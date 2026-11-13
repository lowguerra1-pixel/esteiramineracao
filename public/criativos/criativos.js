// App Criativos: a base de criativos da operação, o kanban de 72h, o painel e as regras de veredito.
// Mesmo login, mesma API e mesmo visual dos outros apps.

const S = { token: localStorage.getItem('esteira.token') || '', user: null, d: null, f: { oferta: '', busca: '', tipo: '' }, ord: { k: 'd7.receita', dir: -1 } };
const STATUS_NOME = { fila: 'Fila', briefing: 'Briefing', producao: 'Produção', revisao: 'Revisão', aprovado: 'Aprovado', no_ar: 'No ar (72h)', meio: 'Veredito: variar', vencedor: 'Vencedor', fadiga: 'Fadiga', morto: 'Morto' };
const ESTADO_NOME = { validacao: 'Validação', escalando: 'Escalando', em_risco: 'Em risco', pausada: 'Pausada', encerrada: 'Encerrada' };
const TIPO_NOME = { modelagem: 'Modelagem', variacao: 'Variação', zero: 'Do zero' };
const FORMATOS = ['IMG', 'VID', 'UGC', 'CAR'];
const PROXIMO = { fila: ['briefing'], briefing: ['producao', 'revisao'], producao: ['revisao'], revisao: ['aprovado', 'briefing'], aprovado: ['no_ar', 'producao'], no_ar: ['vencedor', 'meio', 'morto'], meio: ['no_ar', 'morto', 'vencedor'], vencedor: ['fadiga', 'morto'], fadiga: ['vencedor', 'morto'], morto: ['fila'] };

// ---------------------------------------------------------------- utils
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const opts = (list, sel, ph) => (ph !== undefined ? `<option value="">${esc(ph)}</option>` : '') + list.map((o) => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(t)}</option>`; }).join('');
const hoje = () => new Date().toLocaleDateString('en-CA');
const fmtData = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
const fmtDH = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const fmtN = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d }));
const fmtR = (v) => (v === null || v === undefined ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 }));
const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const dias = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 864e5) : null);
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const roasCls = (r, R) => (r === null || r === undefined ? '' : r >= (R?.roasSegue ?? 1.3) ? 'good' : r < (R?.roasMorre ?? 1) ? 'bad' : '');

function toast(msg, erro = false) { const t = $('#toast'); t.textContent = msg; t.className = 'show' + (erro ? ' erro' : ''); clearTimeout(toast.h); toast.h = setTimeout(() => (t.className = ''), erro ? 6000 : 3200); }
async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(path, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(S.token ? { authorization: 'Bearer ' + S.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/api/login') { sair(); throw new Error(j.erro || 'Faça login de novo.'); }
  if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
  return j;
}
function sair() { S.token = ''; S.user = null; localStorage.removeItem('esteira.token'); renderLogin(); }
const oferta = (id) => S.d.ofertas.find((o) => o.id === id);
const criativo = (id) => S.d.criativos.find((c) => c.id === id);
async function recarregar() { S.d = await api('/api/cr/bootstrap'); }

// ---------------------------------------------------------------- login
async function renderLogin() {
  const users = await api('/api/usuarios');
  let sel = users.find((u) => u.papel === 'admin')?.id || users[0]?.id;
  $('#app').innerHTML = `
  <div class="login"><div class="login-box">
    <h1>Criativos</h1>
    <p class="lede">A base de criativos e o kanban de 72h da operação. Mesmo acesso da Esteira.</p>
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

// ---------------------------------------------------------------- shell
async function boot() {
  if (!S.token) return renderLogin();
  try { S.user = (await api('/api/eu')).usuario; await recarregar(); } catch (e) { toast(e.message, true); return; }
  shell(); route();
}
function shell() {
  $('#app').innerHTML = `
  <div class="top cr">
    <div class="brand"><a href="/" title="Voltar ao hub">Kaian Digital</a><span class="crumb">Criativos</span></div>
    <div class="counters" id="counters"></div>
    <span></span>
  </div>
  <nav class="nav">
    <a href="#/painel" data-r="painel">Painel</a>
    <a href="#/board" data-r="board">Board</a>
    <a href="#/tabela" data-r="tabela">Tabela</a>
    <a href="#/calendario" data-r="calendario">Calendário</a>
    <a href="#/ofertas" data-r="ofertas">Ofertas</a>
    ${S.user.papel === 'admin' ? '<a href="#/ajustes" data-r="ajustes">Ajustes</a>' : ''}
    <span class="grow"></span>
    <span class="who">${esc(S.user.nome)} <button class="linkbtn" id="sair">Sair</button></span>
  </nav>
  <main id="main"></main>`;
  $('#sair').onclick = sair;
}
function contadores() {
  const p = S.d.painel;
  const n = (st) => S.d.criativos.filter((c) => c.status === st).length;
  $('#counters').innerHTML = `
    <span class="${p.vencedoresSemana < p.metaVencedores ? 'alert' : ''}"><b>${p.vencedoresSemana}</b>vencedores na semana</span>
    <span><b>${n('aprovado')}</b>pra produzir</span>
    <span><b>${n('revisao')}</b>pra aprovar</span>
    <span><b>${n('no_ar') + n('meio')}</b>no ar</span>`;
}
function route() {
  if (!S.user) return;
  const [, r = 'painel', arg] = location.hash.split('/');
  $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.r === r));
  contadores(); window.scrollTo({ top: 0 });
  if (r === 'board') return pageBoard();
  if (r === 'tabela') return pageTabela();
  if (r === 'calendario') return pageCalendario();
  if (r === 'ofertas') return pageOfertas();
  if (r === 'ajustes' && S.user.papel === 'admin') return pageAjustes();
  if (r === 'c' && arg) { pagePainel(); return abrirFicha(decodeURIComponent(arg)); }
  return pagePainel();
}
window.addEventListener('hashchange', route);

