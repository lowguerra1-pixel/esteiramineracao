// App Criativos — front. Especificação: docs/criativos-front-spec.md. API: docs/criativos-api.md.
// HTML/CSS/JS puro, mesmo login dos outros apps (token em localStorage 'esteira.token').

const LIQUIDO = 0.91; // receita líquida após a taxa da Lastlink
const ATUALIZA_MS = 60_000;
const S = {
  token: lsGet('esteira.token'), user: null, d: null,
  f: { periodo: '7', oferta: '', tipo: '', busca: '', status: '', ofertasBoard: [], ocultarMortos: true },
  ord: { k: 'd7.receita', dir: -1 }, aprovSel: null, feed: null, evolucao: {},
};
const STATUS_NOME = { fila: 'Fila', briefing: 'Briefing', producao: 'Produção', revisao: 'Revisão', aprovado: 'Aprovado', no_ar: 'No ar', meio: 'Variar', vencedor: 'Vencedor', fadiga: 'Fadiga', morto: 'Morto' };
const ESTADO_NOME = { validacao: 'Validação', escalando: 'Escalando', em_risco: 'Em risco', pausada: 'Pausada', encerrada: 'Encerrada' };
const TIPO_NOME = { modelagem: 'Modelagem', variacao: 'Variação', zero: 'Do zero' };
const FORMATOS = ['IMG', 'VID', 'UGC', 'CAR'];
const LEVA_NOME = { planejada: 'Planejada', producao: 'Produção', no_ar: 'No ar', encerrada: 'Encerrada' };
const RODANDO = ['no_ar', 'meio', 'vencedor', 'fadiga'];
const PRODUCAO = ['fila', 'briefing', 'producao', 'revisao', 'aprovado'];
const PROXIMO = { fila: ['briefing'], briefing: ['producao', 'revisao'], producao: ['revisao'], revisao: ['aprovado', 'briefing'], aprovado: ['no_ar', 'producao'], no_ar: ['vencedor', 'meio', 'morto'], meio: ['no_ar', 'morto', 'vencedor'], vencedor: ['fadiga', 'morto'], fadiga: ['vencedor', 'morto'], morto: ['fila'] };
const PEDE_NOTA = ['briefing', 'morto'];

