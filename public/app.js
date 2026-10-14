import { transcrever, webgpu } from '/transcribe.js';

import L from '/listas.mjs';
const GANCHO_CATS = ['Problema', 'Solução', 'Produto', 'Oferta', 'Genérico'];
const ANG_CATS = Object.keys(L.angulos);
const AVATARES = ['Autoridade', 'Sonho', 'Espelho', 'Fundador', 'Operador define'];
const CONSC = ['Inconsciente', 'Consciente do problema', 'Consciente da solução', 'Consciente do produto', 'Totalmente consciente'];
const EMOC = ['Inveja', 'Ira', 'Luxúria', 'Avareza', 'Gula', 'Preguiça', 'Soberba'];
const BLOCOS = ['Qualificador', 'Invalidação de soluções', 'Spoiler MUP', 'Spoiler MSOL', 'Reason Why', 'Aprofundamento de medos', 'Ponte para esperança', 'Descoberta científica', 'Apresentação Expert', 'Prova social', 'Future Pacing', 'Compra vs. Não compra', 'Inimigo comum', 'Escassez', 'Product Building', 'Contrarian', 'Superestrutura', 'Ancoragem de preço', 'Stack de valor', 'Demonstração do produto', 'CTA'];
const FAIXAS = [{ v: 'Core', s: '80%' }, { v: 'Adjacente', s: '10%' }, { v: 'Aleatório', s: '10%' }];

const S = {
  token: localStorage.getItem('esteira.token') || '',
  user: null, modoDemo: false, stats: null, listas: { nichos: [], formatosExtras: [] }, criativos: [],
  filtros: { q: '', nicho: '', faixa: '', formato: '', cat: '', consc: '', op: '', dias: '' },
};
let F = novoForm();
function novoForm() {
  return { file: null, url: null, linkBiblioteca: '', anunciante: '', diasAtivos: '', nicho: '', faixa: '', transcricao: '', ficha: null, formato: '', hookVisual: '', retencao: '', impressoes: '', avatarOp: '', busy: false };
}

// ---------------------------------------------------------------- utils
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const opts = (list, sel, ph) => (ph !== undefined ? `<option value="">${esc(ph)}</option>` : '') + list.map((o) => `<option ${o === sel ? 'selected' : ''}>${esc(o)}</option>`).join('');
const app = () => $('#app');
const formatos = () => [...L.formatos, ...S.listas.formatosExtras];
const fmtBytes = (b) => (b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.round(b / 1e3) + ' KB');
const fmtData = (d) => d.split('-').reverse().slice(0, 2).join('/');

function toast(msg, erro = false) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'show' + (erro ? ' erro' : '');
  clearTimeout(toast.h); toast.h = setTimeout(() => (t.className = ''), erro ? 5000 : 3000);
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

function sair() {
  S.token = ''; S.user = null; localStorage.removeItem('esteira.token');
  renderLogin();
}

