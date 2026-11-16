// Agendada: todo dia às 06:10 de Brasília (09:10 UTC). Sincroniza os últimos 3 dias da Meta e roda o motor de veredito.
// Limite de 30 s: por isso só 3 dias; o histórico maior se puxa em Criativos › Ajustes.
import crypto from 'node:crypto';
import { contextoInterno } from '../../lib/api.mjs';
import { syncMeta, rodarVeredito, renovarTokenMeta, tokenMeta } from '../../lib/criativos.mjs';

export default async () => {
  const ctx = contextoInterno();
  const { sb } = ctx;
  const [cfg] = await sb('esteira_config?chave=eq.cr_contas&select=valor');
  const contas = cfg?.valor || [];
  const dia = (d) => new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
  const ate = dia(new Date()), desde = dia(new Date(Date.now() - 2 * 864e5));
  try {
    console.log('token', await renovarTokenMeta(ctx));
    if (contas.length && (await tokenMeta(ctx))) console.log('sync', await syncMeta(ctx, { desde, ate, contas }));
    console.log('veredito', (await rodarVeredito(ctx)).mudancas);
    // Analista roda em segundo plano (chamadas à IA passam dos 30 s desta função).
    const chave = crypto.createHmac('sha256', process.env.APP_SECRET || '').update('lastlink-criativos').digest('base64url').slice(0, 32);
    const site = process.env.URL || 'https://esteiramineracao.netlify.app';
    await fetch(`${site}/cr-analista-bg`, { method: 'POST', headers: { 'x-cr-chave': chave } }).then((r) => console.log('analista', r.status)).catch((e) => console.error(e));
  } catch (e) {
    console.error(e);
    await sb('esteira_cr_log', { method: 'POST', body: { tipo: 'cron', resumo: `erro: ${e.message}` } }).catch(() => {});
  }
};

export const config = { schedule: '10 9 * * *' };
