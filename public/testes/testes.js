// App Testes: A/B de páginas de vendas com o divisor do Netlify e as vendas da Lastlink.
// Mesmo login, mesma API e mesmo visual da Esteira e das Ofertas.
import { STATUS_TESTE, REGUA_PADRAO } from '/testes/regras.mjs';

const S = { token: localStorage.getItem('esteira.token') || '', user: null, testes: [], ofertas: [], cfg: null };

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDH = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const fmtData = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const N = (v, d = 0) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d }));
const R$ = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : 'R$ ' + N(v, 2));
const P = (v, d = 1) => (v === null || v === undefined ? '—' : N(v * 100, d) + '%');
const X = (v) => (v === null || v === undefined ? '—' : N(v, 2));
const L = (id) => String(id || '').toUpperCase();
const isAdmin = () => S.user?.papel === 'admin';

function toast(msg, erro = false) {
  const t = $('#toast'); t.textContent = msg; t.className = 'show' + (erro ? ' erro' : '');
  clearTimeout(toast.h); toast.h = setTimeout(() => (t.className = ''), erro ? 6000 : 3200);
}
async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(path, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(S.token ? { authorization: 'Bearer ' + S.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/api/login') { sair(); throw new Error(j.erro || 'Faça login de novo.'); }
  if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
  return j;
}
function sair() { S.token = ''; S.user = null; localStorage.removeItem('esteira.token'); renderLogin(); }

async function renderLogin() {
  const users = await api('/api/usuarios');
  let sel = users.find((u) => u.papel === 'admin')?.id || users[0]?.id;
  $('#app').innerHTML = `
  <div class="login"><div class="login-box">
    <h1>Testes</h1>
    <p class="lede">Teste A/B de páginas de vendas. Mesmo acesso da Esteira.</p>
    <div class="people">${users.map((u) => `<button class="person ${u.id === sel ? 'on' : ''}" data-id="${u.id}"><span><b>${esc(u.nome)}</b></span><small>${u.papel === 'admin' ? 'Gestor' : 'Operador'}</small></button>`).join('')}</div>
    <form id="lf" class="stack"><label class="f"><span>PIN</span><input type="password" id="pin" inputmode="numeric" autocomplete="current-password" autofocus></label><button class="btn big">Entrar</button></form>
  </div></div>`;
  $$('.person').forEach((b) => b.onclick = () => { sel = b.dataset.id; $$('.person').forEach((x) => x.classList.toggle('on', x === b)); $('#pin').focus(); });
  $('#lf').onsubmit = async (e) => {
    e.preventDefault();
    try { const r = await api('/api/login', { method: 'POST', body: { id: sel, pin: $('#pin').value } }); S.token = r.token; localStorage.setItem('esteira.token', r.token); await boot(); }
    catch (err) { toast(err.message, true); $('#pin').select(); }
  };
}

async function boot() {
  if (!S.token) return renderLogin();
  try {
    S.user = (await api('/api/eu')).usuario;
    [S.testes, S.ofertas, S.cfg] = await Promise.all([api('/api/testes'), api('/api/ofertas').catch(() => []), api('/api/testes/config')]);
  } catch (err) {
    if (!S.token) return;
    const semTabela = /esteira_testes/.test(err.message);
    $('#app').innerHTML = `<div class="login"><div class="login-box"><h1>Testes</h1>
      <p class="lede">${semTabela ? 'O banco ainda não tem as tabelas dos testes. Rode o SQL do Testes A/B no Supabase (SQL Editor → colar → Run) e recarregue esta página.' : esc(err.message)}</p>
      <p><a class="btn ghost" href="/">Voltar ao hub</a></p></div></div>`;
    return;
  }
  $('#app').innerHTML = `
  <div class="top of">
    <div class="brand"><a href="/" title="Voltar ao hub">Kaian Digital</a><span class="crumb">Testes</span></div>
    <div class="counters" id="counters"></div><span></span>
  </div>
  <nav class="nav">
    <a href="#/" data-r="">Testes</a>
    ${isAdmin() ? '<a href="#/novo" data-r="novo">Novo teste</a><a href="#/ajustes" data-r="ajustes">Ajustes</a>' : ''}
    <span class="grow"></span>
    <span class="who">${esc(S.user.nome)} <button class="linkbtn" id="sair">Sair</button></span>
  </nav>
  <main id="main"></main>`;
  $('#sair').onclick = sair;
  route();
}

function contadores() {
  const n = (s) => S.testes.filter((t) => t.status === s).length;
  $('#counters').innerHTML = `<span class="${n('ativo') ? 'alert' : ''}"><b>${n('ativo')}</b>rodando</span><span><b>${n('pausado')}</b>pausados</span><span><b>${n('encerrado')}</b>encerrados</span>`;
}

function route() {
  if (!S.user) return;
  const [, r = '', arg] = location.hash.split('/');
  $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.r === r));
  contadores();
  window.scrollTo({ top: 0 });
  if (r === 't' && arg) return pageTeste(arg);
  if (r === 'novo' && isAdmin()) return pageNovo();
  if (r === 'ajustes' && isAdmin()) return pageAjustes();
  return pageLista();
}
window.addEventListener('hashchange', route);

