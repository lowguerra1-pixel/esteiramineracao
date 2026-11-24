// De hora em hora (:40): vendas dos últimos 2 dias da Lastlink + sync leve da Meta (só o dia de hoje),
// pra um anúncio recém-subido virar "no ar" na mesma hora, sem esperar o diário das 06:10.
import { contextoInterno } from '../../lib/api.mjs';
import { syncLastlink, lastlinkConfigurada } from '../../lib/lastlink.mjs';
import { syncMeta, tokenMeta } from '../../lib/criativos.mjs';

export default async () => {
  const ctx = contextoInterno();
  const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  try {
    const [cfg] = await ctx.sb('esteira_config?chave=eq.cr_contas&select=valor');
    const contas = cfg?.valor || [];
    if (contas.length && (await tokenMeta(ctx))) console.log('sync hoje', await syncMeta(ctx, { desde: hoje, ate: hoje, contas, silencioso: true }));
  } catch (e) { console.error('sync hoje', e.message); }
  if (!lastlinkConfigurada(ctx.env)) return;
  try { console.log('lastlink', await syncLastlink(ctx)); }
  catch (e) { console.error(e); await ctx.sb('esteira_cr_log', { method: 'POST', body: { tipo: 'lastlink', resumo: `erro: ${e.message}` } }).catch(() => {}); }
};

export const config = { schedule: '40 * * * *' };
