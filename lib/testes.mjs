// API do app Testes: A/B de páginas de vendas.
// Três portas públicas (sem login): a configuração que o divisor do Netlify lê, os eventos que ele manda
// (visita, clique no checkout, ID do visitante) e o webhook da Lastlink. O resto exige login.
import { STATUS_TESTE, REGUA_PADRAO, lerEtiqueta, calcularPlacar } from '../public/testes/regras.mjs';

const limparHost = (h) => String(h || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
const limparArquivo = (a) => {
  let s = String(a || '/').trim();
  if (!s.startsWith('/')) s = '/' + s;
  if (s !== '/' && !/\.html?$/.test(s) && !s.endsWith('/')) s += '/';
  return s;
};

// Lê um campo do payload sem depender de maiúsculas e minúsculas (a documentação da Lastlink mistura as duas).
function pega(obj, ...caminho) {
  let o = obj;
  for (const k of caminho) {
    if (!o || typeof o !== 'object') return undefined;
    const chave = Object.keys(o).find((x) => x.toLowerCase() === k.toLowerCase());
    o = chave === undefined ? undefined : o[chave];
  }
  return o;
}
const numero = (v) => (v === null || v === undefined || v === '' ? null : Number(String(v).replace(',', '.')));

export const paraApp = (r) => ({
  id: r.id, numero: r.numero, nome: r.nome, ofertaId: r.oferta_id, host: r.host, status: r.status,
  variantes: r.variantes || [], inicio: r.inicio, fim: r.fim, vencedora: r.vencedora, gasto: r.gasto,
  notas: r.notas, produtos: r.produtos || [], historico: r.historico || [], criadoEm: r.criado_em, atualizadoEm: r.atualizado_em,
});

// ---------------------------------------------------------------- rotas públicas
export async function rotasTestesPublicas(p, m, req, ctx) {
  const { sb, json, fail, q, env, tokenWebhook } = ctx;

  // O divisor pergunta: tem teste neste domínio? Resposta curta e guardada na CDN por 15 s.
  if (p === '/api/testes/publico/config' && m === 'GET') {
    const host = limparHost(new URL(req.url).searchParams.get('host'));
    const cache = { 'netlify-cdn-cache-control': 'public, s-maxage=15, stale-while-revalidate=120', 'access-control-allow-origin': '*' };
    if (!host) return json(200, { ativo: false }, cache);
    const rows = await sb(`esteira_testes?host=eq.${q(host)}&status=in.(ativo,encerrado)&select=id,status,variantes,vencedora&order=atualizado_em.desc&limit=5`);
    const t = rows.find((r) => r.status === 'ativo') || rows.find((r) => r.status === 'encerrado' && r.vencedora);
    if (!t) return json(200, { ativo: false }, cache);
    let variantes = (t.variantes || []).map((v) => ({ id: v.id, arquivo: v.arquivo || '/', peso: Number(v.peso) || 0 }));
    // Encerrado com vencedora: todo mundo vê a vencedora até você trocar o arquivo principal do site.
    if (t.status === 'encerrado') variantes = variantes.map((v) => ({ ...v, peso: v.id === t.vencedora ? 100 : 0 }));
    return json(200, { id: t.id, ativo: true, contar: t.status === 'ativo', variantes }, cache);
  }

  // Eventos vindos do divisor (só ele tem a chave).
  if (p === '/api/testes/publico/evento' && m === 'POST') {
    if (!env('AB_CHAVE') || req.headers.get('x-ab-chave') !== env('AB_CHAVE')) fail(403, 'Chave inválida.');
    const b = await req.json().catch(() => ({}));
    const [t] = await sb(`esteira_testes?id=eq.${q(b.t || '')}&status=eq.ativo&select=id,variantes`);
    if (!t || !(t.variantes || []).some((v) => v.id === b.v)) return json(200, { ok: false });
    if (b.tipo === 'visita' || b.tipo === 'ic') await sb('rpc/esteira_teste_contar', { method: 'POST', body: { p_teste: t.id, p_variante: b.v, p_tipo: b.tipo } });
    const idx = String(b.idx || '').slice(0, 120);
    if (idx) await sb('esteira_testes_visitantes?on_conflict=teste_id,visitante', { method: 'POST', body: { teste_id: t.id, visitante: idx, variante: b.v }, prefer: 'resolution=ignore-duplicates' });
    return json(200, { ok: true });
  }

  // Webhook da Lastlink (o endereço tem um código secreto; a Lastlink não assina o envio).
  const mw = p.match(/^\/api\/testes\/lastlink\/([\w-]+)$/);
  if (mw && m === 'POST') {
    if (mw[1] !== tokenWebhook()) fail(403, 'Endereço inválido.');
    const ev = await req.json().catch(() => null);
    if (!ev) fail(400, 'Corpo vazio.');
    return json(200, await receberLastlink(ev, ctx));
  }
  return null;
}

async function receberLastlink(ev, { sb, q }) {
  const evento = String(pega(ev, 'Event') || '');
  const d = pega(ev, 'Data') || {};
  const utm = pega(d, 'Utm') || {};
  const compra = pega(d, 'Purchase') || {};
  const produtos = pega(d, 'Products') || [];
  const pagamento = String(pega(compra, 'PaymentId') || pega(ev, 'Id') || '');
  const vtid = String(pega(utm, 'Vtid') || pega(d, 'Vtid') || '');
  const sck = String(pega(utm, 'Sck') || pega(d, 'Sck') || '');
  const valor = numero(pega(compra, 'Price', 'Value'));
  const produtoId = String(pega(produtos[0] || {}, 'Id') || '');
  const produtoNome = String(pega(produtos[0] || {}, 'Name') || '');
  const ehTeste = !!pega(ev, 'IsTest');
  // Refund_Requested e Refund_Period_Over não são reembolso de fato.
  const reembolso = /^payment_(refund|chargeback)$/i.test(evento);
  const aprovada = !reembolso && /purchase_order_confirmed/i.test(evento);

  // 1) Etiqueta no vtid. 2) ID do visitante da Stape (sck) que o divisor ligou à página. 3) Sem etiqueta.
  let testeId = null, variante = null, via = null;
  const et = lerEtiqueta(vtid);
  if (et) {
    const [t] = await sb(`esteira_testes?id=eq.${q(et.testeId)}&select=id,variantes`);
    if (t && (t.variantes || []).some((v) => v.id === et.variante)) { testeId = t.id; variante = et.variante; via = 'vtid'; }
  }
  if (!testeId && sck) {
    for (const parte of sck.split('|').filter(Boolean)) {
      const [x] = await sb(`esteira_testes_visitantes?visitante=eq.${q(parte)}&select=teste_id,variante&order=criado_em.desc&limit=1`);
      if (x) { testeId = x.teste_id; variante = x.variante; via = 'sck'; break; }
    }
  }
  if (!testeId && produtoId) {
    const [t] = await sb(`esteira_testes?status=eq.ativo&produtos=cs.${q(JSON.stringify([produtoId]))}&select=id&limit=1`);
    if (t) testeId = t.id;
  }

  let resultado = 'ignorado';
  if (aprovada && pagamento) {
    await sb('esteira_testes_vendas?on_conflict=id', {
      method: 'POST', prefer: 'resolution=merge-duplicates',
      body: {
        id: pagamento, teste_id: testeId, variante, via, evento, valor, produto_id: produtoId, produto: produtoNome,
        oferta_lastlink: String(pega(d, 'Offer', 'Id') || ''), upsell: !!pega(compra, 'IsUpsell'),
        utm_content: String(pega(utm, 'UtmContent') || '').slice(0, 300), is_test: ehTeste,
        pago_em: pega(compra, 'PaymentDate') || pega(ev, 'CreatedAt') || new Date().toISOString(),
      },
    });
    resultado = variante ? `venda na página ${variante.toUpperCase()}` : 'venda sem etiqueta';
    // Aprende o produto do teste para reconhecer as vendas sem etiqueta.
    if (testeId && variante && produtoId) {
      const [t] = await sb(`esteira_testes?id=eq.${q(testeId)}&select=produtos`);
      if (t && !(t.produtos || []).includes(produtoId)) await sb(`esteira_testes?id=eq.${q(testeId)}`, { method: 'PATCH', body: { produtos: [...(t.produtos || []), produtoId] } });
    }
  } else if (reembolso && pagamento) {
    await sb(`esteira_testes_vendas?id=eq.${q(pagamento)}`, { method: 'PATCH', body: { reembolso: true } });
    resultado = 'reembolso marcado';
  }
  // Registro curto de cada envio (sem dados do comprador), para conferir que está chegando.
  await sb('esteira_testes_webhooks', {
    method: 'POST',
    body: { evento, is_test: ehTeste, pagamento, teste_id: testeId, variante, via, vtid: vtid.slice(0, 80), tem_sck: !!sck, valor, produto: produtoNome.slice(0, 200), resultado },
  });
  return { ok: true, resultado };
}

// ---------------------------------------------------------------- rotas com login
export async function rotasTestes(p, m, ctx) {
  const { sb, json, fail, q, user, admin, body, getConfig, setConfig, origem, tokenWebhook } = ctx;
  const cfg = await getConfig();
  const regua = { ...REGUA_PADRAO, ...(cfg.testesRegua || {}) };
  const evento = (txt) => ({ em: new Date().toISOString(), por: user.nome, txt });

  async function carregar(id) {
    const [r] = await sb(`esteira_testes?id=eq.${q(id)}&select=*`);
    if (!r) fail(404, `O teste ${id} não existe.`);
    return r;
  }
  async function salvar(row, patch, txt) {
    const historico = [...(row.historico || []), ...(txt ? [evento(txt)] : [])];
    const [r] = await sb(`esteira_testes?id=eq.${q(row.id)}`, { method: 'PATCH', body: { ...patch, historico, atualizado_em: new Date().toISOString() }, prefer: 'return=representation' });
    return r;
  }
  async function notaNaOferta(ofertaId, txt) {
    if (!ofertaId) return;
    const [of] = await sb(`esteira_ofertas?id=eq.${q(ofertaId)}&select=historico`);
    if (of) await sb(`esteira_ofertas?id=eq.${q(ofertaId)}`, { method: 'PATCH', body: { historico: [...(of.historico || []), evento(txt)] } });
  }
  async function placarDe(rows) {
    if (!rows.length) return {};
    const ids = rows.map((r) => r.id).join(',');
    const [cont, vendas] = await Promise.all([
      sb(`esteira_testes_contagem?teste_id=in.(${ids})&select=teste_id,dia,variante,visitas,ics`),
      sb(`esteira_testes_vendas?teste_id=in.(${ids})&is_test=eq.false&select=teste_id,variante,valor,upsell,reembolso,pago_em,via`),
    ]);
    return Object.fromEntries(rows.map((r) => [r.id, {
      ...calcularPlacar({
        variantes: r.variantes || [], contagem: cont.filter((c) => c.teste_id === r.id), vendas: vendas.filter((v) => v.teste_id === r.id),
        gasto: r.gasto?.total ?? null, inicio: r.inicio, fim: r.fim, regua,
      }),
      semEtiqueta: vendas.filter((v) => v.teste_id === r.id && !v.variante && !v.reembolso).length,
      _cont: cont.filter((c) => c.teste_id === r.id), _vendas: vendas.filter((v) => v.teste_id === r.id),
    }]));
  }
  function validarVariantes(vs) {
    if (!Array.isArray(vs) || vs.length < 2) fail(400, 'O teste precisa de pelo menos duas páginas.');
    if (vs.length > 4) fail(400, 'No máximo quatro páginas por teste.');
    const ids = 'abcd';
    const out = vs.map((v, i) => ({ id: ids[i], nome: String(v.nome || `Página ${ids[i].toUpperCase()}`).trim().slice(0, 80), arquivo: limparArquivo(v.arquivo), peso: Math.max(0, Math.min(100, Math.round(Number(v.peso) || 0))) }));
    if (out[0].arquivo !== '/') fail(400, 'A página A é a página atual do site (/).');
    if (new Set(out.map((v) => v.arquivo)).size !== out.length) fail(400, 'Cada página precisa de um arquivo diferente.');
    if (out.reduce((s, v) => s + v.peso, 0) <= 0) fail(400, 'A divisão precisa somar mais que zero.');
    return out;
  }

  if (p === '/api/testes/config' && m === 'GET') {
    return json(200, { regua, webhook: admin ? `${origem}/api/testes/lastlink/${tokenWebhook()}` : null });
  }
  if (p === '/api/testes/config' && m === 'POST') {
    if (!admin) fail(403, 'Só o gestor muda a régua.');
    const b = await body();
    const r = {};
    for (const k of Object.keys(REGUA_PADRAO)) if (Number(b[k]) > 0) r[k] = Number(b[k]);
    await setConfig('testesRegua', { ...regua, ...r });
    return json(200, { regua: { ...regua, ...r } });
  }
  if (p === '/api/testes/webhooks' && m === 'GET') {
    return json(200, await sb('esteira_testes_webhooks?select=recebido_em,evento,is_test,teste_id,variante,via,vtid,tem_sck,valor,produto,resultado&order=recebido_em.desc&limit=40'));
  }

  if (p === '/api/testes' && m === 'GET') {
    const rows = await sb('esteira_testes?select=*&order=criado_em.desc');
    const pl = await placarDe(rows);
    return json(200, rows.map((r) => {
      const { _cont, _vendas, ...resumo } = pl[r.id] || {};
      return { ...paraApp(r), placar: resumo };
    }));
  }
  if (p === '/api/testes' && m === 'POST') {
    if (!admin) fail(403, 'Só o gestor cria testes.');
    const b = await body();
    const nome = String(b.nome || '').trim();
    const host = limparHost(b.host);
    if (!nome) fail(400, 'Dê um nome ao teste.');
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) fail(400, 'Domínio inválido. Ex.: radicigana.onlinechoice.site');
    const variantes = validarVariantes(b.variantes);
    const n = await sb('rpc/esteira_proximo_teste', { method: 'POST', body: {} });
    const row = { id: 'TS-' + String(n).padStart(4, '0'), numero: n, nome, host, oferta_id: b.ofertaId || null, variantes, status: 'rascunho', notas: b.notas || '', criado_por: user.id, historico: [evento('Teste criado')] };
    const [r] = await sb('esteira_testes', { method: 'POST', body: row, prefer: 'return=representation' });
    if (r.oferta_id) await notaNaOferta(r.oferta_id, `Teste A/B ${r.id} criado: ${nome}`);
    return json(201, paraApp(r));
  }

  const mi = p.match(/^\/api\/testes\/(TS-\d+)(\/acao)?$/);
  if (!mi) fail(404, 'Rota não encontrada.');
  const row = await carregar(mi[1]);

  if (!mi[2] && m === 'GET') {
    const pl = (await placarDe([row]))[row.id];
    const porDia = {};
    for (const c of pl._cont) { const k = c.dia; porDia[k] ||= {}; porDia[k][c.variante] = { visitas: c.visitas, ics: c.ics, vendas: 0, fat: 0 }; }
    for (const v of pl._vendas) {
      if (!v.variante || v.reembolso) continue;
      const k = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(v.pago_em));
      porDia[k] ||= {}; porDia[k][v.variante] ||= { visitas: 0, ics: 0, vendas: 0, fat: 0 };
      if (!v.upsell) porDia[k][v.variante].vendas++;
      porDia[k][v.variante].fat += Number(v.valor || 0);
    }
    const vias = { vtid: 0, sck: 0 };
    for (const v of pl._vendas) if (v.via) vias[v.via] = (vias[v.via] || 0) + 1;
    const { _cont, _vendas, ...resumo } = pl;
    return json(200, { teste: paraApp(row), placar: resumo, porDia, vias, regua });
  }
  if (!mi[2] && m === 'PATCH') {
    if (!admin) fail(403, 'Só o gestor muda o teste.');
    const b = await body();
    const patch = {};
    const txt = [];
    if (b.nome !== undefined) patch.nome = String(b.nome).trim() || row.nome;
    if (b.notas !== undefined) patch.notas = String(b.notas);
    if (b.ofertaId !== undefined) patch.oferta_id = b.ofertaId || null;
    if (b.host !== undefined) {
      if (row.status === 'ativo') fail(400, 'Pause o teste antes de trocar o domínio.');
      patch.host = limparHost(b.host);
    }
    if (b.variantes !== undefined) {
      const novas = validarVariantes(b.variantes);
      if (row.status !== 'rascunho' && novas.some((v, i) => row.variantes[i] && v.arquivo !== row.variantes[i].arquivo)) fail(400, 'Depois de ligar, só a divisão e os nomes podem mudar. Para trocar uma página, crie um teste novo.');
      if (row.status !== 'rascunho' && novas.length !== row.variantes.length) fail(400, 'Depois de ligar, não dá para tirar ou pôr páginas. Crie um teste novo.');
      patch.variantes = novas;
      const antes = row.variantes.map((v) => v.peso).join('/'), depois = novas.map((v) => v.peso).join('/');
      if (antes !== depois) txt.push(`Divisão ${antes} → ${depois}`);
    }
    if (b.gasto !== undefined) {
      const total = numero(b.gasto);
      patch.gasto = total > 0 ? { total, em: new Date().toISOString(), por: user.nome } : null;
      txt.push(total > 0 ? `Gasto do período: R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Gasto apagado');
    }
    return json(200, paraApp(await salvar(row, patch, txt.join(' · '))));
  }
  if (!mi[2] && m === 'DELETE') {
    if (!admin) fail(403, 'Só o gestor exclui testes.');
    if (row.status === 'ativo') fail(400, 'Pause o teste antes de excluir.');
    await sb(`esteira_testes_contagem?teste_id=eq.${q(row.id)}`, { method: 'DELETE' });
    await sb(`esteira_testes_visitantes?teste_id=eq.${q(row.id)}`, { method: 'DELETE' });
    await sb(`esteira_testes_vendas?teste_id=eq.${q(row.id)}`, { method: 'PATCH', body: { teste_id: null, variante: null } });
    await sb(`esteira_testes?id=eq.${q(row.id)}`, { method: 'DELETE' });
    return json(200, { ok: true });
  }
  if (mi[2] && m === 'POST') {
    if (!admin) fail(403, 'Só o gestor liga e desliga testes.');
    const { acao, vencedora } = await body();
    if (acao === 'ligar') {
      if (!['rascunho', 'pausado'].includes(row.status)) fail(400, 'Esse teste não pode ser ligado agora.');
      const [outro] = await sb(`esteira_testes?host=eq.${q(row.host)}&status=eq.ativo&id=neq.${q(row.id)}&select=id`);
      if (outro) fail(400, `Já tem o teste ${outro.id} rodando em ${row.host}. Pause ele antes.`);
      const r = await salvar(row, { status: 'ativo', inicio: row.inicio || new Date().toISOString(), fim: null }, row.status === 'pausado' ? 'Teste religado' : 'Teste ligado');
      if (row.status === 'rascunho') await notaNaOferta(row.oferta_id, `Teste A/B ${row.id} ligado`);
      return json(200, paraApp(r));
    }
    if (acao === 'pausar') {
      if (row.status !== 'ativo') fail(400, 'O teste não está rodando.');
      return json(200, paraApp(await salvar(row, { status: 'pausado' }, 'Teste pausado: todo mundo volta a ver a página A')));
    }
    if (acao === 'encerrar') {
      if (!['ativo', 'pausado'].includes(row.status)) fail(400, 'Esse teste não está rodando.');
      const v = row.variantes.find((x) => x.id === vencedora);
      const r = await salvar(row, { status: 'encerrado', fim: new Date().toISOString(), vencedora: v ? v.id : null },
        v ? `Encerrado. Vencedora: ${v.nome} (${v.id.toUpperCase()}). Todo mundo passa a ver ela.` : 'Encerrado sem vencedora. Todo mundo volta a ver a página A.');
      await notaNaOferta(row.oferta_id, v ? `Teste A/B ${row.id} encerrado: venceu ${v.nome}` : `Teste A/B ${row.id} encerrado sem vencedora`);
      return json(200, paraApp(r));
    }
    if (acao === 'soltar') {
      // Depois de pôr a vencedora como arquivo principal do site, o divisor para de interferir.
      if (row.status !== 'encerrado') fail(400, 'Só para testes encerrados.');
      return json(200, paraApp(await salvar(row, { vencedora: null }, 'Divisor solto: o site volta a abrir o arquivo principal')));
    }
    fail(400, 'Ação desconhecida.');
  }
  fail(404, 'Rota não encontrada.');
}

export { STATUS_TESTE };