const chip = (s) => `<span class="st ${s}">${esc(STATUS_TESTE[s] || s)}</span>`;
const nomeOferta = (id) => { const o = S.ofertas.find((x) => x.id === id); return o ? `${o.id} · ${o.frase}` : id || ''; };

// ---------------------------------------------------------------- lista
function pageLista() {
  const lista = S.testes;
  $('#main').innerHTML = `
  <div class="head"><div><h1>Testes A/B de páginas</h1><div class="muted">O anúncio aponta para um link só. O Netlify escolhe a página de cada visitante, e cada venda da Lastlink volta dizendo de qual página veio.</div></div>
  ${isAdmin() ? '<a class="btn" href="#/novo">Novo teste</a>' : ''}</div>
  ${lista.length ? `<div class="tcards">${lista.map((t) => {
    const pl = t.placar || {};
    return `<a class="tcard" href="#/t/${t.id}">
      <div><h3>${esc(t.nome)} ${chip(t.status)}</h3><div class="meta"><span class="t">${t.id}</span><span>${esc(t.host)}</span>${t.ofertaId ? `<span>${esc(nomeOferta(t.ofertaId))}</span>` : ''}${t.inicio ? `<span>desde ${fmtData(t.inicio)}</span>` : ''}</div></div>
      <div class="muted small" style="text-align:right;max-width:380px">${esc(pl.veredito?.txt || '')}</div>
      <div class="mini">${(pl.linhas || []).map((l) => `<div class="v"><b>${L(l.id)} · ${esc(l.nome)}</b><span>${N(l.visitas)} visitas · ${N(l.vendas)} vendas</span><span>${R$(l.rpv)} por visitante${l.chance !== null && l.chance !== undefined ? ` · ${Math.round(l.chance * 100)}%` : ''}</span></div>`).join('')}</div>
    </a>`;
  }).join('')}</div>` : `<div class="panel"><div class="body"><p>Nenhum teste ainda.</p>${isAdmin() ? '<p><a class="btn" href="#/novo">Criar o primeiro</a></p>' : ''}</div></div>`}`;
}

