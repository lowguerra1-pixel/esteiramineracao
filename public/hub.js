// Hub da Kaian Digital: a porta de entrada para os apps (Esteira, Ofertas e os próximos).
// Mesmo login de todos os apps (o token fica salvo neste navegador).

// Para incluir um app novo, acrescente uma linha aqui.
const APPS = [
  { id: 'esteira', nome: 'Esteira de Repertório', href: '/esteira/', desc: 'Minerar, dissecar e guardar no Swipe os criativos escalados.', status: statusEsteira },
  { id: 'ofertas', nome: 'Ofertas', href: '/ofertas/', desc: 'Da mineração ao teste, com o Caçador e o placar de acerto.', status: statusOfertas },
  { id: 'testes', nome: 'Testes A/B', href: '/testes/', desc: 'Duas páginas, um link só, e cada venda dizendo de qual página veio.', status: statusTestes },
];

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let token = localStorage.getItem('esteira.token') || '';

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.className = 'show erro'; clearTimeout(toast.h); toast.h = setTimeout(() => (t.className = ''), 5000); }
async function api(path, opts = {}) {
  const r = await fetch(path, { method: opts.method || 'GET', headers: { ...(opts.body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/api/login') { sair(); throw new Error('Faça login de novo.'); }
  if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
  return j;
}
function sair() { token = ''; localStorage.removeItem('esteira.token'); login(); }

async function statusEsteira() {
  const s = await api('/api/stats');
  const min = Math.round((s.limiteEpoch - Date.now()) / 60000);
  return [`<b>${s.total}</b> de ${s.metaTotal} criativos hoje`, min > 0 ? `prazo às ${esc(s.horarioLimite)}` : `prazo das ${esc(s.horarioLimite)} passou`];
}
async function statusOfertas() {
  const l = await api('/api/ofertas');
  const hoje = new Date().toLocaleDateString('en-CA');
  const triar = l.filter((o) => o.status === 'caixa' || (o.status === 'monitorar' && o.monitorarAte <= hoje)).length;
  const teste = l.filter((o) => o.status === 'teste').length;
  const rodando = l.filter((o) => ['otimizar', 'escala', 'manutencao'].includes(o.status)).length;
  return [`<b>${triar}</b> para triar`, `${teste} em teste, ${rodando} rodando`];
}

async function statusTestes() {
  const l = await api('/api/testes');
  const rodando = l.filter((t) => t.status === 'ativo');
  const venc = rodando.filter((t) => t.placar?.veredito?.tipo === 'vencedora').length;
  return [`<b>${rodando.length}</b> ${rodando.length === 1 ? 'teste rodando' : 'testes rodando'}`, venc ? `${venc} com vencedora` : `${l.filter((t) => t.status === 'encerrado').length} encerrados`];
}

async function login() {
  const users = await api('/api/usuarios');
  let sel = users.find((u) => u.papel === 'admin')?.id || users[0]?.id;
  $('#app').innerHTML = `
  <div class="login"><div class="login-box">
    <h1 class="hub-mark">Kaian Digital</h1>
    <p class="lede">Entre para abrir os apps da operação.</p>
    <div class="people">${users.map((u) => `<button class="person ${u.id === sel ? 'on' : ''}" data-id="${u.id}"><span><b>${esc(u.nome)}</b></span><small>${u.papel === 'admin' ? 'Gestor' : 'Operador'}</small></button>`).join('')}</div>
    <form id="lf" class="stack"><label class="f"><span>PIN</span><input type="password" id="pin" inputmode="numeric" autocomplete="current-password" autofocus></label><button class="btn big">Entrar</button></form>
  </div></div>`;
  $$('.person').forEach((b) => b.onclick = () => { sel = b.dataset.id; $$('.person').forEach((x) => x.classList.toggle('on', x === b)); $('#pin').focus(); });
  $('#lf').onsubmit = async (e) => {
    e.preventDefault();
    try { const r = await api('/api/login', { method: 'POST', body: { id: sel, pin: $('#pin').value } }); token = r.token; localStorage.setItem('esteira.token', token); hub(); }
    catch (err) { toast(err.message); $('#pin').select(); }
  };
}

async function hub() {
  if (!token) return login();
  let eu;
  try { eu = (await api('/api/eu')).usuario; } catch { return; }
  const h = new Date().getHours();
  const saud = h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const data = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#app').innerHTML = `
  <div class="hub">
    <header class="hub-top">
      <div class="hub-mark">Kaian Digital</div>
      <div class="hub-who">${esc(eu.nome)} <button class="linkbtn" id="sair">Sair</button></div>
    </header>
    <p class="hub-hello">${saud}, ${esc(eu.nome.split(' ')[0])}. <span>${data.charAt(0).toUpperCase() + data.slice(1)}.</span></p>
    <nav class="hub-apps" aria-label="Apps">
      ${APPS.map((a) => `<a class="hub-app" href="${a.href}">
        <span class="hub-name"><span>${esc(a.nome)}</span></span>
        <span class="hub-desc">${esc(a.desc)}</span>
        <span class="hub-status" id="st-${a.id}"><span class="muted">…</span></span>
      </a>`).join('')}
    </nav>
    <p class="hub-foot">Cada app novo da operação entra nesta lista.</p>
  </div>`;
  $('#sair').onclick = sair;
  APPS.forEach(async (a) => {
    try { const [l1, l2] = await a.status(); $(`#st-${a.id}`).innerHTML = `<span>${l1}</span><span class="muted">${l2}</span>`; }
    catch { $(`#st-${a.id}`).innerHTML = ''; }
  });
}

hub();
