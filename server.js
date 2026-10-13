// Esteira de Repertório: servidor local, sem dependências (Node 18+).
// Rode com: node server.js   e abra http://localhost:4747
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = Number(process.env.PORT || 4747);
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA, 'db.json');
const CONFIG_FILE = path.join(DATA, 'config.json');

fs.mkdirSync(DATA, { recursive: true });

// ---------------------------------------------------------------- config / db
const DEFAULT_CONFIG = {
  segredo: crypto.randomBytes(24).toString('hex'),
  anthropicKey: '',
  modelo: 'claude-sonnet-5-5',
  pastaVideos: './data/videos',
  metaDiaria: 20,
  horarioLimite: '16:00',
  usuarios: [
    { id: 'joao', nome: 'João Guerra', pin: '1111', papel: 'operador' },
    { id: 'jeff', nome: 'Jeff Figueredo', pin: '2222', papel: 'operador' },
    { id: 'kaian', nome: 'Kaian', pin: '0000', papel: 'admin' },
  ],
};
const DEFAULT_DB = {
  proximoNumero: 1,
  criativos: [],
  nichos: ['Psicologia / Terapia', 'Espiritualidade / Holístico', 'Relacionamento', 'Desenvolvimento pessoal', 'Saúde / Emagrecimento', 'Renda extra', 'Outro'],
  formatosExtras: [],
};

function readJson(file, fallback) {
  try { return { ...fallback, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; }
  catch { return JSON.parse(JSON.stringify(fallback)); }
}
function writeJson(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}
let config = readJson(CONFIG_FILE, DEFAULT_CONFIG);
if (!fs.existsSync(CONFIG_FILE)) writeJson(CONFIG_FILE, config);
let db = readJson(DB_FILE, DEFAULT_DB);
const saveDb = () => writeJson(DB_FILE, db);
const saveConfig = () => writeJson(CONFIG_FILE, config);
const pastaVideos = () => path.resolve(ROOT, config.pastaVideos.replace(/^~(?=$|\/)/, os.homedir()));

// ---------------------------------------------------------------- auth
function sign(userId) {
  const payload = Buffer.from(JSON.stringify({ u: userId, t: Date.now() })).toString('base64url');
  const mac = crypto.createHmac('sha256', config.segredo).update(payload).digest('base64url');
  return payload + '.' + mac;
}
function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, mac] = token.split('.');
  const good = crypto.createHmac('sha256', config.segredo).update(payload).digest('base64url');
  if (mac.length !== good.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(good))) return null;
  try {
    const { u } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return config.usuarios.find((x) => x.id === u) || null;
  } catch { return null; }
}
const publicUser = (u) => u && { id: u.id, nome: u.nome, papel: u.papel };

// ---------------------------------------------------------------- helpers
function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  const data = isBuf || typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': isBuf || typeof body === 'string' ? headers['Content-Type'] || 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(data);
}
function readBody(req, limit = 5e6) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('Corpo grande demais')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJsonBody(req) {
  const b = await readBody(req);
  try { return JSON.parse(b.toString() || '{}'); } catch { throw new Error('JSON inválido'); }
}
const hoje = (d = new Date()) => d.toLocaleDateString('sv-SE'); // YYYY-MM-DD local
const slug = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 40) || 'sem-nicho';

// ---------------------------------------------------------------- dissecação
const LISTAS = (() => {
  const src = fs.readFileSync(path.join(PUBLIC, 'listas.js'), 'utf8');
  return JSON.parse(src.replace(/^window\.LISTAS=/, '').replace(/;\s*$/, ''));
})();

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
 "esqueleto": [{"bloco": "", "funcao": "o que esse trecho faz, em poucas palavras"}],
 "transcricao_limpa": "a transcrição completa, só corrigindo erros óbvios de transcrição"
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
  transcricao_limpa: null,
};

async function dissecar(transcricao) {
  if (!config.anthropicKey) return { ...DEMO, transcricao_limpa: transcricao };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': config.anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: config.modelo,
      max_tokens: 4000,
      system: promptDissecacao(),
      messages: [{ role: 'user', content: `TRANSCRIÇÃO:\n${transcricao}` }],
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `A API respondeu ${r.status}`);
  const text = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('A IA não devolveu a ficha no formato esperado. Tente de novo.');
  const out = JSON.parse(m[0]);
  if (!out.transcricao_limpa) out.transcricao_limpa = transcricao;
  return out;
}