// ---------------------------------------------------------------- login
async function renderLogin() {
  const users = await api('/api/usuarios');
  let sel = users[0]?.id;
  app().innerHTML = `
  <div class="login"><div class="login-box">
    <h1>Esteira de Repertório</h1>
    <p class="lede">Minere, disseque e guarde os criativos escalados no Swipe. Meta do dia: 20 por pessoa até as 16h.</p>
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
    S.user = eu.usuario; S.modoDemo = eu.modoDemo;
    S.listas = await api('/api/listas');
  } catch { return; }
  shell();
  await refreshStats();
  route();
}

function shell() {
  const admin = S.user.papel === 'admin';
  app().innerHTML = `
  <div class="top">
    <div class="brand"><a href="/" title="Voltar ao hub">Kaian Digital</a><span class="crumb">Esteira de Repertório</span></div>
    <div class="quota" id="quota"></div>
    <div class="clock" id="clock"></div>
  </div>
  <nav class="nav">
    <a href="#/novo" data-r="novo">Novo criativo</a>
    <a href="#/swipe" data-r="swipe">Swipe</a>
    <a href="#/painel" data-r="painel">Painel</a>
    ${admin ? '<a href="#/ajustes" data-r="ajustes">Ajustes</a>' : ''}
    <span class="grow"></span>
    <span class="who">${esc(S.user.nome)} <button class="linkbtn" id="sair">Sair</button></span>
  </nav>
  <main id="main"></main>`;
  $('#sair').onclick = sair;
}

async function refreshStats() {
  S.stats = await api('/api/stats');
  $('#quota').innerHTML = S.stats.porUsuario.map((u) => `
    <div class="quota-row" title="${esc(u.nome)}: ${u.feitos} de ${u.meta}">
      <b>${esc(u.nome.split(' ')[0])}</b>
      <div class="slots">${Array.from({ length: u.meta }, (_, i) => `<i class="slot ${i < u.feitos ? 'on' : ''}"></i>`).join('')}</div>
      <span class="quota-num ${u.feitos >= u.meta ? 'done' : ''}">${u.feitos}/${u.meta}</span>
    </div>`).join('');
  tickClock();
}

function tickClock() {
  const el = $('#clock'); if (!el || !S.stats) return;
  const diff = Math.round((S.stats.limiteEpoch - Date.now()) / 60000);
  const t = `${Math.floor(Math.abs(diff) / 60)}h${String(Math.abs(diff) % 60).padStart(2, '0')}`;
  el.className = 'clock' + (diff < 0 ? ' late' : '');
  el.innerHTML = diff >= 0 ? `Faltam <b>${t}</b> para as ${S.stats.horarioLimite}` : `Prazo das ${S.stats.horarioLimite} passou há <b>${t}</b>`;
}
setInterval(tickClock, 30000);

function route() {
  if (!S.user) return;
  const [, rota = 'novo', arg] = location.hash.split('/');
  const [r, qs] = rota.split('?');
  $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.r === r));
  closeDrawer();
  if (r === 'swipe') return pageSwipe(arg);
  if (r === 'painel') return pagePainel();
  if (r === 'ajustes' && S.user.papel === 'admin') return pageAjustes(new URLSearchParams(qs || '').get('drive'));
  return pageNovo();
}
window.addEventListener('hashchange', route);

// ---------------------------------------------------------------- novo criativo
function pageNovo() {
  $('#main').innerHTML = `
  ${S.modoDemo ? `<div class="banner">Modo demonstração: a dissecação devolve uma ficha de exemplo. ${S.user.papel === 'admin' ? 'Veja em <a href="#/ajustes">Ajustes</a> como ligar a IA.' : 'Peça ao Kaian para ligar a IA.'}</div>` : ''}
  <div class="head">
    <div><h1>Novo criativo</h1><div class="muted">Do vídeo baixado até a linha no Swipe, em quatro passos.</div></div>
    <div class="legend"><span class="ia"><i></i>A IA preenche, você revisa</span><span class="op"><i></i>Você preenche</span></div>
  </div>
  <div class="work">
    <section class="panel sticky" id="p1"></section>
    <div class="stepstack">
      <section class="panel" id="p2"></section>
      <section class="panel" id="p3"></section>
      <section class="panel" id="p4"></section>
      <div class="savebar"><div class="falta" id="falta"></div><button class="btn big" id="salvar">Salvar no Swipe</button></div>
    </div>
  </div>`;
  renderP1(); renderP2(); renderP3(); renderP4(); updateFalta();
  $('#salvar').onclick = salvar;
}

function stepHead(n, titulo, done, extra = '') {
  return `<header><h2><span class="step-n ${done ? 'done' : ''}">${done ? '✓' : n}</span>${titulo}</h2>${extra}</header>`;
}

function renderP1() {
  const p = $('#p1');
  const okOrigem = F.file && F.linkBiblioteca && F.diasAtivos !== '' && F.nicho && F.faixa;
  p.innerHTML = `${stepHead(1, 'Vídeo e origem', okOrigem)}
  <div class="body stack">
    ${F.file ? `<video src="${F.url}" controls playsinline></video>
      <div class="filemeta"><span title="${esc(F.file.name)}">${esc(F.file.name)}</span><span>${fmtBytes(F.file.size)} · <button class="linkbtn" id="trocar">trocar</button></span></div>`
    : `<div class="drop" id="drop" tabindex="0" role="button"><strong>Solte o vídeo aqui</strong><span class="muted small">ou clique para escolher (mp4, mov, webm)</span></div>`}
    <input type="file" id="file" accept="video/*" class="hidden">
    <label class="f"><span>Link do anúncio na Biblioteca</span><input type="url" id="link" placeholder="https://www.facebook.com/ads/library/?id=…" value="${esc(F.linkBiblioteca)}"></label>
    <label class="f"><span>Dias ativos <em>(na Biblioteca, contando até hoje)</em></span><input type="number" id="diasAtivos" min="0" inputmode="numeric" placeholder="Ex.: 45" value="${esc(F.diasAtivos)}"></label>
    <label class="f"><span>Anunciante e oferta <em>(opcional)</em></span><input type="text" id="anunciante" placeholder="Ex.: Kit Radiestesia Cigana, R$ 27" value="${esc(F.anunciante)}"></label>
    <label class="f"><span>Nicho</span>
      <div class="row"><select id="nicho" style="flex:1">${opts(S.listas.nichos, F.nicho, 'Escolha o nicho')}</select><button class="btn ghost small" id="addNicho" type="button">Novo</button></div>
    </label>
    <div class="row hidden" id="nichoNovoRow"><input type="text" id="nichoNovo" placeholder="Nome do nicho" style="flex:1"><button class="btn small" id="nichoOk" type="button">Adicionar</button></div>
    <div><div class="small" style="font-weight:600;margin-bottom:4px">Faixa 80/10/10</div>
      <div class="seg" id="faixa">${FAIXAS.map((x) => `<button type="button" data-v="${x.v}" class="${F.faixa === x.v ? 'on' : ''}">${x.v}<small>${x.s}</small></button>`).join('')}</div>
    </div>
  </div>`;
  const pick = () => $('#file').click();
  const drop = $('#drop');
  if (drop) {
    drop.onclick = pick; drop.onkeydown = (e) => (e.key === 'Enter' || e.key === ' ') && pick();
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = (e) => { e.preventDefault(); setFile(e.dataTransfer.files[0]); };
  }
  $('#trocar') && ($('#trocar').onclick = pick);
  $('#file').onchange = (e) => setFile(e.target.files[0]);
  $('#link').oninput = (e) => { F.linkBiblioteca = e.target.value.trim(); updateFalta(); };
  $('#anunciante').oninput = (e) => (F.anunciante = e.target.value);
  $('#diasAtivos').oninput = (e) => { F.diasAtivos = e.target.value; updateFalta(); };
  $('#nicho').onchange = (e) => { F.nicho = e.target.value; updateFalta(); };
  $('#addNicho').onclick = () => { $('#nichoNovoRow').classList.toggle('hidden'); $('#nichoNovo').focus(); };
  $('#nichoOk').onclick = async () => {
    try {
      const r = await api('/api/listas/item', { method: 'POST', body: { lista: 'nicho', valor: $('#nichoNovo').value } });
      S.listas = await api('/api/listas'); F.nicho = r.valor; renderP1(); updateFalta();
    } catch (e) { toast(e.message, true); }
  };
  $$('#faixa button').forEach((b) => b.onclick = () => { F.faixa = b.dataset.v; $$('#faixa button').forEach((x) => x.classList.toggle('on', x === b)); updateFalta(); });
}

function setFile(file) {
  if (!file) return;
  if (!file.type.startsWith('video/') && !/\.(mp4|mov|webm|m4v)$/i.test(file.name)) return toast('Esse arquivo não é um vídeo.', true);
  if (F.url) URL.revokeObjectURL(F.url);
  F.file = file; F.url = URL.createObjectURL(file);
  renderP1(); renderP2(); updateFalta();
}

function renderP2() {
  const p = $('#p2');
  p.innerHTML = `${stepHead(2, 'Transcrição', !!F.transcricao.trim(), `<span class="small muted">${webgpu() ? 'Roda no seu navegador (acelerado)' : 'Roda no seu navegador (modo CPU, mais lento)'}</span>`)}
  <div class="body stack">
    <div class="row">
      <button class="btn" id="transc" ${!F.file || F.busy ? 'disabled' : ''}>Transcrever o vídeo</button>
      <span class="status" id="tstatus">${F.file ? 'Grátis e sem enviar o áudio para lugar nenhum.' : 'Escolha o vídeo no passo 1.'}</span>
    </div>
    <div class="progress hidden" id="tprog"><div></div></div>
    <label class="f"><span>Texto do anúncio <em>(revise, ou cole aqui se preferir)</em></span><textarea id="transcricao" rows="7" placeholder="A transcrição aparece aqui.">${esc(F.transcricao)}</textarea></label>
  </div>`;
  $('#transcricao').oninput = (e) => { F.transcricao = e.target.value; updateFalta(); $('#dissecar') && ($('#dissecar').disabled = F.transcricao.trim().length < 20); };
  $('#transc').onclick = async () => {
    F.busy = true; $('#transc').disabled = true;
    const st = $('#tstatus'), pr = $('#tprog');
    try {
      F.transcricao = await transcrever(F.file, {
        onStage: (s) => (st.textContent = s),
        onProgress: (pct) => { pr.classList.remove('hidden'); pr.firstElementChild.style.width = pct + '%'; st.textContent = `Baixando o modelo… ${pct}%`; },
      });
      F.busy = false; renderP2(); renderP3(); updateFalta();
      toast('Transcrição pronta. Revise e disseque.');
    } catch (e) {
      F.busy = false; $('#transc').disabled = false; pr.classList.add('hidden');
      st.textContent = 'Não deu para transcrever: ' + e.message + ' Você pode colar o texto abaixo.';
    }
  };
}

function renderP3() {
  const p = $('#p3');
  const fi = F.ficha;
  p.innerHTML = `${stepHead(3, 'Dissecação', !!fi, fi ? `<span class="tag ${fi.demo ? 'demo' : 'ia'}">${fi.demo ? 'Exemplo (modo demo)' : 'Gerada pela IA'}</span>` : '')}
  <div class="body stack">
    <div class="row">
      <button class="btn blue" id="dissecar" ${F.transcricao.trim().length < 20 ? 'disabled' : ''}>${fi ? 'Dissecar de novo' : 'Dissecar'}</button>
      <span class="status" id="dstatus">${fi ? 'Revise os campos. Tudo é editável.' : 'A IA lê a transcrição e preenche a ficha.'}</span>
    </div>
    ${fi ? fichaEditor(fi) : ''}
  </div>`;
  $('#dissecar').onclick = async () => {
    $('#dissecar').disabled = true; $('#dstatus').textContent = 'Dissecando…';
    try {
      const r = await api('/api/dissecar', { method: 'POST', body: { transcricao: F.transcricao } });
      if (r.erro) throw new Error(r.erro);
      if (r.transcricao_limpa) F.transcricao = r.transcricao_limpa;
      F.ficha = r; renderP2(); renderP3(); renderP4(); updateFalta();
    } catch (e) { $('#dissecar').disabled = false; $('#dstatus').textContent = e.message; }
  };
  if (fi) bindFicha();
}

function anguloSelect(key, v) {
  const cat = v?.categoria || '';
  const list = L.angulos[cat] || [];
  return `<div class="angle">
    <select data-ang="${key}.categoria">${opts(ANG_CATS, cat, 'Categoria')}</select>
    <select data-ang="${key}.angulo">${opts(list.includes(v?.angulo) || !v?.angulo ? list : [v.angulo, ...list], v?.angulo, 'Ângulo')}</select>
  </div>
  <input type="text" data-ang="${key}.ideia" value="${esc(v?.ideia)}" placeholder="A ideia em uma frase" style="margin-top:6px">`;
}

function fichaEditor(fi) {
  const est = (fi.esqueleto || []).map((b) => b.bloco).filter(Boolean);
  return `<div class="ia-area stack">
    <label class="f"><span>Hook (literal)</span><textarea data-k="hook_literal" rows="2">${esc(fi.hook_literal)}</textarea></label>
    <label class="f"><span>Modelo do gancho <em>(o que você reaproveita)</em></span><textarea data-k="modelo_gancho" rows="2">${esc(fi.modelo_gancho)}</textarea></label>
    <div class="grid2">
      <label class="f"><span>Categoria do gancho</span><select data-k="categoria_gancho">${opts(GANCHO_CATS, fi.categoria_gancho, 'Escolha')}</select></label>
      <label class="f"><span>Consciência</span><select data-k="consciencia">${opts(CONSC, fi.consciencia, 'Escolha')}</select></label>
    </div>
    <div class="grid2">
      <div><h3>Ângulo do hook</h3>${anguloSelect('angulo_hook', fi.angulo_hook)}</div>
      <div><h3>Ângulo do body</h3>${anguloSelect('angulo_body', fi.angulo_body)}</div>
    </div>
    <div class="grid2">
      <label class="f"><span>Avatar</span><select data-k="avatar">${opts(AVATARES, fi.avatar, 'Escolha')}</select></label>
      <div><h3>Emoção</h3><div class="chips">${EMOC.map((e) => `<button type="button" class="chip ${(fi.emocoes || []).includes(e) ? 'on' : ''}" data-emo="${e}">${e}</button>`).join('')}</div></div>
    </div>
    <div>
      <h3>Estrutura invisível</h3>
      <div class="estrutura" id="estrutura">${est.map(esc).join('<span class="arrow">→</span>') || '<span class="muted">Sem blocos</span>'}</div>
    </div>
    <div>
      <h3>Esqueleto pra modelar</h3>
      <div class="skel" id="skel">${(fi.esqueleto || []).map((b, i) => `
        <div class="skel-row">
          <span class="n">${i + 1}</span>
          <select data-sk="${i}.bloco">${opts(BLOCOS.includes(b.bloco) || !b.bloco ? BLOCOS : [b.bloco, ...BLOCOS], b.bloco, 'Bloco')}</select>
          <input type="text" data-sk="${i}.funcao" value="${esc(b.funcao)}" placeholder="O que esse trecho faz">
          <button type="button" class="x" data-rm="${i}" aria-label="Remover bloco ${i + 1}">×</button>
        </div>`).join('')}</div>
      <button type="button" class="linkbtn" id="addBloco" style="margin-top:8px">Adicionar bloco</button>
    </div>
  </div>`;
}

function bindFicha() {
  const fi = F.ficha;
  $$('#p3 [data-k]').forEach((el) => el.oninput = el.onchange = () => { fi[el.dataset.k] = el.value; if (el.dataset.k === 'avatar') renderP4(); updateFalta(); });
  $$('#p3 [data-ang]').forEach((el) => el.onchange = el.oninput = () => {
    const [k, campo] = el.dataset.ang.split('.');
    fi[k] = fi[k] || {}; fi[k][campo] = el.value;
    if (campo === 'categoria') { fi[k].angulo = ''; renderP3(); }
  });
  $$('#p3 [data-emo]').forEach((b) => b.onclick = () => {
    const set = new Set(fi.emocoes || []); set.has(b.dataset.emo) ? set.delete(b.dataset.emo) : set.add(b.dataset.emo);
    fi.emocoes = EMOC.filter((e) => set.has(e)); b.classList.toggle('on');
  });
  $$('#p3 [data-sk]').forEach((el) => el.onchange = el.oninput = () => {
    const [i, campo] = el.dataset.sk.split('.'); fi.esqueleto[i][campo] = el.value;
    if (campo === 'bloco') $('#estrutura').innerHTML = fi.esqueleto.map((b) => esc(b.bloco)).join('<span class="arrow">→</span>');
  });
  $$('#p3 [data-rm]').forEach((b) => b.onclick = () => { fi.esqueleto.splice(Number(b.dataset.rm), 1); renderP3(); });
  $('#addBloco').onclick = () => { fi.esqueleto = fi.esqueleto || []; fi.esqueleto.push({ bloco: '', funcao: '' }); renderP3(); $$('#skel select').at(-1)?.focus(); };
}

function renderP4() {
  const p = $('#p4');
  const precisaAvatar = F.ficha?.avatar === 'Operador define';
  const novoFormato = F.formato && !formatos().some((x) => x.toLowerCase() === F.formato.trim().toLowerCase());
  const ok = F.formato && F.hookVisual.trim() && F.retencao.trim() && (!precisaAvatar || F.avatarOp);
  p.innerHTML = `${stepHead(4, 'Sua leitura', ok, '<span class="tag op">Você preenche</span>')}
  <div class="body">
    <div class="op-area stack">
      <div class="grid2">
        <label class="f"><span>Formato</span><input type="text" id="formato" list="formatosList" value="${esc(F.formato)}" placeholder="Busque: POV, UGC, Notícia…" autocomplete="off">
          <datalist id="formatosList">${formatos().map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
          <span class="small muted ${novoFormato ? '' : 'hidden'}" id="fnovo">Formato novo: vai entrar na lista quando você salvar.</span></label>
        ${precisaAvatar ? `<label class="f"><span>Avatar <em>(a IA não deu para saber pelo texto)</em></span><select id="avatarOp">${opts(AVATARES.slice(0, 4), F.avatarOp, 'Quem fala no vídeo?')}</select></label>` : '<div></div>'}
      </div>
      <label class="f"><span>Hook visual <em>(o que aparece nos primeiros segundos)</em></span><textarea id="hookVisual" rows="2" placeholder="Ex.: mulher segurando pêndulo sobre gráfico, close nas mãos, texto grande na tela">${esc(F.hookVisual)}</textarea></label>
      <label class="f"><span>Retenção <em>(o que segura a atenção no body)</em></span><textarea id="retencao" rows="2" placeholder="Ex.: cortes a cada 2s, mostra o material em B-roll enquanto fala, legenda dinâmica">${esc(F.retencao)}</textarea></label>
      <label class="f"><span>Impressões <em>(opcional)</em></span><textarea id="impressoes" rows="2" placeholder="Sua opinião livre sobre o criativo">${esc(F.impressoes)}</textarea></label>
    </div>
  </div>`;
  $('#formato').oninput = (e) => {
    F.formato = e.target.value;
    $('#fnovo').classList.toggle('hidden', !F.formato || formatos().some((x) => x.toLowerCase() === F.formato.trim().toLowerCase()));
    updateFalta();
  };
  ['hookVisual', 'retencao', 'impressoes'].forEach((k) => $('#' + k).oninput = (e) => { F[k] = e.target.value; updateFalta(); });
  $('#avatarOp') && ($('#avatarOp').onchange = (e) => { F.avatarOp = e.target.value; updateFalta(); });
}

function faltando() {
  const f = [];
  if (!F.file) f.push('vídeo');
  if (!F.linkBiblioteca) f.push('link');
  if (F.diasAtivos === '') f.push('dias ativos');
  if (!F.nicho) f.push('nicho');
  if (!F.faixa) f.push('faixa');
  if (!F.ficha) f.push('dissecação');
  if (!F.formato.trim()) f.push('formato');
  if (F.ficha?.avatar === 'Operador define' && !F.avatarOp) f.push('avatar');
  if (!F.hookVisual.trim()) f.push('hook visual');
  if (!F.retencao.trim()) f.push('retenção');
  return f;
}
function updateFalta() {
  const f = faltando();
  const el = $('#falta'); if (!el) return;
  el.textContent = f.length ? `Falta: ${f.join(', ')}.` : 'Tudo pronto. O ID é gerado na hora de salvar.';
  $('#salvar').disabled = f.length > 0 || F.busy;
  ['p1', 'p2', 'p3', 'p4'].forEach((id, i) => {
    const done = [F.file && F.linkBiblioteca && F.diasAtivos !== '' && F.nicho && F.faixa, F.transcricao.trim(), F.ficha, F.formato && F.hookVisual.trim() && F.retencao.trim() && (F.ficha?.avatar !== 'Operador define' || F.avatarOp)][i];
    const n = $(`#${id} .step-n`); if (n) { n.classList.toggle('done', !!done); n.textContent = done ? '✓' : i + 1; }
  });
}

