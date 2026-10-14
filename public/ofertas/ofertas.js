// App Ofertas: Mineração (caixa, triagem, Caçador) e Modelagem (trilhas, teste, otimização, escala).
// Usa o mesmo login, a mesma API e o mesmo visual da Esteira de Repertório.
import {
  ORIGENS, STATUS, FASES_MODELAGEM, MOTIVOS_DESCARTE, IDIOMAS, TRILHAS, CHECKLIST, CLASSES, BENCHMARKS,
  classeDeAnunciantes, trilhaSugerida, FAIXAS_TESTE, faixaTeste, roasNaEscala, calcularFunil,
} from '/ofertas/regras.mjs';

const S = { token: localStorage.getItem('esteira.token') || '', user: null, usuarios: [], ofertas: [], cfg: null, aba: 'triar', busca: '', fstatus: '' };

// ---------------------------------------------------------------- utils
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const opts = (list, sel, ph) => (ph !== undefined ? `<option value="">${esc(ph)}</option>` : '') + list.map((o) => {
  const [v, t] = Array.isArray(o) ? o : [o, o];
  return `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(t)}</option>`;
}).join('');
const hoje = () => new Date().toLocaleDateString('en-CA');
const fmtData = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const fmtDH = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtN = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d }));
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
const linkCurto = (u) => { try { const x = new URL(u); return x.hostname.replace(/^www\./, '') + (x.pathname.length > 1 ? x.pathname.slice(0, 18) + (x.pathname.length > 18 ? '…' : '') : ''); } catch { return u; } };
const nomeTrilha = (t) => TRILHAS[t]?.nome || '';
const vencida = (of) => of.status === 'monitorar' && of.monitorarAte && of.monitorarAte <= hoje();
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function toast(msg, erro = false) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'show' + (erro ? ' erro' : '');
  clearTimeout(toast.h); toast.h = setTimeout(() => (t.className = ''), erro ? 6000 : 3200);
}

async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(S.token ? { authorization: 'Bearer ' + S.token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/api/login') { sair(); throw new Error(j.erro || 'Faça login de novo.'); }
  if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
  return j;
}
function sair() { S.token = ''; S.user = null; localStorage.removeItem('esteira.token'); renderLogin(); }
const atualizar = (of) => { const i = S.ofertas.findIndex((x) => x.id === of.id); if (i >= 0) S.ofertas[i] = of; else S.ofertas.unshift(of); };
let salvarFunilPendente = null; // o diagnóstico salva com atraso; antes de qualquer ação, grava o que falta
async function acao(id, acao, extra = {}) {
  if (salvarFunilPendente) await salvarFunilPendente();
  const r = await api(`/api/ofertas/${id}/acao`, { method: 'POST', body: { acao, ...extra } });
  atualizar(r.oferta); if (r.filha) atualizar(r.filha);
  if (r.aviso) toast(r.aviso, true);
  return r;
}

// ---------------------------------------------------------------- login (o mesmo da Esteira)
async function renderLogin() {
  const users = await api('/api/usuarios');
  let sel = users.find((u) => u.papel === 'admin')?.id || users[0]?.id;
  $('#app').innerHTML = `
  <div class="login"><div class="login-box">
    <h1>Ofertas</h1>
    <p class="lede">Mineração e modelagem de ofertas da Kaian Digital. Mesmo acesso da Esteira.</p>
    <div class="people">${users.map((u) => `<button class="person ${u.id === sel ? 'on' : ''}" data-id="${u.id}"><span><b>${esc(u.nome)}</b></span><small>${u.papel === 'admin' ? 'Gestor' : 'Operador'}</small></button>`).join('')}</div>
    <form id="lf" class="stack">
      <label class="f"><span>PIN</span><input type="password" id="pin" inputmode="numeric" autocomplete="current-password" autofocus></label>
      <button class="btn big">Entrar</button>
    </form>
  </div></div>`;
  $$('.person').forEach((b) => b.onclick = () => { sel = b.dataset.id; $$('.person').forEach((x) => x.classList.toggle('on', x === b)); $('#pin').focus(); });
  $('#lf').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/api/login', { method: 'POST', body: { id: sel, pin: $('#pin').value } });
      S.token = r.token; localStorage.setItem('esteira.token', r.token);
      await boot();
    } catch (err) { toast(err.message, true); $('#pin').select(); }
  };
}

// ---------------------------------------------------------------- shell
async function boot() {
  if (!S.token) return renderLogin();
  try {
    const eu = await api('/api/eu');
    S.user = eu.usuario;
    [S.usuarios, S.ofertas, S.cfg] = await Promise.all([api('/api/usuarios'), api('/api/ofertas'), api('/api/ofertas/config')]);
  } catch { return; }
  shell(); route();
}

function shell() {
  $('#app').innerHTML = `
  <div class="top of">
    <div class="brand"><a href="/" title="Voltar ao hub">Kaian Digital</a><span class="crumb">Ofertas</span></div>
    <div class="counters" id="counters"></div>
    <span></span>
  </div>
  <nav class="nav">
    <a href="#/caixa" data-r="caixa">Mineração</a>
    <a href="#/modelagem" data-r="modelagem">Modelagem</a>
    <a href="#/todas" data-r="todas">Todas</a>
    <a href="#/placar" data-r="placar">Placar do Caçador</a>
    ${S.user.papel === 'admin' ? '<a href="#/ajustes" data-r="ajustes">Ajustes</a>' : ''}
    <span class="grow"></span>
    <span class="who">${esc(S.user.nome)} <button class="linkbtn" id="sair">Sair</button></span>
  </nav>
  <main id="main"></main>`;
  $('#sair').onclick = sair;
}

function contadores() {
  const n = (f) => S.ofertas.filter(f).length;
  const triar = n((o) => o.status === 'caixa' || vencida(o));
  const rev = n(vencida);
  $('#counters').innerHTML = `
    <span class="${triar ? 'alert' : ''}"><b>${triar}</b>para triar</span>
    ${rev ? `<span class="alert"><b>${rev}</b>para revisar hoje</span>` : ''}
    <span><b>${n((o) => o.status === 'modelagem')}</b>em modelagem</span>
    <span><b>${n((o) => o.status === 'teste')}</b>em teste</span>
    <span><b>${n((o) => ['otimizar', 'escala', 'manutencao'].includes(o.status))}</b>rodando</span>`;
}

function route() {
  if (!S.user) return;
  const [, r = 'caixa', arg] = location.hash.split('/');
  const [rota, qs] = r.split('?');
  $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.r === rota || (rota === 'of' && a.dataset.r === (FASES_MODELAGEM.includes(S.ofertas.find((o) => o.id === arg)?.status) ? 'modelagem' : 'caixa'))));
  contadores();
  window.scrollTo({ top: 0 });
  if (rota === 'of' && arg) return pageFicha(arg);
  if (rota === 'modelagem') return pageModelagem();
  if (rota === 'todas') return pageTodas();
  if (rota === 'placar') return pagePlacar();
  if (rota === 'ajustes' && S.user.papel === 'admin') return pageAjustes(new URLSearchParams(qs || '').get('drive'));
  return pageCaixa();
}
window.addEventListener('hashchange', route);
const rerender = () => route();