// ---------------------------------------------------------------- filtros comuns
function filtrados() {
  const f = S.f;
  return S.d.criativos.filter((c) => (!f.oferta || c.ofertaId === f.oferta) && (!f.tipo || c.tipo === f.tipo) && (!f.busca || norm(c.id + ' ' + (c.angulo || '') + ' ' + (c.hook || '')).includes(norm(f.busca))));
}
function barraFiltros(extra = '') {
  return `<div class="filtros">
    <select id="f_oferta">${opts(S.d.ofertas.map((o) => [o.id, o.nome]), S.f.oferta, 'Todas as ofertas')}</select>
    <select id="f_tipo">${opts(Object.entries(TIPO_NOME), S.f.tipo, 'Todos os tipos')}</select>
    <input type="text" id="f_busca" placeholder="Buscar ID, ângulo, hook…" value="${esc(S.f.busca)}">
    ${extra}
    <span class="grow"></span>
    <button class="btn small" id="novo">+ Criativo</button>
  </div>`;
}
function bindFiltros(render) {
  $('#f_oferta').onchange = (e) => { S.f.oferta = e.target.value; render(); };
  $('#f_tipo').onchange = (e) => { S.f.tipo = e.target.value; render(); };
  $('#f_busca').oninput = (e) => { S.f.busca = e.target.value; clearTimeout(bindFiltros.h); bindFiltros.h = setTimeout(render, 200); };
  $('#novo').onclick = () => novoCriativo();
}

// ---------------------------------------------------------------- painel
function pagePainel() {
  const p = S.d.painel, R = S.d.regras;
  const kpi = (v, l, cls = '', sub = '') => `<div class="kpi ${cls}"><div class="v">${v}${sub ? `<small>${sub}</small>` : ''}</div><div class="l">${l}</div></div>`;
  $('#main').innerHTML = `
  <div class="head"><div><h1>Painel</h1><div class="muted">A métrica-mãe é a primeira: ela antecipa a receita em 30 dias. Semana = últimos 7 dias.</div></div>
    <div class="row"><span class="small muted">${S.d.ultimoSync ? `Meta sincronizada ${fmtDH(S.d.ultimoSync.em)}` : 'Meta ainda não sincronizada'} · ${S.d.ultimoVeredito ? `veredito ${fmtDH(S.d.ultimoVeredito.em)}` : 'veredito ainda não rodou'}</span></div></div>
  <div class="kpis">
    ${kpi(p.vencedoresSemana, 'criativos vencedores novos na semana', p.vencedoresSemana >= p.metaVencedores ? 'ok' : p.vencedoresSemana >= 3 ? 'warn' : 'bad', `meta ${p.metaVencedores}`)}
    ${kpi(p.ofertasAcima5k, 'ofertas acima de R$ 5 mil na semana', p.ofertasAcima5k >= p.metaOfertas ? 'ok' : p.ofertasAcima5k >= 3 ? 'warn' : 'bad', `meta ${p.metaOfertas}`)}
    ${kpi(p.shareMaior ? p.shareMaior.pct + '%' : '—', p.shareMaior ? `da receita vem de ${esc(oferta(p.shareMaior.oferta)?.nome || p.shareMaior.oferta)}` : 'share da maior oferta', p.shareMaior ? (p.shareMaior.pct < 40 ? 'ok' : p.shareMaior.pct <= 55 ? 'warn' : 'bad') : '', 'limite 40%')}
    ${kpi(fmtR(p.receita7), 'receita rastreada na semana (vendas com criativo)')}
  </div>
  <div class="panel"><header><h2>Ofertas</h2><span class="small muted">regras: veredito em ${R.horasVeredito}h · segue ≥ ${R.roasSegue} · morre &lt; ${R.roasMorre} · vencedor com ${R.vencedorVendas} vendas</span></header>
    <div class="ofrow h"><span>Oferta</span><span>Estado</span><span>Receita 7d</span><span>No ar</span><span>Vencedores</span><span>Na fila</span><span>Último vencedor</span><span>Próxima leva</span></div>
    ${p.porOferta.map((o) => `<div class="ofrow">
      <span><b class="nome"><a href="#/board" data-of="${o.id}">${esc(o.nome)}</a></b><span class="small muted">${o.id}</span></span>
      <span><span class="est ${o.estado}">${ESTADO_NOME[o.estado]}</span></span>
      <span class="n">${fmtR(o.receita7)} <span class="small muted">${o.receitaSemanaAnterior ? (o.receita7 >= o.receitaSemanaAnterior ? '▲' : '▼') + Math.abs(Math.round(((o.receita7 - o.receitaSemanaAnterior) / o.receitaSemanaAnterior) * 100)) + '%' : ''}</span></span>
      <span class="n">${o.rodando}</span><span class="n">${o.vencedores}</span><span class="n">${o.emFila}</span>
      <span class="${o.diasSemVencedor !== null && o.diasSemVencedor >= R.diasRisco ? 'muted' : ''}" style="${o.diasSemVencedor !== null && o.diasSemVencedor >= R.diasRisco ? 'color:var(--erro)' : ''}">${o.diasSemVencedor === null ? 'nunca' : o.diasSemVencedor + ' dias atrás'}</span>
      <span>${o.proximaLeva ? `<a href="#/calendario">${fmtData(o.proximaLeva.data)} · ${esc(o.proximaLeva.id)}</a>` : '<span class="muted">não planejada</span>'}</span>
    </div>`).join('') || '<div class="ofrow"><span class="muted">Cadastre as ofertas em Ofertas.</span></div>'}
  </div>`;
  $$('[data-of]').forEach((a) => a.onclick = () => { S.f.oferta = a.dataset.of; });
}

