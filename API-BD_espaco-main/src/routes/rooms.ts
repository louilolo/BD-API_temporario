import { Router } from 'express';
import { prisma } from '../db';

export const roomsRouter = Router();

roomsRouter.get('/', async (req, res) => {
  const rooms = await prisma.room.findMany({ orderBy: { name: 'asc' } });
  res.json(rooms);
});