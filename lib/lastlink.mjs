// Vendas da Lastlink pela API (MCP em https://api.lastlink.com/mcp), sem webhook por produto.
// sales.list traz TODAS as vendas do creator (front, order bump, upsell, renovação) com o bloco UTM da compra:
// utm_content = "NOME-DO-ANUNCIO|<ad_id>" — é o que liga a venda ao criativo. O webhook do painel continua
// valendo como caminho em tempo real (mesmo id de venda: o upsert não duplica), e esta sincronização é a verdade
// de hora em hora, cobrindo os produtos sem webhook.
// Credenciais: LASTLINK_CLIENT_ID e LASTLINK_CLIENT_SECRET na Netlify.
import { limparNome, chaveNome, ofertaApp, sbAll } from './criativos.mjs';

const URL_MCP = 'https://api.lastlink.com/mcp';

export const lastlinkConfigurada = (env) => !!(env('LASTLINK_CLIENT_ID') && env('LASTLINK_CLIENT_SECRET'));

// Cliente MCP mínimo (JSON-RPC sobre HTTP): initialize uma vez por rodada, depois tools/call.
export function clienteLastlink(env) {
  if (!lastlinkConfigurada(env)) throw new Error('Faltam LASTLINK_CLIENT_ID e LASTLINK_CLIENT_SECRET na Netlify.');
  let sessao = null, n = 0;
  const rpc = async (method, params, tentativa = 0) => {
    const r = await fetch(URL_MCP, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'X-Lastlink-Client-Id': env('LASTLINK_CLIENT_ID'), 'X-Lastlink-Client-Secret': env('LASTLINK_CLIENT_SECRET'), ...(sessao ? { 'Mcp-Session-Id': sessao } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method, params: params || {} }),
    });
    sessao = r.headers.get('mcp-session-id') || sessao;
    const raw = await r.text();
    // Instabilidade do lado deles (5xx): espera e tenta de novo até 3 vezes.
    if (r.status >= 500 && tentativa < 3) { await new Promise((ok) => setTimeout(ok, 3000 * (tentativa + 1))); return rpc(method, params, tentativa + 1); }
    if (!r.ok) throw new Error(`Lastlink MCP ${r.status}: ${raw.slice(0, 200)}`);
    const linha = raw.split('\n').find((l) => l.startsWith('data:'));
    const j = JSON.parse(linha ? linha.slice(5) : raw || '{}');
    if (j.error) throw new Error(`Lastlink MCP: ${j.error.message || JSON.stringify(j.error)}`);
    return j.result;
  };
  const pronto = rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'esteira-criativos', version: '1' } });
  return {
    async tool(name, args) {
      await pronto;
      const res = await rpc('tools/call', { name, arguments: args || {} });
      const texto = (res?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
      if (res?.isError) throw new Error(`${name}: ${texto.slice(0, 300)}`);
      try { return JSON.parse(texto); } catch { return texto; }
    },
  };
}

// Varre sales.list no período (por data da venda e por data de reembolso/chargeback) e grava em esteira_cr_vendas.
export async function syncLastlink(ctx, { desde, ate } = {}) {
  const { sb, q, env } = ctx;
  const ll = clienteLastlink(env);
  const ini = `${desde || new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10)}T00:00:00-03:00`;
  const fim = `${ate || new Date().toISOString().slice(0, 10)}T23:59:59-03:00`;
  const [ads, ofs, cs] = await Promise.all([
    sbAll(sb, 'esteira_cr_ads?select=ad_id,criativo_id&criativo_id=not.is.null'),
    sb('esteira_cr_ofertas?select=id,produtos'),
    sbAll(sb, 'esteira_cr_criativos?select=id,oferta_id'),
  ]);
  const porAd = Object.fromEntries(ads.map((a) => [String(a.ad_id), a.criativo_id]));
  const porCriativo = Object.fromEntries(cs.map((c) => [c.id, c.oferta_id]));
  const porChaveCr = new Map(cs.map((c) => [chaveNome(c.id), c.id]));
  const ofertas = ofs.map(ofertaApp);
  const out = { lidas: 0, gravadas: 0, reembolsos: 0, semCriativo: 0, paginas: 0 };
  const vistas = new Set();

  const varrer = async (dateType) => {
    let cursor = null;
    do {
      const r = await ll.tool('sales.list', { soldFrom: ini, soldTo: fim, dateType, limit: 100, ...(cursor ? { cursor } : {}) });
      out.paginas++;
      const itens = r?.items || [];
      const lote = [];
      for (const v of itens) {
        out.lidas++;
        if (vistas.has(v.saleId)) continue;
        vistas.add(v.saleId);
        const status = String(v.status || '').toLowerCase();
        if (!['approved', 'refunded', 'chargeback', 'partially_refunded', 'refund_requested'].includes(status)) continue;
        const reembolso = status === 'refunded' || status === 'chargeback';
        const content = String(v.utm?.content || '').slice(0, 300);
        const [nomeBruto, adId] = content.split('|');
        let criativoId = (adId && porAd[adId.trim()]) || null;
        if (!criativoId) { const nome = limparNome(nomeBruto || ''); if (nome && nome in porCriativo) criativoId = nome; else if (nome && porChaveCr.has(chaveNome(nome))) criativoId = porChaveCr.get(chaveNome(nome)); }
        const produto = (v.products || []).join(' + ').slice(0, 200) || String(v.offer || '').slice(0, 200);
        let ofertaId = criativoId ? porCriativo[criativoId] : null;
        if (!ofertaId && produto) ofertaId = ofertas.find((o) => (o.produtos || []).some((p) => produto.toLowerCase().includes(String(p).toLowerCase())))?.id || null;
        if (!criativoId) out.semCriativo++;
        if (reembolso) out.reembolsos++;
        lote.push({
          id: v.saleId, criativo_id: criativoId, oferta_id: ofertaId, utm_content: content, utm_campaign: String(v.utm?.campaign || '').slice(0, 300),
          valor: (Number(v.grossAmount?.amountCents) || 0) / 100, produto, pago_em: v.paidAt || v.soldAt, reembolso, is_test: false, origem: 'lastlink_api',
        });
      }
      if (lote.length) { await sb('esteira_cr_vendas?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates', body: lote }); out.gravadas += lote.length; }
      cursor = r?.hasMore ? r?.nextCursor : null;
    } while (cursor);
  };
  await varrer('sold_at');
  await varrer('refunded_at');
  await varrer('chargeback_at');
  await sb('esteira_cr_log', { method: 'POST', body: { tipo: 'lastlink', resumo: `${out.gravadas} vendas sincronizadas (${desde || '2 dias'} → ${ate || 'hoje'}), ${out.reembolsos} reembolsos, ${out.semCriativo} sem criativo`, detalhe: { ...out, desde, ate } } });
  return out;
}
