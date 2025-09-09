import { Router } from 'express';
import { prisma } from '../db.js';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase URL and Anon Key must be provided in .env file');
}

const supabase = createClient(supabaseUrl, supabaseKey);

export const usersRouter = Router();

const createUserSchema = z.object({
  name: z.string().min(1, 'Informe um nome'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'A senha precisa ter no mínimo 6 caracteres'),
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.string().optional(),
});

usersRouter.post('/', async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { name, email, password } = parsed.data;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });

  if (error) {
    if (error.message.includes('User already registered')) {
      return res.status(409).json({ error: 'Email já cadastrado.' });
    }
    console.error(error);
    return res.status(500).json({ error: error.message });
  }

  return res.status(201).json({
    message: 'Usuário criado! Verifique seu e-mail para confirmação.',
    user: data.user
  });
});

usersRouter.get('/', async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    }
  });
  res.json(users);
});

usersRouter.get('/:id', async (req, res) => {
  const { id } = req.params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    }
  });

  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  res.json(user);
});

usersRouter.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id },
      data: parsed.data,
    });
    res.json(updatedUser);
  } catch (e) {
    if (typeof e === 'object' && e !== null && 'code' in e) {
      const error = e as { code?: string };
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }
    }
    console.error('Erro inesperado:', e);
    return res.status(500).json({ error: 'Erro ao atualizar usuário.' });
  }
});

usersRouter.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.user.delete({
      where: { id },
    });
    res.status(204).send();
  } catch (e) {
    if (typeof e === 'object' && e !== null && 'code' in e) {
      const error = e as { code?: string };
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }
    }
    console.error('Erro inesperado:', e);
    return res.status(500).json({ error: 'Erro ao deletar usuário.' });
  }
});