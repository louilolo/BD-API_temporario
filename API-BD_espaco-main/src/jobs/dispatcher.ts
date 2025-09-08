import { CronJob } from 'cron';  // Pacote cron para agendar tarefas
import { prisma } from '../db.js';  // Prisma para interagir com o banco de dados
import { orUpsertSchedule } from '../services/orClient.js';  // Função para enviar agendamentos

// Cron Job que roda a cada minuto
export const dispatcher = new CronJob('*/60 * * * * *', async () => {
  // Verifica se o envio de eventos está habilitado
  if (process.env.OR_PUSH_ENABLED !== 'true') return;

  const now = new Date();  // Data e hora atual
  const within = new Date(now.getTime() + 10 * 60 * 1000);  // 10 minutos à frente

  // Busca eventos confirmados que começam nos próximos 10 minutos
  const events = await prisma.event.findMany({
    where: {
      status: 'confirmed',  // Somente eventos confirmados
      startsAt: { lte: within },  // Eventos que começam dentro de 10 minutos
      endsAt: { gte: now },  // Eventos que ainda estão em andamento
    },
    include: { room: true },  // Inclui as informações da sala
  });

  // Para cada evento encontrado, agende um comando 5 minutos antes do seu início
  for (const e of events) {
    if (!e.room.openremoteAssetId) continue;  // Verifica se a sala tem o ID do ativo OpenRemote

    try {
      // Envia o comando 5 minutos antes do início do evento e ao final do evento
      await orUpsertSchedule({
        scheduleId: e.id,  // ID do evento
        assetId: e.room.openremoteAssetId!,  // ID do ativo da sala
        startsAt: e.startsAt.toISOString(),  // Hora de início do evento
        endsAt: e.endsAt.toISOString(),  // Hora de término do evento
        timezone: e.timezone,  // Fuso horário do evento
        actions: [
          {
            at: new Date(e.startsAt.getTime() - 5 * 60 * 1000).toISOString(),  // 5 minutos antes do evento
            command: { attribute: 'power', value: true },  // Ativa o comando de energia
          },
          {
            at: e.endsAt.toISOString(),  // No final do evento
            command: { attribute: 'power', value: false },  // Desliga o comando de energia
          },
        ],
      });
    } catch (err) {
      console.error('[dispatcher]', err);  // Caso ocorra algum erro ao agendar
    }
  }
});
