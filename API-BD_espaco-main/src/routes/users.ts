import { Router } from 'express';
import { prisma } from '../db.js';
import { z } from 'zod';

export const usersRouter = Router();

const createUserSchema = z.object({
  name: z.string().min(1, 'Informe um nome'),
  email: z.string().email('Email inválido'),
  role: z.string().optional().default('user'), 
});


usersRouter.post('/', async (req, res) => {
  const parse = createUserSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

  const { name, email, role } = parse.data;

  try {
    const user = await prisma.user.create({ data: { name, email, role } });

    return res.status(201).json(user);
  } catch (e: any) {

    if (e.code === 'P2002') return res.status(409).json({ error: 'Email já cadastrado' });
    console.error(e);
    return res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});


usersRouter.get('/', async (_req, res) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(users);
});