// O vídeo vai direto do navegador para o Google Drive (sessão de upload criada pela API).
function putArquivo(url, file, onPct) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.setRequestHeader('content-type', file.type || 'video/mp4');
    x.upload.onprogress = (e) => e.lengthComputable && onPct(Math.round((e.loaded / e.total) * 100));
    x.onload = () => {
      if (x.status >= 300) return reject(new Error(`O Drive recusou o vídeo (${x.status}).`));
      let id = null; try { id = JSON.parse(x.responseText).id; } catch {}
      resolve(id);
    };
    x.onerror = () => reject(new Error('A conexão caiu durante o envio do vídeo.'));
    x.send(file);
  });
}
async function uploadVideo(id, file, onPct) {
  const s = await api(`/api/criativos/${id}/video-sessao`, { method: 'POST', body: { nome: file.name, tipo: file.type || 'video/mp4', tamanho: file.size } });
  let fileId = null;
  try { fileId = await putArquivo(s.uploadUrl, file, onPct); }
  catch (e) { if (!/conexão/.test(e.message)) throw e; } // às vezes o Google conclui mas o navegador não lê a resposta; a API confere
  return api(`/api/criativos/${id}/video-ok`, { method: 'POST', body: { fileId } });
}

async function salvar() {
  if (faltando().length) return;
  const btn = $('#salvar'); F.busy = true; btn.disabled = true; btn.textContent = 'Salvando…';
  let c;
  try {
    const ficha = { ...F.ficha };
    delete ficha.demo;
    if (ficha.avatar === 'Operador define' && F.avatarOp) ficha.avatar = F.avatarOp;
    if (!formatos().some((x) => x.toLowerCase() === F.formato.trim().toLowerCase())) {
      await api('/api/listas/item', { method: 'POST', body: { lista: 'formato', valor: F.formato } });
      S.listas = await api('/api/listas');
    }
    c = await api('/api/criativos', { method: 'POST', body: { nicho: F.nicho, faixa: F.faixa, anunciante: F.anunciante, diasAtivos: Number(F.diasAtivos), linkBiblioteca: F.linkBiblioteca, formato: F.formato.trim(), hookVisual: F.hookVisual, retencao: F.retencao, impressoes: F.impressoes, ficha: { ...ficha, transcricao_limpa: F.transcricao } } });
  } catch (e) {
    F.busy = false; btn.disabled = false; btn.textContent = 'Salvar no Swipe';
    return toast(e.message, true);
  }
  let avisoVideo = '';
  try { await uploadVideo(c.id, F.file, (p) => (btn.textContent = `Enviando vídeo ${p}%`)); }
  catch (e) { avisoVideo = e.message; }
  const nicho = F.nicho, faixa = F.faixa;
  if (F.url) URL.revokeObjectURL(F.url);
  F = novoForm(); F.nicho = nicho; F.faixa = faixa; // mantém nicho e faixa para o próximo
  await refreshStats();
  pageNovo();
  window.scrollTo({ top: 0 });
  if (avisoVideo) toast(`${c.id} salvo, mas o vídeo não subiu: ${avisoVideo} Abra o ${c.id} no Swipe para reenviar.`, true);
  else toast(`${c.id} salvo no Swipe.`);
}

