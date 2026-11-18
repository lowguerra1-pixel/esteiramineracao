// Importa e resume a pesquisa de UMA oferta em segundo plano (pesquisas grandes passam dos 26 s da função normal).
// Disparado por POST /api/cr/ofertas/:id/pesquisa. Corpo: { ofertaId, driveIds?, texto? }.
import crypto from 'node:crypto';
import { contextoInterno } from '../../lib/api.mjs';
import { importarPesquisa } from '../../lib/biblioteca.mjs';
import { claude } from '../../lib/criativos.mjs';

export default async (req) => {
  const chave = crypto.createHmac('sha256', process.env.APP_SECRET || '').update('lastlink-criativos').digest('base64url').slice(0, 32);
  if (req.headers.get('x-cr-chave') !== chave) return new Response('Chave inválida.', { status: 403 });
  const ctx = contextoInterno();
  const { sb, q, env, getConfig } = ctx;
  const b = await req.json().catch(() => ({}));
  try {
    const [o] = await sb(`esteira_cr_ofertas?id=eq.${q(b.ofertaId || '')}&select=*`);
    if (!o) throw new Error(`oferta ${b.ofertaId} não encontrada`);
    const cfg = await getConfig();
    const r = await importarPesquisa({ sb, q, env, claude: env('ANTHROPIC_API_KEY') ? claude : null, modelo: cfg.modelo || 'claude-sonnet-5-5' }, o, { driveIds: b.driveIds, texto: b.texto });
    await sb('esteira_cr_log', { method: 'POST', body: { tipo: 'pesquisa', resumo: `${o.id}: pesquisa ${r.ok ? 'importada (' + r.chars + ' caracteres' + (r.resumo ? ', resumida' : ', SEM resumo') + ')' : 'falhou'}`, detalhe: r } });
  } catch (e) { await sb('esteira_cr_log', { method: 'POST', body: { tipo: 'pesquisa', resumo: `${b.ofertaId}: erro: ${e.message}` } }).catch(() => {}); }
  return new Response('ok');
};

export const config = { path: '/cr-pesquisa-bg', background: true };
