// Sync longo da Meta em segundo plano (até 15 min). Chamado pela API em /api/cr/sync quando o período passa de 7 dias.
import crypto from 'node:crypto';
import { contextoInterno } from '../../lib/api.mjs';
import { syncMeta, religar } from '../../lib/criativos.mjs';

export default async (req) => {
  const chave = crypto.createHmac('sha256', process.env.APP_SECRET || '').update('lastlink-criativos').digest('base64url').slice(0, 32);
  if (req.headers.get('x-cr-chave') !== chave) return new Response('Chave inválida.', { status: 403 });
  const { desde, ate, contas } = await req.json().catch(() => ({}));
  const ctx = contextoInterno();
  try {
    // Em janelas de 7 dias, da mais recente para a mais antiga.
    let fim = new Date(ate + 'T12:00:00Z');
    const inicio = new Date(desde + 'T12:00:00Z');
    while (fim >= inicio) {
      const ini = new Date(Math.max(inicio, fim.getTime() - 6 * 864e5));
      const r = await syncMeta(ctx, { desde: ini.toISOString().slice(0, 10), ate: fim.toISOString().slice(0, 10), contas });
      console.log('sync', r);
      fim = new Date(ini.getTime() - 864e5);
    }
    console.log('religar', await religar(ctx.sb, ctx.q));
    await ctx.sb('esteira_cr_log', { method: 'POST', body: { tipo: 'sync', resumo: `segundo plano concluído: ${desde} → ${ate}` } });
  } catch (e) {
    console.error(e);
    await ctx.sb('esteira_cr_log', { method: 'POST', body: { tipo: 'sync', resumo: `erro no segundo plano: ${e.message}` } }).catch(() => {});
  }
  return new Response('ok');
};

export const config = { path: '/cr-sync-bg', background: true };
