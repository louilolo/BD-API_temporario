// Arquivo: src/routes/events.ts

import { Router } from 'express';
import { prisma } from '../db.js';
import { z } from 'zod';
import { orDeleteSchedule, orUpsertSchedule } from '../services/orClient.js';

export const eventsRouter = Router();

// --- Schemas de Validação (Zod) ---
const createSchema = z.object({
  roomId: z.string().min(1).optional(),
  assetId: z.string().min(1).optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  timezone: z.string().default('America/Belem'),
}).refine(d => d.roomId || d.assetId, {
  message: 'roomId or assetId is required',
  path: ['roomId'],
});

const updateSchema = z.object({
  roomId: z.string().min(1).optional(),
  assetId: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  timezone: z.string().optional(),
});


// --- FUNÇÕES AUXILIARES CORRIGIDAS ---
// ======================================

/**
 * Cria o objeto de filtro para o Prisma para checar conflitos de horário.
 * ESTA FUNÇÃO PRECISA RETORNAR UM OBJETO.
 */
function overlapWhere(roomId: string, startsAt: Date, endsAt: Date) {
  return {
    roomId,
    status: 'confirmado' as const,
    startsAt: { lte: endsAt },
    endsAt:   { gte: startsAt },
  };
}

/**
 * Envia um evento confirmado para o serviço OpenRemote.
 * Esta função não precisa retornar nada (Promise<void>).
 */
async function pushToOR(event: any, room: any) {
  if (process.env.OR_PUSH_ENABLED !== 'true') return;
  if (!room.openremoteAssetId) return;

  const payload = {
    scheduleId: event.id,
    assetId: room.openremoteAssetId as string,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    timezone: event.timezone,
    actions: [
      { at: new Date(event.startsAt.getTime() - 5 * 60 * 1000).toISOString(), command: { attribute: 'power', value: true } },
      { at: event.endsAt.toISOString(), command: { attribute: 'power', value: false } },
    ],
  };

  await orUpsertSchedule(payload);
}

/** * Resolve uma sala por id OU por openremoteAssetId.
 * ESTA FUNÇÃO PRECISA RETORNAR A SALA OU NULL.
 */
async function resolveRoom(idOrAsset?: string, assetId?: string) {
  if (idOrAsset) {
    const byEither = await prisma.room.findFirst({
      where: { OR: [{ id: idOrAsset }, { openremoteAssetId: idOrAsset }] },
    });
    if (byEither) return byEither;
  }
  if (assetId) {
    const byAsset = await prisma.room.findFirst({ where: { openremoteAssetId: assetId } });
    if (byAsset) return byAsset;
  }
  return null;
}


// --- ROTAS DA API (usando as funções corrigidas) ---
// =================================================

/** Criar evento */
eventsRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  const startsAt = new Date(data.startsAt);
  const endsAt   = new Date(data.endsAt);
  if (!(startsAt instanceof Date && !isNaN(+startsAt) && endsAt instanceof Date && !isNaN(+endsAt))) {
    return res.status(400).json({ error: 'Invalid datetime' });
  }
  if (startsAt >= endsAt) return res.status(400).json({ error: 'startsAt must be < endsAt' });

  const room = await resolveRoom(data.roomId, data.assetId);
  if (!room) return res.status(404).json({ error: 'room not found' });

  const conflict = await prisma.event.findFirst({ where: overlapWhere(room.id, startsAt, endsAt) });
  if (conflict) return res.status(409).json({ error: 'time conflict for this room' });

  const event = await prisma.event.create({
    data: {
      roomId: room.id,
      title: data.title,
      description: data.description,
      startsAt,
      endsAt,
      timezone: data.timezone,
      status: 'pendente',
    },
  });

  res.status(201).json(event);
});

/** Listar por sala/intervalo */
eventsRouter.get('/', async (req, res) => {
  const { roomId, from, to } = req.query as any;
  const where: any = {};
  if (roomId) where.roomId = roomId;
  if (from || to) {
    if (from) where.startsAt = { gte: new Date(from) };
    if (to)   where.endsAt   = { lte: new Date(to) };
  }
  const events = await prisma.event.findMany({ where, orderBy: { startsAt: 'asc' } });
  res.json(events);
});

/** Atualizar evento */
eventsRouter.patch('/:id', async (req, res) => {
  const id = req.params.id;
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  const prev = await prisma.event.findUnique({ where: { id } });
  if (!prev || prev.status === 'recusado') return res.status(404).json({ error: 'event not found' });

  let roomId = prev.roomId;
  if (data.roomId || data.assetId) {
    const room = await resolveRoom(data.roomId, data.assetId);
    if (!room) return res.status(404).json({ error: 'room not found' });
    roomId = room.id;
  }

  const startsAt = data.startsAt ? new Date(data.startsAt) : prev.startsAt;
  const endsAt   = data.endsAt   ? new Date(data.endsAt)   : prev.endsAt;
  if (startsAt >= endsAt) return res.status(400).json({ error: 'startsAt must be < endsAt' });

  if (data.startsAt || data.endsAt || roomId !== prev.roomId) {
    const conflict = await prisma.event.findFirst({
      where: { ...overlapWhere(roomId, startsAt, endsAt), id: { not: id } },
    });
    if (conflict) return res.status(409).json({ error: 'time conflict for this room' });
  }

  const updated = await prisma.event.update({
    where: { id },
    data: { roomId, title: data.title, description: data.description, startsAt, endsAt, timezone: data.timezone },
  });

  const room = await prisma.room.findUnique({ where: { id: updated.roomId } });
  try { if (room) await pushToOR(updated, room); } catch (e) { console.error(e); }

  res.json(updated);
});

/** Cancelar/Recusar */
eventsRouter.delete('/:id', async (req, res) => {
  const id = req.params.id;
  const prev = await prisma.event.findUnique({ where: { id } });
  if (!prev) return res.status(404).json({ error: 'event not found' });

  await prisma.event.update({ where: { id }, data: { status: 'recusado' } });
  try { await orDeleteSchedule(id); } catch (e) { console.error(e); }
  res.status(204).send();
});

/** Aprovar um evento */
eventsRouter.patch('/:id/approve', async (req, res) => {
  const { id } = req.params;
  const event = await prisma.event.findUnique({ where: { id }, include: { room: true } });
  if (!event || event.status !== 'pendente') {
    return res.status(404).json({ error: 'Pending event not found' });
  }
  const confirmedEvent = await prisma.event.update({ where: { id }, data: { status: 'confirmado' }, include: { room: true } });
  try { await pushToOR(confirmedEvent, confirmedEvent.room); } catch (e) { console.error('[approve]', 'Failed to push to OpenRemote', e); }
  res.status(200).json(confirmedEvent);
});

/** Recusar um evento */
eventsRouter.patch('/:id/reject', async (req, res) => {
    const { id } = req.params;
    const event = await prisma.event.findUnique({ where: { id } });
    if (!event || event.status !== 'pendente') {
        return res.status(404).json({ error: 'Pending event not found' });
    }
    const rejectedEvent = await prisma.event.update({ where: { id }, data: { status: 'recusado' } });
    try { await orDeleteSchedule(id); } catch (e) { console.error('[reject]', 'Failed to delete from OpenRemote', e); }
    res.status(200).json(rejectedEvent);
});