// ---------------------------------------------------------------- utilidades
function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } }
function lsSet(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* sem storage */ } }
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const opts = (list, sel, ph) => (ph !== undefined ? `<option value="">${esc(ph)}</option>` : '') + list.map((o) => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(sel ?? '') ? 'selected' : ''}>${esc(t)}</option>`; }).join('');
const hoje = () => new Date().toLocaleDateString('en-CA');
const fmtData = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');
const fmtDH = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const fmtH = (iso) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—');
const ok = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));
const fmtN = (v, d = 1) => (ok(v) ? Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d }) : '—');
const fmtI = (v) => (ok(v) ? Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '—');
const fmtR = (v) => (ok(v) ? 'R$ ' + Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '—');
const fmtRoas = (v) => (ok(v) ? Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const dias = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 864e5) : null);
const horas = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 36e5 : null);
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const info = (t) => `<span class="i" title="${esc(t)}">i</span>`;
const admin = () => S.user?.papel === 'admin';
const oferta = (id) => S.d.ofertas.find((o) => o.id === id);
const criativo = (id) => S.d.criativos.find((c) => c.id === id);
const enc = encodeURIComponent;
const roasCls = (r) => { const R = S.d.regras; return !ok(r) ? '' : r >= R.roasSegue ? 'verde' : r < R.roasMorre ? 'verm' : 'amar'; };
const notaCls = (n) => (!ok(n) ? '' : n >= 8 ? 'n8' : n >= 6 ? 'n6' : 'n0');
const chipTipo = (t) => (t ? `<span class="chip t-${t}">${TIPO_NOME[t] || t}</span>` : '');
const chipSt = (s) => `<span class="chip ${s}">${STATUS_NOME[s] || s}</span>`;
const chipEst = (e) => `<span class="chip ${e}">${ESTADO_NOME[e] || e}</span>`;

function toast(msg, erro = false) {
  const t = document.createElement('div'); t.className = 'toast' + (erro ? ' erro' : ''); t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), erro ? 7000 : 3500);
}
async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(path, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(S.token ? { authorization: 'Bearer ' + S.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/api/login') { sair(); throw new Error(j.erro || 'Faça login de novo.'); }
  if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
  return j;
}
// Ação com toast de erro, sem travar a tela.
async function acao(fn, msgOk) { try { const r = await fn(); if (msgOk) toast(msgOk); return r; } catch (e) { toast(e.message, true); return undefined; } }
async function recarregar() { S.d = await api('/api/cr/bootstrap'); }

// ---------------------------------------------------------------- derivados (seção 1 da spec)
const daOferta = (lista) => (S.f.oferta ? lista.filter((c) => c.ofertaId === S.f.oferta) : lista);
const janela = () => (S.f.periodo === '30' ? 'd30' : 'd7');
const soma = (lista, campo, jan = janela()) => lista.reduce((a, c) => a + (Number(c[jan]?.[campo]) || 0), 0);
function numeros(ofertaId = S.f.oferta) {
  const cs = ofertaId ? S.d.criativos.filter((c) => c.ofertaId === ofertaId) : S.d.criativos;
  const p = S.d.painel, jan = janela();
  const gasto = soma(cs, 'gasto', jan);
  let receita;
  if (jan === 'd7') receita = ofertaId ? (p.porOferta.find((o) => o.id === ofertaId)?.receita7 ?? soma(cs, 'receita', jan)) : p.receita7;
  else receita = soma(cs, 'receita', jan);
  const roas = gasto > 0 ? receita / gasto : null;
  const lucro = gasto > 0 || receita > 0 ? receita * LIQUIDO - gasto : null;
  return { gasto, receita, roas, lucro, cs };
}
const noAr = (lista) => lista.filter((c) => RODANDO.includes(c.status) && (c.d7?.gasto || 0) > 0);
const mortosSemana = (lista) => lista.filter((c) => c.status === 'morto' && dias(c.statusEm) !== null && dias(c.statusEm) < 7);
const noArHa = (c) => (c.noArEm ? dias(c.noArEm) : null);

// ---------------------------------------------------------------- login
async function renderLogin() {
  let users = [];
  try { users = await api('/api/usuarios'); } catch (e) { toast(e.message, true); }
  let sel = users.find((u) => u.papel === 'admin')?.id || users[0]?.id;
  $('#app').innerHTML = `<div class="login"><div class="login-box">
    <h1>Criativos</h1><p>A base de criativos, a fila de aprovação e o veredito de 72h. Mesmo acesso da Esteira.</p>
    <div class="people">${users.map((u) => `<button class="person ${u.id === sel ? 'on' : ''}" data-id="${esc(u.id)}"><b>${esc(u.nome)}</b><small>${u.papel === 'admin' ? 'Gestor' : 'Operador'}</small></button>`).join('')}</div>
    <form id="lf"><input type="password" id="pin" placeholder="PIN" inputmode="numeric" autocomplete="current-password" autofocus><button class="btn">Entrar</button></form>
  </div></div>`;
  $$('.person').forEach((b) => b.onclick = () => { sel = b.dataset.id; $$('.person').forEach((x) => x.classList.toggle('on', x === b)); $('#pin').focus(); });
  $('#lf').onsubmit = async (e) => {
    e.preventDefault();
    try { const r = await api('/api/login', { method: 'POST', body: { id: sel, pin: $('#pin').value } }); S.token = r.token; lsSet('esteira.token', r.token); await boot(); }
    catch (err) { toast(err.message, true); $('#pin').select(); }
  };
}
function sair() { S.token = ''; S.user = null; lsSet('esteira.token', ''); fecharGaveta(); fecharModal(); renderLogin(); }

// ---------------------------------------------------------------- casca
const ICONES = {
  grade: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/></svg>',
  colunas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="5" height="16" rx="1.2"/><rect x="10" y="4" width="5" height="11" rx="1.2"/><rect x="17" y="4" width="4" height="7" rx="1.2"/></svg>',
  etiqueta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12V4h8l10 10-8 8L3 12Z"/><circle cx="7.5" cy="8.5" r="1.3"/></svg>',
  tabela: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9.5h18M3 14.5h18M9 9.5V20"/></svg>',
  pulso: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12h4l2.5-6 4 12 2.5-6H21"/></svg>',
  engrenagem: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>',
};
const ROTAS = [['', 'Visão geral', 'grade'], ['aovivo', 'Ao vivo', 'pulso'], ['aprovar', 'Aprovar', 'check'], ['board', 'Board', 'colunas'], ['ofertas', 'Ofertas', 'etiqueta'], ['criativos', 'Criativos', 'tabela']];
const TITULOS = { '': 'Visão geral', aovivo: 'Ao vivo', aprovar: 'Aprovar', board: 'Board', ofertas: 'Ofertas', criativos: 'Criativos', ajustes: 'Ajustes' };

async function boot() {
  if (!S.token) return renderLogin();
  $('#app').innerHTML = `<div class="shell"><nav class="menu"></nav><div class="conteudo"><div class="sk" style="height:34px;width:220px;margin-bottom:24px"></div><div class="g4">${'<div class="sk" style="height:150px"></div>'.repeat(4)}</div><div class="sk" style="height:90px"></div></div></div>`;
  try { S.user = (await api('/api/eu')).usuario; await recarregar(); }
  catch (e) { if (S.token) { $('#app').innerHTML = `<div class="vazio"><b>Não consegui carregar os dados.</b>${esc(e.message)}<br><br><button class="btn" id="tenta">Tentar de novo</button></div>`; $('#tenta').onclick = boot; } return; }
  shell(); route();
  clearInterval(boot.t); boot.t = setInterval(atualizar, ATUALIZA_MS);
}
function shell() {
  $('#app').innerHTML = `<div class="shell">
    <nav class="menu" id="menu"></nav>
    <div class="conteudo"><div class="topo"><h1 id="titulo"></h1><span class="grow"></span><button class="busca" id="abrirBusca"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span>Buscar criativo, oferta…</span><kbd>${/Mac/.test(navigator.platform) ? '⌘' : 'Ctrl'} K</kbd></button><span class="vivo" id="vivo"></span><span class="quem"><b>${esc(S.user.nome)}</b><button class="link" id="sair">Sair</button></span></div>
    <div id="faixas"></div><main id="main"></main></div></div>`;
  $('#sair').onclick = sair;
  $('#abrirBusca').onclick = paleta;
}
function menu(r) {
  const nRev = S.d.criativos.filter((c) => c.status === 'revisao').length;
  const nRisco = S.d.ofertas.filter((o) => o.estado === 'em_risco').length;
  const alerta = !S.d.meta || !S.d.ultimoSync || horas(S.d.ultimoSync.em) > 36;
  const badge = { aovivo: (S.vivo?.colunas || []).some((c) => c.ativo) ? '<span class="dot ok" title="agentes trabalhando"></span>' : '', aprovar: nRev ? `<span class="badge verm">${nRev}</span>` : '', ofertas: nRisco ? `<span class="badge amar">${nRisco}</span>` : '' };
  $('#menu').innerHTML = `<div class="marca"><div>Criativos<small><a href="/" style="color:inherit">Kaian Digital ↗</a></small></div></div>
    ${ROTAS.map(([id, nome, ic]) => `<a href="#/${id}" class="${r === id ? 'on' : ''}">${ICONES[ic]}<span>${nome}</span>${badge[id] || ''}</a>`).join('')}
    <span class="grow"></span>
    <a href="#/ajustes" class="${r === 'ajustes' ? 'on' : ''}">${ICONES.engrenagem}<span>Ajustes</span>${alerta ? '<span class="dot" title="Meta desconectada ou sync atrasado"></span>' : ''}</a>`;
  $('#vivo').textContent = `Ao vivo · sync ${fmtH(S.d.ultimoSync?.em)} · veredito ${fmtH(S.d.ultimoVeredito?.em)}`;
  $('#vivo').title = `Último sync da Meta: ${fmtDH(S.d.ultimoSync?.em)} · último veredito: ${fmtDH(S.d.ultimoVeredito?.em)}`;
  const fx = [];
  if (!S.d.meta) fx.push(`Meta não conectada — gasto e ROAS zerados. ${admin() ? '<a href="#/ajustes">Conectar</a>' : 'Peça ao gestor para conectar.'}`);
  else if (!S.d.ultimoSync) fx.push('A Meta ainda não foi sincronizada.');
  else if (horas(S.d.ultimoSync.em) > 36) fx.push(`Última sincronização há ${Math.round(horas(S.d.ultimoSync.em))} h. ${admin() ? '<a href="#/ajustes">Sincronizar</a>' : ''}`);
  $('#faixas').innerHTML = fx.map((t) => `<div class="faixa">${t}</div>`).join('');
}
function rota() {
  const [path, qs = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [r = '', arg] = path.split('/');
  return { r, arg: arg ? decodeURIComponent(arg) : '', q: new URLSearchParams(qs) };
}
function route() {
  if (!S.user || !S.d) return;
  const { r, arg, q } = rota();
  menu(r === 'levas' ? 'ofertas' : r); $('#titulo').textContent = r === 'levas' ? 'Por que esta leva?' : arg && r === 'ofertas' ? (oferta(arg)?.nome || arg) : TITULOS[r] ?? 'Visão geral';
  if (r === 'aovivo') return pageAoVivo();
  if (r === 'aprovar') return pageAprovar();
  if (r === 'board') { if (q.get('oferta')) S.f.ofertasBoard = [q.get('oferta')]; return pageBoard(); }
  if (r === 'ofertas') return arg ? pageOferta(arg) : pageOfertas();
  if (r === 'levas' && arg) return pageLeva(arg);
  if (r === 'criativos') return pageCriativos();
  if (r === 'ajustes') return pageAjustes();
  return pageVisao();
}
window.addEventListener('hashchange', () => { fecharGaveta(); fecharModal(); window.scrollTo({ top: 0 }); route(); });

// A cada 60 s: recarrega e redesenha, se ninguém estiver digitando nem com ficha/modal aberto.
async function atualizar() {
  if (!S.user || document.hidden) return;
  try { await recarregar(); } catch { return; }
  const ocupado = $('.gaveta') || $('.modal') || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (ocupado) menu(rota().r); else route();
}

// Clique em qualquer coisa com data-ficha abre a ficha lateral.
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-ficha]');
  if (el && !e.defaultPrevented) { e.preventDefault(); abrirFicha(el.dataset.ficha); }
});


// ---------------------------------------------------------------- paleta de comandos (⌘K / Ctrl+K)
function paleta() {
  if (!S.d || $('.pal')) return;
  const itens = [
    ...ROTAS.map(([id, nome, ic]) => ({ g: 'Ir para', t: nome, ic: ICONES[ic], ir: () => (location.hash = '#/' + id) })),
    { g: 'Ir para', t: 'Ajustes', ic: ICONES.engrenagem, ir: () => (location.hash = '#/ajustes') },
    { g: 'Criar', t: 'Novo criativo', ic: '+', ir: () => novoCriativo({}) },
    ...S.d.ofertas.map((o) => ({ g: 'Ofertas', t: o.nome, sub: `${o.id} · ${ESTADO_NOME[o.estado]}`, ic: ICONES.etiqueta, busca: o.id + ' ' + o.nome, ir: () => (location.hash = '#/ofertas/' + enc(o.id)) })),
    ...S.d.criativos.map((c) => ({ g: 'Criativos', t: c.id, sub: `${STATUS_NOME[c.status]}${c.hook ? ' · ' + c.hook.slice(0, 60) : ''}`, ic: ICONES.tabela, busca: `${c.id} ${c.hook || ''} ${c.angulo || ''}`, ir: () => abrirFicha(c.id) })),
  ];
  const box = document.createElement('div'); box.className = 'pal';
  box.innerHTML = `<div class="pal-box"><div class="pal-in"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="palq" placeholder="Digite um ID, hook, oferta ou tela…" autocomplete="off"><kbd>Esc</kbd></div><div class="pal-l" id="pall"></div><div class="pal-pe"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> abrir</span></div></div>`;
  document.body.appendChild(box);
  let sel = 0, vis = [];
  const desenha = () => {
    const q = norm($('#palq').value).trim();
    vis = (q ? itens.filter((x) => q.split(/\s+/).every((w) => norm(x.busca || x.t).includes(w))) : itens.filter((x) => x.g !== 'Criativos')).slice(0, 40);
    sel = Math.min(sel, Math.max(0, vis.length - 1));
    let g = '';
    $('#pall').innerHTML = vis.map((x, i) => `${x.g !== g ? `<div class="pal-g">${(g = x.g)}</div>` : ''}<button class="pal-i ${i === sel ? 'on' : ''}" data-i="${i}"><span class="pal-ic">${x.ic}</span><span class="pal-t">${esc(x.t)}${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</span></button>`).join('') || '<div class="pal-g" style="padding:18px">Nada encontrado.</div>';
    $('.pal-i.on', box)?.scrollIntoView({ block: 'nearest' });
    $$('.pal-i', box).forEach((b) => { b.onmousemove = () => { if (sel !== +b.dataset.i) { sel = +b.dataset.i; $$('.pal-i', box).forEach((x) => x.classList.toggle('on', x === b)); } }; b.onclick = () => abrir(+b.dataset.i); });
  };
  const fechar = () => box.remove();
  const abrir = (i) => { const x = vis[i]; if (!x) return; fechar(); x.ir(); };
  box.onclick = (e) => { if (e.target === box) fechar(); };
  $('#palq').oninput = () => { sel = 0; desenha(); };
  $('#palq').onkeydown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(vis.length - 1, sel + 1); desenha(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); desenha(); }
    else if (e.key === 'Enter') { e.preventDefault(); abrir(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(); }
  };
  desenha(); $('#palq').focus();
}
document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); paleta(); } });

// ---------------------------------------------------------------- 3. Visão geral
function pageVisao() {
  const p = S.d.painel, R = S.d.regras;
  const n = numeros();
  const todos = daOferta(S.d.criativos);
  const vs = p.vencedoresSemana, meta = p.metaVencedores || 5;
  const corV = vs >= meta ? 'verde' : vs >= 3 ? 'amar' : 'verm';
  const corR = !ok(n.roas) ? '' : n.roas >= 1.45 ? 'verde' : n.roas >= 1.3 ? 'amar' : 'verm';
  const per = S.f.periodo === '30' ? '30 dias' : '7 dias';
  const share = p.shareMaior;
  // receita da semana anterior: só existe para a janela de 7 dias
  const ant = S.f.periodo === '30' ? null : (S.f.oferta ? p.porOferta.find((o) => o.id === S.f.oferta)?.receitaSemanaAnterior : p.porOferta.reduce((a, o) => a + (o.receitaSemanaAnterior || 0), 0));
  const delta = ant ? Math.round(((n.receita - ant) / ant) * 100) : null;
  const top = [...p.porOferta].filter((o) => !S.f.oferta || o.id === S.f.oferta).sort((a, b) => b.receita7 - a.receita7).slice(0, 3);
  const medalha = ['1º', '2º', '3º'];
  const pend = pendencias();
  const hora = new Date().getHours();
  const saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const frase = !S.d.meta ? 'A Meta não está conectada, então gasto e ROAS ainda não aparecem.'
    : ok(n.roas) ? `Nos últimos ${per}, cada R$ 1 em anúncio voltou <b class="${corR}">R$ ${fmtRoas(n.roas)}</b>${ok(n.lucro) ? ` e sobrou <b class="${n.lucro >= 0 ? 'verde' : 'verm'}">${fmtR(n.lucro)}</b> de lucro estimado` : ''}.`
    : `Ainda não há gasto registrado nos últimos ${per}.`;
  $('#main').innerHTML = `
  <section class="hoje">
    <div class="hoje-txt">
      <div class="cap">${saud}, ${esc(S.user.nome.split(' ')[0])} · ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <p class="frase">${frase}</p>
      <p class="frase2">${vs >= meta ? `Meta de vencedores batida: <b class="verde">${vs} de ${meta}</b> nesta semana.` : `<b class="${corV}">${vs} de ${meta}</b> vencedores novos nesta semana${vs < meta ? ` — faltam ${meta - vs}` : ''}.`}</p>
    </div>
    <div class="pend card">
      <div class="cap">Precisa de você</div>
      ${pend.length ? pend.map((x) => `<a class="pi ${x.cor}" href="${x.href}"><span class="pn">${x.n}</span><span>${x.txt}</span><span class="seta">→</span></a>`).join('') : `<div class="pvazio">Nada pendente ✓<small>O Diretor de Copy roda a cada hora; o próximo veredito sai às 06:10.</small></div>`}
    </div>
  </section>
  <div class="filtros sticky">
    <div class="seg" id="per">${[['hoje', 'Hoje'], ['7', '7 dias'], ['30', '30 dias']].map(([v, t]) => `<button data-v="${v}" class="${S.f.periodo === v ? 'on' : ''}">${t}</button>`).join('')}</div>
    <select id="f_of">${opts(S.d.ofertas.map((o) => [o.id, o.nome]), S.f.oferta, 'Todas as ofertas')}</select>
    ${S.f.periodo === 'hoje' ? '<span class="fraco" style="font-size:12.5px">"Hoje" mostra 7 dias; o dia a dia de cada criativo aparece na ficha.</span>' : ''}
  </div>
  <div class="g4">
    <div class="card big"><div class="cap">Receita rastreada${info('Lastlink, vendas aprovadas sem reembolso, ligadas a um criativo · ' + per)}</div>
      <div class="v" data-conta="${n.receita}" data-fmt="r">${fmtR(n.receita)}</div>
      <div class="sub">${delta !== null ? `<span class="delta ${delta >= 0 ? 'verde' : 'verm'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}%</span> vs semana anterior` : 'Lastlink · vendas ligadas a criativo'}</div></div>
    <div class="card big"><div class="cap">Gasto em anúncios${info('Meta Ads, contas ativas · ' + per)}</div>
      <div class="v" ${S.d.meta ? `data-conta="${n.gasto}" data-fmt="r"` : ''}>${S.d.meta ? fmtR(n.gasto) : '—'}</div><div class="sub">Meta Ads · contas ativas</div></div>
    <div class="card big"><div class="cap">ROAS${info('Receita rastreada ÷ gasto. Lucro ≈ receita × ' + LIQUIDO + ' − gasto (taxa da Lastlink)')}</div>
      <div class="v ${corR}">${fmtRoas(n.roas)}</div><div class="sub">lucro ≈ <span class="${ok(n.lucro) ? (n.lucro >= 0 ? 'verde' : 'verm') : ''}">${fmtR(n.lucro)}</span></div></div>
    <div class="card big"><div class="cap">Vencedores novos${info('Viraram vencedor nos últimos 7 dias (regra: ' + R.vencedorVendas + '+ vendas com ROAS ≥ ' + fmtRoas(R.roasSegue) + ')')}</div>
      <div class="v ${corV}">${vs}<small> / ${meta}</small></div>
      <div class="barra"><i style="width:${Math.min(100, (vs / meta) * 100)}%;background:var(--${corV})"></i></div></div>
  </div>
  <div class="card regua">
    <div><div class="cap">No ar${info('Rodando com gasto nos últimos 7 dias')}</div><div class="v">${noAr(todos).length}</div></div>
    <a href="#/aprovar"><div class="cap">Em revisão</div><div class="v">${todos.filter((c) => c.status === 'revisao').length}</div></a>
    <a href="#/board"><div class="cap">Pra produzir</div><div class="v">${todos.filter((c) => c.status === 'aprovado').length}</div></a>
    <div><div class="cap">Mortos na semana</div><div class="v">${mortosSemana(todos).length}</div></div>
    <div><div class="cap">Maior oferta${info('Fatia da receita de 7 dias que vem da maior oferta. Acima de 55% = operação dependente de uma oferta só.')}</div><div class="v ${share && share.pct > 55 ? 'verm' : ''}">${share ? share.pct + '%' : '—'}</div><div class="fraco" style="font-size:12px">${share ? esc(oferta(share.oferta)?.nome || share.oferta) : ''}</div></div>
  </div>
  <div class="secao"><h2>${S.f.oferta ? 'A oferta' : 'Ofertas que mais vendem'}</h2><span class="fraco" style="font-size:12.5px">receita de 7 dias</span><span class="grow"></span><a href="#/ofertas" class="lk">Todas as ofertas →</a></div>
  <div class="top3">${top.map((o, i) => {
    const cs = S.d.criativos.filter((c) => c.ofertaId === o.id);
    const g = soma(cs, 'gasto', 'd7'), roas = g > 0 ? o.receita7 / g : null;
    const varr = o.receitaSemanaAnterior ? Math.round(((o.receita7 - o.receitaSemanaAnterior) / o.receitaSemanaAnterior) * 100) : null;
    return `<div class="card of3"><div class="of3-top"><span class="pos">${medalha[i]}</span><h3>${esc(o.nome)}</h3>${chipEst(o.estado)}</div>
      <div class="of3-v num">${fmtR(o.receita7)}${varr !== null ? ` <span class="delta ${varr >= 0 ? 'verde' : 'verm'}">${varr >= 0 ? '▲' : '▼'} ${Math.abs(varr)}%</span>` : ''}</div>
      <div class="mini">
        <div><div class="cap">Gasto</div><div class="v">${fmtR(g)}</div></div>
        <div><div class="cap">ROAS</div><div class="v ${g < 50 ? 'fraco' : roasCls(roas)}" ${g < 50 && ok(roas) ? 'title="Gasto de menos de R$ 50: ROAS ainda não diz nada"' : ''}>${g < 50 && ok(roas) ? '—' : fmtRoas(roas)}</div></div>
        <div><div class="cap">Vencedores</div><div class="v">${o.vencedores}</div></div>
      </div>
      <div class="row"><a class="btn ghost sm" href="#/board?oferta=${enc(o.id)}">Ver no board</a><a class="btn ghost sm" href="#/ofertas/${enc(o.id)}">${o.proximaLeva ? `Próxima leva · ${fmtData(o.proximaLeva.data).slice(0, 5)}` : 'Planejar leva'}</a></div></div>`;
  }).join('') || '<div class="card fraco">Nenhuma oferta com receita ainda.</div>'}</div>
  <div class="duo">
    <div class="card"><header><h2>Evolução</h2><span class="fraco" style="font-size:12.5px">30 dias</span><span class="grow"></span><div class="legenda"><span><i style="background:var(--verde)"></i>Receita</span><span><i style="background:var(--fraco)"></i>Gasto</span><span><i style="background:#2EE59D55;height:8px"></i>Lucro</span></div></header>
      <div id="evo"><button class="evo-vazio" id="verEvo">${graficoFantasma()}<span class="btn ghost">Carregar evolução</span></button></div></div>
    <div class="card"><header><h2>O que o motor decidiu</h2><span class="grow"></span><span class="fraco" style="font-size:12px">vereditos e hipóteses</span></header><div class="feed" id="feed">${'<div class="sk"></div>'.repeat(4)}</div></div>
  </div>`;
  $$('#per button').forEach((b) => b.onclick = () => { S.f.periodo = b.dataset.v; pageVisao(); });
  $('#f_of').onchange = (e) => { S.f.oferta = e.target.value; pageVisao(); };
  $('#verEvo').onclick = desenharEvolucao;
  if (S.evolucao[S.f.oferta || '*'] && Date.now() - S.evolucao[S.f.oferta || '*'].em < 600_000) desenharEvolucao();
  contarNumeros();
  carregarFeed();
}
// O que pede ação do usuário agora, em ordem de urgência. Tudo derivado do bootstrap.
function pendencias() {
  const cs = S.d.criativos, p = S.d.painel, R = S.d.regras;
  const n = (s) => cs.filter((c) => c.status === s).length;
  const semLeva = p.porOferta.filter((o) => ['escalando', 'validacao', 'em_risco'].includes(o.estado) && !o.proximaLeva);
  const l = [];
  if (n('revisao')) l.push({ n: n('revisao'), txt: n('revisao') === 1 ? 'criativo esperando sua aprovação' : 'criativos esperando sua aprovação', href: '#/aprovar', cor: 'azul' });
  if (n('meio')) l.push({ n: n('meio'), txt: 'no meio do caminho: pedem 1 variação', href: '#/aprovar', cor: 'amar' });
  const risco = p.porOferta.filter((o) => o.estado === 'em_risco');
  if (risco.length) l.push({ n: risco.length, txt: `${risco.length === 1 ? 'oferta' : 'ofertas'} em risco (sem vencedor há ${R.diasRisco}+ dias)`, href: '#/ofertas', cor: 'verm' });
  if (n('aprovado')) l.push({ n: n('aprovado'), txt: 'aprovados esperando produção', href: '#/board', cor: '' });
  if (n('fadiga')) l.push({ n: n('fadiga'), txt: 'vencedores cansando (fadiga)', href: '#/board', cor: 'amar' });
  if (semLeva.length) l.push({ n: semLeva.length, txt: `${semLeva.length === 1 ? 'oferta ativa' : 'ofertas ativas'} sem próxima leva`, href: '#/ofertas', cor: '' });
  return l;
}
// Números grandes sobem de 0 até o valor, só na primeira vez que a tela abre.
function contarNumeros() {
  if (S.contou) return; S.contou = true;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  $$('[data-conta]').forEach((el) => {
    const fim = Number(el.dataset.conta); if (!Number.isFinite(fim) || fim === 0) return;
    const t0 = performance.now(), dur = 700;
    const passo = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmtR(fim * e); if (k < 1) requestAnimationFrame(passo); };
    requestAnimationFrame(passo);
  });
}
function graficoFantasma() {
  const pts = Array.from({ length: 30 }, (_, i) => 120 - Math.sin(i / 3) * 30 - i * 1.5);
  return `<svg class="chart" viewBox="0 0 760 240" preserveAspectRatio="none"><path d="${pts.map((y, i) => `${i ? 'L' : 'M'}${(i / 29) * 760},${y}`).join('')}" fill="none" stroke="#242A33" stroke-width="3"/><path d="${pts.map((y, i) => `${i ? 'L' : 'M'}${(i / 29) * 760},${y + 50}`).join('')}" fill="none" stroke="#1D2229" stroke-width="3"/></svg>`;
}
async function carregarFeed() {
  try {
    if (!S.feed || Date.now() - S.feed.em > 60_000) S.feed = { em: Date.now(), rows: await api('/api/cr/aprendizados') };
    const rows = S.feed.rows.filter((a) => ['veredito', 'analista'].includes(a.autor)).filter((a) => !S.f.oferta || a.oferta_id === S.f.oferta).slice(0, 12);
    const ic = { veredito: '<span class="fi v">✓</span>', hipotese: '<span class="fi h">?</span>', nota: '<span class="fi">•</span>', dissecacao: '<span class="fi">≡</span>' };
    const el = $('#feed'); if (!el) return;
    el.innerHTML = rows.map((a) => `<div><span class="ic">${ic[a.tipo] || '•'}</span><span>${esc(String(a.texto).slice(0, 180))}${String(a.texto).length > 180 ? '…' : ''}
      <small>${esc(a.oferta_id || '')}${a.criativo_id ? ` · <a href="#" data-ficha="${esc(a.criativo_id)}">${esc(a.criativo_id)}</a>` : ''} · ${fmtDH(a.criado_em)}</small></span></div>`).join('') || '<div class="pvazio">Nenhum veredito ainda.<small>O motor decide às 06:10, 72 h depois de cada criativo entrar no ar.</small></div>';
  } catch (e) { const el = $('#feed'); if (el) el.innerHTML = `<div class="fraco">${esc(e.message)}</div>`; }
}
async function desenharEvolucao() {
  const k = S.f.oferta || '*';
  const el = $('#evo'); if (!el) return;
  let cache = S.evolucao[k];
  if (!cache || Date.now() - cache.em > 600_000) {
    const cs = daOferta(S.d.criativos).filter((c) => (c.d30?.gasto || 0) > 0).sort((a, b) => b.d30.gasto - a.d30.gasto).slice(0, 40);
    if (!cs.length) { el.innerHTML = '<div class="vazio">Sem gasto nos últimos 30 dias.</div>'; return; }
    el.innerHTML = `<div class="carregando">somando ${cs.length} criativos…</div>`;
    const series = await Promise.all(cs.map((c) => api(`/api/cr/criativos/${enc(c.id)}/serie`).catch(() => [])));
    const ini = new Date(); ini.setDate(ini.getDate() - 29);
    const diasL = Array.from({ length: 30 }, (_, i) => { const d = new Date(ini); d.setDate(ini.getDate() + i); return d.toLocaleDateString('en-CA'); });
    const por = Object.fromEntries(diasL.map((d) => [d, { receita: 0, gasto: 0 }]));
    for (const s of series) for (const r of s) if (por[r.dia]) { por[r.dia].receita += Number(r.receita) || 0; por[r.dia].gasto += Number(r.gasto) || 0; }
    cache = S.evolucao[k] = { em: Date.now(), n: cs.length, pts: diasL.map((d) => ({ dia: d, ...por[d], lucro: por[d].receita * LIQUIDO - por[d].gasto })) };
  }
  if (!$('#evo')) return;
  $('#evo').innerHTML = graficoLinhas(cache.pts) + `<div class="fraco" style="font-size:11.5px;margin-top:6px">Soma dos ${cache.n} criativos com mais gasto em 30 dias · Meta Ads + Lastlink · atualiza a cada 10 min</div>`;
}
function graficoLinhas(pts) {
  const W = 760, H = 240, pl = 54, pr = 10, pt = 10, pb = 26;
  const vals = pts.flatMap((p) => [p.receita, p.gasto, p.lucro]);
  const max = Math.max(1, ...vals), min = Math.min(0, ...vals);
  const x = (i) => pl + (i / (pts.length - 1)) * (W - pl - pr);
  const y = (v) => pt + (1 - (v - min) / (max - min)) * (H - pt - pb);
  const linha = (k) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join('');
  const area = `${linha('lucro')}L${x(pts.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + t * (max - min));
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    ${ticks.map((t) => `<line x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}" stroke="#242A33"/><text x="${pl - 6}" y="${y(t) + 4}" fill="#8B95A3" font-size="10" text-anchor="end">${Math.round(t / 1000) ? (t / 1000).toFixed(1) + 'k' : Math.round(t)}</text>`).join('')}
    <path d="${area}" fill="#2EE59D22"/>
    <path d="${linha('gasto')}" fill="none" stroke="#8B95A3" stroke-width="1.6"/>
    <path d="${linha('receita')}" fill="none" stroke="#2EE59D" stroke-width="2.2"/>
    ${pts.map((p, i) => (i % 5 === 0 || i === pts.length - 1 ? `<text x="${x(i)}" y="${H - 8}" fill="#8B95A3" font-size="10" text-anchor="middle">${p.dia.slice(8, 10)}/${p.dia.slice(5, 7)}</text>` : '')).join('')}
    ${pts.map((p, i) => `<rect x="${x(i) - 6}" y="${pt}" width="12" height="${H - pt - pb}" fill="transparent"><title>${fmtData(p.dia)} · receita ${fmtR(p.receita)} · gasto ${fmtR(p.gasto)} · lucro ${fmtR(p.lucro)}</title></rect>`).join('')}
  </svg>`;
}

// ---------------------------------------------------------------- 4. Aprovar (lote + rastreio)
const VARIAVEIS = { hook_visual: 'Hook visual', hook_falado: 'Hook falado', body: 'Body', formato: 'Formato', angulo: 'Ângulo', avatar: 'Avatar', mecanismo: 'Mecanismo', oferta: 'Oferta', execucao: 'Execução' };
const chipVar = (v) => (v ? `<span class="chip v-${esc(v)}">${esc(VARIAVEIS[v] || v)}</span>` : '');
S.lote = { pai: '', variavel: '', min: 6 };
// Cards em revisão que batem os filtros da barra de lote, agrupados por pai (pai com melhor ROAS 7d primeiro).
function filaAprovar() {
  const L = S.lote;
  const cs = S.d.criativos.filter((c) => c.status === 'revisao' && (!L.pai || (c.paiId || '') === L.pai) && (!L.variavel || c.variavel === L.variavel) && (c.score ?? 0) >= L.min);
  const grupos = new Map();
  for (const c of cs) { const k = c.paiId || ''; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(c); }
  const lista = [...grupos.entries()].map(([pai, filhos]) => ({ pai, p: pai ? criativo(pai) : null, filhos: filhos.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || String(a.variavel).localeCompare(String(b.variavel))) }))
    .sort((a, b) => (b.p?.d7?.roas ?? -1) - (a.p?.d7?.roas ?? -1) || b.filhos.length - a.filhos.length);
  return { grupos: lista, plano: lista.flatMap((g) => g.filhos) };
}
const emRevisao = () => filaAprovar().plano;
function pageAprovar() {
  const todos = S.d.criativos.filter((c) => c.status === 'revisao');
  const L = S.lote;
  const pais = [...new Set(todos.map((c) => c.paiId || ''))].map((id) => ({ id, p: id ? criativo(id) : null, n: todos.filter((c) => (c.paiId || '') === id).length })).sort((a, b) => b.n - a.n);
  const vars = [...new Set(todos.map((c) => c.variavel).filter(Boolean))];
  const { grupos, plano } = filaAprovar();
  const variar = S.d.criativos.filter((c) => c.status === 'meio');
  if (!plano.find((c) => c.id === S.aprovSel)) S.aprovSel = plano[0]?.id || null;
  const fechados = S.aprovFechados || (S.aprovFechados = new Set());
  $('#main').innerHTML = `
  <div class="card lote">
    <div class="lote-t"><div class="cap">Aprovar em lote</div><div class="fraco" style="font-size:12.5px">Filtre por pai, variável e nota. A lista abaixo mostra exatamente o que o botão aprova.</div></div>
    <label class="f"><span>Pai</span><select id="lt_pai"><option value="">Todos os pais · ${todos.length} cards</option>${pais.map((x) => `<option value="${esc(x.id)}" ${x.id === L.pai ? 'selected' : ''}>${esc(x.id || 'Sem pai')} · ${x.n} cards${x.p ? ` · ROAS 7d ${fmtRoas(x.p.d7.roas)} · ${fmtI(x.p.d7.vendas)} vendas` : ''}</option>`).join('')}</select></label>
    <label class="f"><span>Variável</span><select id="lt_var"><option value="">Todas</option>${vars.map((v) => `<option value="${esc(v)}" ${v === L.variavel ? 'selected' : ''}>${esc(VARIAVEIS[v] || v)} · ${todos.filter((c) => c.variavel === v && (!L.pai || (c.paiId || '') === L.pai)).length}</option>`).join('')}</select></label>
    <label class="f" style="width:110px"><span>Nota mínima</span><div class="stepper"><button data-st="-1">−</button><b id="lt_min">${L.min}</b><button data-st="1">+</button></div></label>
    <button class="btn ok big-ok" id="lt_ok" ${plano.length && admin() ? '' : 'disabled'} ${admin() ? '' : 'title="Só o gestor aprova"'}>Aprovar ${plano.length === 1 ? 'este' : 'estes'} ${plano.length}</button>
  </div>
  <div class="aprovar">
    <div>
      <div class="card lista">${grupos.map((g) => {
        const aberto = !fechados.has(g.pai);
        return `<div class="grp">
          <button class="grp-h" data-grp="${esc(g.pai)}"><span class="seta2 ${aberto ? 'on' : ''}">▸</span>
            <span class="grp-t"><b>${esc(g.pai || 'Sem pai (do zero)')}</b>${g.p ? `<small>ROAS 7d <b class="${roasCls(g.p.d7.roas)}">${fmtRoas(g.p.d7.roas)}</b> · ${fmtI(g.p.d7.vendas)} vendas${g.p.hook ? ` · “${esc(g.p.hook.slice(0, 60))}${g.p.hook.length > 60 ? '…' : ''}”` : ''}</small>` : ''}</span>
            <span class="grp-n">${g.filhos.length}</span></button>
          ${aberto ? g.filhos.map((c) => `<button class="item ${c.id === S.aprovSel ? 'on' : ''}" data-sel="${esc(c.id)}">
            <div class="id"><span>${esc(c.id)}</span>${ok(c.score) ? `<span class="nota ${notaCls(c.score)}">${fmtN(c.score, c.score % 1 ? 1 : 0)}</span>` : ''}</div>
            <div class="m">${chipVar(c.variavel)}${c.formato ? `<span class="chip f">${esc(c.formato)}</span>` : ''}${c.hook ? `<span class="hk1">${esc(c.hook)}</span>` : ''}</div></button>`).join('') : ''}
        </div>`;
      }).join('') || `<div class="vazio" style="padding:30px 10px"><b>${todos.length ? 'Nenhum card com esses filtros.' : 'Nada pra aprovar.'}</b>${todos.length ? 'Baixe a nota mínima ou limpe os filtros.' : 'O Diretor de Copy roda a cada hora; a próxima leva nasce às 06:10.'}</div>`}</div>
      <details class="dobra card"><summary>Pede variação <span class="badge amar" style="display:inline-grid;margin-left:6px">${variar.length}</span></summary>
        ${variar.map((c) => `<div class="item" style="cursor:default"><div class="id"><a href="#" data-ficha="${esc(c.id)}" style="color:inherit">${esc(c.id)}</a><span class="${roasCls(c.d7.roas)} num" style="font-size:12px">ROAS 7d ${fmtRoas(c.d7.roas)}</span></div>
          <div class="row" style="margin-top:8px"><button class="btn sm" data-variar="${esc(c.id)}">Criar variação</button><button class="btn ghost sm" data-matar="${esc(c.id)}">Matar</button></div></div>`).join('') || '<div class="fraco" style="padding:6px">Nenhum criativo pedindo variação.</div>'}
      </details>
    </div>
    <div class="card det" id="det">${plano.length ? '' : '<div class="vazio"><b>Fila limpa ✓</b>Quando o Revisor terminar uma rodada, os cards aparecem aqui.</div>'}</div>
  </div>`;
  const re = () => pageAprovar();
  $('#lt_pai').onchange = (e) => { L.pai = e.target.value; L.variavel = ''; re(); };
  $('#lt_var').onchange = (e) => { L.variavel = e.target.value; re(); };
  $$('[data-st]', $('.stepper')).forEach((b) => b.onclick = () => { L.min = Math.max(0, Math.min(10, L.min + Number(b.dataset.st))); re(); });
  $('#lt_ok').onclick = aprovarLote;
  $$('[data-grp]').forEach((b) => b.onclick = () => { const k = b.dataset.grp; fechados.has(k) ? fechados.delete(k) : fechados.add(k); re(); });
  $$('[data-sel]').forEach((b) => b.onclick = () => { S.aprovSel = b.dataset.sel; $$('[data-sel]').forEach((x) => x.classList.toggle('on', x === b)); detalheAprovar(); });
  $$('[data-variar]').forEach((b) => b.onclick = () => { const c = criativo(b.dataset.variar); const leva = S.d.levas.filter((l) => l.ofertaId === c.ofertaId && l.status === 'planejada').sort((a, b2) => String(a.planejada).localeCompare(String(b2.planejada)))[0]; novoCriativo({ ofertaId: c.ofertaId, tipo: 'variacao', paiId: c.id, levaId: leva?.id || '', formato: c.formato, angulo: c.angulo }); });
  $$('[data-matar]').forEach((b) => b.onclick = () => mover(b.dataset.matar, 'morto'));
  if (S.aprovSel) detalheAprovar();
}
async function aprovarLote() {
  const L = S.lote, { plano } = filaAprovar(); if (!plano.length) return;
  const desc = [L.pai ? `filhos de <b>${esc(L.pai)}</b>` : 'de todos os pais', L.variavel ? `que testam <b>${esc(VARIAVEIS[L.variavel] || L.variavel)}</b>` : '', `com nota ≥ ${L.min}`].filter(Boolean).join(', ');
  const m = modal(`<h2>Aprovar ${plano.length} ${plano.length === 1 ? 'card' : 'cards'}?</h2>
    <p style="margin:0 0 12px">Cards ${desc}. Eles saem da revisão e o Diretor de Criação começa a montar os projetos de edição (1–2 min cada).</p>
    <div class="lote-ids">${plano.slice(0, 40).map((c) => `<span class="chip">${esc(c.id)}</span>`).join('')}${plano.length > 40 ? `<span class="fraco">+${plano.length - 40}</span>` : ''}</div>
    <div class="row" style="margin-top:16px"><span class="grow"></span><button class="btn ghost" data-fecha>Cancelar</button><button class="btn ok" id="lt_conf">Aprovar ${plano.length}</button></div>`);
  $('#lt_conf', m).onclick = async () => {
    $('#lt_conf').disabled = true; $('#lt_conf').textContent = 'Aprovando…';
    const body = { minScore: L.min, ...(L.pai ? { paiId: L.pai } : {}), ...(L.variavel ? { variavel: L.variavel } : {}), ids: plano.map((c) => c.id) };
    const r = await acao(() => api('/api/cr/criativos/aprovar-lote', { method: 'POST', body }));
    fecharModal();
    if (r) { toast(`${r.aprovados} aprovados ✓ — o Diretor de Criação já começou.`); await recarregar(); route(); }
  };
}
function linhaRastreio(c) {
  const p = c.paiId ? criativo(c.paiId) : null;
  const partes = [];
  if (c.paiId) partes.push(`modela <a href="#" data-ficha="${esc(c.paiId)}"><b>${esc(c.paiId)}</b></a>${p ? ` <span class="fraco">(ROAS 7d <b class="${roasCls(p.d7.roas)}">${fmtRoas(p.d7.roas)}</b>, ${fmtI(p.d7.vendas)} vendas)</span>` : ''}`);
  else partes.push('<b>do zero</b> <span class="fraco">(sem pai)</span>');
  if (c.variavel) partes.push(`testa ${chipVar(c.variavel)}`);
  if (c.hipotese) partes.push(`hipótese: <span class="hip">${esc(c.hipotese)}</span>`);
  return `<div class="rastreio"><div class="r1">${partes.join('<span class="sep">·</span>')}</div>${c.muda ? `<div class="r2">${esc(c.muda)}</div>` : ''}${c.levaId ? `<a class="r3" href="#/levas/${enc(c.levaId)}">ver a leva inteira (${esc(c.levaId)}) →</a>` : ''}</div>`;
}
function notaRevisor(c) {
  const h = [...(c.historico || [])].reverse().find((x) => x.por === 'revisor' && x.nota);
  if (!h) return ok(c.score) ? { n: c.score } : null;
  const t = String(h.nota).replace(/^Revisor:\s*/i, '');
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*\/\s*10/);
  const resto = t.replace(/^.*?\/\s*10\s*[—-]?\s*/, '');
  const [motivos, ajustes] = resto.split(/\s*·\s*ajustes:\s*/i);
  return { n: m ? Number(m[1].replace(',', '.')) : c.score, motivos, ajustes, em: h.em };
}
function detalheAprovar() {
  const c = criativo(S.aprovSel); const el = $('#det'); if (!c || !el) return;
  const rv = notaRevisor(c);
  const bloco = (t, v, cls = '') => `<div class="bloco"><div class="cap">${t}</div><div class="txt ${cls}">${v ? esc(v) : '<span class="fraco">—</span>'}</div></div>`;
  el.innerHTML = `
    ${linhaRastreio(c)}
    <div class="cab"><input class="ided" id="ap_id" value="${esc(c.id)}" title="Nome do anúncio no Meta — edite e tecle Enter para renomear"></div>
    <div class="meta"><span class="chip">${esc(oferta(c.ofertaId)?.nome || c.ofertaId)}</span>${chipTipo(c.tipo)}${c.formato ? `<span class="chip f">${esc(c.formato)}</span>` : ''}<a href="#" data-ficha="${esc(c.id)}" style="margin-left:auto;font-size:12.5px">Ficha completa</a></div>
    ${rv ? `<div class="revisor"><div class="n ${rv.n >= 8 ? 'verde' : rv.n >= 6 ? 'amar' : 'verm'}">${fmtN(rv.n, rv.n % 1 ? 1 : 0)}<small>/10</small></div><div><div class="cap">Nota do Revisor</div>${rv.motivos ? `<div style="margin-top:4px">${esc(rv.motivos)}</div>` : ''}${rv.ajustes ? `<div class="fraco" style="margin-top:6px;font-size:13px"><b style="color:var(--amar)">Ajustes:</b> ${esc(rv.ajustes)}</div>` : ''}</div></div>` : ''}
    ${bloco('Hook', c.hook, 'hook')}
    <div class="f2">${bloco('Ângulo', c.angulo)}${bloco('Mecanismo', c.mecanismo)}</div>
    ${bloco('Body (estrutura)', c.body)}${bloco('Copy completa', c.copy, 'copy')}
    ${c.basePesquisa || (c.fichas || []).length ? `<div class="bloco"><div class="cap">Base na pesquisa</div>${c.basePesquisa ? `<div class="base">${esc(c.basePesquisa)}</div>` : ''}${(c.fichas || []).length ? `<div class="row" style="margin-top:8px"><span class="fraco" style="font-size:12px">Fichas lidas:</span>${c.fichas.map((f) => `<button class="chip ficha" data-lerficha="${esc(f)}">${esc(f)}</button>`).join('')}</div>` : ''}</div>` : ''}
    <div class="f2"><label class="f"><span>Arquivo (Drive)</span><input type="url" id="ap_arq" value="${esc(c.arquivoUrl || '')}" placeholder="https://drive.google.com/…"></label>
      <label class="f"><span>Nota <em>(vai no histórico)</em></span><input type="text" id="ap_nota" placeholder="opcional ao aprovar, obrigatória ao devolver"></label></div>
    <div class="rodape">
      <button class="btn ok" id="ap_ok" ${admin() ? '' : 'disabled title="Só o gestor aprova"'}>Aprovar <kbd>A</kbd></button>
      <button class="btn danger" id="ap_dev">Devolver <kbd>D</kbd></button><span class="grow"></span><span class="fraco" style="font-size:12px"><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
    </div>`;
  el.scrollTop = 0;
  $$('[data-lerficha]', el).forEach((b) => b.onclick = () => lerFicha(b.dataset.lerficha));
  $('#ap_id').onkeydown = async (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } if (e.key === 'Escape') { e.target.value = c.id; e.target.blur(); } };
  $('#ap_id').onchange = async (e) => {
    const novo = e.target.value.trim(); if (!novo || novo === c.id) return;
    const r = await acao(() => api(`/api/cr/criativos/${enc(c.id)}`, { method: 'PATCH', body: { novoId: novo } }), `Renomeado para ${novo}.`);
    if (r !== undefined) { S.aprovSel = novo; await recarregar(); route(); } else e.target.value = c.id;
  };
  $('#ap_ok').onclick = () => decidir('aprovado');
  $('#ap_dev').onclick = () => decidir('briefing');
}
// Leitura de uma ficha da biblioteca em modal (markdown simples).
async function lerFicha(id) {
  const m = modal(`<h2>${esc(id)}</h2><div class="md fraco">carregando…</div><div class="row" style="margin-top:14px"><span class="grow"></span><button class="btn ghost" data-fecha>Fechar</button></div>`);
  m.querySelector('.box').classList.add('larga');
  try {
    const f = await api(`/api/cr/biblioteca/${enc(id)}`);
    const md = $('.md', m); if (!md) return;
    $('h2', m).innerHTML = `${esc(f.titulo || id)} ${f.peso === 'essencial' ? '<span class="chip vencedor">essencial</span>' : ''}`;
    md.className = 'md'; md.innerHTML = `${f.fonte ? `<div class="fraco" style="font-size:12.5px;margin-bottom:10px">${esc(f.fonte)}${f.consulte_quando ? ' · consulte quando: ' + esc(f.consulte_quando) : ''}</div>` : ''}${markdown(f.texto || '')}`;
  } catch (e) { const md = $('.md', m); if (md) md.textContent = e.message; }
}
function markdown(t) {
  const inl = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<i>$2</i>').replace(/`(.+?)`/g, '<code>$1</code>');
  const out = []; let lista = null;
  for (const l of String(t).split('\n')) {
    const h = l.match(/^(#{1,4})\s+(.*)/), li = l.match(/^\s*(?:[-*]|\d+[.)])\s+(.*)/);
    if (li) { if (!lista) { lista = []; } lista.push(`<li>${inl(li[1])}</li>`); continue; }
    if (lista) { out.push(`<ul>${lista.join('')}</ul>`); lista = null; }
    if (h) out.push(`<h${h[1].length + 2}>${inl(h[2])}</h${h[1].length + 2}>`);
    else if (/^\s*>/.test(l)) out.push(`<blockquote>${inl(l.replace(/^\s*>\s?/, ''))}</blockquote>`);
    else if (/^\s*(---|\*\*\*)\s*$/.test(l)) out.push('<hr>');
    else if (l.trim()) out.push(`<p>${inl(l)}</p>`);
  }
  if (lista) out.push(`<ul>${lista.join('')}</ul>`);
  return out.join('');
}
async function decidir(para) {
  const c = criativo(S.aprovSel); if (!c) return;
  if (para === 'aprovado' && !admin()) return toast('Só o gestor aprova.', true);
  let nota = $('#ap_nota')?.value.trim() || '';
  if (para === 'briefing' && !nota) { nota = await pedirNota(`Devolver ${c.id}`, 'O que precisa mudar? (o redator lê isto)'); if (nota === null) return; }
  const arq = $('#ap_arq')?.value.trim() || '';
  const lista = emRevisao(); const i = lista.findIndex((x) => x.id === c.id);
  const prox = lista[i + 1]?.id || lista[i - 1]?.id || null;
  try {
    if (arq !== (c.arquivoUrl || '')) await api(`/api/cr/criativos/${enc(c.id)}`, { method: 'PATCH', body: { arquivoUrl: arq } });
    await api(`/api/cr/criativos/${enc(c.id)}/status`, { method: 'POST', body: { para, nota } });
    toast(para === 'aprovado' ? `${c.id} aprovado ✓` : `${c.id} devolvido para briefing`);
    S.aprovSel = prox; await recarregar(); route();
  } catch (e) { toast(e.message, true); }
}
document.addEventListener('keydown', (e) => {
  if (rota().r !== 'aprovar' || !S.d || $('.modal') || $('.gaveta')) return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'a') { e.preventDefault(); decidir('aprovado'); }
  else if (k === 'd') { e.preventDefault(); decidir('briefing'); }
  else if (k === 'arrowdown' || k === 'arrowup') {
    e.preventDefault(); const l = emRevisao(); const i = l.findIndex((x) => x.id === S.aprovSel);
    const n = l[Math.max(0, Math.min(l.length - 1, i + (k === 'arrowdown' ? 1 : -1)))]; if (n) { S.aprovSel = n.id; pageAprovar(); $('.item.on')?.scrollIntoView({ block: 'nearest' }); }
  }
});

// ---------------------------------------------------------------- 4b. Leva — "Por que esta leva?"
async function pageLeva(id) {
  $('#main').innerHTML = `<div class="sk" style="height:90px"></div>${'<div class="sk" style="height:140px"></div>'.repeat(3)}`;
  let p;
  try { p = await api(`/api/cr/levas/${enc(id)}/porque`); } catch (e) { $('#main').innerHTML = `<div class="vazio"><b>Não consegui abrir a leva ${esc(id)}.</b>${esc(e.message)}</div>`; return; }
  if (rota().r !== 'levas') return;
  S.levaAtual = p;
  const L = p.leva, O = p.oferta;
  // hipóteses antigas vêm só com texto: "… [modelagem · pai: X]"
  const hips = (p.hipoteses || []).map((h) => {
    const m = String(h.porque || '').match(/\[([a-z]+)(?:\s*·\s*pai:\s*([^\]]+))?\]\s*$/i);
    return { ...h, tipo: h.tipo || m?.[1] || null, pai: h.pai || m?.[2]?.trim() || null, porque: m ? h.porque.replace(m[0], '').trim() : h.porque };
  });
  const tabela = (rows, cansando) => rows.length ? `<table class="tb tl"><thead><tr><th>Criativo</th><th class="n">ROAS 7d</th><th class="n">Vendas 7d</th><th class="n">ROAS total</th><th>Hook</th></tr></thead><tbody>${rows.map((c) => `<tr data-ficha="${esc(c.id)}">
      <td><b>${esc(c.id)}</b>${c.temCopy ? '' : ` <button class="chip morto semcopy" data-semcopy="${esc(c.id)}" title="Cole a transcrição na ficha: a dissecação roda sozinha">sem copy</button>`}</td>
      <td class="n"><b class="${cansando ? 'verm' : roasCls(c.roas7)}">${fmtRoas(c.roas7)}</b></td><td class="n">${fmtI(c.vendas7)}</td><td class="n">${fmtRoas(c.roas)}</td>
      <td class="hk">${esc(c.hook || '—')}</td></tr>`).join('')}</tbody></table>` : '';
  const passo = (n, t, sub, corpo, vazio) => `<section class="passo"><div class="pn2">${n}</div><div class="pc"><h2>${t}${sub ? ` <span class="fraco">${sub}</span>` : ''}</h2>${corpo || `<div class="fraco pv">${vazio}</div>`}</div></section>`;
  const grupos = new Map();
  for (const c of [...(p.cards || [])].sort((a, b) => a.id.localeCompare(b.id, 'pt', { numeric: true }))) { const k = c.hipotese || ''; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(c); }
  const ordemH = [...hips.map((h) => h.titulo), ...[...grupos.keys()].filter((k) => !hips.some((h) => h.titulo === k))];
  const nRev = (p.cards || []).filter((c) => c.status === 'revisao').length;
  $('#main').innerHTML = `
  <div class="leva-h card">
    <div><div class="cap"><a href="#/ofertas/${enc(O.id)}">${esc(O.nome)}</a> · leva ${esc(L.numero ?? '')}</div>
      <h2 class="lh">${esc(L.id)} ${chipEst(O.estado)} <span class="chip">${esc(LEVA_NOME[L.status] || L.status)}</span></h2>
      ${L.hipotese ? `<div class="fraco" style="margin-top:6px">${esc(L.hipotese)}</div>` : ''}</div>
    <div class="leva-n">
      <div><b>${(p.cards || []).length}</b><span>cards</span></div>
      <div><b class="${nRev ? 'azul' : ''}">${nRev}</b><span>pra aprovar</span></div>
      <div><b>${fmtData(L.planejada)}</b><span>planejada</span></div>
    </div>
  </div>
  ${passo(1, 'O que deu bom', `${p.vencedores.length} vencedores da oferta`, tabela(p.vencedores), 'Nenhum vencedor vivo nesta oferta ainda.')}
  ${passo(2, 'O que está cansando', p.fadiga.length ? `${p.fadiga.length} em fadiga ou pedindo variação` : '', tabela(p.fadiga, true), 'Nada cansando com gasto nos últimos 7 dias.')}
  ${passo(3, 'O que o motor fez', 'antes desta leva', (p.mudancasDoMotor || []).length ? `<div class="motor">${p.mudancasDoMotor.map((m) => `<div><span class="fraco">${fmtData(m.em).slice(0, 5)}</span>${m.criativo ? `<a href="#" data-ficha="${esc(m.criativo)}">${esc(m.criativo)}</a>` : ''}<span>${esc(traduzStatus(m.texto))}</span></div>`).join('')}</div>` : '', 'O motor não mudou nenhum criativo desta oferta antes da leva.')}
  ${passo(4, 'O que o Analista concluiu', '', p.veredito ? `<div class="veredito">${esc(p.veredito)}</div>` : '', 'Sem veredito registrado para esta leva. O Analista escreve às 06:10.')}
  ${passo(5, 'O que vamos testar', hips.length ? `${hips.length} hipóteses` : '', hips.length ? `<div class="hips">${hips.map((h, i) => { const pai = h.pai ? criativo(h.pai) : null; return `<div class="hipc">
      <div class="row">${h.variavel ? chipVar(h.variavel) : ''}${h.tipo ? chipTipo(h.tipo) : ''}<span class="grow"></span><span class="fraco" style="font-size:11.5px">${(grupos.get(h.titulo) || []).length} cards</span></div>
      <h3>${esc(h.titulo)}</h3><p>${esc(h.porque || '')}</p>
      ${h.pai ? `<div class="hpai">pai <a href="#" data-ficha="${esc(h.pai)}">${esc(h.pai)}</a>${pai ? ` · ROAS 7d <b class="${roasCls(pai.d7.roas)}">${fmtRoas(pai.d7.roas)}</b>` : ''}</div>` : ''}
      ${h.ja_testado ? `<div class="jat">já testado: ${esc(h.ja_testado)}</div>` : ''}</div>`; }).join('')}</div>` : '', 'O Analista não deixou hipóteses para esta leva.')}
  ${passo(6, 'Os cards', (p.cards || []).length ? `${(p.cards || []).length} · <kbd>↑</kbd><kbd>↓</kbd> escolhe · <kbd>A</kbd> aprova · <kbd>D</kbd> devolve` : '', (p.cards || []).length ? ordemH.filter((k) => grupos.has(k)).map((k) => `<div class="lgrp"><div class="lgrp-t">${k ? esc(k) : 'Sem hipótese'}</div>
      <table class="tb tl cards"><thead><tr><th>Card</th><th>Tipo</th><th>Testa</th><th>Pai</th><th>O que muda</th><th>Hook</th><th>Status</th><th></th></tr></thead><tbody>
      ${grupos.get(k).map((c) => `<tr data-lc="${esc(c.id)}" class="${c.id === S.levaSel ? 'sel' : ''}">
        <td><a href="#" data-ficha="${esc(c.id)}"><b>${esc(c.id)}</b></a></td><td>${chipTipo(c.tipo)}</td><td>${chipVar(c.variavel)}</td>
        <td>${c.pai ? `<a href="#" data-ficha="${esc(c.pai.id)}">${esc(c.pai.id)}</a><br><small class="${roasCls(c.pai.roas7)}">ROAS 7d ${fmtRoas(c.pai.roas7)}</small>` : '<span class="fraco">—</span>'}</td>
        <td class="muda">${esc(c.muda || '—')}</td><td class="hk">${esc(c.hook || '—')}</td>
        <td>${chipSt(c.status)}${ok(c.score) ? ` <span class="nota ${notaCls(c.score)}">${fmtN(c.score, c.score % 1 ? 1 : 0)}</span>` : ''}</td>
        <td class="acs">${c.status === 'revisao' ? `<button class="btn ok sm" data-lap="${esc(c.id)}" ${admin() ? '' : 'disabled'}>Aprovar</button><button class="btn ghost sm" data-ldv="${esc(c.id)}">Devolver</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>`).join('') : '', 'Esta leva ainda não tem cards. O Copy escreve a cada hora a partir da fila.')}`;
  if (!S.levaSel || !(p.cards || []).some((c) => c.id === S.levaSel)) S.levaSel = (p.cards || []).find((c) => c.status === 'revisao')?.id || null;
  $$('[data-semcopy]').forEach((b) => b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); abrirFicha(b.dataset.semcopy).then(() => { const t = $('#c_copy'); if (t) { t.scrollIntoView({ block: 'center' }); t.focus(); } toast('Cole a transcrição no campo Copy e salve: a dissecação roda sozinha.'); }); });
  $$('[data-lc]').forEach((tr) => tr.onclick = (e) => { if (e.target.closest('a,button')) return; S.levaSel = tr.dataset.lc; $$('[data-lc]').forEach((x) => x.classList.toggle('sel', x === tr)); });
  $$('[data-lap]').forEach((b) => b.onclick = () => decidirLeva(b.dataset.lap, 'aprovado'));
  $$('[data-ldv]').forEach((b) => b.onclick = () => decidirLeva(b.dataset.ldv, 'briefing'));
}
// "no_ar → morto" vira "No ar → Morto" (sem códigos internos na tela)
const traduzStatus = (t) => String(t || '').replace(/\b(fila|briefing|producao|revisao|aprovado|no_ar|meio|vencedor|fadiga|morto)\b/g, (k) => STATUS_NOME[k] || k);
async function decidirLeva(id, para) {
  if (para === 'aprovado' && !admin()) return toast('Só o gestor aprova.', true);
  let nota = '';
  if (para === 'briefing') { nota = await pedirNota(`Devolver ${id}`, 'O que precisa mudar? (o redator lê isto)'); if (nota === null) return; }
  const cards = S.levaAtual?.cards || []; const fila = cards.filter((c) => c.status === 'revisao'); const i = fila.findIndex((c) => c.id === id);
  const r = await acao(() => api(`/api/cr/criativos/${enc(id)}/status`, { method: 'POST', body: { para, nota } }), para === 'aprovado' ? `${id} aprovado ✓` : `${id} devolvido`);
  if (r !== undefined) { S.levaSel = fila[i + 1]?.id || fila[i - 1]?.id || null; await recarregar(); route(); }
}
document.addEventListener('keydown', (e) => {
  if (rota().r !== 'levas' || !S.levaAtual || $('.modal') || $('.gaveta') || $('.pal')) return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase(), rows = $$('[data-lc]').map((x) => x.dataset.lc);
  if ((k === 'a' || k === 'd') && S.levaSel) { const c = S.levaAtual.cards.find((x) => x.id === S.levaSel); if (c?.status === 'revisao') { e.preventDefault(); decidirLeva(S.levaSel, k === 'a' ? 'aprovado' : 'briefing'); } }
  else if ((k === 'arrowdown' || k === 'arrowup') && rows.length) {
    e.preventDefault(); const i = rows.indexOf(S.levaSel); S.levaSel = rows[Math.max(0, Math.min(rows.length - 1, i + (k === 'arrowdown' ? 1 : -1)))];
    $$('[data-lc]').forEach((x) => x.classList.toggle('sel', x.dataset.lc === S.levaSel)); $('[data-lc].sel')?.scrollIntoView({ block: 'nearest' });
  }
});

// ---------------------------------------------------------------- 5. Board
function pageBoard() {
  const f = S.f;
  $('#main').innerHTML = `<div class="filtros">
    <div class="row" id="bOf">${S.d.ofertas.filter((o) => o.estado !== 'encerrada').map((o) => `<button class="chip ${f.ofertasBoard.includes(o.id) ? 'on' : ''}" data-o="${esc(o.id)}">${esc(o.id)}</button>`).join('')}</div>
    <select id="bTipo">${opts(Object.entries(TIPO_NOME), f.tipo, 'Todos os tipos')}</select>
    <input type="search" id="bBusca" placeholder="Buscar ID…" value="${esc(f.busca)}" style="width:180px">
    <label class="row fraco" style="font-size:13px;cursor:pointer"><input type="checkbox" id="bMortos" ${f.ocultarMortos ? 'checked' : ''}> ocultar mortos</label>
    <span class="grow"></span><button class="btn sm" id="bNovo">+ Criativo</button>
  </div><div class="boardwrap"><div class="grupos" id="board"></div></div>`;
  $$('#bOf [data-o]').forEach((b) => b.onclick = () => { const id = b.dataset.o; f.ofertasBoard = f.ofertasBoard.includes(id) ? f.ofertasBoard.filter((x) => x !== id) : [...f.ofertasBoard, id]; b.classList.toggle('on'); if (location.hash.includes('?')) history.replaceState(null, '', '#/board'); renderBoard(); });
  $('#bTipo').onchange = (e) => { f.tipo = e.target.value; renderBoard(); };
  $('#bBusca').oninput = (e) => { f.busca = e.target.value; clearTimeout(pageBoard.h); pageBoard.h = setTimeout(renderBoard, 180); };
  $('#bMortos').onchange = (e) => { f.ocultarMortos = e.target.checked; renderBoard(); };
  $('#bNovo').onclick = () => novoCriativo({ ofertaId: f.ofertasBoard.length === 1 ? f.ofertasBoard[0] : '' });
  renderBoard();
}
function cardBoard(c) {
  const res = RODANDO.includes(c.status) || c.status === 'morto';
  const D = c.d7;
  const linha = res
    ? `<span>ROAS 7d <b class="${roasCls(D.roas)}">${fmtRoas(D.roas)}</b></span><span><b>${fmtI(D.vendas)}</b> v</span><span>${fmtR(D.gasto)}</span>`
    : `${c.paiId ? `<span>de <b>${esc(c.paiId)}</b></span>` : ''}`;
  const hk = !res && !c.paiId && c.hook ? `<div class="hk">${esc(c.hook.split(/\s+/).slice(0, 9).join(' '))}</div>` : '';
  return `<div class="cc" draggable="true" data-ficha="${esc(c.id)}" data-id="${esc(c.id)}">
    <div class="id"><span>${esc(c.id)}</span>${ok(c.score) ? `<span class="nota ${notaCls(c.score)}">${fmtN(c.score, c.score % 1 ? 1 : 0)}</span>` : ''}</div>
    <div class="m">${chipTipo(c.tipo)}${c.formato ? `<span class="chip f">${esc(c.formato)}</span>` : ''}${linha}</div>${hk}</div>`;
}
function renderBoard() {
  const f = S.f;
  const lista = S.d.criativos.filter((c) => (!f.ofertasBoard.length || f.ofertasBoard.includes(c.ofertaId)) && (!f.tipo || c.tipo === f.tipo) && (!f.busca || norm(c.id).includes(norm(f.busca))) && !(f.ocultarMortos && c.status === 'morto'));
  const st = S.d.status || Object.keys(STATUS_NOME);
  $('#board').innerHTML = `<div class="gt">Produção</div><div class="gt">Resultado</div>` + st.map((s) => {
    const cs = lista.filter((c) => c.status === s).sort((a, b) => (RODANDO.includes(s) ? (b.d7.receita || 0) - (a.d7.receita || 0) : 0) || String(b.statusEm).localeCompare(String(a.statusEm)));
    return `<div class="col ${s}" data-col="${s}"><h3><span>${STATUS_NOME[s]}</span><span>${cs.length}</span></h3>${cs.slice(0, 80).map(cardBoard).join('')}${cs.length > 80 ? `<a href="#/criativos" class="fraco" style="font-size:12px;display:block;padding:4px">+${cs.length - 80} na tabela Criativos</a>` : ''}</div>`;
  }).join('');
  // arrastar entre colunas
  $$('#board .cc').forEach((el) => {
    el.ondragstart = (e) => { e.dataTransfer.setData('text/plain', el.dataset.id); el.classList.add('arrasta'); };
    el.ondragend = () => el.classList.remove('arrasta');
  });
  $$('#board .col').forEach((col) => {
    col.ondragover = (e) => { e.preventDefault(); col.classList.add('alvo'); };
    col.ondragleave = () => col.classList.remove('alvo');
    col.ondrop = (e) => { e.preventDefault(); col.classList.remove('alvo'); const id = e.dataTransfer.getData('text/plain'); const c = criativo(id); if (c && c.status !== col.dataset.col) mover(id, col.dataset.col); };
  });
}
async function mover(id, para) {
  if (para === 'aprovado' && !admin()) return toast('Só o gestor aprova.', true);
  let nota = '';
  if (PEDE_NOTA.includes(para)) { nota = await pedirNota(`${id} → ${STATUS_NOME[para]}`, para === 'morto' ? 'Por que morreu? (vira aprendizado)' : 'O que precisa mudar?'); if (nota === null) return; }
  const r = await acao(() => api(`/api/cr/criativos/${enc(id)}/status`, { method: 'POST', body: { para, nota } }), `${id} → ${STATUS_NOME[para]}`);
  if (r !== undefined) { await recarregar(); route(); if ($('.gaveta')) abrirFicha(id); }
}

// ---------------------------------------------------------------- 6. Ofertas
function pageOfertas() {
  const p = S.d.painel, R = S.d.regras;
  const linhas = S.d.ofertas.map((o) => ({ o, po: p.porOferta.find((x) => x.id === o.id) || {} })).sort((a, b) => (b.po.receita7 || 0) - (a.po.receita7 || 0));
  $('#main').innerHTML = `<div class="filtros"><span class="fraco" style="font-size:13px">A sigla é o prefixo do nome dos anúncios (CFAM-L4-UGC-05 → CFAM). O estado define o mix da próxima leva.</span><span class="grow"></span>${admin() ? '<button class="btn sm" id="nOf">+ Oferta</button>' : ''}</div>
  <div class="ofs">${linhas.map(({ o, po }) => {
    const mix = o.mix || {};
    const varr = po.receitaSemanaAnterior ? Math.round(((po.receita7 - po.receitaSemanaAnterior) / po.receitaSemanaAnterior) * 100) : null;
    const risco = po.diasSemVencedor !== null && po.diasSemVencedor !== undefined && po.diasSemVencedor >= R.diasRisco;
    return `<div class="card of"><h3>${esc(o.nome)} <span class="fraco" style="font-size:12px;font-weight:500">${esc(o.id)}</span> ${chipEst(o.estado)}</h3>
      <div class="mix">${[['modelagem', 'Modelagem', 'var(--tx)'], ['variacao', 'Variação', 'var(--azul)'], ['zero', 'Do zero', 'var(--amar)']].map(([k, t, cor]) => `<div><span>${t}</span><div class="barra"><i style="width:${mix[k] ?? 0}%;background:${cor}"></i></div><span class="num">${mix[k] ?? '—'}%</span></div>`).join('')}</div>
      <div class="kv">
        <div><span class="cap">Receita 7d</span><b>${fmtR(po.receita7)} ${varr !== null ? `<small class="${varr >= 0 ? 'verde' : 'verm'}" style="font-size:12px">${varr >= 0 ? '▲' : '▼'}${Math.abs(varr)}%</small>` : ''}</b></div>
        <div><span class="cap">Vencedores vivos</span><b>${po.vencedores ?? '—'}</b></div>
        <div><span class="cap">No ar</span><b>${po.rodando ?? '—'}</b></div>
        <div><span class="cap">Na fila</span><b>${po.emFila ?? '—'}</b></div>
        <div><span class="cap">Último vencedor</span><b class="${risco ? 'verm' : ''}">${po.diasSemVencedor === null || po.diasSemVencedor === undefined ? 'nunca' : `há ${po.diasSemVencedor} dias`}</b></div>
        <div><span class="cap">Próxima leva</span><b style="font-size:13.5px">${po.proximaLeva ? `${fmtData(po.proximaLeva.data)} · ${esc(po.proximaLeva.id)}` : '<span class="fraco">não planejada</span>'}</b></div>
      </div>
      <div class="row"><a class="btn sm" href="#/ofertas/${enc(o.id)}">Abrir</a><a class="btn ghost sm" href="#/board?oferta=${enc(o.id)}">Board</a></div></div>`;
  }).join('') || '<div class="vazio"><b>Nenhuma oferta ainda.</b>Crie a primeira com "+ Oferta".</div>'}</div>`;
  $('#nOf') && ($('#nOf').onclick = formNovaOferta);
}
function formNovaOferta() {
  modal(`<h2>Nova oferta</h2><div class="form">
    <div class="f2"><label class="f"><span>Sigla <em>(prefixo dos anúncios)</em></span><input id="no_id" placeholder="CFAM" style="text-transform:uppercase"></label><label class="f"><span>Nome</span><input id="no_nome"></label></div>
    <div class="f2"><label class="f"><span>Família</span><input id="no_fam"></label><label class="f"><span>Estado</span><select id="no_est">${opts(Object.entries(ESTADO_NOME), 'validacao')}</select></label></div>
    <div class="row"><span class="grow"></span><button class="btn ghost" data-fecha>Cancelar</button><button class="btn" id="no_ok">Criar</button></div></div>`);
  $('#no_ok').onclick = async () => {
    const id = $('#no_id').value.trim().toUpperCase();
    const r = await acao(() => api('/api/cr/ofertas', { method: 'POST', body: { id, nome: $('#no_nome').value.trim(), familia: $('#no_fam').value.trim(), estado: $('#no_est').value } }), 'Oferta criada.');
    if (r !== undefined) { fecharModal(); await recarregar(); location.hash = `#/ofertas/${enc(id)}`; }
  };
}
function pageOferta(id) {
  const o = oferta(id); if (!o) { $('#main').innerHTML = '<div class="vazio"><b>Oferta não encontrada.</b><a href="#/ofertas">Voltar</a></div>'; return; }
  const lista = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
  const levas = S.d.levas.filter((l) => l.ofertaId === id);
  $('#main').innerHTML = `<div class="filtros"><a href="#/ofertas" class="fraco">← Ofertas</a>${chipEst(o.estado)}<span class="fraco" style="font-size:12.5px">${esc(o.id)}</span><span class="grow"></span><a class="btn ghost sm" href="#/board?oferta=${enc(id)}">Board</a></div>
  <div class="det2">
    <div class="card"><header><h2>Oferta</h2></header><div class="form">
      <div class="f2"><label class="f"><span>Nome</span><input id="o_nome" value="${esc(o.nome)}"></label><label class="f"><span>Família</span><input id="o_fam" value="${esc(o.familia || '')}"></label></div>
      <div class="f2"><label class="f"><span>Estado <em>(ajusta o mix sozinho)</em></span><select id="o_est">${opts(Object.entries(ESTADO_NOME), o.estado)}</select></label>
        <label class="f"><span>Mix atual</span><input disabled value="${o.mix?.modelagem ?? '—'} / ${o.mix?.variacao ?? '—'} / ${o.mix?.zero ?? '—'}  (mod. / var. / zero)"></label></div>
      <label class="f"><span>Outros prefixos de anúncio <em>(vírgula)</em></span><input id="o_pref" value="${esc((o.prefixos || []).join(', '))}" placeholder="BARCONST, CONST"></label>
      <label class="f"><span>Produtos na Lastlink <em>(trechos do nome, vírgula)</em></span><input id="o_prod" value="${esc((o.produtos || []).join(', '))}"></label>
      <div class="f2"><label class="f"><span>Página de vendas</span><input type="url" id="o_pv" value="${esc(o.pvUrl || '')}"></label><label class="f"><span>Pasta no Drive</span><input type="url" id="o_pasta" value="${esc(o.pastaDrive || '')}"></label></div>
      <label class="f"><span>Pesquisa da oferta <em>— avatar, promessa, mecanismo, objeções. É o que o Diretor de Copy lê.</em></span><textarea id="o_notas" rows="14">${esc(o.notas || '')}</textarea></label>
      <div class="row"><span class="fraco" style="font-size:12px">${o.atualizadoEm ? 'salvo ' + fmtDH(o.atualizadoEm) : ''}</span><span class="grow"></span><button class="btn" id="o_ok">Salvar oferta</button></div>
    </div></div>
    <div style="display:grid;gap:14px;min-width:0">
      <div class="card"><header><h2>Levas</h2><span class="grow"></span><button class="btn sm" id="l_novo">+ Leva</button></header>
        <div style="overflow:auto"><table class="tb"><thead><tr><th>Leva</th><th>Status</th><th>Planejada</th><th>No ar</th><th>Hipótese</th><th class="n">Criat.</th><th class="n">Venc.</th><th></th></tr></thead><tbody>
        ${levas.map((l) => { const cs = S.d.criativos.filter((c) => c.levaId === l.id); return `<tr data-leva="${esc(l.id)}"><td><b>${esc(l.id)}</b></td><td>${LEVA_NOME[l.status] || esc(l.status)}</td><td>${fmtData(l.planejada)}</td><td>${fmtData(l.noAr)}</td><td class="hip">${esc(l.hipotese || '')}</td><td class="n">${cs.length}</td><td class="n">${cs.filter((c) => c.status === 'vencedor').length}</td><td><button class="link" data-edleva title="Editar datas, status e hipótese">editar</button></td></tr>`; }).join('') || '<tr><td colspan="8" class="fraco">Nenhuma leva ainda.</td></tr>'}
        </tbody></table></div></div>
      <div class="card"><header><h2>Aprendizados</h2><span class="grow"></span><select id="ap_tipo">${opts([['veredito', 'Vereditos'], ['hipotese', 'Hipóteses'], ['dissecacao', 'Dissecações'], ['nota', 'Notas']], '', 'Todos')}</select></header>
        <div class="row" style="margin-bottom:12px"><input id="ap_txt" placeholder="Anotar algo que a oferta ensinou…" style="flex:1"><button class="btn sm" id="ap_add">Anotar</button></div>
        <div id="ap_lista"><div class="fraco">carregando…</div></div></div>
    </div>
  </div>`;
  $('#o_ok').onclick = async () => {
    const body = { nome: $('#o_nome').value.trim(), familia: $('#o_fam').value.trim(), estado: $('#o_est').value, prefixos: lista($('#o_pref').value), produtos: lista($('#o_prod').value), pvUrl: $('#o_pv').value.trim(), pastaDrive: $('#o_pasta').value.trim(), notas: $('#o_notas').value };
    const r = await acao(() => api(`/api/cr/ofertas/${enc(id)}`, { method: 'PATCH', body }), 'Oferta salva.');
    if (r !== undefined) { await recarregar(); route(); }
  };
  $('#l_novo').onclick = () => formLeva(id);
  $$('[data-leva]').forEach((tr) => tr.onclick = (e) => { if (e.target.closest('[data-edleva]')) return formLeva(id, tr.dataset.leva); location.hash = '#/levas/' + enc(tr.dataset.leva); });
  let apr = [];
  const desenhar = () => { const t = $('#ap_tipo').value; $('#ap_lista').innerHTML = listaAprendizados(apr.filter((a) => !t || a.tipo === t)) || '<div class="fraco">Nada ainda.</div>'; };
  $('#ap_tipo').onchange = desenhar;
  $('#ap_add').onclick = async () => {
    const texto = $('#ap_txt').value.trim(); if (!texto) return;
    const r = await acao(() => api('/api/cr/aprendizados', { method: 'POST', body: { ofertaId: id, tipo: 'nota', texto } }), 'Anotado.');
    if (r !== undefined) { $('#ap_txt').value = ''; apr.unshift(r); desenhar(); }
  };
  api(`/api/cr/aprendizados?oferta=${enc(id)}`).then((r) => { apr = r; if ($('#ap_lista')) desenhar(); }).catch((e) => { if ($('#ap_lista')) $('#ap_lista').innerHTML = `<div class="fraco">${esc(e.message)}</div>`; });
}
function formLeva(ofertaId, levaId) {
  const l = levaId ? S.d.levas.find((x) => x.id === levaId) : null;
  const cs = l ? S.d.criativos.filter((c) => c.levaId === l.id) : [];
  modal(`<h2>${l ? esc(l.id) : 'Nova leva · ' + esc(ofertaId)}</h2><div class="form">
    <div class="f3">${l ? `<label class="f"><span>Status</span><select id="l_st">${opts(Object.entries(LEVA_NOME), l.status)}</select></label>` : ''}
      <label class="f"><span>Planejada</span><input type="date" id="l_pl" value="${l ? l.planejada || '' : hoje()}"></label>
      ${l ? `<label class="f"><span>No ar</span><input type="date" id="l_na" value="${l.noAr || ''}"></label>` : ''}</div>
    <label class="f"><span>Hipótese que a leva testa</span><textarea id="l_hip" rows="3">${esc(l?.hipotese || '')}</textarea></label>
    ${l ? `<div><div class="cap" style="margin-bottom:6px">Criativos da leva (${cs.length})</div>${cs.map((c) => `<a href="#" data-ficha="${esc(c.id)}" class="chip" style="margin:0 4px 4px 0">${esc(c.id)} · ${STATUS_NOME[c.status]}</a>`).join('') || '<span class="fraco">nenhum</span>'}</div>` : ''}
    <div class="row"><span class="grow"></span><button class="btn ghost" data-fecha>Cancelar</button><button class="btn" id="l_ok">${l ? 'Salvar' : 'Criar'}</button></div></div>`);
  $('#l_ok').onclick = async () => {
    const r = await acao(() => (l
      ? api(`/api/cr/levas/${enc(l.id)}`, { method: 'PATCH', body: { status: $('#l_st').value, planejada: $('#l_pl').value || null, noAr: $('#l_na').value || null, hipotese: $('#l_hip').value } })
      : api('/api/cr/levas', { method: 'POST', body: { ofertaId, planejada: $('#l_pl').value || null, hipotese: $('#l_hip').value } })), l ? 'Leva salva.' : 'Leva criada.');
    if (r !== undefined) { fecharModal(); await recarregar(); route(); }
  };
}
function listaAprendizados(rows) {
  const ic = { veredito: '⚖️ Veredito', hipotese: '💡 Hipótese', nota: '📝 Nota', dissecacao: '🔬 Dissecação' };
  return rows.map((a) => {
    let corpo = esc(a.texto);
    if (a.tipo === 'dissecacao') { try { corpo = fichaDissecacao(JSON.parse(a.texto)); } catch { /* texto cru */ } }
    return `<div class="apr"><div class="t"><b>${ic[a.tipo] || esc(a.tipo)}</b><span>${esc(a.autor || '')}</span>${a.criativo_id ? `<a href="#" data-ficha="${esc(a.criativo_id)}">${esc(a.criativo_id)}</a>` : ''}<span style="margin-left:auto">${fmtDH(a.criado_em)}</span></div><div class="txt">${corpo}</div></div>`;
  }).join('');
}
function fichaDissecacao(d) {
  const ang = (x) => (x && (x.categoria || x.angulo) ? `<b>${esc(x.categoria)}</b> · ${esc(x.angulo)}${x.ideia ? `<div class="fraco">${esc(x.ideia)}</div>` : ''}` : '—');
  const linha = (t, v) => `<div><span>${t}</span><span>${v || '—'}</span></div>`;
  return `<div class="dis">
    ${linha('Hook literal', d.hook_literal ? `“${esc(d.hook_literal)}”` : '')}
    ${linha('Modelo de gancho', esc(d.modelo_gancho))}
    ${linha('Categoria', esc(d.categoria_gancho))}
    ${linha('Ângulo do hook', ang(d.angulo_hook))}
    ${linha('Ângulo do body', ang(d.angulo_body))}
    ${linha('Avatar', esc(d.avatar))}
    ${linha('Consciência', esc(d.consciencia))}
    ${linha('Emoções', esc((d.emocoes || []).filter(Boolean).join(', ')))}
    ${linha('Esqueleto', (d.esqueleto || []).length ? `<ol>${d.esqueleto.map((b) => `<li><b>${esc(b.bloco)}</b> — ${esc(b.funcao)}</li>`).join('')}</ol>` : '')}
  </div>`;
}

// ---------------------------------------------------------------- 7. Criativos (tabela)
const COLS = [
  ['id', 'Criativo'], ['ofertaId', 'Oferta'], ['status', 'Status'], ['tipo', 'Tipo'], ['formato', 'Fmt'], ['levaId', 'Leva'],
  ['d7.gasto', 'Gasto 7d', 'r'], ['d7.vendas', 'Vendas 7d', 'i'], ['d7.roas', 'ROAS 7d', 'roas'], ['total.gasto', 'Gasto total', 'r'], ['total.vendas', 'Vendas', 'i'], ['total.receita', 'Receita', 'r'],
  ['total.roas', 'ROAS', 'roas'], ['total.cpa', 'CPA', 'r'], ['total.hookRate', 'Hook %', 'p'], ['total.holdRate', 'Hold %', 'p'], ['total.ctr', 'CTR %', 'p'], ['noArEm', 'No ar desde', 'd'],
];
function pageCriativos() {
  const f = S.f;
  $('#main').innerHTML = `<div class="filtros">
    <select id="tOf">${opts(S.d.ofertas.map((o) => [o.id, o.nome]), f.oferta, 'Todas as ofertas')}</select>
    <select id="tSt">${opts((S.d.status || Object.keys(STATUS_NOME)).map((s) => [s, STATUS_NOME[s]]), f.status, 'Todos os status')}</select>
    <select id="tTipo">${opts(Object.entries(TIPO_NOME), f.tipo, 'Todos os tipos')}</select>
    <input type="search" id="tBusca" placeholder="Buscar ID, ângulo, hook…" value="${esc(f.busca)}" style="width:220px">
    <span class="grow"></span><button class="btn ghost sm" id="tCsv">Baixar CSV</button><button class="btn sm" id="tNovo">+ Criativo</button>
  </div><div class="tw" id="tw"></div><div class="fraco" id="tN" style="font-size:12px;margin-top:8px"></div>`;
  $('#tOf').onchange = (e) => { f.oferta = e.target.value; renderTabela(); };
  $('#tSt').onchange = (e) => { f.status = e.target.value; renderTabela(); };
  $('#tTipo').onchange = (e) => { f.tipo = e.target.value; renderTabela(); };
  $('#tBusca').oninput = (e) => { f.busca = e.target.value; clearTimeout(pageCriativos.h); pageCriativos.h = setTimeout(renderTabela, 180); };
  $('#tCsv').onclick = () => baixarCsv(linhasTabela());
  $('#tNovo').onclick = () => novoCriativo({ ofertaId: f.oferta });
  renderTabela();
}
function linhasTabela() {
  const f = S.f;
  return S.d.criativos.filter((c) => (!f.oferta || c.ofertaId === f.oferta) && (!f.status || c.status === f.status) && (!f.tipo || c.tipo === f.tipo) && (!f.busca || norm(`${c.id} ${c.angulo || ''} ${c.hook || ''}`).includes(norm(f.busca))))
    .sort((a, b) => { const x = get(a, S.ord.k), y = get(b, S.ord.k); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * S.ord.dir; });
}
function celula(c, k, t) {
  const v = get(c, k);
  if (k === 'status') return chipSt(v);
  if (k === 'tipo') return TIPO_NOME[v] || '—';
  if (t === 'r') return fmtR(v);
  if (t === 'i') return fmtI(v);
  if (t === 'p') return fmtN(v, 1);
  if (t === 'roas') return `<span class="${roasCls(v)}">${fmtRoas(v)}</span>`;
  if (t === 'd') return fmtData(v);
  return v ? esc(v) : '—';
}
function renderTabela() {
  const rows = linhasTabela();
  $('#tw').innerHTML = `<table class="tb"><thead><tr>${COLS.map(([k, n, t]) => `<th class="${t && t !== 'd' ? 'n' : ''} ${S.ord.k === k ? 'on' : ''}" data-k="${k}">${n}${S.ord.k === k ? (S.ord.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`).join('')}</tr></thead>
  <tbody>${rows.slice(0, 1500).map((c) => `<tr data-ficha="${esc(c.id)}">${COLS.map(([k, , t]) => `<td class="${t && t !== 'd' ? 'n' : ''}">${k === 'id' ? `<b>${esc(c.id)}</b>` : celula(c, k, t)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${COLS.length}" class="fraco" style="text-align:center;height:80px">Nenhum criativo com esses filtros.</td></tr>`}</tbody></table>`;
  $('#tN').textContent = `${rows.length} criativos${rows.length > 1500 ? ' (mostrando 1.500; o CSV leva todos)' : ''}`;
  $$('th[data-k]').forEach((th) => th.onclick = () => { const k = th.dataset.k; S.ord = { k, dir: S.ord.k === k ? -S.ord.dir : -1 }; renderTabela(); });
}
function baixarCsv(rows) {
  const escC = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const cols = [...COLS, ['paiId', 'Pai'], ['angulo', 'Ângulo'], ['mecanismo', 'Mecanismo'], ['hook', 'Hook'], ['body', 'Body'], ['aprendizado', 'Aprendizado']];
  const txt = '﻿' + [cols.map((c) => escC(c[1])).join(','), ...rows.map((c) => cols.map(([k]) => escC(get(c, k))).join(','))].join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv' })); a.download = `criativos-${hoje()}.csv`; a.click();
}

// ---------------------------------------------------------------- 8. Ficha lateral
function fecharGaveta() { $('.gaveta')?.remove(); $('.veu')?.remove(); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if ($('.modal')) fecharModal(); else fecharGaveta(); } });
async function abrirFicha(id) {
  const c = criativo(id); if (!c) return toast(`Criativo ${id} não está na base.`, true);
  fecharGaveta();
  const T = c.total, D = c.d7;
  const prox = (PROXIMO[c.status] || []).filter((s) => admin() || s !== 'aprovado');
  const veu = document.createElement('div'); veu.className = 'veu'; veu.onclick = fecharGaveta;
  const g = document.createElement('aside'); g.className = 'gaveta';
  const m = (v, l) => `<div><div class="v">${v}</div><div class="l">${l}</div></div>`;
  const vencedores = S.d.criativos.filter((x) => x.ofertaId === c.ofertaId && x.status === 'vencedor' && x.id !== c.id);
  g.innerHTML = `<button class="btn ghost sm fechar" id="g_x">Fechar <kbd>Esc</kbd></button>
    <h2>${esc(c.id)}</h2>
    <div class="meta">${chipSt(c.status)}<span class="chip">${esc(oferta(c.ofertaId)?.nome || c.ofertaId)}</span>${c.levaId ? `<a class="chip" href="#/levas/${enc(c.levaId)}" title="Por que esta leva?">${esc(c.levaId)} →</a>` : ''}${chipTipo(c.tipo)}${c.formato ? `<span class="chip f">${esc(c.formato)}</span>` : ''}
      ${c.paiId ? `<span>pai <a href="#" data-ficha="${esc(c.paiId)}">${esc(c.paiId)}</a></span>` : ''}${noArHa(c) !== null ? `<span>no ar há ${noArHa(c)} dias</span>` : ''}</div>
    <div class="reg6">${m(fmtR(T.gasto), 'Gasto total')}${m(fmtI(T.vendas), 'Vendas')}${m(fmtR(T.receita), 'Receita')}${m(`<span class="${roasCls(T.roas)}">${fmtRoas(T.roas)}</span>`, 'ROAS total')}${m(`<span class="${roasCls(D.roas)}">${fmtRoas(D.roas)}</span>`, 'ROAS 7d')}${m(fmtR(T.cpa), 'CPA')}</div>
    <div class="reg6">${m(fmtN(T.hookRate), 'Hook %')}${m(fmtN(T.holdRate), 'Hold %')}${m(fmtN(T.ctr), 'CTR %')}${m(fmtN(T.conversao), 'Conversão %')}${m(fmtI(T.ic), 'IC')}${m(fmtI(T.reembolsos), 'Reembolsos')}</div>
    <div id="g_serie" class="fraco" style="font-size:12.5px;margin-top:10px">carregando o dia a dia…</div>
    <div class="acoes">${prox.map((s) => `<button class="btn sm ${s === 'aprovado' || s === 'vencedor' ? 'ok' : s === 'morto' ? 'danger' : 'ghost'}" data-para="${s}">${s === 'aprovado' ? 'Aprovar' : s === 'briefing' && c.status === 'revisao' ? 'Devolver' : '→ ' + STATUS_NOME[s]}</button>`).join('')}
      <span style="flex:1"></span><button class="btn ghost sm" id="g_dis" ${c.copy && c.copy.trim().length >= 20 ? '' : 'disabled title="Cole a copy na ficha antes"'}>Dissecar</button></div>
    <div class="form">
      <div class="f3"><label class="f"><span>Tipo</span><select id="c_tipo">${opts(Object.entries(TIPO_NOME), c.tipo)}</select></label>
        <label class="f"><span>Formato</span><select id="c_fmt">${opts(FORMATOS, c.formato, '—')}</select></label>
        <label class="f"><span>Leva</span><select id="c_leva">${opts(S.d.levas.filter((l) => l.ofertaId === c.ofertaId).map((l) => [l.id, l.id]), c.levaId, '—')}</select></label></div>
      <div class="f2"><label class="f"><span>Criativo-pai <em>(vencedores da oferta)</em></span><input id="c_pai" list="g_pais" value="${esc(c.paiId || '')}"></label>
        <label class="f"><span>Arquivo (Drive)</span><input type="url" id="c_arq" value="${esc(c.arquivoUrl || '')}"></label></div>
      <datalist id="g_pais">${vencedores.map((x) => `<option value="${esc(x.id)}">ROAS ${fmtRoas(x.total.roas)} · ${x.total.vendas} vendas</option>`).join('')}</datalist>
      <div class="f2"><label class="f"><span>Ângulo</span><input id="c_ang" value="${esc(c.angulo || '')}"></label><label class="f"><span>Mecanismo</span><input id="c_mec" value="${esc(c.mecanismo || '')}"></label></div>
      <label class="f"><span>Hook</span><input id="c_hook" value="${esc(c.hook || '')}"></label>
      <label class="f"><span>Body (estrutura)</span><input id="c_body" value="${esc(c.body || '')}"></label>
      <label class="f"><span>Copy <em>(texto do anúncio, HEADLINE, ROTEIRO/ARTE, POR QUE)</em></span><textarea id="c_copy" rows="10">${esc(c.copy || '')}</textarea></label>
      <div class="f2"><label class="f"><span>Aprendizado <em>(1 linha)</em></span><input id="c_apr" value="${esc(c.aprendizado || '')}"></label><label class="f"><span>Nota do revisor <em>(0–10)</em></span><input type="number" id="c_score" min="0" max="10" step="0.5" value="${c.score ?? ''}"></label></div>
      <div class="row"><span class="fraco" style="font-size:12px">${c.criadoPor ? `criado por ${esc(c.criadoPor)} · ${fmtDH(c.criadoEm)}` : ''}</span><span class="grow"></span><button class="btn" id="c_ok">Salvar ficha</button></div>
    </div>
    <h3>Histórico</h3><div class="hist">${(c.historico || []).slice().reverse().map((h) => `<div>${fmtDH(h.em)} · ${h.de ? STATUS_NOME[h.de] + ' → ' : ''}<b>${STATUS_NOME[h.para] || esc(h.para)}</b> · ${esc(h.por)}${h.nota ? ` — ${esc(h.nota)}` : ''}</div>`).join('') || 'sem histórico'}</div>
    <h3>Aprendizados</h3><div id="g_apr" class="fraco">carregando…</div>`;
  document.body.append(veu, g);
  $('#g_x').onclick = fecharGaveta;
  $$('[data-para]', g).forEach((b) => b.onclick = () => mover(c.id, b.dataset.para));
  $('#g_dis').onclick = async () => {
    $('#g_dis').disabled = true; $('#g_dis').textContent = 'Dissecando…';
    const r = await acao(() => api(`/api/cr/criativos/${enc(c.id)}/dissecar`, { method: 'POST' }), 'Dissecação gravada.');
    if (r !== undefined) carregarApr(); if ($('#g_dis')) { $('#g_dis').disabled = false; $('#g_dis').textContent = 'Dissecar'; }
  };
  $('#c_ok').onclick = async () => {
    const sc = $('#c_score').value;
    const body = { tipo: $('#c_tipo').value, formato: $('#c_fmt').value || null, levaId: $('#c_leva').value || null, paiId: $('#c_pai').value.trim() || null, arquivoUrl: $('#c_arq').value.trim(), angulo: $('#c_ang').value, mecanismo: $('#c_mec').value, hook: $('#c_hook').value, body: $('#c_body').value, copy: $('#c_copy').value, aprendizado: $('#c_apr').value, score: sc === '' ? null : Number(sc) };
    const r = await acao(() => api(`/api/cr/criativos/${enc(c.id)}`, { method: 'PATCH', body }), 'Ficha salva.');
    if (r !== undefined) { await recarregar(); route(); abrirFicha(c.id); }
  };
  const carregarApr = () => api(`/api/cr/aprendizados?criativo=${enc(c.id)}`).then((r) => { const el = $('#g_apr'); if (el) { el.className = ''; el.innerHTML = listaAprendizados(r) || '<div class="fraco">Nenhum ainda.</div>'; } }).catch((e) => { const el = $('#g_apr'); if (el) el.textContent = e.message; });
  carregarApr();
  try {
    const serie = await api(`/api/cr/criativos/${enc(c.id)}/serie`);
    const el = $('#g_serie'); if (!el) return;
    if (!serie.length) { el.textContent = 'Sem métricas diárias ainda (o sync da Meta roda às 06:10; vendas chegam pelo webhook).'; return; }
    el.innerHTML = `<div class="row"><span>Dia a dia · ${serie.length} dias</span><span class="grow"></span><span class="legenda"><span><i style="background:var(--verde)"></i>Receita</span><span><i style="background:var(--line2);height:8px"></i>Gasto</span></span></div>${sparkline(serie)}`;
  } catch { const el = $('#g_serie'); if (el) el.textContent = ''; }
}
function sparkline(serie) {
  const pts = serie.slice(-60), W = 670, H = 70, n = pts.length;
  const max = Math.max(1, ...pts.map((d) => Math.max(d.receita, d.gasto)));
  const bw = W / n;
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${pts.map((d, i) => {
    const hg = (d.gasto / max) * (H - 2), hr = (d.receita / max) * (H - 2);
    return `<g><title>${fmtData(d.dia)} · ${d.vendas} vendas · receita ${fmtR(d.receita)} · gasto ${fmtR(d.gasto)}</title>
      <rect x="${i * bw + bw * 0.1}" y="${H - hg}" width="${bw * 0.8}" height="${hg}" fill="#2E3540" rx="1"/>
      <rect x="${i * bw + bw * 0.28}" y="${H - hr}" width="${bw * 0.44}" height="${hr}" fill="#2EE59D" rx="1"/></g>`;
  }).join('')}</svg>`;
}

// ---------------------------------------------------------------- 9. Novo criativo + modais
function modal(html) {
  fecharModal();
  const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="box">${html}</div>`;
  document.body.appendChild(m);
  m.onclick = (e) => { if (e.target === m || e.target.closest('[data-fecha]')) fecharModal(); };
  setTimeout(() => $('input:not([disabled]), textarea, select', m)?.focus(), 30);
  return m;
}
function fecharModal() { $('.modal')?.remove(); }
function pedirNota(titulo, rotulo) {
  return new Promise((resolve) => {
    const m = modal(`<h2>${esc(titulo)}</h2><div class="form"><label class="f"><span>${esc(rotulo)}</span><textarea id="pn_txt" rows="4"></textarea></label>
      <div class="row"><span class="grow"></span><button class="btn ghost" id="pn_x">Cancelar</button><button class="btn" id="pn_ok">Confirmar</button></div></div>`);
    let feito = false;
    const fim = (v) => { if (feito) return; feito = true; fecharModal(); resolve(v); };
    $('#pn_x').onclick = () => fim(null);
    m.addEventListener('click', (e) => { if (e.target === m) fim(null); });
    $('#pn_ok').onclick = () => { const v = $('#pn_txt').value.trim(); if (!v) { $('#pn_txt').focus(); return toast('Escreva a nota.', true); } fim(v); };
    $('#pn_txt').onkeydown = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $('#pn_ok').click(); };
    new MutationObserver((_, ob) => { if (!document.body.contains(m)) { ob.disconnect(); fim(null); } }).observe(document.body, { childList: true });
  });
}
function novoCriativo(pre = {}) {
  modal(`<h2>${pre.tipo === 'variacao' ? `Variação de ${esc(pre.paiId)}` : 'Novo criativo'}</h2><div class="form">
    <div class="f2"><label class="f"><span>Oferta</span><select id="n_of">${opts(S.d.ofertas.map((o) => [o.id, o.nome]), pre.ofertaId, 'Escolha')}</select></label>
      <label class="f"><span>Leva</span><select id="n_leva"></select></label></div>
    <label class="f"><span>ID <em>— nome que o anúncio terá no Meta; comece pela sigla da oferta</em></span><input id="n_id" placeholder="CFAM-L8-UGC-01"></label>
    <div class="f3"><label class="f"><span>Tipo</span><select id="n_tipo">${opts(Object.entries(TIPO_NOME), pre.tipo || 'modelagem')}</select></label>
      <label class="f"><span>Formato</span><select id="n_fmt">${opts(FORMATOS, pre.formato, '—')}</select></label>
      <label class="f"><span>Status inicial</span><select id="n_st">${opts([['fila', 'Fila'], ['briefing', 'Briefing'], ['no_ar', 'Já está no ar']], 'fila')}</select></label></div>
    <label class="f"><span>Criativo-pai</span><input id="n_pai" list="n_pais" value="${esc(pre.paiId || '')}"></label><datalist id="n_pais"></datalist>
    <div class="f2"><label class="f"><span>Ângulo</span><input id="n_ang" value="${esc(pre.angulo || '')}"></label><label class="f"><span>Hook</span><input id="n_hook"></label></div>
    <label class="f"><span>Copy</span><textarea id="n_copy" rows="4"></textarea></label>
    <div class="row"><span class="grow"></span><button class="btn ghost" data-fecha>Cancelar</button><button class="btn" id="n_ok">Criar</button></div></div>`);
  const sync = () => {
    const of = $('#n_of').value;
    $('#n_leva').innerHTML = opts(S.d.levas.filter((l) => l.ofertaId === of && l.status !== 'encerrada').map((l) => [l.id, `${l.id} · ${LEVA_NOME[l.status] || l.status}`]), pre.levaId, '—');
    $('#n_pais').innerHTML = S.d.criativos.filter((x) => x.ofertaId === of && x.status === 'vencedor').map((x) => `<option value="${esc(x.id)}">`).join('');
    if (of && !$('#n_id').value) $('#n_id').placeholder = `${of}-L?-UGC-01`;
  };
  $('#n_of').onchange = sync; sync();
  $('#n_leva').onchange = (e) => { if (e.target.value && !$('#n_id').value) $('#n_id').value = e.target.value + '-'; };
  $('#n_ok').onclick = async () => {
    const id = $('#n_id').value.trim(); if (!id) return toast('Dê o ID (nome do anúncio).', true);
    const body = { id, ofertaId: $('#n_of').value, levaId: $('#n_leva').value || undefined, tipo: $('#n_tipo').value, formato: $('#n_fmt').value || undefined, paiId: $('#n_pai').value.trim() || undefined, angulo: $('#n_ang').value, hook: $('#n_hook').value, copy: $('#n_copy').value, status: $('#n_st').value };
    const r = await acao(() => api('/api/cr/criativos', { method: 'POST', body }), `${id} criado.`);
    if (r !== undefined) { fecharModal(); await recarregar(); route(); }
  };
}

// ---------------------------------------------------------------- 10. Ajustes
async function pageAjustes() {
  if (!admin()) { $('#main').innerHTML = '<div class="vazio"><b>Só o gestor mexe nos ajustes.</b>Conexão da Meta, webhook e regras ficam com o Kaian.</div>'; return; }
  const R = S.d.regras, M = S.d.meta;
  const ult = (k, t) => (S.d[k] ? `<span class="fraco" style="font-size:12px">${t}: ${fmtDH(S.d[k].em)}</span>` : '');
  $('#main').innerHTML = `<div class="aj">
    <div class="card"><header><h2>Meta Ads</h2><span class="grow"></span><span class="estado ${M ? 'verde' : 'amar'}">${M?.fonte === 'env' ? '● token fixo na Netlify' : M ? `● conectada${M.usuario ? ' como ' + esc(M.usuario) : ''}` : '● não conectada'}</span></header>
      ${M?.exp ? `<div class="fraco" style="font-size:12.5px">Renova sozinha · vence ${fmtData(M.exp)}</div>` : ''}
      <details ${M ? '' : 'open'}><summary style="cursor:pointer;font-size:13px">Conectar / trocar o token</summary>
        <div class="fraco" style="font-size:12.5px;margin:8px 0">No <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener">Graph API Explorer</a>, escolha o app, adicione a permissão <code>ads_read</code>, clique em "Generate Access Token" e cole aqui. O app troca por um token de 60 dias e renova sozinho.</div>
        <div class="row"><input type="password" id="m_tok" placeholder="EAAB…" style="flex:1" autocomplete="off"><button class="btn sm" id="m_con">Conectar</button></div></details>
      <div id="m_contas" class="fraco" style="font-size:12.5px">${M ? 'carregando as contas…' : 'Conecte para listar as contas.'}</div>
      <div class="row"><button class="btn ghost sm" id="m_sync">Sincronizar 3 dias</button><span class="grow"></span><input type="date" id="m_ate" title="Data final"><button class="btn ghost sm" id="m_hist">Puxar histórico até a data</button></div>
      <div id="m_res" style="font-size:12.5px"></div>${ult('ultimoSync', 'último sync')}
    </div>
    <div class="card"><header><h2>Lastlink</h2></header>
      <div style="font-size:13px">Em Integrações › Webhooks, cadastre esta URL em todos os produtos, com 3 eventos: <b>Purchase_Order_Confirmed</b>, <b>Payment_Refund</b> e <b>Payment_Chargeback</b>.</div>
      <pre class="code" id="w_url">${esc(S.d.webhook || '—')}</pre>
      <div class="row"><button class="btn sm" id="w_cop">Copiar URL</button><button class="btn ghost sm" id="w_log">Ver log</button></div>
      <div class="fraco" style="font-size:12px">A venda liga ao criativo pelo <code>utm_content</code> (= nome do anúncio).</div>
      <div id="w_out"></div>
    </div>
    <div class="card"><header><h2>Regras do veredito</h2></header><div class="form">
      <div class="f3">
        <label class="f"><span>Horas no ar</span><input type="number" id="r_horasVeredito" value="${R.horasVeredito}"></label>
        <label class="f"><span>Gasto mín. (R$)</span><input type="number" id="r_gastoMin" value="${R.gastoMin}"></label>
        <label class="f"><span>ou vendas mín.</span><input type="number" id="r_vendasMin" value="${R.vendasMin}"></label>
        <label class="f"><span>ROAS segue ≥</span><input type="number" step="0.05" id="r_roasSegue" value="${R.roasSegue}"></label>
        <label class="f"><span>ROAS morre &lt;</span><input type="number" step="0.05" id="r_roasMorre" value="${R.roasMorre}"></label>
        <label class="f"><span>Vendas p/ vencedor</span><input type="number" id="r_vencedorVendas" value="${R.vencedorVendas}"></label>
        <label class="f"><span>Fadiga: queda</span><input type="number" step="0.05" id="r_fadigaQueda" value="${R.fadigaQueda}"></label>
        <label class="f"><span>Filhos por vencedor</span><input type="number" id="r_filhos" value="${R.filhos}"></label>
        <label class="f"><span>Dias p/ em risco</span><input type="number" id="r_diasRisco" value="${R.diasRisco}"></label>
      </div>
      <div class="fraco" style="font-size:12px">No ar há ≥ ${R.horasVeredito}h com ≥ R$${R.gastoMin} ou ≥ ${R.vendasMin} vendas: ROAS ≥ ${R.roasSegue} segue · &lt; ${R.roasMorre} morre · entre, pede variação.</div>
      <div class="row"><span class="grow"></span><button class="btn sm" id="r_ok">Salvar regras</button></div></div>
    </div>
    <div class="card"><header><h2>Agentes</h2></header>
      <div class="row"><button class="btn ghost sm" data-ag="analista">Rodar Analista agora</button><button class="btn ghost sm" data-ag="copy">Rodar Copy agora</button><button class="btn ghost sm" data-ag="veredito">Rodar veredito</button><button class="btn ghost sm" data-ag="religar">Religar</button></div>
      <div style="display:grid;gap:2px">${ult('ultimoVeredito', 'último veredito')}${ult('ultimoAnalista', 'último Analista')}${ult('ultimoCopy', 'último Copy')}</div>
      <div id="ag_out" style="font-size:12.5px"></div>
      <details style="margin-top:6px"><summary class="fraco" style="cursor:pointer;font-size:12px">Importar semente</summary>
        <div class="fraco" style="font-size:12px;margin:8px 0">CSVs com cabeçalho: ofertas (id, nome, familia, estado, prefixos, produtos), criativos (id, ofertaId, tipo, paiId, formato, status, noArEm, angulo, hook, aprendizado), vendas (id, criativoId, ofertaId, utmContent, valor, produto, pagoEm, reembolso), metricas (adId, dia, criativoId, gasto, impressoes, cliques, lpv, ic, video3s, video75).</div>
        <div class="f2"><label class="f"><span>ofertas.csv</span><input type="file" id="i_o" accept=".csv"></label><label class="f"><span>criativos.csv</span><input type="file" id="i_c" accept=".csv"></label><label class="f"><span>vendas.csv</span><input type="file" id="i_v" accept=".csv"></label><label class="f"><span>metricas.csv</span><input type="file" id="i_m" accept=".csv"></label></div>
        <div class="row" style="margin-top:8px"><button class="btn sm" id="i_ok">Importar</button><span id="i_res" style="font-size:12.5px"></span></div></details>
    </div>
  </div>`;
  const out = (sel, txt, erro) => { const el = $(sel); if (el) { el.textContent = txt; el.style.color = erro ? 'var(--verm)' : ''; } };
  if (M) {
    api('/api/cr/meta/contas').then((contas) => {
      const el = $('#m_contas'); if (!el) return;
      const ativas = new Set(S.d.contas.map(String));
      el.className = ''; el.innerHTML = `<div class="cap" style="margin-bottom:6px">Contas que entram no sync</div><div class="switches">${contas.map((c) => `<label class="sw ${ativas.has(String(c.id)) ? 'on' : ''}" data-c="${esc(c.id)}"><span class="k"></span><span>${esc(c.nome)} <small>${esc(c.id)} · ${esc(c.status)}${c.bm ? ' · ' + esc(c.bm) : ''}</small></span></label>`).join('') || '<span class="fraco">O token não enxerga nenhuma conta.</span>'}</div>`;
      $$('.sw', el).forEach((s) => s.onclick = async (e) => {
        e.preventDefault(); s.classList.toggle('on');
        const ids = $$('.sw.on', el).map((x) => x.dataset.c);
        const r = await acao(() => api('/api/cr/config', { method: 'POST', body: { contas: ids } }), 'Contas salvas.');
        if (r === undefined) s.classList.toggle('on'); else S.d.contas = ids;
      });
    }).catch((e) => out('#m_contas', e.message, true));
  }
  $('#m_con').onclick = async () => { const r = await acao(() => api('/api/cr/meta/conectar', { method: 'POST', body: { token: $('#m_tok').value.trim() } })); if (r !== undefined) { toast(`Meta conectada${r.usuario ? ' como ' + r.usuario : ''}.`); await recarregar(); route(); } };
  const sync = async (body) => {
    out('#m_res', 'sincronizando…');
    try { const r = await api('/api/cr/sync', { method: 'POST', body }); out('#m_res', r.segundoPlano ? `${r.desde} → ${r.ate}: ${r.aviso || 'rodando em segundo plano'}` : `${r.desde} → ${r.ate}: ${r.linhas} linhas, ${r.anuncios} anúncios, ${r.criados} criativos novos, ${r.semPar} sem par.`); await recarregar(); menu('ajustes'); }
    catch (e) { out('#m_res', e.message, true); }
  };
  $('#m_sync').onclick = () => sync({ dias: 3 });
  $('#m_hist').onclick = () => { const ate = $('#m_ate').value; if (!ate) return toast('Escolha a data final.', true); const d = new Date(ate + 'T12:00'); d.setDate(d.getDate() - 30); sync({ desde: d.toLocaleDateString('en-CA'), ate }); };
  $('#w_cop').onclick = async () => { try { await navigator.clipboard.writeText(S.d.webhook || ''); toast('URL copiada.'); } catch { toast('Não consegui copiar; selecione o texto.', true); } };
  $('#w_log').onclick = async () => { const l = await acao(() => api('/api/cr/log')); if (l) $('#w_out').innerHTML = `<div class="log">${l.map((x) => `<div>${fmtDH(x.em)} · <b>${esc(x.tipo)}</b> · ${esc(x.resumo || '')}</div>`).join('') || 'vazio'}</div>`; };
  $('#r_ok').onclick = async () => {
    const regras = Object.fromEntries(Object.keys(R).filter((k) => $('#r_' + k)).map((k) => [k, Number($('#r_' + k).value)]));
    const r = await acao(() => api('/api/cr/config', { method: 'POST', body: { regras } }), 'Regras salvas.');
    if (r !== undefined) { await recarregar(); route(); }
  };
  $$('[data-ag]').forEach((b) => b.onclick = async () => {
    const ag = b.dataset.ag; b.disabled = true; out('#ag_out', 'rodando…');
    try {
      const r = await api(`/api/cr/${ag}`, { method: 'POST' });
      out('#ag_out', r.aviso || (r.mudancas ? (r.mudancas.length ? r.mudancas.join(' · ') : 'Nenhuma mudança.') : r.ligados !== undefined ? `${r.ligados} ligados.` : 'Feito.'));
      await recarregar(); menu('ajustes');
    } catch (e) { out('#ag_out', e.message, true); }
    b.disabled = false;
  });
  $('#i_ok').onclick = async () => {
    const ler = async (sel) => { const f = $(sel).files[0]; return f ? parseCsv(await f.text()) : []; };
    out('#i_res', 'lendo…');
    try {
      const [ofertas, criativos, vendas, metricas] = await Promise.all([ler('#i_o'), ler('#i_c'), ler('#i_v'), ler('#i_m')]);
      const lista = (v) => { try { const j = JSON.parse(v); return Array.isArray(j) ? j : []; } catch { return String(v || '').split(',').map((x) => x.trim()).filter(Boolean); } };
      if (ofertas.length) await api('/api/cr/importar', { method: 'POST', body: { ofertas: ofertas.map((o) => ({ ...o, prefixos: lista(o.prefixos), produtos: lista(o.produtos) })) } });
      const tot = { criativos: 0, vendas: 0, metricas: 0, ignorados: 0 };
      for (let i = 0; i < Math.max(criativos.length, vendas.length, metricas.length, 1); i += 1500) {
        const r = await api('/api/cr/importar', { method: 'POST', body: { criativos: criativos.slice(i, i + 1500), vendas: vendas.slice(i, i + 1500), metricas: metricas.slice(i, i + 1500) } });
        for (const k of Object.keys(tot)) tot[k] += r[k] || 0;
        out('#i_res', `importando… ${tot.criativos} criativos, ${tot.vendas} vendas, ${tot.metricas} métricas`);
      }
      out('#i_res', `Pronto: ${tot.criativos} criativos, ${tot.vendas} vendas, ${tot.metricas} métricas (${tot.ignorados} ignorados).`);
      await recarregar(); menu('ajustes');
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
  return h ? body.map((r) => Object.fromEntries(h.map((k, i) => [k.trim(), r[i] ?? '']))) : [];
}

boot();


// ---------------------------------------------------------------- Ao vivo: a esteira andando (kanban que se move sozinho)
// Lê /api/cr/aovivo a cada 8 s e anima o card de uma coluna para a outra (FLIP) quando o status muda.
const VIVO_MS = 8000;
async function pageAoVivo() {
  clearInterval(pageAoVivo.t);
  $('#main').innerHTML = `<div class="vivo-top"><span class="muted">A esteira em tempo real: cada coluna é uma etapa, o nome embaixo é quem faz. Clique num card para abrir a ficha.</span><span class="grow"></span><span class="muted" id="vv_hora"></span></div>
    <div class="vivo-cols" id="vv_cols"></div>
    <div class="card" style="margin-top:16px"><header><h2>Últimos acontecimentos</h2></header><div class="log vivo-log" id="vv_log"></div></div>`;
  await tickAoVivo(true);
  pageAoVivo.t = setInterval(() => { if (rota().r === 'aovivo') tickAoVivo(false); else clearInterval(pageAoVivo.t); }, VIVO_MS);
}
const VARIAVEL_NOME = { hook_visual: 'hook visual', hook_falado: 'copy nova', body: 'body novo', formato: 'formato', angulo: 'ângulo novo', avatar: 'avatar', mecanismo: 'mecanismo', oferta: 'oferta', execucao: 'execução' };
async function tickAoVivo(primeira) {
  let d; try { d = await api('/api/cr/aovivo'); } catch (e) { $('#vv_hora').textContent = 'sem conexão: ' + e.message; return; }
  const antes = {}; $$('#vv_cols [data-vid]').forEach((el) => { antes[el.dataset.vid] = { col: el.closest('.vivo-col').dataset.col, rect: el.getBoundingClientRect() }; });
  S.vivo = d; menu(rota().r);
  const agora = Date.now();
  const min = (iso) => Math.max(0, Math.round((agora - new Date(iso).getTime()) / 60000));
  const tempo = (iso) => { const m = min(iso); return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`; };
  const porCol = Object.fromEntries(d.colunas.map((c) => [c.id, d.cards.filter((x) => x.status === c.id)]));
  $('#vv_cols').innerHTML = d.colunas.map((c) => {
    const cards = porCol[c.id].slice(0, 40);
    return `<div class="vivo-col" data-col="${c.id}"><div class="vivo-head"><span class="vdot ${c.ativo ? 'on' : ''}"></span><b>${esc(c.nome)}</b><span class="n">${porCol[c.id].length}</span><small>${esc(c.agente)}</small></div><div class="vivo-list">${cards.map((x) => `<div class="vivo-card ${x.status === 'briefing' ? 'escrevendo' : ''}" data-vid="${esc(x.id)}" data-ficha="${esc(x.id)}">
      <div class="vc-id">${esc(x.id)}${x.score != null ? `<span class="vc-nota ${x.score >= 8 ? 'g' : x.score >= 6 ? 'y' : 'r'}">${x.score}</span>` : ''}</div>
      <div class="vc-meta">${x.variavel ? `<span class="chip v-${esc(x.variavel)}">${esc(VARIAVEL_NOME[x.variavel] || x.variavel)}</span>` : ''}${x.paiId ? `<span class="muted">← ${esc(x.paiId)}</span>` : ''}</div>
      ${x.hook ? `<div class="vc-hook">${esc(x.hook)}</div>` : x.hipotese ? `<div class="vc-hook muted">${esc(x.hipotese)}</div>` : ''}
      <div class="vc-foot">${x.status === 'briefing' ? '<span class="typing"><i></i><i></i><i></i></span> escrevendo' : x.status === 'aprovado' ? (x.temProjeto ? 'projeto pronto · esperando o Editor' : '<span class="typing"><i></i><i></i><i></i></span> Criação montando o projeto') : esc(x.nota || '')} <span class="grow"></span>${tempo(x.em)}</div>
    </div>`).join('') || '<div class="vivo-vazio">—</div>'}${porCol[c.id].length > 40 ? `<div class="vivo-vazio">+${porCol[c.id].length - 40}</div>` : ''}</div></div>`;
  }).join('');
  $('#vv_hora').textContent = 'atualizado ' + new Date().toLocaleTimeString('pt-BR') + ' · a cada 8 s';
  $('#vv_log').innerHTML = (d.log || []).map((l) => `<div>${fmtDH(l.em)} · <b>${esc(l.tipo)}</b> · ${esc(l.resumo || '')}</div>`).join('');
  if (primeira) return;
  // FLIP: card que mudou de coluna voa da posição antiga para a nova; card novo entra deslizando.
  $$('#vv_cols [data-vid]').forEach((el) => {
    const a = antes[el.dataset.vid];
    if (!a) { el.classList.add('entrou'); return; }
    if (a.col === el.closest('.vivo-col').dataset.col) return;
    const b = el.getBoundingClientRect(); const dx = a.rect.left - b.left, dy = a.rect.top - b.top;
    el.style.transition = 'none'; el.style.transform = `translate(${dx}px,${dy}px)`; el.classList.add('voando');
    requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transition = 'transform .9s cubic-bezier(.2,.8,.2,1)'; el.style.transform = ''; setTimeout(() => el.classList.remove('voando'), 1000); }));
  });
}