// ---------------------------------------------------------------- swipe
async function pageSwipe(abrirId) {
  $('#main').innerHTML = `<div class="head"><div><h1>Swipe</h1><div class="muted" id="contagem">Carregando…</div></div>
    <a class="btn ghost" href="/api/export.csv?t=${encodeURIComponent(S.token)}">Baixar planilha (CSV)</a></div>
    <div class="filters" id="filtros"></div><div class="tablewrap" id="tabela"></div>`;
  S.criativos = await api('/api/criativos');
  const uniq = (fn) => [...new Set(S.criativos.map(fn).filter(Boolean))].sort();
  const fl = S.filtros;
  $('#filtros').innerHTML = `
    <input type="text" data-f="q" placeholder="Buscar no hook, transcrição, anunciante…" value="${esc(fl.q)}">
    <select data-f="nicho">${opts(uniq((c) => c.nicho), fl.nicho, 'Nicho')}</select>
    <select data-f="faixa">${opts(FAIXAS.map((x) => x.v), fl.faixa, 'Faixa')}</select>
    <select data-f="formato">${opts(uniq((c) => c.formato), fl.formato, 'Formato')}</select>
    <select data-f="cat">${opts(ANG_CATS, fl.cat, 'Categoria do ângulo')}</select>
    <select data-f="consc">${opts(CONSC, fl.consc, 'Consciência')}</select>
    <select data-f="op">${opts(uniq((c) => c.operadorNome), fl.op, 'Operador')}</select>
    <select data-f="dias"><option value="">Dias ativos</option>${[7, 15, 30, 60, 90].map((d) => `<option value="${d}" ${String(fl.dias) === String(d) ? 'selected' : ''}>${d}+ dias</option>`).join('')}</select>`;
  $$('#filtros [data-f]').forEach((el) => el.oninput = el.onchange = () => { fl[el.dataset.f] = el.value; renderTabela(); });
  renderTabela();
  if (abrirId) openDrawer(abrirId);
}

