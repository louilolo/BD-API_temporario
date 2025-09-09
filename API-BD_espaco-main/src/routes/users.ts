import { Router } from 'express';

export const usersRouter = Router();

// Esta rota NÃO usa Prisma. Ela apenas retorna um JSON simples.
usersRouter.get('/', (req, res) => {
  console.log("A rota GET /users foi chamada com sucesso!");
  res.status(200).json({ message: "Olá! A rota de usuários está funcionando." });
});

// Vamos deixar as outras rotas desativadas por enquanto para simplificar
usersRouter.post('/', (req, res) => res.status(501).json({ error: "Rota desativada para teste."}));
usersRouter.get('/:id', (req, res) => res.status(501).json({ error: "Rota desativada para teste."}));
usersRouter.patch('/:id', (req, res) => res.status(501).json({ error: "Rota desativada para teste."}));
usersRouter.delete('/:id', (req, res) => res.status(501).json({ error: "Rota desativada para teste."}));