// ---------------------------------------------------------------- novo
function linhaVariante(v, i, travado = false) {
  return `<div class="vrow" data-i="${i}">
    <span class="lt">${'ABCD'[i]}</span>
    <input class="vn" placeholder="Nome (ex.: Página atual)" value="${esc(v.nome || '')}">
    <input class="va" placeholder="${i === 0 ? '/' : '/b/'}" value="${esc(v.arquivo || '')}" ${i === 0 || travado ? 'disabled' : ''} title="${i === 0 ? 'A página A é sempre a página atual do site.' : 'Pasta da página dentro do mesmo site.'}">
    <input class="vp" type="number" min="0" max="100" value="${esc(v.peso ?? 50)}" title="Parte do tráfego">
  </div>`;
}
function lerVariantes() { return $$('.vrow[data-i]').map((r, i) => ({ nome: $('.vn', r).value, arquivo: i === 0 ? '/' : $('.va', r).value, peso: Number($('.vp', r).value) })); }
function desenharSplit() {
  const vs = lerVariantes(); const tot = vs.reduce((s, v) => s + (v.peso || 0), 0) || 1;
  $('#split').innerHTML = vs.map((v) => `<div style="width:${(100 * (v.peso || 0)) / tot}%"></div>`).join('');
  $('#splittxt').textContent = vs.map((v, i) => `${'ABCD'[i]} ${Math.round((100 * (v.peso || 0)) / tot)}%`).join(' · ');
}

function pageNovo() {
  const ofertas = S.ofertas.filter((o) => !['descartada', 'cacador_descartou', 'arquivada'].includes(o.status));
  const vs = [{ nome: 'Página atual', arquivo: '/', peso: 50 }, { nome: 'Página nova', arquivo: '/b/', peso: 50 }];
  $('#main').innerHTML = `
  <div class="head"><div><h1>Novo teste</h1><div class="muted">O teste nasce desligado. Você liga quando a página B estiver no ar.</div></div></div>
  <div class="grid2">
    <section class="panel"><header><h2>O teste</h2></header><div class="body stack">
      <label class="f"><span>Nome</span><input id="nome" placeholder="Ex.: Radiestesia Cigana · PV atual x PV nova"></label>
      <label class="f"><span>Oferta</span><select id="oferta"><option value="">Sem oferta ligada</option>${ofertas.map((o) => `<option value="${o.id}">${esc(o.id)} · ${esc(o.frase)}</option>`).join('')}</select></label>
      <label class="f"><span>Domínio da página</span><input id="host" placeholder="radicigana.onlinechoice.site"><small class="muted">O mesmo link que está no anúncio.</small></label>
      <label class="f"><span>Notas</span><textarea id="notas" rows="3" placeholder="O que muda da A para a B?"></textarea></label>
    </div></section>
    <section class="panel"><header><h2>Páginas e divisão</h2><button class="btn ghost small" id="mais">Mais uma página</button></header><div class="body stack">
      <div class="vrow muted small"><span></span><span>Nome</span><span>Pasta no site</span><span>Tráfego</span></div>
      <div id="vs">${vs.map((v, i) => linhaVariante(v, i)).join('')}</div>
      <div><div class="split" id="split"></div><p class="small muted" id="splittxt"></p></div>
      <p class="small muted">A página A é a que o site já abre hoje. A B fica numa pasta do mesmo site (ex.: <code>/b/</code>), com os arquivos dela dentro.</p>
    </div></section>
  </div>
  <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn big" id="criar">Criar teste</button></div>`;
  const ligar = () => { $$('.vp, .va, .vn').forEach((x) => x.oninput = desenharSplit); desenharSplit(); };
  ligar();
  $('#oferta').onchange = () => { if (!$('#nome').value) $('#nome').value = (S.ofertas.find((o) => o.id === $('#oferta').value)?.frase || '') + ' · A/B de página'; };
  $('#mais').onclick = () => {
    const n = $$('.vrow[data-i]').length; if (n >= 4) return toast('No máximo quatro páginas.', true);
    $('#vs').insertAdjacentHTML('beforeend', linhaVariante({ nome: '', arquivo: `/${'abcd'[n]}/`, peso: 0 }, n)); ligar();
  };
  $('#criar').onclick = async (e) => {
    e.target.disabled = true;
    try {
      const t = await api('/api/testes', { method: 'POST', body: { nome: $('#nome').value, ofertaId: $('#oferta').value, host: $('#host').value, notas: $('#notas').value, variantes: lerVariantes() } });
      S.testes = await api('/api/testes'); location.hash = `#/t/${t.id}`; toast(`Teste ${t.id} criado.`);
    } catch (err) { toast(err.message, true); e.target.disabled = false; }
  };
}

