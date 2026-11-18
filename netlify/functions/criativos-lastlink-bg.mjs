// Histórico de vendas da Lastlink em segundo plano (até 15 min), em janelas de 15 dias.
import crypto from 'node:crypto';
import { contextoInterno } from '../../lib/api.mjs';
import { syncLastlink } from '../../lib/lastlink.mjs';

export default async (req) => {
  const chave = crypto.createHmac('sha256', process.env.APP_SECRET || '').update('lastlink-criativos').digest('base64url').slice(0, 32);
  if (req.headers.get('x-cr-chave') !== chave) return new Response('Chave inválida.', { status: 403 });
  const ctx = contextoInterno();
  const { desde, ate } = await req.json().catch(() => ({}));
  const dia = (d) => d.toISOString().slice(0, 10);
  let fim = new Date(ate);
  try {
    while (fim >= new Date(desde)) {
      const ini = new Date(Math.max(fim.getTime() - 14 * 864e5, new Date(desde).getTime()));
      console.log(await syncLastlink(ctx, { desde: dia(ini), ate: dia(fim) }));
      fim = new Date(ini.getTime() - 864e5);
    }
  } catch (e) { console.error(e); await ctx.sb('esteira_cr_log', { method: 'POST', body: { tipo: 'lastlink', resumo: `erro no histórico: ${e.message}` } }).catch(() => {}); }
  return new Response('ok');
};

export const config = { path: '/cr-lastlink-bg', background: true };
