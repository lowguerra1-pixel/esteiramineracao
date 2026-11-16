// Analista do Setor de Criativos, em segundo plano (até 15 min): veredito narrativo, hipóteses, próxima leva e dissecações.
// Disparado pelo cron diário depois do veredito, ou por /api/cr/analista.
import crypto from 'node:crypto';
import { contextoInterno } from '../../lib/api.mjs';
import { rodarAnalista } from '../../lib/criativos.mjs';

export default async (req) => {
  const chave = crypto.createHmac('sha256', process.env.APP_SECRET || '').update('lastlink-criativos').digest('base64url').slice(0, 32);
  if (req.headers.get('x-cr-chave') !== chave) return new Response('Chave inválida.', { status: 403 });
  const ctx = contextoInterno();
  try { console.log('analista', await rodarAnalista(ctx)); }
  catch (e) { console.error(e); await ctx.sb('esteira_cr_log', { method: 'POST', body: { tipo: 'analista', resumo: `erro: ${e.message}` } }).catch(() => {}); }
  return new Response('ok');
};

export const config = { path: '/cr-analista-bg', background: true };