// ---------------------------------------------------------------- board
function pageBoard() {
  $('#main').innerHTML = `<div class="head"><div><h1>Board</h1><div class="muted">Um card por criativo. Clique pra ver métricas, mover de coluna, aprovar ou devolver.</div></div></div>${barraFiltros()}<div class="board" id="board"></div>`;
  bindFiltros(renderBoard); renderBoard();
}
function cardHtml(c) {
  const R = S.d.regras, T = c.total, D = c.d7;
  const m = ['no_ar', 'meio', 'vencedor', 'fadiga'].includes(c.status)
    ? `<span>7d <b class="${roasCls(D.roas, R)}">${D.roas ?? '—'}</b></span><span>total <b class="${roasCls(T.roas, R)}">${T.roas ?? '—'}</b></span><span><b>${T.vendas}</b> v</span><span>${fmtR(T.gasto)}</span>`
    : `<span class="muted">${c.paiId ? 'de ' + esc(c.paiId) : (c.angulo || c.hook || '')}</span>`;
  return `<div class="ccard" data-id="${esc(c.id)}"><div class="id">${esc(c.id)}</div><div class="m"><span class="tipo ${c.tipo}">${TIPO_NOME[c.tipo]}</span>${c.formato ? `<span>${esc(c.formato)}</span>` : ''}<span>${esc(c.ofertaId)}</span></div><div class="m">${m}</div></div>`;
}
function renderBoard() {
  const lista = filtrados();
  $('#board').innerHTML = S.d.status.map((st) => {
    const cs = lista.filter((c) => c.status === st).sort((a, b) => (b.d7.receita || 0) - (a.d7.receita || 0) || b.statusEm.localeCompare(a.statusEm));
    return `<div class="col ${st}"><h2><span>${STATUS_NOME[st]}</span><span>${cs.length}</span></h2>${cs.slice(0, 60).map(cardHtml).join('')}${cs.length > 60 ? `<div class="small muted">+${cs.length - 60} (use a Tabela)</div>` : ''}</div>`;
  }).join('');
  $$('.ccard').forEach((el) => el.onclick = () => abrirFicha(el.dataset.id));
}

