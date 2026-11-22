// Diretor de Copy + Revisor, em segundo plano (até 15 min): escreve até 15 cards da fila e, se ainda houver fila,
// chama a si mesmo de novo — trabalho contínuo até esvaziar. Trava em esteira_config (cr_copy_lock) evita duas rodadas ao mesmo tempo.
import crypto from 'node:crypto';
import { contextoInterno } from '../../lib/api.mjs';
import { rodarCopy } from '../../lib/criativos.mjs';

export default async (req) => {
  const chave = crypto.createHmac('sha256', process.env.APP_SECRET || '').update('lastlink-criativos').digest('base64url').slice(0, 32);
  if (req.headers.get('x-cr-chave') !== chave) return new Response('Chave inválida.', { status: 403 });
  const ctx = contextoInterno();
  const { sb, getConfig, setConfig } = ctx;
  const b = await req.json().catch(() => ({}));
  const cfg = await getConfig();
  const lock = cfg.cr_copy_lock;
  if (lock?.em && Date.now() - new Date(lock.em).getTime() < 12 * 60e3 && !b.forcar) { console.log('copy já rodando desde', lock.em); return new Response('ocupado'); }
  await setConfig('cr_copy_lock', { em: new Date().toISOString() });
  try {
    const out = await rodarCopy(ctx, { maxCards: b.maxCards || 15, paiId: b.paiId || null, ofertaId: b.ofertaId || null, variavel: b.variavel || null });
    console.log('copy', out);
    await setConfig('cr_copy_lock', {});
    // Ainda tem fila (e a rodada escreveu algo)? Chama a próxima rodada já.
    const resto = await sb('esteira_cr_criativos?status=eq.fila&select=id&limit=1');
    if (resto.length && (out.escritos || 0) > 0) {
      const site = process.env.URL || 'https://esteiramineracao.netlify.app';
      await fetch(`${site}/cr-copy-bg`, { method: 'POST', headers: { 'x-cr-chave': chave, 'content-type': 'application/json' }, body: JSON.stringify({ maxCards: b.maxCards || 15 }) }).catch(() => {});
    }
  } catch (e) {
    console.error(e); await setConfig('cr_copy_lock', {});
    await sb('esteira_cr_log', { method: 'POST', body: { tipo: 'copy', resumo: `erro: ${e.message}` } }).catch(() => {});
  }
  return new Response('ok');
};

export const config = { path: '/cr-copy-bg', background: true };
