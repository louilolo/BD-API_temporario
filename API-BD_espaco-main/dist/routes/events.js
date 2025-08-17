import { Router } from 'express';
import { prisma } from '../db.js';
import { z } from 'zod';
import { orDeleteSchedule, orUpsertSchedule } from '../services/orClient.js';
export const eventsRouter = Router();
const payloadSchema = z.object({
    roomId: z.string().uuid(),
    title: z.string().min(1),
    description: z.string().optional(),
    startsAt: z.coerce.date(), // aceita "2025-08-16T14:00:00-03:00", "2025-08-16T17:00:00Z", etc.
    endsAt: z.coerce.date(),
    timezone: z.string().default('America/Belem'),
});
function overlapWhere(roomId, startsAt, endsAt) {
    return {
        roomId,
        status: 'confirmed',
        startsAt: { lte: endsAt },
        endsAt: { gte: startsAt },
    };
}
async function pushToOR(event, room) {
    if (process.env.OR_PUSH_ENABLED !== 'true')
        return;
    if (!room.openremoteAssetId)
        return; // nada a fazer
    const payload = {
        scheduleId: event.id,
        assetId: room.openremoteAssetId,
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
// Criar evento
eventsRouter.post('/', async (req, res) => {
    const { success, data, error } = payloadSchema.safeParse(req.body);
    if (!success)
        return res.status(400).json({ error: error.flatten() });
    const { startsAt, endsAt } = data;
    if (startsAt >= endsAt)
        return res.status(400).json({ error: 'startsAt must be < endsAt' });
    const room = await prisma.room.findUnique({ where: { id: data.roomId } });
    if (!room)
        return res.status(404).json({ error: 'room not found' });
    // conflito
    const conflict = await prisma.event.findFirst({ where: overlapWhere(data.roomId, startsAt, endsAt) });
    if (conflict)
        return res.status(409).json({ error: 'time conflict for this room' });
    // ... e ao criar:
    const event = await prisma.event.create({ data: {
            roomId: data.roomId,
            title: data.title,
            description: data.description,
            startsAt,
            endsAt,
            timezone: data.timezone,
        } });
    try {
        await pushToOR(event, room);
    }
    catch (e) {
        // logar e seguir — o cron pode re-tentar
        console.error(e);
    }
    res.status(201).json(event);
});
// Listar por sala/intervalo
eventsRouter.get('/', async (req, res) => {
    const { roomId, from, to } = req.query;
    const where = {};
    if (roomId)
        where.roomId = roomId;
    if (from || to) {
        where.startsAt = from ? { gte: new Date(from) } : undefined;
        where.endsAt = to ? { lte: new Date(to) } : undefined;
    }
    const events = await prisma.event.findMany({ where, orderBy: { startsAt: 'asc' } });
    res.json(events);
});
// Atualizar evento
eventsRouter.patch('/:id', async (req, res) => {
    const id = req.params.id;
    const { success, data, error } = payloadSchema.partial().safeParse(req.body);
    if (!success)
        return res.status(400).json({ error: error.flatten() });
    const prev = await prisma.event.findUnique({ where: { id } });
    if (!prev || prev.status === 'cancelled')
        return res.status(404).json({ error: 'event not found' });
    const startsAt = data.startsAt ? new Date(data.startsAt) : prev.startsAt;
    const endsAt = data.endsAt ? new Date(data.endsAt) : prev.endsAt;
    if (startsAt >= endsAt)
        return res.status(400).json({ error: 'startsAt must be < endsAt' });
    // conflito (se alterou tempo)
    if (data.startsAt || data.endsAt) {
        const conflict = await prisma.event.findFirst({
            where: {
                ...overlapWhere(prev.roomId, startsAt, endsAt),
                id: { not: id },
            }
        });
        if (conflict)
            return res.status(409).json({ error: 'time conflict for this room' });
    }
    const updated = await prisma.event.update({ where: { id }, data: {
            title: data.title ?? prev.title,
            description: data.description ?? prev.description,
            startsAt,
            endsAt,
            timezone: data.timezone ?? prev.timezone,
        } });
    const room = await prisma.room.findUnique({ where: { id: updated.roomId } });
    try {
        if (room)
            await pushToOR(updated, room);
    }
    catch (e) {
        console.error(e);
    }
    res.json(updated);
});
// Cancelar
eventsRouter.delete('/:id', async (req, res) => {
    const id = req.params.id;
    const prev = await prisma.event.findUnique({ where: { id } });
    if (!prev)
        return res.status(404).json({ error: 'event not found' });
    await prisma.event.update({ where: { id }, data: { status: 'cancelled' } });
    try {
        await orDeleteSchedule(id);
    }
    catch (e) {
        console.error(e);
    }
    res.status(204).send();
});
