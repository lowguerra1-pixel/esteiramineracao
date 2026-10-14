// API da Esteira de Repertório.
// Um único handler (Request -> Response) usado pela função da Netlify e pelo servidor local (dev.mjs).
// Dados: Supabase (via REST). Vídeos: Google Drive do Kaian (OAuth, escopo drive.file).
import crypto from 'node:crypto';
import LISTAS from '../public/listas.mjs';
import { rotasOfertas } from './ofertas.mjs';

const env = (k) => process.env[k] || '';
const SUPABASE_URL = () => env('SUPABASE_URL').replace(/\/$/, '');
// drive.file: os vídeos do Swipe. spreadsheets: ler e escrever na planilha do Caçador (app Ofertas).
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets';

// ---------------------------------------------------------------- respostas
const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };

// ---------------------------------------------------------------- supabase
async function sb(path, { method = 'GET', body, prefer, raw = false } = {}) {
  if (!SUPABASE_URL() || !env('SUPABASE_SERVICE_ROLE_KEY')) fail(500, 'O Supabase ainda não foi configurado na Netlify (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY).');
  const r = await fetch(`${SUPABASE_URL()}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: env('SUPABASE_SERVICE_ROLE_KEY'),
      authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`,
      'content-type': 'application/json',
      ...(prefer ? { prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (raw) return r;
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) {
    if (data?.code === '23505') fail(409, 'Esse anúncio já está no Swipe. Escolha outro criativo.');
    fail(502, `Erro no banco de dados: ${data?.message || r.status}`);
  }
  return data;
}
const q = encodeURIComponent;

async function getConfig() {
  const rows = await sb('esteira_config?select=chave,valor');
  const c = Object.fromEntries(rows.map((r) => [r.chave, r.valor]));
  return { metaDiaria: 20, horarioLimite: '16:00', fuso: 'America/Sao_Paulo', modelo: 'claude-sonnet-5-5', ...c };
}
const setConfig = (chave, valor) => sb('esteira_config?on_conflict=chave', { method: 'POST', body: { chave, valor }, prefer: 'resolution=merge-duplicates' });

// ---------------------------------------------------------------- datas no fuso da equipe
function partesNoFuso(date, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(date).map((x) => [x.type, x.value]));
  return p;
}
const hojeNoFuso = (tz, d = new Date()) => { const p = partesNoFuso(d, tz); return `${p.year}-${p.month}-${p.day}`; };
function limiteDeHoje(tz, hhmm) {
  // Epoch (ms) do horário limite de hoje no fuso da equipe.
  const now = new Date();
  const p = partesNoFuso(now, tz);
  const comoUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const offset = comoUTC - Math.floor(now.getTime() / 1000) * 1000; // fuso em ms
  const [h, m] = String(hhmm).split(':').map(Number);
  return Date.UTC(p.year, p.month - 1, p.day, h, m || 0, 0) - offset;
}

// ---------------------------------------------------------------- auth (token assinado)
function segredo() {
  if (!env('APP_SECRET')) fail(500, 'Falta a variável APP_SECRET na Netlify.');
  return env('APP_SECRET');
}
function assinar(obj, validadeDias = 30) {
  const payload = Buffer.from(JSON.stringify({ ...obj, exp: Date.now() + validadeDias * 864e5 })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', segredo()).update(payload).digest('base64url');
}
function verificar(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, mac] = token.split('.');
  const bom = crypto.createHmac('sha256', segredo()).update(payload).digest('base64url');
  if (mac.length !== bom.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(bom))) return null;
  try { const o = JSON.parse(Buffer.from(payload, 'base64url').toString()); return o.exp > Date.now() ? o : null; } catch { return null; }
}
async function usuarioDoToken(req, url) {
  const t = (req.headers.get('authorization') || '').replace(/^Bearer /, '') || url.searchParams.get('t');
  const o = verificar(t);
  if (!o?.u) return null;
  const [u] = await sb(`esteira_usuarios?id=eq.${q(o.u)}&select=id,nome,papel`);
  return u ? { id: u.id, nome: u.nome, papel: u.papel } : null;
}