function filtrados() {
  const f = S.filtros, q = f.q.trim().toLowerCase();
  return S.criativos.filter((c) => {
    const fi = c.ficha || {};
    if (f.nicho && c.nicho !== f.nicho) return false;
    if (f.faixa && c.faixa !== f.faixa) return false;
    if (f.formato && c.formato !== f.formato) return false;
    if (f.cat && fi.angulo_hook?.categoria !== f.cat && fi.angulo_body?.categoria !== f.cat) return false;
    if (f.consc && fi.consciencia !== f.consc) return false;
    if (f.op && c.operadorNome !== f.op) return false;
    if (f.dias && !(Number(c.diasAtivos) >= Number(f.dias))) return false;
    if (q) {
      const hay = [c.id, c.anunciante, c.formato, c.hookVisual, c.retencao, c.impressoes, fi.hook_literal, fi.modelo_gancho, fi.transcricao_limpa, fi.angulo_hook?.angulo, fi.angulo_body?.angulo].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderTabela() {
  const list = filtrados();
  $('#contagem').textContent = `${list.length} de ${S.criativos.length} criativos`;
  if (!S.criativos.length) {
    $('#tabela').innerHTML = `<div class="empty"><h2>O Swipe ainda está vazio</h2><p>Cada criativo salvo em <a href="#/novo">Novo criativo</a> aparece aqui, com ficha e vídeo.</p></div>`;
    return;
  }
  if (!list.length) { $('#tabela').innerHTML = `<div class="empty"><h2>Nada com esses filtros</h2><p>Limpe algum filtro para ver mais criativos.</p></div>`; return; }
  $('#tabela').innerHTML = `<table><thead><tr><th>ID</th><th>Dias ativos</th><th>Nicho</th><th>Formato</th><th>Modelo do gancho</th><th>Ângulo do hook</th><th>Ângulo do body</th><th>Consciência</th><th>Estrutura</th></tr></thead>
  <tbody>${list.map((c) => {
    const fi = c.ficha || {};
    return `<tr data-id="${c.id}" tabindex="0">
      <td class="id">${c.id}<div class="sub">${fmtData(c.data)} · ${esc(c.operadorNome.split(' ')[0])}</div></td>
      <td class="dias">${c.diasAtivos ?? '<span class="muted">—</span>'}</td>
      <td>${esc(c.nicho)}<div><span class="pill ${esc(c.faixa)}">${esc(c.faixa)}</span></div></td>
      <td>${esc(c.formato)}</td>
      <td style="min-width:240px">${esc(fi.modelo_gancho)}<div class="sub">${esc(fi.categoria_gancho)}</div></td>
      <td>${esc(fi.angulo_hook?.angulo)}<div class="sub">${esc(fi.angulo_hook?.categoria)}</div></td>
      <td>${esc(fi.angulo_body?.angulo)}<div class="sub">${esc(fi.angulo_body?.categoria)}</div></td>
      <td>${esc(fi.consciencia)}</td>
      <td class="sub" style="min-width:220px">${(fi.esqueleto || []).map((b) => esc(b.bloco)).join(' → ')}</td>
    </tr>`; }).join('')}</tbody></table>`;
  $$('#tabela tbody tr').forEach((tr) => {
    tr.onclick = () => (location.hash = `#/swipe/${tr.dataset.id}`);
    tr.onkeydown = (e) => e.key === 'Enter' && tr.click();
  });
}

function fichaTexto(c) {
  const fi = c.ficha || {};
  return [
    `${c.id} · ${c.nicho} · ${c.faixa}`,
    '',
    `Hook (literal): "${fi.hook_literal || ''}"`,
    `Modelo do gancho: ${fi.modelo_gancho || ''}`,
    `Gancho: ${fi.categoria_gancho || ''}`,
    `Ângulo do hook: ${fi.angulo_hook?.categoria} · ${fi.angulo_hook?.angulo} · ${fi.angulo_hook?.ideia || ''}`,
    `Ângulo do body: ${fi.angulo_body?.categoria} · ${fi.angulo_body?.angulo} · ${fi.angulo_body?.ideia || ''}`,
    `Avatar: ${fi.avatar || ''}`,
    `Consciência: ${fi.consciencia || ''}`,
    `Emoção: ${(fi.emocoes || []).join(', ')}`,
    `Dias ativos: ${c.diasAtivos ?? '—'}`,
    `Formato: ${c.formato}`,
    `Hook visual: ${c.hookVisual}`,
    `Retenção: ${c.retencao}`,
    '',
    `Estrutura invisível: ${(fi.esqueleto || []).map((b) => b.bloco).join(' → ')}`,
    '',
    'Esqueleto pra modelar:',
    ...(fi.esqueleto || []).map((b, i) => `${i + 1}. ${b.bloco}: ${b.funcao}`),
    '',
    'Transcrição:',
    fi.transcricao_limpa || '',
  ].join('\n');
}

function openDrawer(id) {
  const c = S.criativos.find((x) => x.id === id);
  if (!c) return toast(`${id} não está no Swipe.`, true);
  const fi = c.ficha || {};
  const pode = S.user.papel === 'admin' || S.user.id === c.operador;
  const wrap = document.createElement('div');
  wrap.id = 'drawerwrap';
  wrap.innerHTML = `<div class="drawer-bg"></div>
  <aside class="drawer" role="dialog" aria-label="${c.id}">
    <header><h2>${c.id} <span class="muted" style="font-weight:400">· ${esc(c.nicho)} · ${esc(c.faixa)}</span></h2>
      <div class="row"><button class="btn ghost small" id="copiar">Copiar ficha</button><button class="btn small" id="fechar">Fechar</button></div></header>
    <div class="content">
      ${c.video?.driveId ? `<div class="player"><iframe src="https://drive.google.com/file/d/${esc(c.video.driveId)}/preview" allow="autoplay; fullscreen" allowfullscreen title="Vídeo ${c.id}"></iframe></div>`
        : `<div class="banner">O vídeo deste criativo ainda não está no Drive.${pode ? ' <label class="linkbtn" style="cursor:pointer">Enviar agora<input type="file" accept="video/*" id="reenviar" class="hidden"></label>' : ''}</div>`}
      <div class="small muted">${esc(c.operadorNome)} · ${fmtData(c.data)} ${c.anunciante ? '· ' + esc(c.anunciante) : ''} · <a href="${esc(c.linkBiblioteca)}" target="_blank" rel="noopener">Abrir na Biblioteca</a>${c.video?.link ? ` · <a href="${esc(c.video.link)}" target="_blank" rel="noopener">Abrir no Drive</a>` : ''}</div>
      <section class="panel ficha"><header><h2>Ficha</h2><span class="tag ia">IA, revisada</span></header><div class="body"><dl>
        <dt>Hook (literal)</dt><dd>"${esc(fi.hook_literal)}"</dd>
        <dt>Modelo do gancho</dt><dd><b>${esc(fi.modelo_gancho)}</b></dd>
        <dt>Gancho</dt><dd>${esc(fi.categoria_gancho)}</dd>
        <dt>Ângulo do hook</dt><dd>${esc(fi.angulo_hook?.categoria)} · <b>${esc(fi.angulo_hook?.angulo)}</b><div class="muted small">${esc(fi.angulo_hook?.ideia)}</div></dd>
        <dt>Ângulo do body</dt><dd>${esc(fi.angulo_body?.categoria)} · <b>${esc(fi.angulo_body?.angulo)}</b><div class="muted small">${esc(fi.angulo_body?.ideia)}</div></dd>
        <dt>Avatar</dt><dd>${esc(fi.avatar)}</dd>
        <dt>Consciência</dt><dd>${esc(fi.consciencia)}</dd>
        <dt>Emoção</dt><dd>${esc((fi.emocoes || []).join(', '))}</dd>
        <dt>Estrutura</dt><dd class="estrutura">${(fi.esqueleto || []).map((b) => esc(b.bloco)).join('<span class="arrow">→</span>')}</dd>
        <dt>Esqueleto</dt><dd><ol>${(fi.esqueleto || []).map((b) => `<li><b>${esc(b.bloco)}:</b> ${esc(b.funcao)}</li>`).join('')}</ol></dd>
      </dl></div></section>
      <section class="panel"><header><h2>Leitura do operador</h2>${pode ? '<button class="linkbtn" id="editar">Editar</button>' : '<span class="tag op">Operador</span>'}</header>
        <div class="body" id="leitura"></div></section>
      <section class="panel"><header><h2>Transcrição</h2></header><div class="body transcript">${esc(fi.transcricao_limpa)}</div></section>
    </div>
  </aside>`;
  document.body.appendChild(wrap);
  document.body.style.overflow = 'hidden';
  const leitura = (edit) => {
    $('#leitura').innerHTML = edit ? `<div class="op-area stack">
      <label class="f"><span>Dias ativos</span><input type="number" min="0" id="e_dias" value="${esc(c.diasAtivos ?? '')}"></label>
      <label class="f"><span>Formato</span><input type="text" id="e_formato" list="fl2" value="${esc(c.formato)}"><datalist id="fl2">${formatos().map((x) => `<option value="${esc(x)}">`).join('')}</datalist></label>
      <label class="f"><span>Hook visual</span><textarea id="e_hookVisual" rows="2">${esc(c.hookVisual)}</textarea></label>
      <label class="f"><span>Retenção</span><textarea id="e_retencao" rows="2">${esc(c.retencao)}</textarea></label>
      <label class="f"><span>Impressões</span><textarea id="e_impressoes" rows="2">${esc(c.impressoes)}</textarea></label>
      <div><button class="btn" id="salvarEd">Salvar alterações</button></div></div>`
      : `<div class="ficha"><dl><dt>Dias ativos</dt><dd>${c.diasAtivos ?? '<span class="muted">Não informado</span>'}</dd><dt>Formato</dt><dd>${esc(c.formato)}</dd><dt>Hook visual</dt><dd>${esc(c.hookVisual)}</dd><dt>Retenção</dt><dd>${esc(c.retencao)}</dd><dt>Impressões</dt><dd>${esc(c.impressoes) || '<span class="muted">Sem impressões</span>'}</dd></dl></div>`;
    if (edit) $('#salvarEd').onclick = async () => {
      try {
        const body = { diasAtivos: $('#e_dias').value === '' ? null : Number($('#e_dias').value), formato: $('#e_formato').value.trim(), hookVisual: $('#e_hookVisual').value.trim(), retencao: $('#e_retencao').value.trim(), impressoes: $('#e_impressoes').value.trim() };
        Object.assign(c, await api(`/api/criativos/${c.id}`, { method: 'PATCH', body }));
        leitura(false); renderTabela(); toast('Alterações salvas.');
      } catch (e) { toast(e.message, true); }
    };
  };
  leitura(false);
  $('#editar') && ($('#editar').onclick = () => leitura(true));
  const fechar = () => (location.hash = '#/swipe');
  $('#fechar').onclick = fechar; $('.drawer-bg').onclick = fechar;
  $('#reenviar') && ($('#reenviar').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      toast('Enviando o vídeo…');
      Object.assign(c, await uploadVideo(c.id, file, (p) => toast(`Enviando o vídeo… ${p}%`)));
      toast('Vídeo enviado para o Drive.'); closeDrawer(); openDrawer(c.id);
    } catch (err) { toast(err.message, true); }
  });
  $('#copiar').onclick = async () => { await navigator.clipboard.writeText(fichaTexto(c)); toast('Ficha copiada.'); };
  wrap.onkeydown = (e) => e.key === 'Escape' && fechar();
  $('#fechar').focus();
}
function closeDrawer() {
  $('#drawerwrap')?.remove(); document.body.style.overflow = '';
}

// ---------------------------------------------------------------- painel
async function pagePainel() {
  await refreshStats();
  const s = S.stats;
  const max = Math.max(1, ...s.dias.map((d) => d.porUsuario.reduce((a, b) => a + b.n, 0)));
  const alvo = { Core: 80, Adjacente: 10, 'Aleatório': 10 };
  $('#main').innerHTML = `<div class="head"><div><h1>Painel do dia</h1><div class="muted">${s.total} de ${s.metaTotal} criativos hoje · ${s.totalSwipe} no Swipe no total</div></div>
    <a class="btn ghost" href="/api/export.csv?t=${encodeURIComponent(S.token)}">Baixar planilha (CSV)</a></div>
  <div class="cards3">
    ${s.porUsuario.map((u) => `<section class="panel"><div class="body">
      <h3>${esc(u.nome)}</h3>
      <div class="big">${u.feitos}<small> / ${u.meta}</small></div>
      <div class="bar"><div style="width:${Math.min(100, (u.feitos / u.meta) * 100)}%"></div></div>
      <div class="small muted" style="margin-top:8px">${u.feitos >= u.meta ? 'Meta batida.' : `Faltam ${u.meta - u.feitos}.`}</div>
    </div></section>`).join('')}
    <section class="panel"><div class="body">
      <h3>Mistura 80/10/10 de hoje</h3>
      <div class="mix" style="margin-top:12px">${Object.entries(s.faixas).map(([k, n]) => {
        const pct = s.total ? Math.round((n / s.total) * 100) : 0;
        return `<div class="mix-row"><span>${k}</span><div class="mix-track" title="Alvo ${alvo[k]}%"><div style="width:${pct}%"></div><i style="left:${alvo[k]}%"></i></div><span class="small"><b>${pct}%</b> <span class="muted">/ ${alvo[k]}%</span></span></div>`;
      }).join('')}</div>
      <div class="small muted" style="margin-top:10px">A barra preta marca o alvo.</div>
    </div></section>
  </div>
  <section class="panel"><header><h2>Últimos 7 dias</h2></header><div class="body">
    <div class="week">${s.dias.map((d) => `<div class="day">
      <div class="stack-bar">${d.porUsuario.map((u, i) => `<div class="seg${i + 1}" style="height:${(u.n / max) * 120}px" title="${u.n}"></div>`).join('')}</div>
      <span><b style="color:var(--ink)">${d.porUsuario.reduce((a, b) => a + b.n, 0)}</b><br>${fmtData(d.data)}</span></div>`).join('')}</div>
    <div class="keys">${s.porUsuario.map((u, i) => `<span><i class="seg${i + 1}" style="background:${i ? 'var(--marca)' : 'var(--ink)'}"></i>${esc(u.nome.split(' ')[0])}</span>`).join('')}</div>
  </div></section>`;
}

// ---------------------------------------------------------------- ajustes
async function pageAjustes(driveRet) {
  const c = await api('/api/config');
  const item = (ok, txt) => `<li><span class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'}</span><span>${txt}</span></li>`;
  $('#main').innerHTML = `<div class="head"><div><h1>Ajustes</h1><div class="muted">Só o gestor vê esta página.</div></div></div>
  ${driveRet === 'ok' ? '<div class="banner" style="background:#E5F4EC;color:#14532D;border-color:#B7E0C8">Google Drive conectado. Os próximos vídeos vão para a pasta "Esteira de Repertório" no seu Drive.</div>' : ''}
  ${driveRet === 'erro' ? '<div class="banner">O Google não devolveu a autorização. Tente conectar de novo.</div>' : ''}
  <div class="stack" style="max-width:760px">
    <section class="panel"><header><h2>Conexões</h2></header><div class="body stack">
      <ul class="checklist">
        ${item(c.temChave, c.temChave ? 'Dissecação com IA ligada.' : 'Dissecação em modo demo. Cadastre <code>ANTHROPIC_API_KEY</code> nas variáveis da Netlify e faça um novo deploy.')}
        ${item(c.googleConfigurado, c.googleConfigurado ? 'Credenciais do Google cadastradas na Netlify.' : 'Faltam <code>GOOGLE_CLIENT_ID</code> e <code>GOOGLE_CLIENT_SECRET</code> nas variáveis da Netlify.')}
        ${item(c.driveConectado, c.driveConectado ? 'Google Drive conectado.' : 'Google Drive ainda não conectado.')}
      </ul>
      ${c.googleConfigurado ? `<div class="row"><a class="btn ${c.driveConectado ? 'ghost' : ''}" href="/api/google/conectar?t=${encodeURIComponent(S.token)}">${c.driveConectado ? 'Reconectar Google Drive' : 'Conectar Google Drive'}</a>
        <span class="small muted">Use a conta do Google onde os vídeos devem ficar.</span></div>` : ''}
      <div class="small muted">Endereço de retorno para cadastrar no Google Cloud: <code>${esc(c.redirectUri)}</code></div>
    </div></section>
    <form id="cf" class="stack">
      <section class="panel"><header><h2>Meta e prazo</h2></header><div class="body grid2">
        <label class="f"><span>Meta diária por pessoa</span><input type="number" id="meta" min="1" value="${c.metaDiaria}"></label>
        <label class="f"><span>Horário limite</span><input type="text" id="hora" value="${esc(c.horarioLimite)}" placeholder="16:00"></label>
        <label class="f"><span>Fuso horário da equipe</span><input type="text" id="fuso" value="${esc(c.fuso)}" placeholder="America/Sao_Paulo"></label>
        <label class="f"><span>Modelo da IA</span><input type="text" id="modelo" value="${esc(c.modelo)}"></label>
      </div></section>
      <section class="panel"><header><h2>PINs de acesso</h2></header><div class="body grid2">
        ${c.usuarios.map((u) => `<label class="f"><span>${esc(u.nome)}</span><input type="text" data-pin="${u.id}" value="${esc(u.pin)}" inputmode="numeric"></label>`).join('')}
      </div></section>
      <div><button class="btn big">Salvar ajustes</button></div>
    </form>
  </div>`;
  $('#cf').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/api/config', { method: 'POST', body: {
        modelo: $('#modelo').value, metaDiaria: $('#meta').value, horarioLimite: $('#hora').value, fuso: $('#fuso').value,
        usuarios: $$('[data-pin]').map((i) => ({ id: i.dataset.pin, pin: i.value })),
      } });
      await refreshStats(); pageAjustes(); toast('Ajustes salvos.');
    } catch (err) { toast(err.message, true); }
  };
}

boot();