// ---------------------------------------------------------------- mineração: caixa e triagem
function pageCaixa() {
  const triar = S.ofertas.filter((o) => o.status === 'caixa' || vencida(o))
    .sort((a, b) => (vencida(b) - vencida(a)) || ((b.score ?? -1) - (a.score ?? -1)) || (b.numero - a.numero));
  const monit = S.ofertas.filter((o) => o.status === 'monitorar' && !vencida(o)).sort((a, b) => a.monitorarAte.localeCompare(b.monitorarAte));
  const desc = S.ofertas.filter((o) => o.status === 'cacador_descartou').sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const descMinhas = S.ofertas.filter((o) => o.status === 'descartada').sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
  const listas = { triar, monit, desc, descMinhas };
  if (!listas[S.aba]) S.aba = 'triar';
  const ult = S.cfg?.ultimaPuxada;
  $('#main').innerHTML = `
  <div class="head"><div><h1>Mineração</h1><div class="muted">Anote, trie e decida. O que for Modelar segue para a Modelagem com a mesma ficha.</div></div></div>
  <form class="capture" id="cap" autocomplete="off">
    <div class="main">
      <input type="text" class="frase" id="c_frase" placeholder="A oferta em uma frase. Ex.: baralho de florais de Bach, ninguém anunciando" required>
      <input type="url" id="c_link" placeholder="Link (opcional): Biblioteca, página…">
      <button class="btn big">Anotar</button>
    </div>
    <div class="more">
      <label class="f"><span>Origem</span><select id="c_origem">${opts(ORIGENS.filter((o) => o !== 'Mecanismo vencedor'), 'Ideia')}</select></label>
      <label class="f"><span>Nicho <em>(opcional)</em></span><input type="text" id="c_nicho" placeholder="Ex.: Terapias integrativas"></label>
      <label class="f"><span>Ticket <em>(R$, opcional)</em></span><input type="text" id="c_ticket" inputmode="decimal" placeholder="37"></label>
      <label class="f"><span>Anunciantes no BR <em>(opcional)</em></span><input type="number" id="c_anun" min="0" placeholder="Define a classe"></label>
    </div>
    <div class="warn hidden" id="c_parecida"></div>
    <div class="hint" id="c_hint">Só a frase já basta. A classe sai do número de anunciantes: 0 = A, 1 a 2 = B, 3 a 9 = C, 10+ = D.</div>
  </form>
  <div class="tabs">
    <button data-aba="triar" class="${S.aba === 'triar' ? 'on' : ''}">Para triar<span class="n">${triar.length}</span></button>
    <button data-aba="monit" class="${S.aba === 'monit' ? 'on' : ''}">Monitorando<span class="n">${monit.length}</span></button>
    <button data-aba="desc" class="${S.aba === 'desc' ? 'on' : ''}">Descartadas pelo Caçador<span class="n">${desc.length}</span></button>
    <button data-aba="descMinhas" class="${S.aba === 'descMinhas' ? 'on' : ''}">Descartadas por você<span class="n">${descMinhas.length}</span></button>
    <span class="grow"></span>
    <span class="row"><span class="small muted">${ult ? `Caçador puxado em ${fmtDH(ult)}` : 'O Caçador ainda não foi puxado'}</span><button class="btn ghost small" id="puxar">Puxar Caçador</button></span>
  </div>
  <div class="cards" id="lista"></div>`;
  $$('.tabs [data-aba]').forEach((b) => b.onclick = () => { S.aba = b.dataset.aba; pageCaixa(); });
  renderLista(listas[S.aba]);
  bindCaptura();
  $('#puxar').onclick = puxarCacador;
}

function bindCaptura() {
  const frase = $('#c_frase'), anun = $('#c_anun');
  const hint = () => {
    const c = classeDeAnunciantes(anun.value);
    $('#c_hint').innerHTML = c ? `Classe <b>${c}</b>: ${esc(CLASSES[c])}` : 'Só a frase já basta. A classe sai do número de anunciantes: 0 = A, 1 a 2 = B, 3 a 9 = C, 10+ = D.';
  };
  anun.oninput = hint;
  frase.oninput = () => {
    const pal = norm(frase.value).split(/\W+/).filter((w) => w.length >= 5);
    const box = $('#c_parecida');
    const par = pal.length ? S.ofertas.filter((o) => pal.some((w) => norm(o.frase).includes(w))).slice(0, 3) : [];
    box.classList.toggle('hidden', !par.length);
    box.innerHTML = par.length ? `Parecida com: ${par.map((o) => `<a href="#/of/${o.id}">${o.id} · ${esc(o.frase)}</a> <span class="muted">(${esc(STATUS[o.status])}${o.status === 'cacador_descartou' && o.cacador?.reavaliarEm ? `, reavaliar a partir de ${esc(o.cacador.reavaliarEm)}` : ''})</span>`).join(' · ')}` : '';
  };
  $('#cap').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const of = await api('/api/ofertas', { method: 'POST', body: { frase: frase.value, link: $('#c_link').value, origem: $('#c_origem').value, nicho: $('#c_nicho').value, ticket: $('#c_ticket').value, anunciantes: anun.value } });
      atualizar(of); S.aba = 'triar'; contadores(); pageCaixa();
      toast(`${of.id} anotada na caixa.`);
      $('#c_frase').focus();
    } catch (err) { toast(err.message, true); }
  };
}

async function puxarCacador() {
  const b = $('#puxar'); b.disabled = true; b.textContent = 'Puxando…';
  try {
    const r = await api('/api/ofertas/cacador/puxar', { method: 'POST' });
    [S.ofertas, S.cfg] = await Promise.all([api('/api/ofertas'), api('/api/ofertas/config')]);
    contadores(); pageCaixa();
    toast(r.novas || r.descartadas ? `Caçador: ${r.novas} novas para triar e ${r.descartadas} descartadas por ele.` : 'Nada novo na planilha do Caçador.');
  } catch (e) { b.disabled = false; b.textContent = 'Puxar Caçador'; toast(e.message, true); }
}