// ---------------------------------------------------------------- formato app <-> banco
const paraApp = (r) => ({
  id: r.id, numero: r.numero, data: r.data, criadoEm: r.criado_em, operador: r.operador, operadorNome: r.operador_nome,
  nicho: r.nicho, faixa: r.faixa, anunciante: r.anunciante, linkBiblioteca: r.link_biblioteca, formato: r.formato,
  hookVisual: r.hook_visual, retencao: r.retencao, impressoes: r.impressoes, ficha: r.ficha, video: r.video,
});
const CAMPOS = { nicho: 'nicho', faixa: 'faixa', anunciante: 'anunciante', linkBiblioteca: 'link_biblioteca', formato: 'formato', hookVisual: 'hook_visual', retencao: 'retencao', impressoes: 'impressoes', ficha: 'ficha' };

// ---------------------------------------------------------------- dissecação
function promptDissecacao() {
  const ang = Object.entries(LISTAS.angulos).map(([cat, l]) => `- ${cat}: ${l.join('; ')}`).join('\n');
  return `Você disseca criativos em vídeo para o Swipe de repertório. O objetivo é uma ficha curta, de bater o olho e conseguir modelar outro criativo.

Você recebe a TRANSCRIÇÃO do anúncio. Você só lê texto: NUNCA opine sobre formato, visual, cenário ou edição. Nada de tempos (3s, 8s). Use só as categorias abaixo, escritas exatamente assim; se nada encaixar, use "Não identificado". Frases curtas (até 12 palavras). Sem nota, sem elogio, sem crítica.

ÂNGULOS (sempre uma categoria e um ângulo desta lista):
${ang}

CATEGORIA DO GANCHO: Problema, Solução, Produto, Oferta, Genérico. Referência de consciência: Problema → Inconsciente ou Consciente do problema; Solução → Consciente do problema ou da solução; Produto → Consciente da solução ou do produto; Oferta → Consciente do produto ou Totalmente consciente; Genérico → depende do que segue.

AVATAR: Autoridade, Sonho, Espelho, Fundador. Só classifique se o texto deixar explícito quem fala; senão use "Operador define".
CONSCIÊNCIA: Inconsciente, Consciente do problema, Consciente da solução, Consciente do produto, Totalmente consciente.
EMOÇÕES (1 ou 2): Inveja, Ira, Luxúria, Avareza, Gula, Preguiça, Soberba.
BLOCOS DO BODY: Qualificador, Invalidação de soluções, Spoiler MUP, Spoiler MSOL, Reason Why, Aprofundamento de medos, Ponte para esperança, Descoberta científica, Apresentação Expert, Prova social, Future Pacing, Compra vs. Não compra, Inimigo comum, Escassez, Product Building, Contrarian, Superestrutura, Ancoragem de preço, Stack de valor, Demonstração do produto, CTA.

Responda APENAS com um JSON válido, sem texto antes ou depois, neste formato:
{
 "hook_literal": "primeira frase ou duas, palavra por palavra",
 "modelo_gancho": "o hook como template, trocando o específico por [colchetes]",
 "categoria_gancho": "Problema|Solução|Produto|Oferta|Genérico",
 "angulo_hook": {"categoria": "", "angulo": "", "ideia": ""},
 "angulo_body": {"categoria": "", "angulo": "", "ideia": ""},
 "avatar": "",
 "consciencia": "",
 "emocoes": [""],
 "esqueleto": [{"bloco": "", "funcao": "o que esse trecho faz, em poucas palavras"}]
}`;
}

