// routes/integrations.openremote.ts
import express from 'express';
import { Router } from 'express';
import { prisma } from '../db.js';
import crypto from 'crypto';
import { Prisma } from '@prisma/client'; // <- padrao A; ou remova e use o padrao B

export const orIntegration = Router();

// HMAC opcional
function verifySig(raw: string, sig?: string) {
  if (!sig || !process.env.OR_WEBHOOK_SECRET) return true;
  const h = crypto.createHmac('sha256', process.env.OR_WEBHOOK_SECRET);
  const expected = 'sha256=' + h.update(raw).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

orIntegration.post('/rooms', express.json(), async (req, res) => {
  const raw = JSON.stringify(req.body);
  if (!verifySig(raw, req.header('x-signature') ?? undefined)) {
    return res.status(401).send('bad sig');
  }

  const {
    roomId,
    openremoteAssetId,
    timezone,
    powerAttribute,
    powerLeadMinutes,
  } = req.body ?? {};

  if (!roomId) return res.status(400).json({ error: 'roomId é obrigatório' });

  const lead =
    powerLeadMinutes === undefined || powerLeadMinutes === null
      ? undefined
      : Number(powerLeadMinutes);

  // ======= PADRÃO A (com Prisma namespace) =======
  const data = {
    ...(openremoteAssetId !== undefined && { openremoteAssetId }),
    ...(timezone          !== undefined && { timezone }),
    ...(powerAttribute    !== undefined && { powerAttribute }),
    ...(lead !== undefined && !Number.isNaN(lead) && { powerLeadMinutes: lead }),
    openremoteLinkedAt: new Date(),
  } satisfies Prisma.RoomUpdateInput;

  // ======= PADRÃO B (se preferir): comente o bloco acima e descomente abaixo =======
  // type UpdateArgs = Parameters<typeof prisma.room.update>[0];
  // const data: UpdateArgs['data'] = {
  //   ...(openremoteAssetId !== undefined && { openremoteAssetId }),
  //   ...(timezone          !== undefined && { timezone }),
  //   ...(powerAttribute    !== undefined && { powerAttribute }),
  //   ...(lead !== undefined && !Number.isNaN(lead) && { powerLeadMinutes: lead }),
  //   openremoteLinkedAt: new Date(),
  // };

  try {
    const room = await prisma.room.update({
      where: { id: String(roomId) },
      data,
    });
    return res.json({ ok: true, roomId: room.id });
  } catch (err: any) {
    console.error('[openremote/rooms][update]', {
      err: err?.message,
      code: err?.code,
      meta: err?.meta,
      data,
    });
    if (err?.code === 'P2025') {
      return res.status(404).json({ error: 'Room não encontrada' });
    }
    return res.status(500).json({ error: 'Erro ao atualizar Room' });
  }
});