function scoreBox(of) {
  return `<div class="score">${of.score !== null && of.score !== undefined ? `<div class="os">${of.score}</div><small>score</small>` : '<div class="os vazio">s/ score</div>'}
    ${of.classe ? `<span class="cl ${of.classe}" title="${esc(CLASSES[of.classe])}">${of.classe}</span>` : ''}</div>`;
}
function metaTags(of) {
  const c = of.cacador;
  return `<div class="meta">
    <span class="t ${of.origem === 'Caçador' ? 'cac' : ''}">${esc(of.origem)}${c?.semana ? ` · ${esc(c.semana.split(' ')[0])}` : ''}${c?.rank ? ` · #${c.rank}` : ''}</span>
    ${of.nicho ? `<span>${esc(of.nicho)}</span>` : ''}
    ${of.ticket ? `<span>R$ ${fmtN(of.ticket, 0)}</span>` : ''}
    ${of.anunciantes !== null && of.anunciantes !== undefined ? `<span>${of.anunciantes} anunciante${of.anunciantes === 1 ? '' : 's'} no BR</span>` : ''}
    ${of.teimosia ? '<span class="t teima">Teimosia</span>' : ''}
    ${vencida(of) ? '<span class="t due">Revisar hoje</span>' : ''}
    ${of.status === 'monitorar' && !vencida(of) ? `<span>revisar em ${fmtData(of.monitorarAte)}</span>` : ''}
    ${of.link ? `<a href="${esc(of.link)}" target="_blank" rel="noopener">${esc(linkCurto(of.link))}</a>` : ''}
  </div>`;
}
function detalhesCacador(of) {
  const c = of.cacador; if (!c) return '';
  const nt = c.notas || {};
  const barras = [['Demanda', nt.demanda, 30], ['Orgânico', nt.organico, 20], ['Gap de oferta', nt.gap, 25], ['Prova de compra', nt.prova, 15], ['Amplitude', nt.amplitude, 10]]
    .filter(([, v]) => v !== null && v !== undefined);
  return `<details class="det"><summary>${c.veredito === 'descartou' ? 'Por que o Caçador descartou' : 'O que o Caçador viu'}</summary>
    ${barras.length ? `<div class="notas">${barras.map(([n, v, mx]) => `<div class="nota"><span>${n}</span><div class="tr"><div style="width:${(v / mx) * 100}%"></div></div><span class="v">${fmtN(v, 0)}/${mx}</span></div>`).join('')}
      ${nt.ajustes ? `<div class="nota"><span>Ajustes</span><span></span><span class="v">${nt.ajustes > 0 ? '+' : ''}${nt.ajustes}</span></div>` : ''}</div>` : ''}
    <dl>
      ${c.caminho ? `<dt>Caminho</dt><dd>${esc(c.caminho)}</dd>` : ''}
      ${c.referencia ? `<dt>Oferta mãe</dt><dd>${esc(c.referencia)}</dd>` : ''}
      ${c.anunciantesTexto ? `<dt>Anunciantes BR</dt><dd>${esc(c.anunciantesTexto)}</dd>` : ''}
      ${c.porQueAgora ? `<dt>Por que agora</dt><dd>${esc(c.porQueAgora)}</dd>` : ''}
      ${c.riscos ? `<dt>Riscos</dt><dd>${esc(c.riscos)}</dd>` : ''}
      ${c.sinalEUA ? `<dt>Sinal EUA</dt><dd>${esc(c.sinalEUA)}</dd>` : ''}
      ${c.confianca ? `<dt>Confiança</dt><dd>${esc(c.confianca)}</dd>` : ''}
      ${c.motivo ? `<dt>Motivo</dt><dd>${esc(c.motivo)}</dd>` : ''}
      ${c.reavaliarEm ? `<dt>Reavaliar</dt><dd>a partir de ${esc(c.reavaliarEm)}</dd>` : ''}
    </dl></details>`;
}

function decisaoHTML(of, compacto = true) {
  const sug = of.trilha || trilhaSugerida(of);
  return `<div class="acts" data-dec="${of.id}">
    <div class="row"><select data-trilha style="flex:1">${opts(Object.entries(TRILHAS).map(([k, t]) => [k, t.nome + (k === sug ? ' (sugerida)' : '')]), sug)}</select><button class="btn ok small" data-modelar>Modelar</button></div>
    <div class="row ${sug === 'lateralizacao' ? '' : 'hidden'}" data-idrow><select data-idioma style="flex:1">${opts(IDIOMAS, of.idioma || '', 'Idioma')}</select></div>
    <div class="row"><button class="btn ghost small" data-monitorar style="flex:1">Monitorar 7 dias</button><button class="btn danger small" data-descartar style="flex:1">Descartar</button></div>
    <div class="row hidden" data-motrow><select data-motivo style="flex:1">${opts(MOTIVOS_DESCARTE, '', 'Motivo')}</select><button class="btn small" data-confdesc>OK</button></div>
    <input type="text" data-outro class="hidden" placeholder="Qual motivo?">
    ${compacto ? '' : `<div class="small muted">${esc(CLASSES[of.classe] || 'Sem classe: informe os anunciantes no BR para o app sugerir a trilha.')}</div>`}
  </div>`;
}
function bindDecisao(root, depois) {
  $$('[data-dec]', root).forEach((box) => {
    const id = box.dataset.dec;
    const tr = $('[data-trilha]', box);
    tr.onchange = () => $('[data-idrow]', box).classList.toggle('hidden', tr.value !== 'lateralizacao');
    const go = async (fn, ok) => { try { await fn(); contadores(); toast(ok); depois(); } catch (e) { toast(e.message, true); } };
    $('[data-modelar]', box).onclick = () => go(() => acao(id, 'modelar', { trilha: tr.value, idioma: $('[data-idioma]', box).value }), `${id} foi para a Modelagem (${nomeTrilha(tr.value)}).`);
    $('[data-monitorar]', box).onclick = () => go(() => acao(id, 'monitorar', { dias: 7 }), `${id} em monitoramento. Volta para a triagem em 7 dias.`);
    $('[data-descartar]', box).onclick = () => { $('[data-motrow]', box).classList.toggle('hidden'); $('[data-motivo]', box).focus(); };
    $('[data-motivo]', box).onchange = (e) => $('[data-outro]', box).classList.toggle('hidden', e.target.value !== 'Outro');
    $('[data-confdesc]', box).onclick = () => {
      let motivo = $('[data-motivo]', box).value;
      if (motivo === 'Outro') motivo = $('[data-outro]', box).value.trim() || 'Outro';
      if (!motivo) return toast('Escolha o motivo do descarte.', true);
      go(() => acao(id, 'descartar', { motivo }), `${id} descartada.`);
    };
  });
}

function renderLista(lista) {
  const el = $('#lista');
  if (!lista.length) {
    const vazio = {
      triar: ['Nada para triar', 'Anote uma oferta acima ou clique em "Puxar Caçador" para trazer o ranking da semana.'],
      monit: ['Nada em monitoramento', 'Quando você escolhe "Monitorar", a oferta fica aqui por 7 dias e depois volta para a triagem.'],
      desc: ['Nenhuma descartada pelo Caçador', 'As descartadas da aba Histórico da planilha aparecem aqui quando você puxa o Caçador.'],
      descMinhas: ['Nenhuma descartada por você', 'O que você descartar na triagem fica guardado aqui, com o motivo.'],
    }[S.aba];
    el.innerHTML = `<div class="empty"><h2>${vazio[0]}</h2><p>${vazio[1]}</p></div>`;
    return;
  }
  el.innerHTML = lista.map((of) => `
  <article class="ocard ${vencida(of) ? 'due' : ''}">
    ${scoreBox(of)}
    <div>
      <h3><a href="#/of/${of.id}">${esc(of.frase)}</a> <span class="muted small" style="font-weight:500">${of.id}</span></h3>
      ${of.notas ? `<div class="promessa">${esc(of.notas)}</div>` : ''}
      ${metaTags(of)}
      ${of.status === 'descartada' ? `<div class="small" style="margin-top:6px">Motivo: <b>${esc(of.motivoDescarte)}</b></div>` : ''}
      ${detalhesCacador(of)}
    </div>
    ${S.aba === 'desc' ? `<div class="acts"><button class="btn warn small" data-teima="${of.id}">Testar mesmo assim</button><span class="small muted">Vai para a triagem marcada como teimosia. Conta no placar do Caçador.</span></div>`
      : S.aba === 'descMinhas' ? `<div class="acts"><button class="btn ghost small" data-reabrir="${of.id}">Reabrir</button></div>`
      : S.aba === 'monit' ? `<div class="acts"><button class="btn ghost small" data-voltar="${of.id}">Revisar agora</button></div>`
      : decisaoHTML(of)}
  </article>`).join('');
  bindDecisao(el, pageCaixa);
  const simples = (attr, ac, msg) => $$(`[${attr}]`, el).forEach((b) => b.onclick = async () => {
    try { await acao(b.getAttribute(attr), ac); contadores(); toast(msg(b.getAttribute(attr))); pageCaixa(); } catch (e) { toast(e.message, true); }
  });
  simples('data-teima', 'teimosia', (id) => `${id} foi para a triagem como teimosia.`);
  simples('data-reabrir', 'reabrir', (id) => `${id} voltou para a caixa.`);
  simples('data-voltar', 'voltar_caixa', (id) => `${id} voltou para a triagem.`);
}

// ---------------------------------------------------------------- modelagem
function progresso(of) {
  const et = TRILHAS[of.trilha]?.etapas || [];
  const feitas = et.filter(([k]) => of.etapas?.[k]?.feito).length;
  const ck = CHECKLIST.filter((c) => of.checklist?.[c]).length;
  return { feitas, total: et.length, ck, pct: et.length ? Math.round(((feitas + ck / CHECKLIST.length) / (et.length + 1)) * 100) : 0 };
}
function pageModelagem() {
  const col = (st) => S.ofertas.filter((o) => o.status === st).sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
  $('#main').innerHTML = `
  <div class="head"><div><h1>Modelagem</h1><div class="muted">Da decisão de modelar até a manutenção. Clique numa oferta para abrir a ficha.</div></div></div>
  <div class="kanban">${FASES_MODELAGEM.map((st) => {
    const l = col(st);
    return `<section class="col"><h2><span>${STATUS[st]}</span><span>${l.length}</span></h2>
      ${l.map((of) => {
        const pg = progresso(of);
        const extra = st === 'modelagem' ? `${pg.feitas}/${pg.total} etapas · checklist ${pg.ck}/10`
          : st === 'teste' ? (of.teste?.faixa === 'caso_a_caso' ? `ROAS ${fmtN(of.teste.roas, 2)}: decidir` : `no ar desde ${fmtData(of.teste?.inicio)}`)
          : of.teste?.roas ? `teste: ROAS ${fmtN(of.teste.roas, 2)}` : '';
        return `<a class="kcard" href="#/of/${of.id}"><span class="id">${of.id} · ${esc(nomeTrilha(of.trilha))}${of.idioma ? ` · ${esc(of.idioma)}` : ''}</span><b>${esc(of.frase)}</b>
          <div class="small muted">${extra}</div>${st === 'modelagem' ? `<div class="prog"><div style="width:${pg.pct}%"></div></div>` : ''}</a>`;
      }).join('') || '<div class="small muted" style="padding:4px">Vazio</div>'}
    </section>`;
  }).join('')}</div>`;
}

// ---------------------------------------------------------------- ficha da oferta
async function pageFicha(id) {
  let of = S.ofertas.find((o) => o.id === id);
  if (!of) { try { of = await api(`/api/ofertas/${id}`); atualizar(of); } catch (e) { $('#main').innerHTML = `<div class="empty"><h2>${esc(e.message)}</h2><p><a href="#/caixa">Voltar para a Mineração</a></p></div>`; return; } }
  $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.r === (FASES_MODELAGEM.includes(of.status) ? 'modelagem' : 'caixa')));
  const mae = of.maeId ? S.ofertas.find((o) => o.id === of.maeId) : null;
  const filhas = S.ofertas.filter((o) => o.maeId === of.id);
  $('#main').innerHTML = `
  <div class="fhead">
    <div>
      <div class="small muted" style="margin-bottom:4px"><a href="#/${FASES_MODELAGEM.includes(of.status) ? 'modelagem' : 'caixa'}">← ${FASES_MODELAGEM.includes(of.status) ? 'Modelagem' : 'Mineração'}</a></div>
      <h1><span class="idt">${of.id}</span>${esc(of.frase)} <span class="st ${of.status}">${esc(STATUS[of.status])}</span></h1>
      <div class="muted">${of.trilha ? `${esc(nomeTrilha(of.trilha))}${of.idioma ? ` · ${esc(of.idioma)}` : ''} · ` : ''}${esc(of.origem)} · anotada por ${esc(of.criadoPorNome || '')} em ${fmtData(of.criadoEm)}</div>
    </div>
    <div class="row">${of.link ? `<a class="btn ghost small" href="${esc(of.link)}" target="_blank" rel="noopener">Abrir link</a>` : ''}<button class="btn ghost small" id="editar">Editar dados</button>${S.user.papel === 'admin' ? '<span id="delbox"><button class="btn danger small" id="excluir">Excluir</button></span>' : ''}</div>
  </div>
  <div class="fgrid">
    <div class="side">
      <section class="panel"><header><h2>Mineração</h2>${scoreBox(of).replace('class="score"', 'class="score" style="display:flex;gap:10px;align-items:center"')}</header>
        <div class="body" id="dados"></div></section>
      ${of.cacador ? `<section class="panel"><header><h2>Caçador</h2><span class="tag ia">${of.cacador.veredito === 'descartou' ? 'Descartou' : 'Recomendou'}</span></header><div class="body">${detalhesCacador(of).replace('<details class="det">', '<details class="det" open>')}
        ${(of.cacador.evidencias || []).length ? `<h3 style="margin-top:14px">Evidências</h3><div class="tablewrap"><table class="evid"><thead><tr><th>Sinal</th><th>Fonte</th><th>Valor</th></tr></thead><tbody>${of.cacador.evidencias.map((e) => `<tr><td>${esc(e.sinal)}</td><td>${e.link ? `<a href="${esc(/^https?:/.test(e.link) ? e.link : 'https://' + e.link)}" target="_blank" rel="noopener">${esc(e.fonte)}</a>` : esc(e.fonte)}<div class="sub">${esc(e.metrica)}</div></td><td>${esc(e.valor)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      </div></section>` : ''}
      ${mae || filhas.length ? `<section class="panel"><header><h2>Família</h2></header><div class="body stack small">
        ${mae ? `<div>Oferta mãe: <a href="#/of/${mae.id}">${mae.id} · ${esc(mae.frase)}</a></div>` : ''}
        ${filhas.map((f) => `<div>Filha: <a href="#/of/${f.id}">${f.id} · ${esc(f.frase)}</a> <span class="muted">(${esc(STATUS[f.status])})</span></div>`).join('')}
      </div></section>` : ''}
    </div>
    <div class="mainc" id="fase"></div>
  </div>
  <section class="panel" style="margin-top:16px"><header><h2>Histórico</h2></header><div class="body"><ul class="hist">${[...of.historico].reverse().map((h) => `<li><time>${fmtDH(h.em)}</time><span>${esc(h.txt)} <span class="muted">· ${esc(h.por)}</span></span></li>`).join('')}</ul></div></section>`;
  renderDados(of, false);
  $('#editar').onclick = () => renderDados(of, true);
  $('#excluir') && ($('#excluir').onclick = () => {
    $('#delbox').innerHTML = '<span class="small" style="color:var(--erro)">Excluir de vez?</span> <button class="btn small" id="delsim" style="background:var(--erro);border-color:var(--erro)">Sim, excluir</button> <button class="btn ghost small" id="delnao">Cancelar</button>';
    $('#delnao').onclick = () => pageFicha(of.id);
    $('#delsim').onclick = async () => {
      try {
        await api(`/api/ofertas/${of.id}`, { method: 'DELETE' });
        S.ofertas = S.ofertas.filter((o) => o.id !== of.id);
        toast(`${of.id} excluída.`);
        location.hash = FASES_MODELAGEM.includes(of.status) ? '#/modelagem' : '#/caixa';
      } catch (e) { toast(e.message, true); }
    };
  });
  renderFase(of);
}

function renderDados(of, edit) {
  const el = $('#dados');
  if (!edit) {
    el.innerHTML = `<dl class="kv">
      ${of.notas ? `<dt>Notas</dt><dd>${esc(of.notas)}</dd>` : ''}
      <dt>Origem</dt><dd>${esc(of.origem)}</dd>
      <dt>Nicho</dt><dd>${esc(of.nicho) || '<span class="muted">—</span>'}</dd>
      <dt>Ticket</dt><dd>${of.ticket ? 'R$ ' + fmtN(of.ticket, 2) : '<span class="muted">—</span>'}</dd>
      <dt>Anunciantes BR</dt><dd>${of.anunciantes ?? '<span class="muted">—</span>'}</dd>
      <dt>Classe</dt><dd>${of.classe ? `<b>${of.classe}</b> <span class="muted small">${esc(CLASSES[of.classe])}</span>` : '<span class="muted">—</span>'}</dd>
      <dt>Link</dt><dd>${of.link ? `<a href="${esc(of.link)}" target="_blank" rel="noopener">${esc(linkCurto(of.link))}</a>` : '<span class="muted">—</span>'}</dd>
      <dt>Oferta mãe</dt><dd>${of.maeLink ? `<a href="${esc(of.maeLink)}" target="_blank" rel="noopener">Biblioteca da mãe</a>` : ['mecanismo', 'lateralizacao'].includes(of.trilha) ? '<span class="small" style="color:var(--marca-ink)">Falta o link da Biblioteca da oferta mãe.</span>' : '<span class="muted">—</span>'}</dd>
      ${of.motivoDescarte ? `<dt>Motivo</dt><dd>${esc(of.motivoDescarte)}</dd>` : ''}
    </dl>`;
    return;
  }
  el.innerHTML = `<form class="stack" id="fdados">
    <label class="f"><span>Frase</span><input type="text" name="frase" value="${esc(of.frase)}"></label>
    <label class="f"><span>Notas</span><textarea name="notas" rows="3">${esc(of.notas)}</textarea></label>
    <label class="f"><span>Nicho</span><input type="text" name="nicho" value="${esc(of.nicho)}"></label>
    <div class="grid2"><label class="f"><span>Ticket (R$)</span><input type="text" name="ticket" inputmode="decimal" value="${esc(of.ticket ?? '')}"></label>
      <label class="f"><span>Anunciantes BR</span><input type="number" min="0" name="anunciantes" value="${esc(of.anunciantes ?? '')}"></label></div>
    <label class="f"><span>Classe</span><select name="classe">${opts(['A', 'B', 'C', 'D'], of.classe || '', 'Sem classe')}</select></label>
    <label class="f"><span>Link</span><input type="url" name="link" value="${esc(of.link)}"></label>
    <label class="f"><span>Link da Biblioteca da oferta mãe</span><input type="url" name="maeLink" value="${esc(of.maeLink)}"></label>
    <div class="row"><button class="btn small">Salvar</button><button type="button" class="btn ghost small" id="cancelar">Cancelar</button></div>
  </form>`;
  $('#cancelar').onclick = () => renderDados(of, false);
  $('[name=anunciantes]', el).oninput = (e) => { const c = classeDeAnunciantes(e.target.value); if (c) $('[name=classe]', el).value = c; };
  $('#fdados').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    try { const r = await api(`/api/ofertas/${of.id}`, { method: 'PATCH', body }); atualizar(r); toast('Dados salvos.'); pageFicha(of.id); } catch (err) { toast(err.message, true); }
  };
}

function renderFase(of) {
  const el = $('#fase');
  const go = async (fn, ok, ir) => { try { const r = await fn(); contadores(); toast(ok); if (ir) location.hash = ir; else pageFicha(of.id); return r; } catch (e) { toast(e.message, true); } };

  if (['caixa', 'monitorar'].includes(of.status)) {
    el.innerHTML = `<section class="panel"><header><h2>Decisão</h2><span class="small muted">Modelar, monitorar ou descartar</span></header><div class="body">${decisaoHTML(of, false)}</div></section>`;
    bindDecisao(el, () => pageFicha(of.id));
    return;
  }
  if (['descartada', 'cacador_descartou', 'arquivada'].includes(of.status)) {
    el.innerHTML = `<section class="panel"><header><h2>${esc(STATUS[of.status])}</h2></header><div class="body stack">
      <div>${of.motivoDescarte ? `Motivo: <b>${esc(of.motivoDescarte)}</b>` : ''}</div>
      ${of.teste?.roas !== undefined && of.teste?.roas !== null ? resultadoBox(of.teste) : ''}
      <div class="row">${of.status === 'cacador_descartou' ? '<button class="btn warn" id="teima">Testar mesmo assim</button>' : '<button class="btn ghost" id="reabrir">Reabrir na caixa</button>'}</div>
    </div></section>`;
    $('#teima') && ($('#teima').onclick = () => go(() => acao(of.id, 'teimosia'), 'Foi para a triagem como teimosia.'));
    $('#reabrir') && ($('#reabrir').onclick = () => go(() => acao(of.id, 'reabrir'), 'Voltou para a caixa.'));
    return;
  }
  if (of.status === 'modelagem') return renderModelando(of, el, go);
  if (of.status === 'teste') return renderTeste(of, el, go);
  return renderRodando(of, el, go);
}

function renderModelando(of, el, go) {
  const tr = TRILHAS[of.trilha];
  const pg = progresso(of);
  el.innerHTML = `
  <section class="panel"><header><h2>Etapas: ${esc(tr.nome)}</h2><span class="small muted">${pg.feitas} de ${pg.total} feitas</span></header>
    <div class="body"><div class="etapas">${tr.etapas.map(([k, nome, dica]) => {
      const e = of.etapas?.[k] || {};
      return `<div class="etapa ${e.feito ? 'feita' : ''}" data-et="${k}">
        <input type="checkbox" ${e.feito ? 'checked' : ''} aria-label="${esc(nome)} feita">
        <div><div class="nm">${esc(nome)}</div>${dica ? `<div class="dica">${esc(dica)}</div>` : ''}
          <div class="nt"><input type="text" data-nota placeholder="Nota ou link (Drive, página, checkout…)" value="${esc(e.nota)}"></div></div>
        <select data-resp aria-label="Responsável">${opts(S.usuarios.map((u) => [u.id, u.nome.split(' ')[0]]), e.resp || S.user.id)}</select>
      </div>`;
    }).join('')}</div></div></section>
  <section class="panel"><header><h2>Checklist low ticket</h2><span class="small muted">${pg.ck} de 10 · confere a oferta pronta, antes de subir</span></header>
    <div class="body"><div class="check10">${CHECKLIST.map((c) => `<label class="${of.checklist?.[c] ? 'on' : ''}"><input type="checkbox" data-ck="${esc(c)}" ${of.checklist?.[c] ? 'checked' : ''}>${esc(c)}</label>`).join('')}</div></div></section>
  <section class="panel"><header><h2>Subir o teste</h2></header><div class="body stack">
    <div class="small">Estrutura: <b>${esc(tr.teste)}</b>. Sem orderbump. Coloque o <b>${of.id}</b> no nome da campanha.</div>
    <div class="row"><label class="f" style="width:180px"><span>Início</span><input type="text" id="inicio" value="${hoje()}" placeholder="AAAA-MM-DD"></label>
      <label class="f" style="flex:1"><span>Verba <em>(opcional)</em></span><input type="text" id="verba" placeholder="Ex.: US$ 20 por dia"></label></div>
    <div class="row"><button class="btn big" id="subir" ${pg.ck < 10 ? 'disabled' : ''}>Teste no ar</button>
      <span class="small muted">${pg.ck < 10 ? `Falta bater o checklist (${10 - pg.ck}). <button class="linkbtn" id="forcar">Subir mesmo assim</button>` : pg.feitas < pg.total ? `Ainda há ${pg.total - pg.feitas} etapa(s) sem marcar.` : 'Tudo pronto.'}</span></div>
  </div></section>
  `;
  const salvarEtapas = async () => { try { const r = await api(`/api/ofertas/${of.id}`, { method: 'PATCH', body: { etapas: of.etapas } }); atualizar(r); Object.assign(of, r); } catch (e) { toast(e.message, true); } };
  $$('[data-et]', el).forEach((row) => {
    const k = row.dataset.et;
    const set = (campo, v) => { of.etapas = { ...(of.etapas || {}), [k]: { ...(of.etapas?.[k] || {}), [campo]: v } }; };
    $('input[type=checkbox]', row).onchange = async (e) => { set('feito', e.target.checked); if (!of.etapas[k].resp) set('resp', $('[data-resp]', row).value); row.classList.toggle('feita', e.target.checked); await salvarEtapas(); renderModelando(of, el, go); };
    $('[data-resp]', row).onchange = (e) => { set('resp', e.target.value); salvarEtapas(); };
    $('[data-nota]', row).onchange = (e) => { set('nota', e.target.value.trim()); salvarEtapas(); };
  });
  $$('[data-ck]', el).forEach((cb) => cb.onchange = async () => {
    of.checklist = { ...(of.checklist || {}), [cb.dataset.ck]: cb.checked };
    try { const r = await api(`/api/ofertas/${of.id}`, { method: 'PATCH', body: { checklist: of.checklist } }); atualizar(r); Object.assign(of, r); renderModelando(of, el, go); } catch (e) { toast(e.message, true); }
  });
  const subir = (forcar) => go(() => acao(of.id, 'subir_teste', { inicio: $('#inicio').value.trim(), verba: $('#verba').value.trim(), forcar }), `${of.id} em teste. Volte em 3 dias com o resultado.`);
  $('#subir').onclick = () => subir(false);
  $('#forcar') && ($('#forcar').onclick = () => subir(true));
}

function resultadoBox(t) {
  const f = t.faixa || faixaTeste(t.roas);
  if (!f) return '';
  return `<div class="faixa ${f}">ROAS ${fmtN(t.roas, 2)} · ${FAIXAS_TESTE[f].nome}<small>${FAIXAS_TESTE[f].txt} No teste ${fmtN(t.roas, 2)} ${roasNaEscala(t.roas)}.${t.vendas !== null && t.vendas !== undefined ? ` ${t.vendas} vendas.` : ''}</small></div>`;
}

function renderTeste(of, el, go) {
  const t = of.teste || {};
  const dias = t.inicio ? Math.max(0, Math.floor((new Date(hoje()) - new Date(t.inicio)) / 864e5)) : null;
  const decidir = t.faixa === 'caso_a_caso';
  el.innerHTML = `
  <section class="panel"><header><h2>Teste no ar</h2><span class="small muted">${t.inicio ? `desde ${fmtData(t.inicio)}${dias !== null ? ` · ${dias} dia(s)` : ''}` : ''}${t.verba ? ` · ${esc(t.verba)}` : ''}</span></header>
    <div class="body stack">
      <div class="small">${esc(TRILHAS[of.trilha]?.teste || '')}</div>
      ${decidir ? `${resultadoBox(t)}<div class="row"><button class="btn" id="otim">Otimizar</button><button class="btn danger" id="arq">Arquivar</button><span class="small muted">Olhe o diagnóstico abaixo antes de decidir.</span></div>` : ''}
      <h3 style="margin-top:6px">${decidir ? 'Corrigir o resultado' : 'Resultado do teste (3 dias, sem orderbump)'}</h3>
      <div class="grid4">
        <label class="f"><span>Gasto (R$)</span><input type="text" inputmode="decimal" id="r_gasto" value="${esc(t.gasto ?? '')}"></label>
        <label class="f"><span>Faturamento (R$)</span><input type="text" inputmode="decimal" id="r_fat" value="${esc(t.faturamento ?? '')}"></label>
        <label class="f"><span>Vendas</span><input type="number" min="0" id="r_vendas" value="${esc(t.vendas ?? '')}"></label>
        <label class="f"><span>ou ROAS direto</span><input type="text" inputmode="decimal" id="r_roas" placeholder="Ex.: 1,9"></label>
      </div>
      <div id="r_prev"></div>
      <div><button class="btn big" id="r_salvar">Registrar resultado</button></div>
    </div></section>
  ${diagnosticoHTML(of)}`;
  const prev = () => {
    const g = Number($('#r_gasto').value.replace(',', '.')), f = Number($('#r_fat').value.replace(',', '.'));
    const direto = $('#r_roas').value.trim();
    const roas = direto ? Number(direto.replace(',', '.')) : g ? f / g : null;
    $('#r_prev').innerHTML = roas !== null && Number.isFinite(roas) ? resultadoBox({ roas, vendas: $('#r_vendas').value === '' ? null : Number($('#r_vendas').value) }) : '';
  };
  ['#r_gasto', '#r_fat', '#r_vendas', '#r_roas'].forEach((s) => $(s).oninput = prev);
  $('#r_salvar').onclick = () => go(() => acao(of.id, 'resultado', { gasto: $('#r_gasto').value, faturamento: $('#r_fat').value, vendas: $('#r_vendas').value, roas: $('#r_roas').value }), 'Resultado registrado.');
  $('#otim') && ($('#otim').onclick = () => go(() => acao(of.id, 'otimizar'), 'Foi para otimização.'));
  $('#arq') && ($('#arq').onclick = () => go(() => acao(of.id, 'arquivar', { motivo: 'ROAS de 1 a 1,4: não valeu otimizar' }), 'Arquivada.'));
  bindDiagnostico(of);
}

function renderRodando(of, el, go) {
  const t = of.teste || {};
  const acoes = {
    otimizar: `<div class="small">Conserte a etapa que vaza, monte o funil (orderbump e upsell, se fizer sentido) e faça novos criativos. Desista se não vender ou vender com ROAS muito ruim.</div>
      <div class="row"><button class="btn ok" id="escalar">Vende com ROAS bom: escalar</button><input type="text" id="motivo" placeholder="Motivo, se for desistir" style="flex:1;min-width:180px"><button class="btn danger" id="desistir">Desistir</button></div>`,
    escala: `<div class="small">Teste uma quantidade maior de criativos e suba o orçamento até achar o teto.</div>
      <div class="row"><button class="btn" id="teto">Achou o teto: manutenção</button><input type="text" id="motivo" placeholder="Motivo, se for parar" style="flex:1;min-width:180px"><button class="btn danger" id="desistir">Parar e arquivar</button></div>`,
    manutencao: `<div class="small">Deixe rodando e ajuste o orçamento devagar.</div><div class="row"><input type="text" id="motivo" placeholder="Motivo, se for parar" style="flex:1;min-width:180px"><button class="btn danger" id="desistir">Parar e arquivar</button></div>`,
  }[of.status];
  el.innerHTML = `
  <section class="panel"><header><h2>${esc(STATUS[of.status])}</h2><span class="small muted">${esc(nomeTrilha(of.trilha))}</span></header>
    <div class="body stack">${t.roas !== undefined && t.roas !== null ? resultadoBox(t) : ''}${acoes}</div></section>
  ${of.trilha === 'mecanismo' ? `<section class="panel"><header><h2>Mecanismo vencedor</h2><span class="small muted">vira oferta filha, com página própria e orderbump</span></header>
    <div class="body row"><input type="text" id="mecNome" placeholder="Nome do mecanismo vencedor" style="flex:1"><button class="btn" id="filha">Criar oferta filha</button></div></section>` : ''}
  ${diagnosticoHTML(of)}`;
  $('#escalar') && ($('#escalar').onclick = () => go(() => acao(of.id, 'escalar'), 'Foi para a escala.'));
  $('#teto') && ($('#teto').onclick = () => go(() => acao(of.id, 'teto'), 'Em manutenção.'));
  $('#desistir') && ($('#desistir').onclick = () => go(() => acao(of.id, 'desistir', { motivo: $('#motivo').value.trim() }), 'Arquivada.'));
  $('#filha') && ($('#filha').onclick = async () => {
    const r = await go(() => acao(of.id, 'filha', { nome: $('#mecNome').value }), 'Oferta filha criada na Modelagem.');
    if (r?.filha) location.hash = `#/of/${r.filha.id}`;
  });
  bindDiagnostico(of);
}