const DEMO = {
  demo: true,
  hook_literal: 'As Radiestesistas estão substituindo seus materiais por radiestesia cigana…',
  modelo_gancho: '[Profissionais do nicho] estão substituindo [ferramenta atual] por [nova versão do método]…',
  categoria_gancho: 'Solução',
  angulo_hook: { categoria: 'Produto', angulo: 'Efeito manada qualificado', ideia: 'Colegas de profissão já estão migrando para o novo método' },
  angulo_body: { categoria: 'Solução', angulo: 'Mecanismo único', ideia: 'Radiestesia dentro de uma tradição, não energia genérica' },
  avatar: 'Operador define',
  consciencia: 'Consciente da solução',
  emocoes: ['Inveja', 'Preguiça'],
  esqueleto: [
    { bloco: 'Invalidação de soluções', funcao: 'O método comum mexe em energia sem nome e sem dono' },
    { bloco: 'Spoiler MSOL', funcao: 'O pêndulo caminha pelos oito setores da própria linha' },
    { bloco: 'Superestrutura', funcao: 'Método em 4 etapas: diagnóstico, causa, intensidade, correção' },
    { bloco: 'Stack de valor', funcao: 'Lista tudo que vem no kit' },
    { bloco: 'Prova social', funcao: 'Mais de 2.000 terapeutas já usam' },
    { bloco: 'Future Pacing', funcao: 'É PDF, imprime hoje e usa na próxima cliente' },
    { bloco: 'CTA', funcao: 'Clica em Saiba Mais' },
  ],
};

async function chamarClaude(transcricao, modelo) {
  const r = await fetch(env('ANTHROPIC_BASE_URL') || 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: modelo, max_tokens: 2000, system: promptDissecacao(), messages: [{ role: 'user', content: `TRANSCRIÇÃO:\n${transcricao}` }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `A API da IA respondeu ${r.status}`);
  const text = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('A IA não devolveu a ficha no formato esperado. Tente de novo.');
  return JSON.parse(m[0]);
}

// A dissecação leva de 10 a 30 s. Resposta em streaming (limite de 60 s na Netlify):
// manda espaços enquanto espera e, no fim, o JSON. Espaços antes do JSON não atrapalham o parse.
function dissecarStream(transcricao, modelo) {
  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(ctrl) {
      const tick = setInterval(() => ctrl.enqueue(enc.encode(' ')), 4000);
      try {
        const ficha = env('ANTHROPIC_API_KEY') ? await chamarClaude(transcricao, modelo) : DEMO;
        ctrl.enqueue(enc.encode(JSON.stringify(ficha)));
      } catch (e) {
        ctrl.enqueue(enc.encode(JSON.stringify({ erro: e.message })));
      } finally {
        clearInterval(tick); ctrl.close();
      }
    },
  });
  return new Response(body, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

// ---------------------------------------------------------------- google drive
let tokenCache = null;
async function googleAccessToken() {
  if (tokenCache && tokenCache.exp > Date.now() + 60e3) return tokenCache.token;
  const cfg = await getConfig();
  if (!cfg.googleRefreshToken) fail(409, 'O Google Drive ainda não foi conectado. O Kaian conecta em Ajustes.');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), refresh_token: cfg.googleRefreshToken, grant_type: 'refresh_token' }),
  });
  const j = await r.json();
  if (!r.ok) fail(502, `O Google recusou o acesso ao Drive (${j.error || r.status}). Conecte o Drive de novo em Ajustes.`);
  tokenCache = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return tokenCache.token;
}
async function drive(path, { method = 'GET', body, headers = {} } = {}) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    method, headers: { authorization: `Bearer ${await googleAccessToken()}`, ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) fail(502, `Erro no Google Drive: ${j?.error?.message || r.status}`);
  return j;
}
async function pasta(nome, paiId) {
  const qs = `name='${nome.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false` + (paiId ? ` and '${paiId}' in parents` : '');
  const { files } = await drive(`files?q=${q(qs)}&fields=files(id)&pageSize=1`);
  if (files?.[0]) return files[0].id;
  const f = await drive('files?fields=id', { method: 'POST', body: { name: nome, mimeType: 'application/vnd.google-apps.folder', ...(paiId ? { parents: [paiId] } : {}) } });
  return f.id;
}
async function pastaDoMes(data) {
  const cfg = await getConfig();
  let raiz = cfg.drivePastaRaiz;
  if (!raiz) { raiz = await pasta('Esteira de Repertório'); await setConfig('drivePastaRaiz', raiz); }
  return pasta(data.slice(0, 7), raiz);
}
const slug = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 40) || 'sem-nicho';

