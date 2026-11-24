// Rotina diária em segundo plano (até 15 min): renova token, sync Meta (3 dias), sync Lastlink, veredito e dispara o Analista.
// Disparada pelo criativos-cron às 06:10; antes isso rodava dentro da agendada e estourava o limite dela (499 + 3 reexecuções).
import crypto from 'node:crypto';
import { contextoInterno } from '../../lib/api.mjs';
import { syncMeta, rodarVeredito, renovarTokenMeta, tokenMeta } from '../../lib/criativos.mjs';
import { syncLastlink, lastlinkConfigurada } from '../../lib/lastlink.mjs';

const chaveCr = () => crypto.createHmac('sha256', process.env.APP_SECRET || '').update('lastlink-criativos').digest('base64url').slice(0, 32);

export default async (req) => {
  if (req.headers.get('x-cr-chave') !== chaveCr()) return new Response('Chave inválida.', { status: 403 });
  const ctx = contextoInterno();
  const { sb } = ctx;
  const [cfg] = await sb('esteira_config?chave=eq.cr_contas&select=valor');
  const contas = cfg?.valor || [];
  const dia = (d) => new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
  const ate = dia(new Date()), desde = dia(new Date(Date.now() - 2 * 864e5));
  try {
    console.log('token', await renovarTokenMeta(ctx));
    if (contas.length && (await tokenMeta(ctx))) console.log('sync', await syncMeta(ctx, { desde, ate, contas }));
    if (lastlinkConfigurada(ctx.env)) console.log('lastlink', await syncLastlink(ctx, { desde, ate }).catch((e) => e.message));
    console.log('veredito', (await rodarVeredito(ctx)).mudancas);
    const site = process.env.URL || 'https://esteiramineracao.netlify.app';
    await fetch(`${site}/cr-analista-bg`, { method: 'POST', headers: { 'x-cr-chave': chaveCr() } }).then((r) => console.log('analista', r.status)).catch((e) => console.error(e));
  } catch (e) {
    console.error(e);
    await sb('esteira_cr_log', { method: 'POST', body: { tipo: 'cron', resumo: `erro: ${e.message}` } }).catch(() => {});
  }
  return new Response('ok');
};

export const config = { path: '/cr-diario-bg', background: true };