// ---------------------------------------------------------------- ficha do teste
async function pageTeste(id) {
  $('#main').innerHTML = '<p class="muted">Carregando…</p>';
  let d;
  try { d = await api(`/api/testes/${id}`); } catch (err) { $('#main').innerHTML = `<p>${esc(err.message)}</p>`; return; }
  const { teste: t, placar: pl, porDia, vias, regua } = d;
  const ls = pl.linhas || [];
  const melhor = (campo, maior = true) => {
    const vals = ls.map((l) => l[campo]).filter((v) => v !== null && v !== undefined && Number.isFinite(v));
    if (vals.length < 2) return null;
    return maior ? Math.max(...vals) : Math.min(...vals);
  };
  const linha = (rotulo, campo, fmt, { maior = true, main = false, dica = '', destaque = true } = {}) => {
    const b = destaque ? melhor(campo, maior) : null;
    return `<tr class="${main ? 'main' : ''}"><td class="lbl">${rotulo}${dica ? `<div class="sub">${dica}</div>` : ''}</td>${ls.map((l) => `<td class="num ${b !== null && l[campo] === b && ls.filter((x) => x[campo] === b).length === 1 ? 'best' : ''}">${fmt(l[campo])}</td>`).join('')}</tr>`;
  };
  const sep = (txt) => `<tr class="sep"><td colspan="${ls.length + 1}">${txt}</td></tr>`;
  const temGasto = !!t.gasto?.total;
  const dias = Object.keys(porDia).sort().reverse();
  const verComo = (v) => `https://${t.host}${v.arquivo === '/' ? '/' : '/'}?ab_ver=${v.id}`;

  $('#main').innerHTML = `
  <div class="fhead">
    <div><h1><span class="idt">${t.id}</span> ${esc(t.nome)} ${chip(t.status)}</h1>
      <div class="meta"><a href="https://${esc(t.host)}" target="_blank" rel="noopener">${esc(t.host)}</a>${t.ofertaId ? `<a href="/ofertas/#/of/${esc(t.ofertaId)}">${esc(nomeOferta(t.ofertaId))}</a>` : ''}${t.inicio ? `<span>ligado em ${fmtDH(t.inicio)}</span>` : ''}${t.fim ? `<span>encerrado em ${fmtDH(t.fim)}</span>` : ''}<span>${N(pl.dias, 1)} dias</span></div></div>
    <div class="row">${acoes(t, pl)}</div>
  </div>
  <div class="veredito ${pl.veredito.tipo}">${esc(pl.veredito.txt)}<small>Régua: ${regua.confianca}% de chance de ser a melhor em receita por visitante, com pelo menos ${regua.minVendas} vendas, ${regua.minDias} dias e ${regua.minVisitas} visitas por página.</small></div>
  <div class="fgrid">
    <div class="side">
      <section class="panel"><header><h2>Divisão</h2></header><div class="body stack">
        <div id="vs">${t.variantes.map((v, i) => linhaVariante(v, i, t.status !== 'rascunho')).join('')}</div>
        <div><div class="split" id="split"></div><p class="small muted" id="splittxt"></p></div>
        ${isAdmin() ? '<button class="btn ghost small" id="salvarDiv">Salvar divisão</button>' : ''}
        <div class="small stack">${t.variantes.map((v) => `<a href="${esc(verComo(v))}" target="_blank" rel="noopener">Ver como ${esc(v.nome)} (${L(v.id)})</a>`).join('')}<span class="muted">Esses links não contam visita.</span></div>
      </div></section>
      <section class="panel"><header><h2>Gasto do período</h2></header><div class="body stack">
        <p class="small muted">O anúncio é o mesmo para todas as páginas, então o gasto é dividido pela parte do tráfego de cada uma. É isso que gera o ROAS, o custo por IC e o CPA de cada página.</p>
        <div class="row"><input id="gasto" type="text" inputmode="decimal" placeholder="Ex.: 850,00" value="${temGasto ? N(t.gasto.total, 2) : ''}"><button class="btn small" id="salvarGasto" ${isAdmin() ? '' : 'disabled'}>Salvar</button></div>
        ${temGasto ? `<span class="small muted">Lançado por ${esc(t.gasto.por)} em ${fmtDH(t.gasto.em)}</span>` : ''}
      </div></section>
      <section class="panel"><header><h2>Conferência</h2></header><div class="body stack">
        <div class="prova"><div><b>${N(vias.vtid || 0)}</b><span>vendas com etiqueta no link</span></div><div><b>${N(vias.sck || 0)}</b><span>pelo ID da Stape</span></div><div><b>${N(pl.semEtiqueta || 0)}</b><span>sem etiqueta</span></div></div>
        <p class="small muted">Toda venda da oferta deveria chegar com etiqueta. Se o número sem etiqueta crescer, alguma venda está entrando por outro caminho (outro link, e-mail, orgânico). Compare o total com a UTMIFY do mesmo período.</p>
      </div></section>
      ${t.notas ? `<section class="panel"><header><h2>Notas</h2></header><div class="body small">${esc(t.notas).replace(/\n/g, '<br>')}</div></section>` : ''}
    </div>
    <div class="mainc">
      <section class="panel"><header><h2>Placar</h2></header><div class="tablewrap" style="border:0">
        <table class="placar"><thead><tr><th></th>${ls.map((l) => `<th class="var">${L(l.id)} · ${esc(l.nome)}</th>`).join('')}</tr></thead><tbody>
          ${linha('<b>Receita por visitante</b>', 'rpv', R$, { main: true, dica: 'É o ROAS da página: o custo por visitante é o mesmo para todas.' })}
          <tr><td class="lbl">Chance de ser a melhor</td>${ls.map((l) => `<td class="num">${l.chance === null ? '—' : `<div class="chance"><div class="tr"><div style="width:${Math.round(l.chance * 100)}%"></div></div><span>${Math.round(l.chance * 100)}%</span></div>`}</td>`).join('')}</tr>
          ${sep('Funil')}
          ${linha('Visitantes únicos', 'visitas', (v) => N(v), { destaque: false })}
          ${linha('Cliques no checkout (IC)', 'ics', (v) => N(v), { destaque: false })}
          ${linha('Taxa de IC', 'taxaIC', (v) => P(v), { dica: 'Cliques no checkout ÷ visitantes. É onde a página trabalha.' })}
          ${linha('Vendas', 'vendas', (v) => N(v), { destaque: false })}
          ${linha('Conversão do checkout', 'convCheckout', (v) => P(v), { dica: 'Vendas ÷ IC. O checkout é o mesmo, então deve ficar parecido.' })}
          ${linha('Conversão total', 'conversao', (v) => P(v, 2), { dica: 'Vendas ÷ visitantes.' })}
          ${sep('Dinheiro')}
          ${linha('Faturamento', 'faturamento', R$, { dica: 'Com order bump e upsell.', destaque: false })}
          ${linha('Ticket médio', 'ticket', R$)}
          ${linha('Upsells', 'upsells', (v) => N(v), { destaque: false })}
          ${linha('Reembolsos', 'reembolsos', (v) => N(v), { maior: false })}
          ${sep(temGasto ? 'Com o gasto do período' : 'Lance o gasto do período para ver ROAS, custo por IC e CPA')}
          ${temGasto ? `${linha('Gasto (pela parte do tráfego)', 'gasto', R$, { destaque: false })}
          ${linha('<b>ROAS</b>', 'roas', X, { main: true })}
          ${linha('Custo por IC', 'custoIC', R$, { maior: false })}
          ${linha('CPA', 'cpa', R$, { maior: false })}` : ''}
        </tbody></table></div></section>
      <section class="panel"><header><h2>Dia a dia</h2></header><div class="tablewrap" style="border:0">
        ${dias.length ? `<table class="placar"><thead><tr><th>Dia</th>${t.variantes.map((v) => `<th class="var">${L(v.id)} visitas</th><th class="var">${L(v.id)} IC</th><th class="var">${L(v.id)} vendas</th>`).join('')}</tr></thead><tbody>
          ${dias.map((dia) => `<tr><td>${fmtData(dia)}</td>${t.variantes.map((v) => { const x = porDia[dia][v.id] || {}; return `<td class="num">${N(x.visitas || 0)}</td><td class="num">${N(x.ics || 0)}</td><td class="num">${N(x.vendas || 0)}</td>`; }).join('')}</tr>`).join('')}
        </tbody></table>` : '<div class="vazio-tab muted">Os números aparecem aqui quando o teste for ligado.</div>'}
      </div></section>
      <section class="panel"><header><h2>Histórico</h2></header><div class="body"><ul class="hist">${[...t.historico].reverse().map((h) => `<li><time>${fmtDH(h.em)}</time><span>${esc(h.txt)} <span class="muted">· ${esc(h.por)}</span></span></li>`).join('')}</ul></div></section>
    </div>
  </div>`;

  $$('.vp, .vn').forEach((x) => x.oninput = desenharSplit); desenharSplit();
  $('#salvarDiv')?.addEventListener('click', async () => {
    try { await api(`/api/testes/${t.id}`, { method: 'PATCH', body: { variantes: lerVariantes().map((v, i) => ({ ...v, arquivo: t.variantes[i]?.arquivo || v.arquivo })) } }); toast('Divisão salva. Vale em até 15 segundos.'); pageTeste(t.id); }
    catch (err) { toast(err.message, true); }
  });
  $('#salvarGasto').onclick = async () => {
    try { await api(`/api/testes/${t.id}`, { method: 'PATCH', body: { gasto: $('#gasto').value.replace(/\./g, '').replace(',', '.') } }); toast('Gasto salvo.'); pageTeste(t.id); }
    catch (err) { toast(err.message, true); }
  };
  $$('[data-acao]').forEach((b) => b.onclick = async () => {
    const acao = b.dataset.acao, vencedora = b.dataset.v;
    if (b.dataset.confirma && !b.classList.contains('armado')) { b.classList.add('armado'); b.textContent = b.dataset.confirma; setTimeout(() => { b.classList.remove('armado'); b.textContent = b.dataset.txt; }, 4000); return; }
    try {
      if (acao === 'excluir') { await api(`/api/testes/${t.id}`, { method: 'DELETE' }); S.testes = await api('/api/testes'); location.hash = '#/'; toast('Teste excluído.'); return; }
      await api(`/api/testes/${t.id}/acao`, { method: 'POST', body: { acao, vencedora } });
      S.testes = await api('/api/testes'); contadores(); pageTeste(t.id);
      toast({ ligar: 'Teste ligado. O divisor começa em até 15 segundos.', pausar: 'Pausado. Todo mundo vê a página A.', encerrar: 'Teste encerrado.', soltar: 'Divisor solto.' }[acao] || 'Feito.');
    } catch (err) { toast(err.message, true); }
  });
}