// Diagnóstico do funil pela régua do SOP MVT.
const CAMPOS_FUNIL = [['ticket', 'Ticket (R$)'], ['gasto', 'Gasto (R$)'], ['impressoes', 'Impressões'], ['cliques', 'Cliques no link'], ['views', 'Views da página'], ['checkouts', 'Checkouts iniciados'], ['compras', 'Compras aprovadas'], ['ob', 'Compras com orderbump'], ['faturamento', 'Faturamento (R$, opcional)']];
const benchmarks = () => (Array.isArray(S.cfg?.benchmarks) && S.cfg.benchmarks.length ? S.cfg.benchmarks : BENCHMARKS);
function diagnosticoHTML(of) {
  const t = of.teste || {};
  const f = { ticket: of.ticket ?? '', gasto: t.gasto ?? '', faturamento: t.faturamento ?? '', compras: t.vendas ?? '', ...(of.funil || {}) };
  return `<section class="panel"><header><h2>Diagnóstico do funil</h2><span class="small muted">régua do SOP MVT · ajuste em Ajustes</span></header>
    <div class="body stack">
      <div class="grid4">${CAMPOS_FUNIL.map(([k, n]) => `<label class="f"><span>${n}</span><input type="text" inputmode="decimal" data-fn="${k}" value="${esc(f[k] ?? '')}"></label>`).join('')}</div>
      <div id="fn_out"></div>
    </div></section>`;
}
function bindDiagnostico(of) {
  const ler = () => Object.fromEntries($$('[data-fn]').map((i) => [i.dataset.fn, i.value.trim()]));
  const desenhar = () => {
    const r = calcularFunil(ler(), benchmarks());
    const tem = r.linhas.some((l) => l.valor !== null);
    const fmt = (l) => l.valor === null ? '—' : l.un === 'R$' ? `R$ ${fmtN(l.valor, 2)}` : l.un === '' ? fmtN(l.valor, 2) : `${fmtN(l.valor, 1)}%${l.un === '% do ticket' ? ' do ticket' : ''}`;
    const regua = (l) => l.sentido === 'menor' ? `bom abaixo de ${l.bom}${l.un === 'R$' ? '' : l.un ? '%' : ''}${l.bom !== l.ruim ? `, ruim acima de ${l.ruim}` : ''}` : `bom acima de ${l.bom}${l.un ? '%' : ''}, ruim abaixo de ${l.ruim}${l.un ? '%' : ''}`;
    $('#fn_out').innerHTML = !tem ? '<div class="small muted">Preencha os números do gerenciador para ver onde a oferta vaza.</div>' : `
      ${r.vazamento ? `<div class="faixa negativa">Vazamento: ${esc(r.vazamento.nome)} (${esc(r.vazamento.camada)})<small>É a primeira etapa fora da régua. Comece a otimizar por ela.</small></div>` : '<div class="faixa escalar">Nenhuma etapa fora da régua.</div>'}
      <div class="tablewrap"><table class="funil"><thead><tr><th>Camada</th><th>Métrica</th><th>Valor</th><th>Nível</th><th>Régua</th></tr></thead><tbody>
      ${r.linhas.map((l) => `<tr class="${l === r.vazamento ? 'leak' : ''}"><td class="sub">${esc(l.camada)}</td><td>${esc(l.nome)}</td><td><b>${fmt(l)}</b></td><td>${l.nivel ? `<span class="nv ${l.nivel}">${{ bom: 'Bom', medio: 'Médio', ruim: 'Ruim' }[l.nivel]}</span>` : ''}</td><td class="sub">${regua(l)}</td></tr>`).join('')}
      </tbody></table></div>
      ${r.faturamento !== null ? `<div class="small muted">Faturamento considerado: R$ ${fmtN(r.faturamento, 2)}.</div>` : ''}`;
  };
  let h;
  const gravar = async () => {
    clearTimeout(h); salvarFunilPendente = null;
    try { const r = await api(`/api/ofertas/${of.id}`, { method: 'PATCH', body: { funil: ler() } }); atualizar(r); } catch (e) { toast(e.message, true); }
  };
  $$('[data-fn]').forEach((i) => {
    i.oninput = () => { desenhar(); clearTimeout(h); salvarFunilPendente = gravar; h = setTimeout(gravar, 800); };
    i.onchange = () => salvarFunilPendente && gravar();
  });
  desenhar();
}

