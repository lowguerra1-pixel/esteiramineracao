// Diretor de Criação em segundo plano: monta o projeto de edição dos cards aprovados (ids dados, ou todos sem projeto).
import crypto from 'node:crypto';
import { contextoInterno } from '../../lib/api.mjs';
import { rodarCriacao } from '../../lib/criacao.mjs';

export default async (req) => {
  const chave = crypto.createHmac('sha256', process.env.APP_SECRET || '').update('lastlink-criativos').digest('base64url').slice(0, 32);
  if (req.headers.get('x-cr-chave') !== chave) return new Response('Chave inválida.', { status: 403 });
  const ctx = contextoInterno();
  const b = await req.json().catch(() => ({}));
  try { console.log('criacao', await rodarCriacao(ctx, { ids: b.ids, max: b.max || 5 })); }
  catch (e) { console.error(e); await ctx.sb('esteira_cr_log', { method: 'POST', body: { tipo: 'criacao', resumo: `erro: ${e.message}` } }).catch(() => {}); }
  return new Response('ok');
};

export const config = { path: '/cr-criacao-bg', background: true };