function acoes(t, pl) {
  if (!isAdmin()) return '';
  const btn = (acao, txt, cls = '', extra = '') => `<button class="btn ${cls}" data-acao="${acao}" data-txt="${esc(txt)}" ${extra}>${esc(txt)}</button>`;
  const enc = t.variantes.map((v) => btn('encerrar', `Encerrar: vence ${L(v.id)}`, v.id === pl.veredito.id ? 'ok' : 'ghost', `data-v="${v.id}" data-confirma="Confirmar: ${L(v.id)} para todo mundo"`)).join('');
  if (t.status === 'rascunho') return btn('ligar', 'Ligar teste', 'ok', 'data-confirma="Confirmar: ligar agora"') + btn('excluir', 'Excluir', 'danger', 'data-confirma="Confirmar exclusão"');
  if (t.status === 'ativo') return btn('pausar', 'Pausar', 'ghost') + enc;
  if (t.status === 'pausado') return btn('ligar', 'Religar', 'ok') + enc + btn('encerrar', 'Encerrar sem vencedora', 'ghost', 'data-confirma="Confirmar: volta tudo para A"') + btn('excluir', 'Excluir', 'danger', 'data-confirma="Confirmar exclusão"');
  if (t.status === 'encerrado') return t.vencedora ? `<span class="small muted" style="max-width:340px">Todo mundo está vendo a ${L(t.vencedora)}. Quando ela virar o arquivo principal do site, solte o divisor.</span>` + btn('soltar', 'Soltar divisor', 'ghost', 'data-confirma="Confirmar: a vencedora já é a principal"') : btn('excluir', 'Excluir', 'danger', 'data-confirma="Confirmar exclusão"');
  return '';
}

