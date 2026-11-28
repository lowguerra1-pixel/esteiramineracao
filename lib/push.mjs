// Web Push do Hub (PWA): chaves VAPID geradas e guardadas pelo próprio app (esteira_config cr_vapid),
// inscrições por aparelho (cr_push_inscricoes) e envio com a biblioteca web-push.
import webpush from 'web-push';

export async function chavesVapid({ getConfig, setConfig }) {
  const cfg = await getConfig();
  if (cfg.cr_vapid?.publicKey && cfg.cr_vapid?.privateKey) return cfg.cr_vapid;
  const k = webpush.generateVAPIDKeys();
  const v = { publicKey: k.publicKey, privateKey: k.privateKey, criado_em: new Date().toISOString() };
  await setConfig('cr_vapid', v);
  return v;
}

export async function inscricoes({ getConfig }) {
  const cfg = await getConfig();
  return Array.isArray(cfg.cr_push_inscricoes) ? cfg.cr_push_inscricoes : [];
}

export async function inscrever(ctx, { usuario, subscription, aparelho }) {
  const lista = (await inscricoes(ctx)).filter((i) => i.endpoint !== subscription.endpoint);
  lista.push({ usuario, endpoint: subscription.endpoint, sub: subscription, aparelho: String(aparelho || '').slice(0, 120), em: new Date().toISOString() });
  await ctx.setConfig('cr_push_inscricoes', lista.slice(-50));
  return lista.length;
}

export async function desinscrever(ctx, endpoint) {
  const lista = (await inscricoes(ctx)).filter((i) => i.endpoint !== endpoint);
  await ctx.setConfig('cr_push_inscricoes', lista);
  return lista.length;
}

// Envia para todos os aparelhos (ou só os de um usuário). Remove inscrições mortas (404/410).
export async function enviarPush(ctx, { titulo, texto, url, tag, para = null }) {
  const v = await chavesVapid(ctx);
  webpush.setVapidDetails('mailto:contato@esteiramineracao.netlify.app', v.publicKey, v.privateKey);
  const lista = await inscricoes(ctx);
  const alvo = para ? lista.filter((i) => i.usuario === para) : lista;
  const payload = JSON.stringify({ titulo, texto: String(texto || '').slice(0, 3500), url: url || '/criativos/#maestro', tag: tag || 'criativos' });
  let ok = 0; const mortas = [];
  for (const i of alvo) {
    try { await webpush.sendNotification(i.sub, payload, { TTL: 12 * 3600 }); ok++; }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) mortas.push(i.endpoint); else console.error('push', i.aparelho, e.statusCode, e.body || e.message); }
  }
  if (mortas.length) await ctx.setConfig('cr_push_inscricoes', lista.filter((i) => !mortas.includes(i.endpoint)));
  return { enviados: ok, aparelhos: alvo.length, removidos: mortas.length };
}