// ---------------------------------------------------------------- todas
function pageTodas() {
  $('#main').innerHTML = `<div class="head"><div><h1>Todas as ofertas</h1><div class="muted" id="cont"></div></div></div>
    <div class="filters" style="grid-template-columns:2fr 1fr 1fr 1fr"><input type="text" id="busca" placeholder="Buscar por frase, nicho, ID…" value="${esc(S.busca)}">
      <select id="fst">${opts(Object.entries(STATUS), S.fstatus, 'Todos os status')}</select></div>
    <div class="tablewrap" id="tab"></div>`;
  const desenhar = () => {
    const q = norm(S.busca);
    const l = S.ofertas.filter((o) => (!S.fstatus || o.status === S.fstatus) && (!q || norm([o.id, o.frase, o.nicho, o.notas, o.origem].join(' ')).includes(q)));
    $('#cont').textContent = `${l.length} de ${S.ofertas.length} ofertas`;
    $('#tab').innerHTML = !l.length ? '<div class="empty"><h2>Nenhuma oferta</h2><p>Anote a primeira na Mineração.</p></div>' : `<table><thead><tr><th>ID</th><th>Oferta</th><th>Status</th><th>Classe</th><th>Score</th><th>Trilha</th><th>Teste</th><th>Origem</th></tr></thead><tbody>
      ${l.map((o) => `<tr data-id="${o.id}" tabindex="0"><td class="id">${o.id}<div class="sub">${fmtData(o.criadoEm)}</div></td><td style="min-width:260px">${esc(o.frase)}<div class="sub">${esc(o.nicho)}</div></td>
        <td><span class="st ${o.status}">${esc(STATUS[o.status])}</span></td><td>${o.classe ? `<span class="cl ${o.classe}" style="margin:0">${o.classe}</span>` : ''}</td><td>${o.score ?? ''}</td>
        <td>${esc(nomeTrilha(o.trilha))}</td><td>${o.teste?.roas !== undefined && o.teste?.roas !== null ? 'ROAS ' + fmtN(o.teste.roas, 2) : ''}</td><td class="sub">${esc(o.origem)}${o.teimosia ? ' · teimosia' : ''}</td></tr>`).join('')}</tbody></table>`;
    $$('#tab tbody tr').forEach((tr) => { tr.onclick = () => (location.hash = `#/of/${tr.dataset.id}`); tr.onkeydown = (e) => e.key === 'Enter' && tr.click(); });
  };
  $('#busca').oninput = (e) => { S.busca = e.target.value; desenhar(); };
  $('#fst').onchange = (e) => { S.fstatus = e.target.value; desenhar(); };
  desenhar();
}

