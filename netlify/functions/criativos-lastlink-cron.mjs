// De hora em hora: puxa as vendas dos últimos 2 dias da Lastlink pela API (front, bumps, upsells, reembolsos).
import { contextoInterno } from '../../lib/api.mjs';
import { syncLastlink, lastlinkConfigurada } from '../../lib/lastlink.mjs';

export default async () => {
  const ctx = contextoInterno();
  if (!lastlinkConfigurada(ctx.env)) return;
  try { console.log('lastlink', await syncLastlink(ctx)); }
  catch (e) { console.error(e); await ctx.sb('esteira_cr_log', { method: 'POST', body: { tipo: 'lastlink', resumo: `erro: ${e.message}` } }).catch(() => {}); }
};

export const config = { schedule: '40 * * * *' };