// ---------------------------------------------------------------- stats
function stats() {
  const d = hoje();
  const doDia = db.criativos.filter((c) => c.data === d);
  const operadores = config.usuarios.filter((u) => u.papel === 'operador');
  const porUsuario = operadores.map((u) => ({ id: u.id, nome: u.nome, feitos: doDia.filter((c) => c.operador === u.id).length, meta: config.metaDiaria }));
  const faixas = { Core: 0, Adjacente: 0, 'Aleatório': 0 };
  doDia.forEach((c) => { if (faixas[c.faixa] !== undefined) faixas[c.faixa]++; });
  const dias = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(); dt.setDate(dt.getDate() - i);
    const k = hoje(dt);
    dias.push({ data: k, porUsuario: operadores.map((u) => ({ id: u.id, n: db.criativos.filter((c) => c.data === k && c.operador === u.id).length })) });
  }
  return { hoje: d, porUsuario, total: doDia.length, metaTotal: config.metaDiaria * operadores.length, faixas, dias, horarioLimite: config.horarioLimite, totalSwipe: db.criativos.length };
}

// ---------------------------------------------------------------- csv
function csv() {
  const cols = [
    ['ID', (c) => c.id], ['Data', (c) => c.data], ['Operador', (c) => c.operadorNome], ['Nicho', (c) => c.nicho], ['Faixa', (c) => c.faixa],
    ['Anunciante / oferta', (c) => c.anunciante], ['Link Biblioteca', (c) => c.linkBiblioteca], ['Vídeo', (c) => c.video?.caminho],
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
  return '\ufeff' + [cols.map((c) => esc(c[0])).join(','), ...db.criativos.map((c) => cols.map(([, f]) => esc(f(c))).join(','))].join('\n');
}

// ---------------------------------------------------------------- static / video
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.m4v': 'video/mp4' };
function serveFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Não encontrado');
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      const start = m[1] ? Number(m[1]) : 0;
      const end = m[2] ? Number(m[2]) : st.size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(file).pipe(res);
  });
}

