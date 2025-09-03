// Arquivo: src/routes/events.ts
// src/routes/events.ts
import { Router } from 'express';
import { prisma } from '../db.js';
import { z } from 'zod';

export const eventsRouter = Router();

/**
 * Schema para criação/edição de eventos (PT-BR)
 * status: 'pendente' | 'confirmado' | 'recusado'
 */
const createSchema = z.object({
  roomId: z.string().min(1).optional(),
  assetId: z.string().optional(), // permite criar por assetId (OpenRemote)
  title: z.string().min(1),
  description: z.string().optional(),
  startsAt: z.string().datetime(), // ISO
  endsAt: z.string().datetime(),   // ISO
  timezone: z.string().default('America/Belem'),
  status: z.enum(['pendente', 'confirmado', 'recusado']).optional(), // default pendente
});

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  timezone: z.string().optional(),
  status: z.enum(['pendente', 'confirmado', 'recusado']).optional(),
});

/** Resolve roomId se vier assetId */
async function resolveRoomIdFromPayload(data: z.infer<typeof createSchema>) {
  if (data.roomId) return data.roomId;

  if (data.assetId) {
    const room = await prisma.room.findFirst({
      where: { openremoteAssetId: data.assetId },
      select: { id: true },
    });
    if (!room) throw new Error('room not found for given assetId');
    return room.id;
  }

  throw new Error('roomId or assetId required');
}

/** condição de conflito de horário */
function overlapWhere(roomId: string, startsAt: Date, endsAt: Date) {
  return {
    roomId,
    status: 'confirmado' as const,
    startsAt: { lte: endsAt },
    endsAt: { gte: startsAt },
  };
}

/** Criar evento */
eventsRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const { title, description, timezone } = parsed.data;
    const startsAt = new Date(parsed.data.startsAt);
    const endsAt = new Date(parsed.data.endsAt);
    if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) {
      return res.status(400).json({ error: 'Invalid datetime' });
    }
    if (startsAt >= endsAt) return res.status(400).json({ error: 'startsAt must be < endsAt' });

    const roomId = await resolveRoomIdFromPayload(parsed.data);

    // sala existe?
    const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true } });
    if (!room) return res.status(404).json({ error: 'room not found' });

    // conflito só se o status já for 'confirmado'
    const desiredStatus = parsed.data.status ?? 'pendente';
    if (desiredStatus === 'confirmado') {
      const conflict = await prisma.event.findFirst({ where: overlapWhere(roomId, startsAt, endsAt) });
      if (conflict) return res.status(409).json({ error: 'time conflict for this room' });
    }

    const event = await prisma.event.create({
      data: {
        roomId,
        title,
        description,
        startsAt,
        endsAt,
        timezone: timezone ?? 'America/Belem',
        status: desiredStatus,
      },
    });

    return res.status(201).json(event);
  } catch (e: any) {
    const msg = e?.message ?? 'unknown error';
    if (msg.includes('roomId or assetId required')) return res.status(400).json({ error: msg });
    if (msg.includes('room not found')) return res.status(404).json({ error: msg });
    console.error('[POST /events] error:', e);
    return res.status(500).json({ error: 'internal error' });
  }
});

/** Listar eventos (opcionais: roomId, from, to) */
eventsRouter.get('/', async (req, res) => {
  const { roomId, from, to } = req.query as Record<string, string | undefined>;
  const where: any = {};

  if (roomId) where.roomId = roomId;
  if (from || to) {
    if (from) where.endsAt = { ...(where.endsAt || {}), gte: new Date(from) };
    if (to) where.startsAt = { ...(where.startsAt || {}), lte: new Date(to) };
  }

  const events = await prisma.event.findMany({
    where,
    orderBy: { startsAt: 'asc' },
  });

  res.json(events);
});

/** Atualizar evento (inclui mudança de status) */
eventsRouter.patch('/:id', async (req, res) => {
  const id = req.params.id;
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const prev = await prisma.event.findUnique({ where: { id } });
  if (!prev) return res.status(404).json({ error: 'event not found' });

  const nextStarts = parsed.data.startsAt ? new Date(parsed.data.startsAt) : prev.startsAt;
  const nextEnds = parsed.data.endsAt ? new Date(parsed.data.endsAt) : prev.endsAt;
  if (nextStarts >= nextEnds) return res.status(400).json({ error: 'startsAt must be < endsAt' });

  // conflito apenas se o novo status for confirmado OU já era confirmado e mexeu em hora
  const willBeConfirmed = (parsed.data.status ?? prev.status) === 'confirmado';
  const timeChanged = !!(parsed.data.startsAt || parsed.data.endsAt);
  if (willBeConfirmed && timeChanged) {
    const conflict = await prisma.event.findFirst({
      where: {
        ...overlapWhere(prev.roomId, nextStarts, nextEnds),
        id: { not: id },
      },
    });
    if (conflict) return res.status(409).json({ error: 'time conflict for this room' });
  }

  const updated = await prisma.event.update({
    where: { id },
    data: {
      title: parsed.data.title ?? prev.title,
      description: parsed.data.description ?? prev.description,
      startsAt: nextStarts,
      endsAt: nextEnds,
      timezone: parsed.data.timezone ?? prev.timezone,
      status: parsed.data.status ?? prev.status,
    },
  });

  res.json(updated);
});

/** Deletar evento */
eventsRouter.delete('/:id', async (req, res) => {
  const id = req.params.id;
  const prev = await prisma.event.findUnique({ where: { id } });
  if (!prev) return res.status(404).json({ error: 'event not found' });

  await prisma.event.delete({ where: { id } });
  res.status(204).send();
});