// ---------------------------------------------------------------- csv
function csv(lista) {
  const cols = [
    ['ID', (c) => c.id], ['Data', (c) => c.data], ['Operador', (c) => c.operadorNome], ['Nicho', (c) => c.nicho], ['Faixa', (c) => c.faixa],
    ['Anunciante / oferta', (c) => c.anunciante], ['Link Biblioteca', (c) => c.linkBiblioteca], ['Vídeo no Drive', (c) => c.video?.link],
    ['Formato', (c) => c.formato], ['Hook visual', (c) => c.hookVisual], ['Retenção', (c) => c.retencao], ['Impressões', (c) => c.impressoes],
    ['Hook literal', (c) => c.ficha?.hook_literal], ['Modelo do gancho', (c) => c.ficha?.modelo_gancho], ['Categoria do gancho', (c) => c.ficha?.categoria_gancho],
    ['Ângulo do hook', (c) => c.ficha?.angulo_hook && `${c.ficha.angulo_hook.categoria} · ${c.ficha.angulo_hook.angulo}`],
    ['Ângulo do body', (c) => c.ficha?.angulo_body && `${c.ficha.angulo_body.categoria} · ${c.ficha.angulo_body.angulo}`],
    ['Avatar', (c) => c.ficha?.avatar], ['Consciência', (c) => c.ficha?.consciencia], ['Emoção', (c) => (c.ficha?.emocoes || []).join(', ')],
    ['Estrutura invisível', (c) => (c.ficha?.esqueleto || []).map((b) => b.bloco).join(' → ')],
    ['Esqueleto', (c) => (c.ficha?.esqueleto || []).map((b, i) => `${i + 1}. ${b.bloco}: ${b.funcao}`).join('\n')],
    ['Transcrição', (c) => c.ficha?.transcricao_limpa],
  ];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return '\ufeff' + [cols.map((c) => esc(c[0])).join(','), ...lista.map((c) => cols.map(([, f]) => esc(f(c))).join(','))].join('\n');
}