// ---------------------------------------------------------------- ajustes
async function pageAjustes() {
  const r = S.cfg.regua || REGUA_PADRAO;
  const hooks = await api('/api/testes/webhooks').catch(() => []);
  $('#main').innerHTML = `
  <div class="head"><div><h1>Ajustes dos testes</h1></div></div>
  <div class="grid2">
    <section class="panel"><header><h2>Webhook da Lastlink</h2></header><div class="body stack">
      <p class="small">Na Lastlink, em <b>Integrações</b> do produto, ative <b>Lastlink - Webhook</b>, cole este endereço e marque os eventos de compra completa e de reembolso. Pode ficar junto com o webhook da UTMIFY.</p>
      <div class="copy"><input id="wh" readonly value="${esc(S.cfg.webhook || '')}"><button class="btn small" id="copiar">Copiar</button></div>
      <p class="small muted">O endereço tem um código secreto. Não compartilhe.</p>
    </div></section>
    <section class="panel"><header><h2>Régua da vencedora</h2></header><div class="body stack">
      <div class="grid4" style="grid-template-columns:1fr 1fr">
        <label class="f"><span>Chance mínima (%)</span><input id="r-confianca" type="number" value="${r.confianca}"></label>
        <label class="f"><span>Vendas no total</span><input id="r-minVendas" type="number" value="${r.minVendas}"></label>
        <label class="f"><span>Dias rodando</span><input id="r-minDias" type="number" value="${r.minDias}"></label>
        <label class="f"><span>Visitas por página</span><input id="r-minVisitas" type="number" value="${r.minVisitas}"></label>
      </div>
      <button class="btn small" id="salvarRegua">Salvar régua</button>
    </div></section>
  </div>
  <section class="panel" style="margin-top:16px"><header><h2>Últimos envios da Lastlink</h2></header><div class="tablewrap" style="border:0">
    ${hooks.length ? `<table><thead><tr><th>Quando</th><th>Evento</th><th>Produto</th><th>Valor</th><th>Resultado</th><th>Etiqueta</th></tr></thead><tbody>${hooks.map((h) => `<tr><td>${fmtDH(h.recebido_em)}</td><td>${esc(h.evento)}${h.is_test ? ' <span class="t">teste</span>' : ''}</td><td>${esc(h.produto)}</td><td>${R$(h.valor)}</td><td>${esc(h.resultado)}${h.teste_id ? ` · ${esc(h.teste_id)}` : ''}</td><td class="small">${esc(h.vtid || (h.tem_sck ? 'só ID da Stape' : '—'))}</td></tr>`).join('')}</tbody></table>` : '<div class="vazio-tab muted">Nada recebido ainda. Depois de colar o endereço na Lastlink, o primeiro envio aparece aqui.</div>'}
  </div></section>`;
  $('#copiar').onclick = async () => { try { await navigator.clipboard.writeText($('#wh').value); toast('Copiado.'); } catch { $('#wh').select(); } };
  $('#salvarRegua').onclick = async () => {
    try { const j = await api('/api/testes/config', { method: 'POST', body: Object.fromEntries(Object.keys(REGUA_PADRAO).map((k) => [k, $(`#r-${k}`).value])) }); S.cfg.regua = j.regua; toast('Régua salva.'); }
    catch (err) { toast(err.message, true); }
  };
}

boot();
