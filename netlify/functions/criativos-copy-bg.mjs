// Diretor de Copy + Revisor, em segundo plano (até 15 min): escreve os cards da fila e manda para Revisão.
import crypto from 'node:crypto';
import { contextoInterno } from '../../lib/api.mjs';
import { rodarCopy } from '../../lib/criativos.mjs';

export default async (req) => {
  const chave = crypto.createHmac('sha256', process.env.APP_SECRET || '').update('lastlink-criativos').digest('base64url').slice(0, 32);
  if (req.headers.get('x-cr-chave') !== chave) return new Response('Chave inválida.', { status: 403 });
  const ctx = contextoInterno();
  try { console.log('copy', await rodarCopy(ctx)); }
  catch (e) { console.error(e); await ctx.sb('esteira_cr_log', { method: 'POST', body: { tipo: 'copy', resumo: `erro: ${e.message}` } }).catch(() => {}); }
  return new Response('ok');
};

export const config = { path: '/cr-copy-bg', background: true };