// ---------------------------------------------------------------- placar do Caçador
function pagePlacar() {
  const cac = S.ofertas.filter((o) => o.cacador?.veredito);
  const testada = (o) => o.teste?.faixa;
  const naoNeg = (o) => o.teste?.faixa && o.teste.faixa !== 'negativa';
  const rec = cac.filter((o) => o.cacador.veredito === 'recomendou');
  const desc = cac.filter((o) => o.cacador.veredito === 'descartou');
  const recT = rec.filter(testada), descT = desc.filter(testada);
  const recOk = recT.filter(naoNeg).length, descOk = descT.filter((o) => o.teste.faixa === 'negativa').length;
  const recEsc = rec.filter((o) => o.escalou === 'sim').length;
  const card = (titulo, valor, sub) => `<section class="panel stat"><div class="body"><h3>${titulo}</h3><div class="big">${valor}</div><p>${sub}</p></div></section>`;
  const faixas = [['90 a 100', 90, 101], ['80 a 89', 80, 90], ['70 a 79', 70, 80], ['Abaixo de 70', -1, 70]];
  const linha = (nome, l) => {
    const t = l.filter(testada);
    const ok = t.filter(naoNeg).length, esc_ = l.filter((o) => o.escalou === 'sim').length;
    return `<tr><td>${nome}</td><td>${l.length}</td><td>${t.length}</td><td>${t.length ? pct(ok, t.length) + '%' : '—'}</td><td>${t.length ? pct(esc_, t.length) + '%' : '—'}</td></tr>`;
  };
  const media = (l) => (l.length ? l.reduce((a, o) => a + Number(o.teste.roas || 0), 0) / l.length : null);
  const comRoas = S.ofertas.filter((o) => o.teste?.roas !== null && o.teste?.roas !== undefined && o.escalou);
  const mSim = media(comRoas.filter((o) => o.escalou === 'sim')), mNao = media(comRoas.filter((o) => o.escalou === 'nao'));
  const testadasTodas = S.ofertas.filter(testada).sort((a, b) => (b.teste.registradoEm || '').localeCompare(a.teste.registradoEm || ''));
  $('#main').innerHTML = `
  <div class="head"><div><h1>Placar do Caçador</h1><div class="muted">Quanto o Caçador acerta, medido pelos testes de verdade. Cada resultado também vai para a aba Calibração da planilha.</div></div></div>
  <div class="cards4">
    ${card('Acerto nas recomendadas', recT.length ? pct(recOk, recT.length) + '%' : '—', `${recOk} de ${recT.length} testadas não ficaram negativas · ${rec.length} recomendadas no total`)}
    ${card('Acerto nas descartadas', descT.length ? pct(descOk, descT.length) + '%' : '—', `${descOk} de ${descT.length} teimosias testadas floparam. Se as teimosias derem bom, o corte de 70 está duro.`)}
    ${card('Recomendadas que escalaram', recT.length ? pct(recEsc, recT.length) + '%' : '—', `${recEsc} de ${recT.length} testadas`)}
    ${card('ROAS do teste prevê a escala?', mSim !== null && mNao !== null ? `${fmtN(mSim, 2)} × ${fmtN(mNao, 2)}` : '—', mSim !== null && mNao !== null ? 'ROAS médio no teste das que escalaram × das que não escalaram' : 'Aparece quando houver ofertas que escalaram e que não escalaram.')}
  </div>
  <div class="grid2">
    <section class="panel"><header><h2>Por faixa de score</h2><span class="small muted">só ofertas do Caçador</span></header><div class="body"><div class="tablewrap"><table class="mini"><thead><tr><th>Score</th><th>Avaliadas</th><th>Testadas</th><th>Não negativas</th><th>Escalaram</th></tr></thead><tbody>
      ${faixas.map(([n, a, b]) => linha(n, cac.filter((o) => (o.score ?? -1) >= a && (o.score ?? -1) < b))).join('')}</tbody></table></div>
      <div class="small muted" style="margin-top:8px">Se o Caçador estiver certo, as faixas de cima ganham mais vezes que as de baixo.</div></div></section>
    <section class="panel"><header><h2>Por classe</h2><span class="small muted">todas as ofertas com classe</span></header><div class="body"><div class="tablewrap"><table class="mini"><thead><tr><th>Classe</th><th>Avaliadas</th><th>Testadas</th><th>Não negativas</th><th>Escalaram</th></tr></thead><tbody>
      ${['A', 'B', 'C', 'D'].map((c) => linha(`<span class="cl ${c}" style="margin:0">${c}</span>`, S.ofertas.filter((o) => o.classe === c))).join('')}</tbody></table></div></div></section>
  </div>
  <section class="panel" style="margin-top:16px"><header><h2>Ofertas testadas</h2></header><div class="body">${testadasTodas.length ? `<div class="tablewrap"><table><thead><tr><th>ID</th><th>Oferta</th><th>Veredito do Caçador</th><th>Score</th><th>ROAS no teste</th><th>Faixa</th><th>Escalou</th></tr></thead><tbody>
    ${testadasTodas.map((o) => `<tr data-id="${o.id}"><td class="id">${o.id}</td><td>${esc(o.frase)}${o.teimosia ? ' <span class="pill" style="background:#FDECEA;color:#B42318">teimosia</span>' : ''}</td><td>${o.cacador?.veredito === 'recomendou' ? 'Recomendou' : o.cacador?.veredito === 'descartou' ? 'Descartou' : '<span class="muted">Fora do Caçador</span>'}</td>
      <td>${o.score ?? ''}</td><td>${fmtN(o.teste.roas, 2)}</td><td>${esc(FAIXAS_TESTE[o.teste.faixa]?.nome)}</td><td>${o.escalou === 'sim' ? 'Sim' : o.escalou === 'nao' ? 'Não' : '<span class="muted">ainda não</span>'}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty" style="padding:24px"><h2>Nenhum teste registrado ainda</h2><p>Quando você registrar o resultado de um teste na ficha da oferta, ele entra aqui.</p></div>'}</div></section>`;
  $$('#main tr[data-id]').forEach((tr) => { tr.style.cursor = 'pointer'; tr.onclick = () => (location.hash = `#/of/${tr.dataset.id}`); });
}

// ---------------------------------------------------------------- ajustes
async function pageAjustes(driveRet) {
  S.cfg = await api('/api/ofertas/config');
  const c = S.cfg;
  const bm = benchmarks();
  $('#main').innerHTML = `<div class="head"><div><h1>Ajustes do Ofertas</h1><div class="muted">Só o gestor vê esta página.</div></div></div>
  ${driveRet === 'ok' ? '<div class="banner" style="background:#E5F4EC;color:#14532D;border-color:#B7E0C8">Google reconectado.</div>' : ''}
  ${driveRet === 'erro' ? '<div class="banner">O Google não devolveu a autorização. Tente de novo.</div>' : ''}
  <div class="stack" style="max-width:900px">
    <section class="panel"><header><h2>Planilha do Caçador</h2></header><div class="body stack">
      <ul class="checklist">
        <li><span class="${c.driveConectado ? 'ok' : 'no'}">${c.driveConectado ? '✓' : '✗'}</span><span>${c.driveConectado ? 'Conta do Google conectada.' : 'Conta do Google ainda não conectada.'}</span></li>
        <li><span class="${c.sheetsLiberado ? 'ok' : 'no'}">${c.sheetsLiberado ? '✓' : '✗'}</span><span>${c.sheetsLiberado ? 'Acesso à planilha liberado.' : 'Falta liberar o acesso às planilhas. Clique em "Reconectar Google" e aceite a nova permissão.'}</span></li>
      </ul>
      <div class="row"><a class="btn ${c.sheetsLiberado ? 'ghost' : ''}" href="/api/google/conectar?t=${encodeURIComponent(S.token)}&volta=ofertas">Reconectar Google</a><span class="small muted">Use a mesma conta do Drive da Esteira. O Google pode avisar que o app não é verificado: clique em "Avançado" e continue.</span></div>
      <form id="fpl" class="row"><label class="f" style="flex:1"><span>Link da planilha</span><input type="url" id="pl" value="${esc(c.planilha)}"></label><button class="btn small" style="align-self:end">Salvar</button></form>
      <div class="small muted">O app lê as abas Ranking, Evidências e Histórico. Ao decidir, escreve Aprovado ou Reprovado na coluna Status (Kaian). Ao registrar o teste, escreve o ROAS em Resultado e acrescenta uma linha na aba Calibração.</div>
    </div></section>
    <section class="panel"><header><h2>Régua do diagnóstico</h2><span class="small muted">benchmarks do SOP MVT · mudam por mercado e ticket</span></header><div class="body stack">
      <div class="tablewrap"><table class="mini"><thead><tr><th>Métrica</th><th>Unidade</th><th>Bom</th><th>Ruim</th><th>Melhor quando</th></tr></thead><tbody>
        ${bm.map((b, i) => `<tr><td>${esc(b.nome)}</td><td class="sub">${esc(b.un || '×')}</td><td><input type="text" inputmode="decimal" data-bm="${i}.bom" value="${b.bom}" style="width:80px"></td><td><input type="text" inputmode="decimal" data-bm="${i}.ruim" value="${b.ruim}" style="width:80px"></td><td class="sub">${b.sentido === 'menor' ? 'menor' : 'maior'}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="row"><button class="btn" id="sbm">Salvar régua</button><button class="btn ghost" id="rbm">Voltar ao padrão do SOP</button></div>
    </div></section>
  </div>`;
  $('#fpl').onsubmit = async (e) => { e.preventDefault(); try { await api('/api/ofertas/config', { method: 'POST', body: { planilha: $('#pl').value } }); toast('Planilha salva.'); } catch (err) { toast(err.message, true); } };
  $('#sbm').onclick = async () => {
    const novo = bm.map((b) => ({ ...b }));
    $$('[data-bm]').forEach((i) => { const [idx, k] = i.dataset.bm.split('.'); novo[idx][k] = Number(i.value.replace(',', '.')); });
    try { await api('/api/ofertas/config', { method: 'POST', body: { benchmarks: novo } }); S.cfg.benchmarks = novo; toast('Régua salva.'); } catch (err) { toast(err.message, true); }
  };
  $('#rbm').onclick = async () => { try { await api('/api/ofertas/config', { method: 'POST', body: { benchmarks: null } }); toast('Régua padrão do SOP.'); pageAjustes(); } catch (err) { toast(err.message, true); } };
}

boot();
