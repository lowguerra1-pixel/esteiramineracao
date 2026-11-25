// Rotina horária em segundo plano: sync leve da Meta (só hoje) + vendas da Lastlink (2 dias).
// Disparada pelo criativos-lastlink-cron; antes rodava dentro da agendada e passava dos 15 s (499 + reexecução).
import crypto from 'node:crypto';
import { contextoInterno } from '../../lib/api.mjs';
import { syncLastlink, lastlinkConfigurada } from '../../lib/lastlink.mjs';
import { syncMeta, tokenMeta } from '../../lib/criativos.mjs';

export default async (req) => {
  const chave = crypto.createHmac('sha256', process.env.APP_SECRET || '').update('lastlink-criativos').digest('base64url').slice(0, 32);
  if (req.headers.get('x-cr-chave') !== chave) return new Response('Chave inválida.', { status: 403 });
  const ctx = contextoInterno();
  const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  try {
    const [cfg] = await ctx.sb('esteira_config?chave=eq.cr_contas&select=valor');
    const contas = cfg?.valor || [];
    if (contas.length && (await tokenMeta(ctx))) console.log('sync hoje', await syncMeta(ctx, { desde: hoje, ate: hoje, contas, silencioso: true }));
  } catch (e) { console.error('sync hoje', e.message); }
  if (lastlinkConfigurada(ctx.env)) {
    try { console.log('lastlink', await syncLastlink(ctx)); }
    catch (e) { console.error(e); await ctx.sb('esteira_cr_log', { method: 'POST', body: { tipo: 'lastlink', resumo: `erro: ${e.message}` } }).catch(() => {}); }
  }
  return new Response('ok');
};

export const config = { path: '/cr-hora-bg', background: true };