// ---------------------------------------------------------------- routes
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = decodeURIComponent(url.pathname);
  try {
    if (!p.startsWith('/api/') && !p.startsWith('/videos/')) {
      const file = path.join(PUBLIC, p === '/' ? 'index.html' : p);
      if (!file.startsWith(PUBLIC)) return send(res, 403, 'Proibido');
      return serveFile(req, res, file);
    }

    if (p === '/api/usuarios' && req.method === 'GET') return send(res, 200, config.usuarios.map(publicUser));
    if (p === '/api/login' && req.method === 'POST') {
      const { id, pin } = await readJsonBody(req);
      const u = config.usuarios.find((x) => x.id === id && String(x.pin) === String(pin));
      if (!u) return send(res, 401, { erro: 'PIN incorreto.' });
      return send(res, 200, { token: sign(u.id), usuario: publicUser(u) });
    }

    const tokenQ = url.searchParams.get('t');
    const user = verify((req.headers.authorization || '').replace(/^Bearer /, '') || tokenQ);
    if (!user) return send(res, 401, { erro: 'Faça login de novo.' });
    const admin = user.papel === 'admin';

    if (p.startsWith('/videos/')) {
      const c = db.criativos.find((x) => x.id === p.slice(8));
      if (!c?.video?.caminho) return send(res, 404, 'Sem vídeo');
      return serveFile(req, res, c.video.caminho);
    }

    if (p === '/api/eu') return send(res, 200, { usuario: publicUser(user), modoDemo: !config.anthropicKey });
    if (p === '/api/listas') return send(res, 200, { nichos: db.nichos, formatosExtras: db.formatosExtras });
    if (p === '/api/listas/item' && req.method === 'POST') {
      const { lista, valor } = await readJsonBody(req);
      const v = String(valor || '').trim();
      if (!v) return send(res, 400, { erro: 'Escreva um nome.' });
      const arr = lista === 'nicho' ? db.nichos : lista === 'formato' ? db.formatosExtras : null;
      if (!arr) return send(res, 400, { erro: 'Lista desconhecida.' });
      if (!arr.some((x) => x.toLowerCase() === v.toLowerCase())) { arr.push(v); saveDb(); }
      return send(res, 200, { ok: true, valor: v });
    }
    if (p === '/api/stats') return send(res, 200, stats());

    if (p === '/api/dissecar' && req.method === 'POST') {
      const { transcricao } = await readJsonBody(req);
      if (!transcricao || transcricao.trim().length < 20) return send(res, 400, { erro: 'A transcrição está vazia ou curta demais.' });
      return send(res, 200, await dissecar(transcricao.trim()));
    }

    if (p === '/api/criativos' && req.method === 'GET') return send(res, 200, [...db.criativos].reverse());

    if (p === '/api/criativos' && req.method === 'POST') {
      const b = await readJsonBody(req);
      const faltando = [['nicho', 'nicho'], ['faixa', 'faixa 80/10/10'], ['linkBiblioteca', 'link da Biblioteca'], ['formato', 'formato'], ['hookVisual', 'hook visual'], ['retencao', 'retenção']]
        .filter(([k]) => !String(b[k] || '').trim()).map(([, n]) => n);
      if (!b.ficha) faltando.push('dissecação');
      if (faltando.length) return send(res, 400, { erro: `Falta preencher: ${faltando.join(', ')}.` });
      if (b.linkBiblioteca && db.criativos.some((c) => c.linkBiblioteca === b.linkBiblioteca.trim()))
        return send(res, 409, { erro: 'Esse anúncio já está no Swipe. Escolha outro criativo.' });
      // O número sai daqui, num processo único: dois cadastros nunca recebem o mesmo ID.
      const id = 'SW-' + String(db.proximoNumero++).padStart(4, '0');
      const c = {
        id, data: hoje(), criadoEm: new Date().toISOString(), operador: user.id, operadorNome: user.nome,
        nicho: b.nicho.trim(), faixa: b.faixa, anunciante: (b.anunciante || '').trim(), linkBiblioteca: b.linkBiblioteca.trim(),
        formato: b.formato.trim(), hookVisual: b.hookVisual.trim(), retencao: b.retencao.trim(), impressoes: (b.impressoes || '').trim(),
        ficha: b.ficha, video: null,
      };
      db.criativos.push(c); saveDb();
      return send(res, 201, c);
    }

    const mVideo = p.match(/^\/api\/criativos\/(SW-\d+)\/video$/);
    if (mVideo && req.method === 'PUT') {
      const c = db.criativos.find((x) => x.id === mVideo[1]);
      if (!c) return send(res, 404, { erro: 'Criativo não encontrado.' });
      const ext = (path.extname(decodeURIComponent(req.headers['x-filename'] || '')) || '.mp4').toLowerCase().replace(/[^.\w]/g, '');
      const dir = path.join(pastaVideos(), c.data.slice(0, 7));
      fs.mkdirSync(dir, { recursive: true });
      const nome = `${c.id} · ${slug(c.nicho)} · ${c.operadorNome.split(' ')[0]}${ext}`;
      const dest = path.join(dir, nome);
      await new Promise((resolve, reject) => {
        const w = fs.createWriteStream(dest);
        req.pipe(w); w.on('finish', resolve); w.on('error', reject); req.on('error', reject);
      });
      c.video = { nome, caminho: dest, bytes: fs.statSync(dest).size };
      saveDb();
      return send(res, 200, c);
    }

    const mOne = p.match(/^\/api\/criativos\/(SW-\d+)$/);
    if (mOne && req.method === 'PATCH') {
      const c = db.criativos.find((x) => x.id === mOne[1]);
      if (!c) return send(res, 404, { erro: 'Criativo não encontrado.' });
      if (!admin && c.operador !== user.id) return send(res, 403, { erro: 'Só quem cadastrou (ou o Kaian) pode editar.' });
      const b = await readJsonBody(req);
      ['nicho', 'faixa', 'anunciante', 'linkBiblioteca', 'formato', 'hookVisual', 'retencao', 'impressoes', 'ficha'].forEach((k) => { if (b[k] !== undefined) c[k] = b[k]; });
      saveDb();
      return send(res, 200, c);
    }

    if (p === '/api/export.csv') return send(res, 200, csv(), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="swipe-${hoje()}.csv"` });

    if (p === '/api/config' && admin && req.method === 'GET')
      return send(res, 200, { temChave: !!config.anthropicKey, modelo: config.modelo, pastaVideos: config.pastaVideos, metaDiaria: config.metaDiaria, horarioLimite: config.horarioLimite, usuarios: config.usuarios });
    if (p === '/api/config' && admin && req.method === 'POST') {
      const b = await readJsonBody(req);
      if (typeof b.anthropicKey === 'string' && b.anthropicKey.trim()) config.anthropicKey = b.anthropicKey.trim();
      if (b.removerChave) config.anthropicKey = '';
      ['modelo', 'pastaVideos', 'horarioLimite'].forEach((k) => { if (typeof b[k] === 'string' && b[k].trim()) config[k] = b[k].trim(); });
      if (Number(b.metaDiaria) > 0) config.metaDiaria = Number(b.metaDiaria);
      if (Array.isArray(b.usuarios)) b.usuarios.forEach((nu) => { const u = config.usuarios.find((x) => x.id === nu.id); if (u && String(nu.pin || '').trim()) u.pin = String(nu.pin).trim(); });
      saveConfig();
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { erro: 'Rota não encontrada.' });
  } catch (e) {
    console.error(e);
    return send(res, 500, { erro: e.message || 'Erro inesperado.' });
  }
});

server.listen(PORT, () => {
  console.log(`\n  Esteira de Repertório rodando em  http://localhost:${PORT}\n  Vídeos em: ${pastaVideos()}\n  ${config.anthropicKey ? 'Dissecação: IA ligada' : 'Dissecação: MODO DEMO (cole a chave em Ajustes)'}\n`);
});