// ---------------------------------------------------------------- tabela
const COLS = [
  ['id', 'Criativo'], ['ofertaId', 'Oferta'], ['status', 'Status'], ['tipo', 'Tipo'], ['formato', 'Fmt'], ['levaId', 'Leva'],
  ['d7.gasto', 'Gasto 7d', 1], ['d7.vendas', 'Vendas 7d', 1], ['d7.roas', 'ROAS 7d', 1], ['total.gasto', 'Gasto total', 1], ['total.vendas', 'Vendas', 1], ['total.receita', 'Receita', 1], ['total.roas', 'ROAS', 1], ['total.cpa', 'CPA', 1], ['total.hookRate', 'Hook %', 1], ['total.holdRate', 'Hold %', 1], ['total.ctr', 'CTR %', 1], ['noArEm', 'No ar desde'],
];
function pageTabela() {
  $('#main').innerHTML = `<div class="head"><div><h1>Tabela</h1><div class="muted">A Evidência: ordene por qualquer coluna. É daqui que saem os pais da próxima leva.</div></div></div>
  ${barraFiltros(`<select id="f_status">${opts(S.d.status.map((s) => [s, STATUS_NOME[s]]), S.f.status || '', 'Todos os status')}</select><button class="btn ghost small" id="csv">Baixar CSV</button>`)}
  <div class="tablewrap" id="tw"></div>`;
  bindFiltros(renderTabela);
  $('#f_status').onchange = (e) => { S.f.status = e.target.value; renderTabela(); };
  $('#csv').onclick = () => baixarCsv(linhasTabela());
  renderTabela();
}
const linhasTabela = () => filtrados().filter((c) => !S.f.status || c.status === S.f.status).sort((a, b) => { const x = get(a, S.ord.k), y = get(b, S.ord.k); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * S.ord.dir; });
function renderTabela() {
  const rows = linhasTabela();
  $('#tw').innerHTML = `<table class="tb"><thead><tr>${COLS.map(([k, n, num]) => `<th class="${num ? 'n' : ''} ${S.ord.k === k ? 'on' : ''}" data-k="${k}">${n}${S.ord.k === k ? (S.ord.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`).join('')}</tr></thead>
  <tbody>${rows.slice(0, 1500).map((c) => `<tr>${COLS.map(([k, , num]) => { let v = get(c, k); if (k === 'id') v = `<a href="#" data-id="${esc(c.id)}">${esc(c.id)}</a>`; else if (k === 'status') v = STATUS_NOME[v]; else if (k === 'tipo') v = TIPO_NOME[v]; else if (k === 'noArEm') v = fmtData(v); else if (num) v = k.endsWith('gasto') || k.endsWith('receita') || k.endsWith('cpa') ? fmtR(v) : fmtN(v, k.endsWith('vendas') ? 0 : 2); return `<td class="${num ? 'n' : ''}">${v ?? '—'}</td>`; }).join('')}</tr>`).join('')}</tbody></table>
  <div class="small muted" style="padding:8px 10px">${rows.length} criativos</div>`;
  $$('th[data-k]').forEach((th) => th.onclick = () => { const k = th.dataset.k; S.ord = { k, dir: S.ord.k === k ? -S.ord.dir : -1 }; renderTabela(); });
  $$('td a[data-id]').forEach((a) => a.onclick = (e) => { e.preventDefault(); abrirFicha(a.dataset.id); });
}
function baixarCsv(rows) {
  const escC = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const cols = [...COLS, ['paiId', 'Pai'], ['angulo', 'Ângulo'], ['mecanismo', 'Mecanismo'], ['hook', 'Hook'], ['body', 'Body'], ['aprendizado', 'Aprendizado']];
  const txt = '﻿' + [cols.map((c) => escC(c[1])).join(','), ...rows.map((c) => cols.map(([k]) => escC(get(c, k))).join(','))].join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv' })); a.download = `criativos-${hoje()}.csv`; a.click();
}

// ---------------------------------------------------------------- calendário
function pageCalendario() {
  const ini = new Date(); ini.setDate(ini.getDate() - ini.getDay()); // domingo desta semana
  const diasCal = Array.from({ length: 28 }, (_, i) => { const d = new Date(ini); d.setDate(ini.getDate() + i); return d.toLocaleDateString('en-CA'); });
  const h = hoje();
  $('#main').innerHTML = `<div class="head"><div><h1>Calendário de levas</h1><div class="muted">Quando sai a próxima leva de cada oferta. A cada 2–3 dias, uma leva por oferta viva.</div></div><button class="btn small" id="nl">+ Leva</button></div>
  <div class="cal">${diasCal.map((d) => { const dt = new Date(d + 'T12:00'); const fds = [0, 6].includes(dt.getDay()); const ls = S.d.levas.filter((l) => (l.planejada || l.noAr) === d || (l.status === 'no_ar' && l.noAr === d)); return `<div class="d ${d === h ? 'hoje' : ''}"><div class="dt ${fds ? 'fds' : ''}">${dt.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' })}</div>${ls.map((l) => `<a class="lv ${l.status}" href="#" data-l="${esc(l.id)}">${esc(l.id)}${l.hipotese ? ` · ${esc(l.hipotese.slice(0, 28))}` : ''}</a>`).join('')}</div>`; }).join('')}</div>
  <div class="panel" style="margin-top:16px"><header><h2>Levas</h2></header><div class="body"><table class="tb"><thead><tr><th>Leva</th><th>Oferta</th><th>Status</th><th>Planejada</th><th>No ar</th><th>Hipótese</th><th class="n">Criativos</th><th class="n">Vencedores</th></tr></thead><tbody>
  ${S.d.levas.slice(0, 80).map((l) => { const cs = S.d.criativos.filter((c) => c.levaId === l.id); return `<tr><td><a href="#" data-l="${esc(l.id)}">${esc(l.id)}</a></td><td>${esc(l.ofertaId)}</td><td>${esc(l.status)}</td><td>${fmtData(l.planejada)}</td><td>${fmtData(l.noAr)}</td><td style="white-space:normal">${esc(l.hipotese || '')}</td><td class="n">${cs.length}</td><td class="n">${cs.filter((c) => c.status === 'vencedor').length}</td></tr>`; }).join('')}
  </tbody></table></div></div>`;
  $('#nl').onclick = novaLeva;
  $$('[data-l]').forEach((a) => a.onclick = (e) => { e.preventDefault(); editarLeva(a.dataset.l); });
}
function novaLeva() {
  modal(`<h2>Nova leva</h2><div class="stack">
    <label class="f"><span>Oferta</span><select id="l_of">${opts(S.d.ofertas.map((o) => [o.id, o.nome]), S.f.oferta, 'Escolha')}</select></label>
    <label class="f"><span>Data planejada</span><input type="date" id="l_data" value="${hoje()}"></label>
    <label class="f"><span>Hipótese que a leva testa</span><input type="text" id="l_hip" placeholder="Ex.: ângulo 'sintoma físico' em UGC"></label>
    <div class="row"><button class="btn" id="l_ok">Criar</button></div></div>`);
  $('#l_ok').onclick = async () => { try { await api('/api/cr/levas', { method: 'POST', body: { ofertaId: $('#l_of').value, planejada: $('#l_data').value, hipotese: $('#l_hip').value } }); fecharModal(); await recarregar(); route(); toast('Leva criada.'); } catch (e) { toast(e.message, true); } };
}
function editarLeva(id) {
  const l = S.d.levas.find((x) => x.id === id); if (!l) return;
  const cs = S.d.criativos.filter((c) => c.levaId === id);
  modal(`<h2>${esc(l.id)}</h2><div class="stack">
    <div class="form3"><label class="f"><span>Status</span><select id="l_st">${opts(['planejada', 'producao', 'no_ar', 'encerrada'], l.status)}</select></label>
    <label class="f"><span>Planejada</span><input type="date" id="l_data" value="${l.planejada || ''}"></label>
    <label class="f"><span>No ar</span><input type="date" id="l_noar" value="${l.noAr || ''}"></label></div>
    <label class="f"><span>Hipótese</span><input type="text" id="l_hip" value="${esc(l.hipotese || '')}"></label>
    <div class="row"><button class="btn" id="l_ok">Salvar</button></div>
    <h3>Criativos da leva (${cs.length})</h3>${cs.map(cardHtml).join('') || '<div class="muted small">Nenhum ainda. Crie em Board › + Criativo escolhendo esta leva.</div>'}</div>`);
  $$('.ccard', $('#modal')).forEach((el) => el.onclick = () => abrirFicha(el.dataset.id));
  $('#l_ok').onclick = async () => { try { await api(`/api/cr/levas/${id}`, { method: 'PATCH', body: { status: $('#l_st').value, planejada: $('#l_data').value || null, noAr: $('#l_noar').value || null, hipotese: $('#l_hip').value } }); fecharModal(); await recarregar(); route(); } catch (e) { toast(e.message, true); } };
}

// ---------------------------------------------------------------- ofertas
function pageOfertas() {
  $('#main').innerHTML = `<div class="head"><div><h1>Ofertas</h1><div class="muted">A sigla é o prefixo do nome dos anúncios (CFAM-L4-UGC-05 → CFAM). O estado define o mix da próxima leva.</div></div><button class="btn small" id="no">+ Oferta</button></div>
  <div class="cards">${S.d.ofertas.map((o) => `<div class="ocard" style="grid-template-columns:1fr auto"><div><h3>${esc(o.nome)} <span class="muted">${o.id}</span> <span class="est ${o.estado}">${ESTADO_NOME[o.estado]}</span></h3>
    <div class="meta"><span class="t">mix ${o.mix?.modelagem ?? 60}/${o.mix?.variacao ?? 30}/${o.mix?.zero ?? 10}</span>${(o.prefixos || []).map((p) => `<span class="t">${esc(p)}</span>`).join('')}${o.familia ? `<span>${esc(o.familia)}</span>` : ''}${o.pastaDrive ? `<a href="${esc(o.pastaDrive)}" target="_blank">pasta</a>` : ''}${o.pvUrl ? `<a href="${esc(o.pvUrl)}" target="_blank">PV</a>` : ''}</div>
    ${o.notas ? `<div class="small muted" style="margin-top:6px">${esc(o.notas)}</div>` : ''}</div><div><button class="btn ghost small" data-ed="${o.id}">Editar</button></div></div>`).join('') || '<div class="muted">Nenhuma oferta ainda.</div>'}</div>`;
  $('#no').onclick = () => formOferta();
  $$('[data-ed]').forEach((b) => b.onclick = () => formOferta(oferta(b.dataset.ed)));
}
function formOferta(o) {
  const mix = o?.mix || { modelagem: 60, variacao: 30, zero: 10 };
  modal(`<h2>${o ? esc(o.nome) : 'Nova oferta'}</h2><div class="stack">
    <div class="form3"><label class="f"><span>Sigla (prefixo dos anúncios)</span><input type="text" id="o_id" value="${esc(o?.id || '')}" ${o ? 'disabled' : ''} placeholder="CFAM"></label>
    <label class="f"><span>Nome</span><input type="text" id="o_nome" value="${esc(o?.nome || '')}"></label>
    <label class="f"><span>Família</span><input type="text" id="o_fam" value="${esc(o?.familia || '')}" placeholder="Constelação"></label></div>
    <div class="form3"><label class="f"><span>Estado</span><select id="o_est">${opts(Object.entries(ESTADO_NOME), o?.estado || 'validacao')}</select></label>
    <label class="f"><span>Outros prefixos <em>(vírgula)</em></span><input type="text" id="o_pref" value="${esc((o?.prefixos || []).join(', '))}" placeholder="BARCONST, CONST"></label>
    <label class="f"><span>Produtos na Lastlink <em>(trechos do nome, vírgula)</em></span><input type="text" id="o_prod" value="${esc((o?.produtos || []).join(', '))}" placeholder="Baralho da Constelação"></label></div>
    <div class="form3"><label class="f"><span>Mix: modelagem %</span><input type="number" id="o_m1" value="${mix.modelagem}"></label><label class="f"><span>variação %</span><input type="number" id="o_m2" value="${mix.variacao}"></label><label class="f"><span>do zero %</span><input type="number" id="o_m3" value="${mix.zero}"></label></div>
    <div class="grid2"><label class="f"><span>Pasta no Drive</span><input type="url" id="o_pasta" value="${esc(o?.pastaDrive || '')}"></label><label class="f"><span>Página de vendas</span><input type="url" id="o_pv" value="${esc(o?.pvUrl || '')}"></label></div>
    <label class="f"><span>Notas</span><textarea id="o_notas">${esc(o?.notas || '')}</textarea></label>
    <div class="row"><button class="btn" id="o_ok">Salvar</button></div></div>`);
  $('#o_ok').onclick = async () => {
    const lista = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
    const body = { nome: $('#o_nome').value, familia: $('#o_fam').value, estado: $('#o_est').value, prefixos: lista($('#o_pref').value), produtos: lista($('#o_prod').value), mix: { modelagem: Number($('#o_m1').value), variacao: Number($('#o_m2').value), zero: Number($('#o_m3').value) }, pastaDrive: $('#o_pasta').value, pvUrl: $('#o_pv').value, notas: $('#o_notas').value };
    try { if (o) await api(`/api/cr/ofertas/${o.id}`, { method: 'PATCH', body }); else await api('/api/cr/ofertas', { method: 'POST', body: { id: $('#o_id').value, ...body } }); fecharModal(); await recarregar(); route(); toast('Salvo.'); } catch (e) { toast(e.message, true); }
  };
}

// ---------------------------------------------------------------- ficha do criativo
function modal(html) { fecharModal(); const m = document.createElement('div'); m.className = 'modal'; m.id = 'modal'; m.innerHTML = `<div class="box"><button class="linkbtn x" id="mx">Fechar</button>${html}</div>`; document.body.appendChild(m); $('#mx').onclick = fecharModal; m.onclick = (e) => { if (e.target === m) fecharModal(); }; }
function fecharModal() { $('#modal')?.remove(); }

async function abrirFicha(id) {
  const c = criativo(id); if (!c) return toast('Criativo não encontrado.', true);
  const R = S.d.regras, T = c.total, D = c.d7;
  const admin = S.user.papel === 'admin';
  const met = (v, l) => `<div><div class="v">${v}</div><div class="l">${l}</div></div>`;
  const prox = (PROXIMO[c.status] || []).filter((s) => admin || s !== 'aprovado');
  modal(`<div class="fh"><div><h2>${esc(c.id)} <span class="st">${STATUS_NOME[c.status]}</span></h2>
    <div class="meta"><span class="tipo ${c.tipo}">${TIPO_NOME[c.tipo]}</span><span class="t">${esc(c.ofertaId)}</span>${c.levaId ? `<span class="t">${esc(c.levaId)}</span>` : ''}${c.formato ? `<span class="t">${esc(c.formato)}</span>` : ''}${c.paiId ? `<span>pai: <a href="#" data-id="${esc(c.paiId)}">${esc(c.paiId)}</a></span>` : ''}${c.noArEm ? `<span>no ar há ${dias(c.noArEm)} dias</span>` : ''}</div></div></div>
  <div class="mets">${met(fmtR(T.gasto), 'gasto total')}${met(T.vendas, 'vendas')}${met(fmtR(T.receita), 'receita')}${met(`<span class="${roasCls(T.roas, R)}">${T.roas ?? '—'}</span>`, 'ROAS total')}${met(`<span class="${roasCls(D.roas, R)}">${D.roas ?? '—'}</span>`, 'ROAS 7d')}${met(fmtR(T.cpa), 'CPA')}</div>
  <div class="mets">${met(fmtN(T.hookRate), 'hook % (3s/impr.)')}${met(fmtN(T.holdRate), 'hold % (75%/impr.)')}${met(fmtN(T.ctr), 'CTR %')}${met(fmtN(T.conversao), 'conv. % (vendas/LPV)')}${met(T.ic, 'inícios de checkout')}${met(T.reembolsos, 'reembolsos')}</div>
  <div id="serie" class="small muted">carregando série diária…</div>
  <div class="acoes">${prox.map((s) => `<button class="btn ${s === 'aprovado' ? 'ok' : s === 'morto' ? 'danger' : s === 'briefing' && c.status === 'revisao' ? 'warn' : 'ghost'} small" data-st="${s}">${s === 'briefing' && c.status === 'revisao' ? 'Devolver' : s === 'aprovado' ? 'Aprovar' : '→ ' + STATUS_NOME[s]}</button>`).join('')}</div>
  <div class="form3">
    <label class="f"><span>Tipo</span><select id="c_tipo">${opts(Object.entries(TIPO_NOME), c.tipo)}</select></label>
    <label class="f"><span>Formato</span><select id="c_fmt">${opts(FORMATOS, c.formato || '', '—')}</select></label>
    <label class="f"><span>Leva</span><select id="c_leva">${opts(S.d.levas.filter((l) => l.ofertaId === c.ofertaId).map((l) => [l.id, l.id + (l.hipotese ? ' · ' + l.hipotese.slice(0, 30) : '')]), c.levaId || '', '—')}</select></label>
    <label class="f"><span>Criativo-pai</span><input type="text" id="c_pai" value="${esc(c.paiId || '')}" list="ids"></label>
    <label class="f"><span>Ângulo</span><input type="text" id="c_ang" value="${esc(c.angulo || '')}"></label>
    <label class="f"><span>Mecanismo</span><input type="text" id="c_mec" value="${esc(c.mecanismo || '')}"></label>
    <label class="f"><span>Hook</span><input type="text" id="c_hook" value="${esc(c.hook || '')}"></label>
    <label class="f"><span>Body (estrutura)</span><input type="text" id="c_body" value="${esc(c.body || '')}"></label>
    <label class="f"><span>Arquivo (Drive)</span><input type="url" id="c_arq" value="${esc(c.arquivoUrl || '')}"></label>
  </div>
  <datalist id="ids">${S.d.criativos.filter((x) => x.status === 'vencedor' && x.ofertaId === c.ofertaId).map((x) => `<option value="${esc(x.id)}">`).join('')}</datalist>
  <label class="f" style="margin-top:10px"><span>Copy / roteiro</span><textarea id="c_copy" rows="5">${esc(c.copy || '')}</textarea></label>
  <div class="grid2" style="margin-top:10px"><label class="f"><span>Aprendizado <em>(1 linha: o que este criativo ensinou)</em></span><input type="text" id="c_apr" value="${esc(c.aprendizado || '')}"></label><label class="f"><span>Nota do revisor <em>(0–10)</em></span><input type="number" id="c_score" min="0" max="10" value="${c.score ?? ''}"></label></div>
  <div class="row" style="margin:10px 0 16px"><button class="btn" id="c_ok">Salvar ficha</button><span class="small muted">${c.criadoPor ? `criado por ${esc(c.criadoPor)} em ${fmtDH(c.criadoEm)}` : ''}</span></div>
  <h3>Histórico</h3><div class="hist">${(c.historico || []).slice().reverse().map((h) => `<div>${fmtDH(h.em)} · ${h.de ? STATUS_NOME[h.de] + ' → ' : ''}${STATUS_NOME[h.para] || h.para} · ${esc(h.por)}${h.nota ? ` · ${esc(h.nota)}` : ''}</div>`).join('')}</div>`);
  $$('[data-id]', $('#modal')).forEach((a) => a.onclick = (e) => { e.preventDefault(); abrirFicha(a.dataset.id); });
  $$('[data-st]').forEach((b) => b.onclick = async () => {
    const para = b.dataset.st;
    const nota = ['briefing', 'morto', 'meio'].includes(para) ? prompt('Nota (por quê?):') : '';
    if (nota === null) return;
    try { await api(`/api/cr/criativos/${encodeURIComponent(c.id)}/status`, { method: 'POST', body: { para, nota } }); await recarregar(); route(); abrirFicha(c.id); toast(`${c.id} → ${STATUS_NOME[para]}`); } catch (e) { toast(e.message, true); }
  });
  $('#c_ok').onclick = async () => {
    try {
      await api(`/api/cr/criativos/${encodeURIComponent(c.id)}`, { method: 'PATCH', body: { tipo: $('#c_tipo').value, formato: $('#c_fmt').value || null, levaId: $('#c_leva').value || null, paiId: $('#c_pai').value || null, angulo: $('#c_ang').value, mecanismo: $('#c_mec').value, hook: $('#c_hook').value, body: $('#c_body').value, arquivoUrl: $('#c_arq').value, copy: $('#c_copy').value, aprendizado: $('#c_apr').value, score: $('#c_score').value === '' ? null : Number($('#c_score').value) } });
      await recarregar(); route(); toast('Ficha salva.');
    } catch (e) { toast(e.message, true); }
  };
  try {
    const serie = await api(`/api/cr/criativos/${encodeURIComponent(c.id)}/serie`);
    const el = $('#serie'); if (!el) return;
    if (!serie.length) { el.textContent = 'Sem métricas ainda (o sync da Meta roda todo dia às 6h; vendas chegam pelo webhook).'; return; }
    const max = Math.max(...serie.map((d) => Math.max(d.receita, d.gasto)), 1);
    el.className = ''; el.innerHTML = `<div class="small muted">Receita (azul) e gasto (cinza) por dia · ${serie.length} dias</div><div class="spark">${serie.map((d) => `<i title="${fmtData(d.dia)}: ${d.vendas} vendas, ${fmtR(d.receita)} / gasto ${fmtR(d.gasto)}" style="height:${Math.max(2, (d.receita / max) * 48)}px;${d.receita < d.gasto ? 'background:#B0B8C0' : ''}"></i>`).join('')}</div>`;
  } catch { const el = $('#serie'); if (el) el.textContent = ''; }
}

function novoCriativo() {
  modal(`<h2>Novo criativo</h2><div class="stack">
    <div class="form3"><label class="f"><span>Oferta</span><select id="n_of">${opts(S.d.ofertas.map((o) => [o.id, o.nome]), S.f.oferta, 'Escolha')}</select></label>
    <label class="f"><span>Leva</span><select id="n_leva"><option value="">—</option></select></label>
    <label class="f"><span>Status inicial</span><select id="n_st">${opts([['fila', 'Fila'], ['briefing', 'Briefing'], ['aprovado', 'Aprovado'], ['no_ar', 'Já está no ar']], 'fila')}</select></label></div>
    <label class="f"><span>ID = nome que o anúncio terá no Meta <em>(OFERTA-Lx-ADn-Hn-Bn-Fn)</em></span><input type="text" id="n_id" placeholder="CFAM-L6-UGC-01"></label>
    <div class="form3"><label class="f"><span>Tipo</span><select id="n_tipo">${opts(Object.entries(TIPO_NOME), 'modelagem')}</select></label>
    <label class="f"><span>Formato</span><select id="n_fmt">${opts(FORMATOS, '', '—')}</select></label>
    <label class="f"><span>Criativo-pai</span><input type="text" id="n_pai" list="ids2"></label></div>
    <datalist id="ids2">${S.d.criativos.filter((x) => x.status === 'vencedor').map((x) => `<option value="${esc(x.id)}">`).join('')}</datalist>
    <div class="grid2"><label class="f"><span>Ângulo</span><input type="text" id="n_ang"></label><label class="f"><span>Hook</span><input type="text" id="n_hook"></label></div>
    <label class="f"><span>Copy / roteiro</span><textarea id="n_copy" rows="4"></textarea></label>
    <div class="row"><button class="btn" id="n_ok">Criar</button></div></div>`);
  const levas = () => { $('#n_leva').innerHTML = '<option value="">—</option>' + opts(S.d.levas.filter((l) => l.ofertaId === $('#n_of').value && l.status !== 'encerrada').map((l) => [l.id, l.id]), ''); };
  $('#n_of').onchange = levas; levas();
  $('#n_ok').onclick = async () => {
    try { const c = await api('/api/cr/criativos', { method: 'POST', body: { id: $('#n_id').value, ofertaId: $('#n_of').value, levaId: $('#n_leva').value, status: $('#n_st').value, tipo: $('#n_tipo').value, formato: $('#n_fmt').value, paiId: $('#n_pai').value, angulo: $('#n_ang').value, hook: $('#n_hook').value, copy: $('#n_copy').value } }); fecharModal(); await recarregar(); route(); toast(`${c.id} criado.`); }
    catch (e) { toast(e.message, true); }
  };
}

// ---------------------------------------------------------------- ajustes
async function pageAjustes() {
  const R = S.d.regras;
  $('#main').innerHTML = `<div class="head"><div><h1>Ajustes</h1><div class="muted">Contas do Meta, webhook da Lastlink, regras do veredito e importação da semente.</div></div></div>
  <div class="aj">
    <div class="panel"><header><h2>Meta Ads</h2><span class="small ${S.d.metaConfigurado ? '' : 'muted'}">${S.d.metaConfigurado ? 'token configurado na Netlify' : 'falta META_ACCESS_TOKEN na Netlify'}</span></header><div class="body">
      <div id="a_lista" class="small muted">${S.d.metaConfigurado ? 'carregando as contas do token…' : 'Cadastre o token pra listar as contas.'}</div>
      <label class="f"><span>Contas ativas <em>(IDs, vírgula; a lista acima preenche isso)</em></span><input type="text" id="a_contas" value="${esc(S.d.contas.join(', '))}" placeholder="1297287845818107, 1684145772892649"></label>
      <div class="row"><button class="btn small" id="a_salvar">Salvar contas</button><span class="grow"></span><select id="a_dias">${opts([['3', 'últimos 3 dias'], ['7', 'últimos 7 dias'], ['14', 'últimos 14 dias'], ['31', 'últimos 31 dias']], '3')}</select><button class="btn ghost small" id="a_sync">Sincronizar agora</button><button class="btn ghost small" id="a_ver">Rodar veredito</button></div>
      <div class="small muted">O cron roda todo dia às 06:10 (3 dias). Pra puxar meses antigos, sincronize 31 dias por vez com a data final (abaixo).</div>
      <div class="row"><label class="f"><span>Data final <em>(histórico)</em></span><input type="date" id="a_ate"></label><button class="btn ghost small" id="a_hist">Puxar 31 dias até essa data</button></div>
      <div id="a_res" class="small"></div>
    </div></div>
    <div class="panel"><header><h2>Webhook da Lastlink</h2></header><div class="body">
      <div class="small">Na Lastlink, em Integrações › Webhooks, cadastre este endereço para os eventos <b>Purchase_Order_Confirmed</b>, <b>Payment_Refund</b> e <b>Payment_Chargeback</b>, em todos os produtos:</div>
      <pre class="code">${esc(S.d.webhook || '')}</pre>
      <div class="small muted">A venda é ligada ao criativo pelo <code>utm_content</code> (que já é o nome do anúncio nos seus links). Vendas sem criativo conhecido ficam guardadas e são ligadas depois (botão abaixo).</div>
      <div class="row"><button class="btn ghost small" id="a_religar">Religar vendas e anúncios sem par</button><button class="btn ghost small" id="a_log">Ver log</button></div>
      <div id="a_log_out"></div>
    </div></div>
    <div class="panel"><header><h2>Regras do veredito</h2></header><div class="body">
      <div class="form3">
        <label class="f"><span>Horas no ar antes do veredito</span><input type="number" id="r_h" value="${R.horasVeredito}"></label>
        <label class="f"><span>Gasto mínimo (R$) pra decidir</span><input type="number" id="r_g" value="${R.gastoMin}"></label>
        <label class="f"><span>ou vendas mínimas</span><input type="number" id="r_v" value="${R.vendasMin}"></label>
        <label class="f"><span>ROAS: segue a partir de</span><input type="number" step="0.05" id="r_s" value="${R.roasSegue}"></label>
        <label class="f"><span>ROAS: morre abaixo de</span><input type="number" step="0.05" id="r_m" value="${R.roasMorre}"></label>
        <label class="f"><span>Vendas pra virar vencedor</span><input type="number" id="r_w" value="${R.vencedorVendas}"></label>
        <label class="f"><span>Fadiga: queda do ROAS 7d vs 30d</span><input type="number" step="0.05" id="r_f" value="${R.fadigaQueda}"></label>
        <label class="f"><span>Filhos abertos por vencedor</span><input type="number" id="r_c" value="${R.filhos}"></label>
        <label class="f"><span>Dias sem vencedor = oferta em risco</span><input type="number" id="r_d" value="${R.diasRisco}"></label>
      </div>
      <div class="row"><button class="btn small" id="r_ok">Salvar regras</button></div>
    </div></div>
    <div class="panel"><header><h2>Importar semente (CSV)</h2></header><div class="body">
      <div class="small">Arquivos opcionais, com cabeçalho na primeira linha: <b>ofertas.csv</b> (id, nome, familia, estado, prefixos, produtos), <b>criativos.csv</b> (id, ofertaId, tipo, paiId, formato, status, noArEm, angulo, hook, aprendizado), <b>vendas.csv</b> (id, criativoId, ofertaId, utmContent, valor, produto, pagoEm, reembolso) e <b>metricas.csv</b> (adId, dia, criativoId, gasto, impressoes, cliques, lpv, ic, video3s, video75). Ofertas que não existirem precisam ser criadas antes.</div>
      <div class="form3"><label class="f"><span>ofertas.csv</span><input type="file" id="i_o" accept=".csv"></label><label class="f"><span>criativos.csv</span><input type="file" id="i_c" accept=".csv"></label><label class="f"><span>vendas.csv</span><input type="file" id="i_v" accept=".csv"></label><label class="f"><span>metricas.csv</span><input type="file" id="i_m" accept=".csv"></label></div>
      <div class="row"><button class="btn small" id="i_ok">Importar</button><span id="i_res" class="small"></span></div>
    </div></div>
  </div>`;
  const out = (el, txt, erro) => { $(el).textContent = txt; $(el).style.color = erro ? 'var(--erro)' : ''; };
  if (S.d.metaConfigurado) {
    try {
      const contas = await api('/api/cr/meta/contas');
      const sel = new Set(S.d.contas.map(String));
      $('#a_lista').className = ''; $('#a_lista').innerHTML = `<div class="small muted" style="margin-bottom:6px">Contas que o token enxerga (${contas.length}). Marque as que entram no sync, como na UTMIFY:</div><div class="chips">${contas.map((c) => `<button class="chip ${sel.has(String(c.id)) ? 'on' : ''}" data-c="${esc(c.id)}" title="${esc(c.status)} · ${esc(c.moeda)}${c.bm ? ' · ' + esc(c.bm) : ''}">${esc(c.nome)} <small>${esc(c.id)}</small></button>`).join('')}</div>`;
      $$('#a_lista .chip').forEach((b) => b.onclick = () => { b.classList.toggle('on'); $('#a_contas').value = $$('#a_lista .chip.on').map((x) => x.dataset.c).join(', '); });
    } catch (e) { out('#a_lista', e.message, true); }
  }
  $('#a_salvar').onclick = async () => { try { await api('/api/cr/config', { method: 'POST', body: { contas: $('#a_contas').value.split(',') } }); await recarregar(); toast('Contas salvas.'); } catch (e) { toast(e.message, true); } };
  const sync = async (body) => { out('#a_res', 'sincronizando…'); try { const r = await api('/api/cr/sync', { method: 'POST', body }); out('#a_res', `${r.desde} → ${r.ate}: ${r.linhas} linhas, ${r.anuncios} anúncios, ${r.criados} criativos novos, ${r.semPar} sem par, ${r.ligados} religados.`); await recarregar(); contadores(); } catch (e) { out('#a_res', e.message, true); } };
  $('#a_sync').onclick = () => sync({ dias: Number($('#a_dias').value) });
  $('#a_hist').onclick = () => { const ate = $('#a_ate').value; if (!ate) return toast('Escolha a data final.', true); const d = new Date(ate + 'T12:00'); d.setDate(d.getDate() - 30); sync({ desde: d.toLocaleDateString('en-CA'), ate }); };
  $('#a_ver').onclick = async () => { out('#a_res', 'rodando veredito…'); try { const r = await api('/api/cr/veredito', { method: 'POST' }); out('#a_res', r.mudancas.length ? r.mudancas.join(' · ') : 'Nenhuma mudança.'); await recarregar(); contadores(); } catch (e) { out('#a_res', e.message, true); } };
  $('#a_religar').onclick = async () => { try { const r = await api('/api/cr/religar', { method: 'POST' }); toast(`${r.ligados} ligados.`); await recarregar(); } catch (e) { toast(e.message, true); } };
  $('#a_log').onclick = async () => { const l = await api('/api/cr/log'); $('#a_log_out').innerHTML = `<div class="hist">${l.map((x) => `<div>${fmtDH(x.em)} · <b>${esc(x.tipo)}</b> · ${esc(x.resumo || '')}</div>`).join('')}</div>`; };
  $('#r_ok').onclick = async () => { try { await api('/api/cr/config', { method: 'POST', body: { regras: { horasVeredito: +$('#r_h').value, gastoMin: +$('#r_g').value, vendasMin: +$('#r_v').value, roasSegue: +$('#r_s').value, roasMorre: +$('#r_m').value, vencedorVendas: +$('#r_w').value, fadigaQueda: +$('#r_f').value, filhos: +$('#r_c').value, diasRisco: +$('#r_d').value } } }); await recarregar(); toast('Regras salvas.'); } catch (e) { toast(e.message, true); } };
  $('#i_ok').onclick = async () => {
    const ler = async (el) => { const f = $(el).files[0]; return f ? parseCsv(await f.text()) : []; };
    out('#i_res', 'lendo…');
    try {
      const [ofertas, criativos, vendas, metricas] = await Promise.all([ler('#i_o'), ler('#i_c'), ler('#i_v'), ler('#i_m')]);
      const lista = (v) => { try { const j = JSON.parse(v); return Array.isArray(j) ? j : []; } catch { return String(v || '').split(',').map((x) => x.trim()).filter(Boolean); } };
      if (ofertas.length) await api('/api/cr/importar', { method: 'POST', body: { ofertas: ofertas.map((o) => ({ ...o, prefixos: lista(o.prefixos), produtos: lista(o.produtos) })) } });
      let tot = { criativos: 0, vendas: 0, metricas: 0, ignorados: 0 };
      const lote = 1500;
      for (let i = 0; i < Math.max(criativos.length, vendas.length, metricas.length, 1); i += lote) {
        const r = await api('/api/cr/importar', { method: 'POST', body: { criativos: criativos.slice(i, i + lote), vendas: vendas.slice(i, i + lote), metricas: metricas.slice(i, i + lote) } });
        for (const k of Object.keys(tot)) tot[k] += r[k] || 0;
        out('#i_res', `importando… ${tot.criativos} criativos, ${tot.vendas} vendas, ${tot.metricas} métricas`);
      }
      out('#i_res', `Pronto: ${tot.criativos} criativos, ${tot.vendas} vendas, ${tot.metricas} métricas (${tot.ignorados} ignorados por oferta desconhecida).`);
      await recarregar(); contadores();
    } catch (e) { out('#i_res', e.message, true); }
  };
}
function parseCsv(txt) {
  const rows = []; let row = [], cell = '', q = false;
  txt = txt.replace(/^﻿/, '');
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) { if (ch === '"') { if (txt[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',' || ch === ';') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && txt[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [h, ...body] = rows.filter((r) => r.some((c) => c !== ''));
  return body.map((r) => Object.fromEntries(h.map((k, i) => [k.trim(), r[i] ?? ''])));
}

boot();