// ---------------------------------------------------------------- rotas
async function rotear(req) {
  const url = new URL(req.url);
  const p = decodeURIComponent(url.pathname).replace(/\/+$/, '');
  const m = req.method;
  const body = async () => { try { return await req.json(); } catch { return {}; } };

  if (p === '/api/usuarios' && m === 'GET') return json(200, (await sb('esteira_usuarios?select=id,nome,papel&order=papel.desc,nome.asc')).map(({ id, nome, papel }) => ({ id, nome, papel })));
  if (p === '/api/login' && m === 'POST') {
    const { id, pin } = await body();
    const [u] = await sb(`esteira_usuarios?id=eq.${q(id || '')}&select=id,nome,papel,pin`);
    if (!u || String(u.pin) !== String(pin)) fail(401, 'PIN incorreto.');
    return json(200, { token: assinar({ u: u.id }), usuario: { id: u.id, nome: u.nome, papel: u.papel } });
  }

  // Volta do Google depois de autorizar o Drive.
  if (p === '/api/google/callback' && m === 'GET') {
    const st = verificar(url.searchParams.get('state'));
    if (!st?.google) return new Response('Link expirado. Volte em Ajustes e clique em Conectar Google Drive de novo.', { status: 400 });
    const volta = st.volta === 'ofertas' ? '/ofertas/#/ajustes' : '/esteira/#/ajustes';
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: url.searchParams.get('code') || '', client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), redirect_uri: `${url.origin}/api/google/callback`, grant_type: 'authorization_code' }),
    });
    const j = await r.json();
    if (!r.ok || !j.refresh_token) return Response.redirect(`${url.origin}${volta}?drive=erro`, 302);
    await setConfig('googleRefreshToken', j.refresh_token);
    await setConfig('googleEscopos', j.scope || '');
    tokenCache = null;
    return Response.redirect(`${url.origin}${volta}?drive=ok`, 302);
  }

  const user = await usuarioDoToken(req, url);
  if (!user) fail(401, 'Faça login de novo.');
  const admin = user.papel === 'admin';

  if (p.startsWith('/api/ofertas')) {
    return rotasOfertas(p, m, { sb, json, fail, q, user, admin, body, getConfig, setConfig, googleAccessToken });
  }

  if (p === '/api/eu') return json(200, { usuario: user, modoDemo: !env('ANTHROPIC_API_KEY') });

  if (p === '/api/listas' && m === 'GET') {
    const rows = await sb('esteira_listas?select=tipo,valor&order=criado_em.asc');
    return json(200, { nichos: rows.filter((r) => r.tipo === 'nicho').map((r) => r.valor), formatosExtras: rows.filter((r) => r.tipo === 'formato').map((r) => r.valor) });
  }
  if (p === '/api/listas/item' && m === 'POST') {
    const { lista, valor } = await body();
    const v = String(valor || '').trim();
    if (!v) fail(400, 'Escreva um nome.');
    if (!['nicho', 'formato'].includes(lista)) fail(400, 'Lista desconhecida.');
    await sb('esteira_listas?on_conflict=tipo,valor', { method: 'POST', body: { tipo: lista, valor: v }, prefer: 'resolution=ignore-duplicates' });
    return json(200, { ok: true, valor: v });
  }

  if (p === '/api/stats') {
    const cfg = await getConfig();
    const hoje = hojeNoFuso(cfg.fuso);
    const dias = Array.from({ length: 7 }, (_, i) => hojeNoFuso(cfg.fuso, new Date(Date.now() - (6 - i) * 864e5)));
    const [ops, rows, total] = await Promise.all([
      sb('esteira_usuarios?papel=eq.operador&select=id,nome&order=nome.asc'),
      sb(`esteira_criativos?data=gte.${dias[0]}&select=operador,faixa,data`),
      sb('esteira_criativos?select=id', { raw: true, prefer: 'count=exact' }).then((r) => Number((r.headers.get('content-range') || '/0').split('/')[1]) || 0),
    ]);
    const doDia = rows.filter((c) => c.data === hoje);
    const faixas = { Core: 0, Adjacente: 0, 'Aleatório': 0 };
    doDia.forEach((c) => { if (faixas[c.faixa] !== undefined) faixas[c.faixa]++; });
    return json(200, {
      hoje, total: doDia.length, metaTotal: cfg.metaDiaria * ops.length, faixas, totalSwipe: total,
      horarioLimite: cfg.horarioLimite, limiteEpoch: limiteDeHoje(cfg.fuso, cfg.horarioLimite),
      porUsuario: ops.map((u) => ({ id: u.id, nome: u.nome, feitos: doDia.filter((c) => c.operador === u.id).length, meta: cfg.metaDiaria })),
      dias: dias.map((d) => ({ data: d, porUsuario: ops.map((u) => ({ id: u.id, n: rows.filter((c) => c.data === d && c.operador === u.id).length })) })),
    });
  }

  if (p === '/api/dissecar' && m === 'POST') {
    const { transcricao } = await body();
    if (!transcricao || transcricao.trim().length < 20) fail(400, 'A transcrição está vazia ou curta demais.');
    const cfg = await getConfig();
    return dissecarStream(transcricao.trim().slice(0, 20000), cfg.modelo);
  }

  if (p === '/api/criativos' && m === 'GET') return json(200, (await sb('esteira_criativos?select=*&order=numero.desc&limit=5000')).map(paraApp));

  if (p === '/api/criativos' && m === 'POST') {
    const b = await body();
    const faltando = [['nicho', 'nicho'], ['faixa', 'faixa 80/10/10'], ['linkBiblioteca', 'link da Biblioteca'], ['formato', 'formato'], ['hookVisual', 'hook visual'], ['retencao', 'retenção']]
      .filter(([k]) => !String(b[k] || '').trim()).map(([, n]) => n);
    if (!b.ficha) faltando.push('dissecação');
    if (faltando.length) fail(400, `Falta preencher: ${faltando.join(', ')}.`);
    const link = b.linkBiblioteca.trim();
    if ((await sb(`esteira_criativos?link_biblioteca=eq.${q(link)}&select=id`)).length) fail(409, 'Esse anúncio já está no Swipe. Escolha outro criativo.');
    const cfg = await getConfig();
    // O número sai de uma sequência do banco: dois cadastros ao mesmo tempo nunca recebem o mesmo ID.
    const numero = await sb('rpc/esteira_proximo_numero', { method: 'POST', body: {} });
    const row = {
      id: 'SW-' + String(numero).padStart(4, '0'), numero, data: hojeNoFuso(cfg.fuso), operador: user.id, operador_nome: user.nome,
      nicho: b.nicho.trim(), faixa: b.faixa, anunciante: (b.anunciante || '').trim(), link_biblioteca: link, formato: b.formato.trim(),
      hook_visual: b.hookVisual.trim(), retencao: b.retencao.trim(), impressoes: (b.impressoes || '').trim(), ficha: b.ficha,
    };
    const [criado] = await sb('esteira_criativos', { method: 'POST', body: row, prefer: 'return=representation' });
    return json(201, paraApp(criado));
  }

  const mSessao = p.match(/^\/api\/criativos\/(SW-\d+)\/video-sessao$/);
  if (mSessao && m === 'POST') {
    const [c] = await sb(`esteira_criativos?id=eq.${mSessao[1]}&select=*`);
    if (!c) fail(404, 'Criativo não encontrado.');
    if (!admin && c.operador !== user.id) fail(403, 'Só quem cadastrou pode enviar o vídeo.');
    const { nome: nomeArquivo = 'video.mp4', tipo = 'video/mp4', tamanho } = await body();
    const ext = (nomeArquivo.match(/\.[\w]+$/)?.[0] || '.mp4').toLowerCase();
    const nome = `${c.id} · ${slug(c.nicho)} · ${c.operador_nome.split(' ')[0]}${ext}`;
    const parent = await pastaDoMes(c.data);
    // Sessão de upload resumível: o navegador manda o vídeo direto para o Google (sem passar pelo limite da Netlify).
    const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${await googleAccessToken()}`, 'content-type': 'application/json; charset=UTF-8',
        'x-upload-content-type': tipo, ...(tamanho ? { 'x-upload-content-length': String(tamanho) } : {}),
        origin: req.headers.get('origin') || url.origin,
      },
      body: JSON.stringify({ name: nome, parents: [parent], appProperties: { criativo: c.id } }),
    });
    if (!r.ok) fail(502, `O Google Drive recusou o envio (${r.status}).`);
    return json(200, { uploadUrl: r.headers.get('location'), nome });
  }

  const mOk = p.match(/^\/api\/criativos\/(SW-\d+)\/video-ok$/);
  if (mOk && m === 'POST') {
    const id = mOk[1];
    let { fileId } = await body();
    if (!fileId) {
      const { files } = await drive(`files?q=${q(`appProperties has { key='criativo' and value='${id}' } and trashed=false`)}&fields=files(id)`);
      fileId = files?.[0]?.id;
    }
    if (!fileId) fail(404, 'O vídeo não apareceu no Drive. Tente enviar de novo.');
    // Qualquer pessoa com o link vê (são anúncios públicos da Biblioteca); assim o player funciona para todos.
    await drive(`files/${fileId}/permissions`, { method: 'POST', body: { role: 'reader', type: 'anyone' } });
    const f = await drive(`files/${fileId}?fields=id,name,webViewLink,size`);
    const video = { driveId: f.id, nome: f.name, link: f.webViewLink, bytes: Number(f.size) || null };
    const [c] = await sb(`esteira_criativos?id=eq.${id}`, { method: 'PATCH', body: { video }, prefer: 'return=representation' });
    return json(200, paraApp(c));
  }

  const mOne = p.match(/^\/api\/criativos\/(SW-\d+)$/);
  if (mOne && m === 'PATCH') {
    const [c] = await sb(`esteira_criativos?id=eq.${mOne[1]}&select=operador`);
    if (!c) fail(404, 'Criativo não encontrado.');
    if (!admin && c.operador !== user.id) fail(403, 'Só quem cadastrou (ou o Kaian) pode editar.');
    const b = await body();
    const patch = Object.fromEntries(Object.entries(CAMPOS).filter(([k]) => b[k] !== undefined).map(([k, col]) => [col, b[k]]));
    const [novo] = await sb(`esteira_criativos?id=eq.${mOne[1]}`, { method: 'PATCH', body: patch, prefer: 'return=representation' });
    return json(200, paraApp(novo));
  }

  if (p === '/api/export.csv') {
    const lista = (await sb('esteira_criativos?select=*&order=numero.asc')).map(paraApp);
    return new Response(csv(lista), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="swipe-${new Date().toISOString().slice(0, 10)}.csv"` } });
  }

  // ---- ajustes (só o gestor)
  if (p === '/api/config' && m === 'GET') {
    if (!admin) fail(403, 'Só o gestor vê os ajustes.');
    const cfg = await getConfig();
    return json(200, {
      temChave: !!env('ANTHROPIC_API_KEY'), modelo: cfg.modelo, metaDiaria: cfg.metaDiaria, horarioLimite: cfg.horarioLimite, fuso: cfg.fuso,
      googleConfigurado: !!(env('GOOGLE_CLIENT_ID') && env('GOOGLE_CLIENT_SECRET')), driveConectado: !!cfg.googleRefreshToken,
      redirectUri: `${url.origin}/api/google/callback`,
      usuarios: await sb('esteira_usuarios?select=id,nome,pin,papel&order=papel.desc,nome.asc'),
    });
  }
  if (p === '/api/config' && m === 'POST') {
    if (!admin) fail(403, 'Só o gestor muda os ajustes.');
    const b = await body();
    for (const k of ['modelo', 'horarioLimite', 'fuso']) if (typeof b[k] === 'string' && b[k].trim()) await setConfig(k, b[k].trim());
    if (b.fuso) { try { new Intl.DateTimeFormat('en', { timeZone: b.fuso }); } catch { fail(400, 'Fuso horário inválido. Ex.: America/Sao_Paulo'); } }
    if (Number(b.metaDiaria) > 0) await setConfig('metaDiaria', Number(b.metaDiaria));
    for (const u of b.usuarios || []) if (String(u.pin || '').trim()) await sb(`esteira_usuarios?id=eq.${q(u.id)}`, { method: 'PATCH', body: { pin: String(u.pin).trim() } });
    return json(200, { ok: true });
  }
  if (p === '/api/google/conectar' && m === 'GET') {
    if (!admin) fail(403, 'Só o gestor conecta o Drive.');
    if (!env('GOOGLE_CLIENT_ID')) fail(500, 'Faltam GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET na Netlify.');
    const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    auth.search = new URLSearchParams({
      client_id: env('GOOGLE_CLIENT_ID'), redirect_uri: `${url.origin}/api/google/callback`, response_type: 'code',
      scope: GOOGLE_SCOPE, access_type: 'offline', include_granted_scopes: 'true', prompt: 'consent', state: assinar({ google: true, volta: url.searchParams.get('volta') || '' }, 1 / 96),
    });
    return Response.redirect(auth.toString(), 302);
  }

  fail(404, 'Rota não encontrada.');
}

export async function handler(req) {
  try { return await rotear(req); }
  catch (e) {
    if (e instanceof HttpError) return json(e.status, { erro: e.message });
    console.error(e);
    return json(500, { erro: e.message || 'Erro inesperado.' });
  }
}
