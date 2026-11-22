// API do app Criativos (Setor de Criativos): a base de criativos, o kanban de 72h, o motor de veredito,
// o sync com a Meta Marketing API e o webhook de vendas da Lastlink.
// Rotas em /api/cr/* (o prefixo /api/criativos já é do Swipe da Esteira de Repertório).

import { JAMES } from './prompts/james.mjs';
import { syncLastlink, lastlinkConfigurada } from './lastlink.mjs';
import { rodarCriacao, gerarTake, conferirTake, lerTakesMd, magnificConfigurado } from './criacao.mjs';
import { importarBiblioteca, importarPesquisa, escolherFichas, corpoFicha, SITUACOES, PESQUISA_DRIVE } from './biblioteca.mjs';

const META_API = 'https://graph.facebook.com/v21.0';
const STATUS = ['fila', 'briefing', 'producao', 'revisao', 'aprovado', 'no_ar', 'meio', 'vencedor', 'fadiga', 'morto'];
const RODANDO = ['no_ar', 'meio', 'vencedor', 'fadiga'];
const MIX_POR_ESTADO = { escalando: { modelagem: 60, variacao: 30, zero: 10 }, em_risco: { modelagem: 20, variacao: 30, zero: 50 }, validacao: { modelagem: 0, variacao: 20, zero: 80 }, pausada: { modelagem: 60, variacao: 30, zero: 10 }, encerrada: { modelagem: 60, variacao: 30, zero: 10 } };
// roasSegue = piso de lucro da operação (abaixo disso não paga a conta). Níveis de vencedor: quanto maior o ROAS, mais filhos e mais verba.
const REGRAS_PADRAO = { gastoMin: 150, vendasMin: 5, roasSegue: 1.4, roasMorre: 1.0, vencedorVendas: 20, fadigaQueda: 0.3, filhos: 3, horasVeredito: 72, diasRisco: 14, diasMeio: 7,
  metaSemanal: 60, // criativos novos por oferta por semana: o Analista dimensiona a leva para fechar essa conta
  // Mix da leva pelo ROAS 7d da OFERTA (não por estado fixo): oferta forte multiplica o validado (80%) e explora pouco (20%);
  // oferta fraca inverte. Em risco (14 dias sem vencedor novo) força exploração. modelagem = bodies/execuções no ângulo validado; variacao = hooks/copies dos vencedores; zero = ângulo/mecanismo novo (planilha de ângulos).
  mixPorRoas: [ { roas: 2.3, nome: 'forte', modelagem: 40, variacao: 40, zero: 20 }, { roas: 1.4, nome: 'ok', modelagem: 30, variacao: 30, zero: 40 }, { roas: 0, nome: 'fraca', modelagem: 10, variacao: 20, zero: 70 } ],
  // Árvore de multiplicação de um vencedor: hookVisual = mesmo áudio e body, só os 3 primeiros segundos mudam (barato);
  // hookFalado = copy nova no mesmo ângulo (hook falado + visual); body = corpo novo dentro do ângulo validado.
  niveis: [ { nome: 'ouro', roas: 3, hookVisual: 10, hookFalado: 10, body: 5, verba: '+20%/dia até 1,0x o custo/IC médio' }, { nome: 'prata', roas: 2, hookVisual: 8, hookFalado: 6, body: 3, verba: '+20% uma vez; reavaliar em 72h' }, { nome: 'bronze', roas: 1.4, hookVisual: 4, hookFalado: 2, body: 0, verba: 'manter' } ] };
const nivelDe = (R, roas) => (R.niveis || REGRAS_PADRAO.niveis).find((n) => (roas ?? 0) >= n.roas) || null;

export const agora = () => new Date().toISOString();
const diaISO = (d = new Date()) => new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10); // dia no fuso de Brasília
const diasAtras = (n) => diaISO(new Date(Date.now() - n * 864e5));
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(String(v).replace(',', '.')));
const round = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(d)));

// Lê um campo do payload da Lastlink sem depender de maiúsculas e minúsculas.
function pega(obj, ...caminho) {
  let o = obj;
  for (const k of caminho) {
    if (!o || typeof o !== 'object') return undefined;
    const chave = Object.keys(o).find((x) => x.toLowerCase() === k.toLowerCase());
    o = chave === undefined ? undefined : o[chave];
  }
  return o;
}

// ---------------------------------------------------------------- nomes de anúncio
// O ID do criativo é o nome do anúncio no Meta, limpo: sem " — Cópia", sem o que vem depois de "|", sem espaços nas pontas.
export const limparNome = (s) => {
  let t = String(s || '').split('|')[0];
  try { if (/%[0-9a-f]{2}/i.test(t)) t = decodeURIComponent(t); } catch { /* fica como veio */ }
  return t.replace(/\+/g, ' ').replace(/\s*[—–-]\s*c[oó]pia(\s*\d*)?\s*$/gi, '').replace(/\//g, '-').replace(/\s+/g, ' ').trim();
};
// O Supabase devolve no máximo 1000 linhas por consulta: pagina até acabar.
export async function sbAll(sb, path, body) {
  const out = []; const sep = path.includes('?') ? '&' : '?';
  for (let off = 0; ; off += 1000) {
    const page = await sb(`${path}${sep}limit=1000&offset=${off}`, body ? { method: 'POST', body } : {});
    out.push(...page); if (page.length < 1000) break;
  }
  return out;
}
const prefixoDe = (id) => String(id || '').toUpperCase().split(/[-_ ]/)[0];
export const formatoDoNome = (id) => {
  const s = String(id || '').toUpperCase();
  if (/UGC/.test(s)) return 'UGC';
  if (/\bCAR|CARROSSEL/.test(s)) return 'CAR';
  if (/\bVID|VIDEO|HV\d|AD\d+H\d/.test(s)) return 'VID';
  if (/\bIMG|IMAGEM|ORG\d|TXT\d/.test(s)) return 'IMG';
  return null;
};
const levaDoNome = (id) => { const m = String(id || '').match(/[-_]L(\d{1,2})[-_]/i); return m ? Number(m[1]) : null; };

function ofertaDoNome(ofertas, nome) {
  const up = String(nome || '').toUpperCase();
  const pref = prefixoDe(up);
  for (const o of ofertas) {
    const prefs = [o.id, ...(o.prefixos || [])].map((p) => String(p).toUpperCase());
    if (prefs.some((p) => pref === p || up.startsWith(p + '-') || up.startsWith(p + '_') || up.startsWith(p + ' '))) return o;
  }
  return null;
}

// ---------------------------------------------------------------- formato app <-> banco
export const ofertaApp = (r) => ({ id: r.id, nome: r.nome, familia: r.familia, estado: r.estado, mix: r.mix, prefixos: r.prefixos || [], produtos: r.produtos || [], pastaDrive: r.pasta_drive, pvUrl: r.pv_url, notas: r.notas, tetoIc: r.teto_ic, metaSemanal: r.meta_semanal || null, pesquisaDrive: r.pesquisa_drive || [], temPesquisa: !!(r.pesquisa_resumo || r.pesquisa), pesquisaResumo: r.pesquisa_resumo || null, criadoEm: r.criado_em, atualizadoEm: r.atualizado_em });
const levaApp = (r) => ({ id: r.id, ofertaId: r.oferta_id, numero: r.numero, planejada: r.planejada, noAr: r.no_ar, hipotese: r.hipotese, status: r.status, codigo: r.codigo || null, veredito: r.veredito || null, hipoteses: r.hipoteses || [], criadoEm: r.criado_em });
const criativoApp = (r) => ({
  id: r.id, ofertaId: r.oferta_id, levaId: r.leva_id, tipo: r.tipo, paiId: r.pai_id, formato: r.formato, angulo: r.angulo, mecanismo: r.mecanismo,
  hook: r.hook, body: r.body, copy: r.copy, arquivoUrl: r.arquivo_url, status: r.status, statusEm: r.status_em, noArEm: r.no_ar_em, score: r.score,
  aprendizado: r.aprendizado, basePesquisa: r.base_pesquisa || null, fichas: r.fichas || [], marcacoes: r.marcacoes || {},
  projeto: r.projeto || null, projetoEm: r.projeto_em || null, entrega: r.entrega || null, variavel: r.variavel || null, hipotese: r.hipotese || null, muda: r.muda || null,
  historico: r.historico || [], criadoPor: r.criado_por, criadoEm: r.criado_em, atualizadoEm: r.atualizado_em,
});
const CAMPOS_CRIATIVO = { ofertaId: 'oferta_id', levaId: 'leva_id', tipo: 'tipo', paiId: 'pai_id', formato: 'formato', angulo: 'angulo', mecanismo: 'mecanismo', hook: 'hook', body: 'body', copy: 'copy', arquivoUrl: 'arquivo_url', score: 'score', aprendizado: 'aprendizado', basePesquisa: 'base_pesquisa', marcacoes: 'marcacoes', variavel: 'variavel', hipotese: 'hipotese', muda: 'muda' };
const CAMPOS_OFERTA = { nome: 'nome', familia: 'familia', estado: 'estado', mix: 'mix', prefixos: 'prefixos', produtos: 'produtos', pastaDrive: 'pasta_drive', pvUrl: 'pv_url', notas: 'notas', tetoIc: 'teto_ic', metaSemanal: 'meta_semanal', pesquisaDrive: 'pesquisa_drive', pesquisaResumo: 'pesquisa_resumo' };

const metricas = (r) => {
  const gasto = Number(r.gasto) || 0, receita = Number(r.receita) || 0, vendas = Number(r.vendas) || 0;
  return {
    gasto: round(gasto), vendas, receita: round(receita), reembolsos: Number(r.reembolsos) || 0,
    roas: gasto > 0 ? round(receita / gasto) : null, cpa: vendas > 0 && gasto > 0 ? round(gasto / vendas) : null,
    impressoes: Number(r.impressoes) || 0, cliques: Number(r.cliques) || 0, lpv: Number(r.lpv) || 0, ic: Number(r.ic) || 0,
    ctr: r.impressoes > 0 ? round((r.cliques / r.impressoes) * 100) : null,
    hookRate: r.impressoes > 0 && r.video_3s > 0 ? round((r.video_3s / r.impressoes) * 100) : null,
    holdRate: r.impressoes > 0 && r.video_75 > 0 ? round((r.video_75 / r.impressoes) * 100) : null,
    conversao: r.lpv > 0 ? round((vendas / r.lpv) * 100) : null,
    primeiroDia: r.primeiro_dia, ultimoDia: r.ultimo_dia,
  };
};

// ---------------------------------------------------------------- leitura agregada
async function carregarTudo(sb) {
  const [ofertas, levas, criativos, total, d7, d30, cfgRows] = await Promise.all([
    sb('esteira_cr_ofertas?select=*&order=nome.asc'),
    sb('esteira_cr_levas?select=*&order=planejada.desc.nullslast,numero.desc'),
    sbAll(sb, 'esteira_cr_criativos?select=*&order=criado_em.desc'),
    sbAll(sb, 'rpc/esteira_cr_resumo', {}),
    sbAll(sb, 'rpc/esteira_cr_resumo', { p_desde: diasAtras(6) }),
    sbAll(sb, 'rpc/esteira_cr_resumo', { p_desde: diasAtras(29) }),
    sb('esteira_config?chave=in.(cr_regras,cr_contas,cr_ultimo_sync,cr_ultimo_veredito)&select=chave,valor'),
  ]);
  const porId = (rows) => Object.fromEntries(rows.map((r) => [r.criativo_id, metricas(r)]));
  const mT = porId(total), m7 = porId(d7), m30 = porId(d30);
  const cfg = Object.fromEntries(cfgRows.map((r) => [r.chave, r.valor]));
  return {
    ofertas: ofertas.map(ofertaApp), levas: levas.map(levaApp),
    criativos: criativos.map((r) => ({ ...criativoApp(r), total: mT[r.id] || metricas({}), d7: m7[r.id] || metricas({}), d30: m30[r.id] || metricas({}) })),
    regras: { ...REGRAS_PADRAO, ...(cfg.cr_regras || {}) }, contas: cfg.cr_contas || [], ultimoSync: cfg.cr_ultimo_sync || null, ultimoVeredito: cfg.cr_ultimo_veredito || null,
  };
}

// Painel: os números que ficam no topo. Vencedor "novo" = virou vencedor nos últimos 7 dias.
async function painel(sb, tudo) {
  const hoje = diaISO();
  const [vendas7, vendas14] = await Promise.all([
    sbAll(sb, `esteira_cr_vendas?pago_em=gte.${diasAtras(6)}&reembolso=eq.false&is_test=eq.false&select=oferta_id,criativo_id,valor`),
    sbAll(sb, `esteira_cr_vendas?pago_em=gte.${diasAtras(13)}&pago_em=lt.${diasAtras(6)}&reembolso=eq.false&is_test=eq.false&select=oferta_id,valor`),
  ]);
  const soma = (rows) => rows.reduce((acc, v) => { acc[v.oferta_id || '?'] = (acc[v.oferta_id || '?'] || 0) + (Number(v.valor) || 0); return acc; }, {});
  const r7 = soma(vendas7), r14 = soma(vendas14);
  const total7 = Object.values(r7).reduce((a, b) => a + b, 0);
  const maior = Object.entries(r7).sort((a, b) => b[1] - a[1])[0];
  const venc7 = tudo.criativos.filter((c) => c.status === 'vencedor' && c.statusEm >= new Date(Date.now() - 7 * 864e5).toISOString());
  const porOferta = tudo.ofertas.map((o) => {
    const cs = tudo.criativos.filter((c) => c.ofertaId === o.id);
    const ultimoVenc = cs.filter((c) => c.status === 'vencedor' || (c.historico || []).some((h) => h.para === 'vencedor')).map((c) => (c.historico || []).filter((h) => h.para === 'vencedor').map((h) => h.em).sort().pop() || c.statusEm).sort().pop();
    const proxima = tudo.levas.filter((l) => l.ofertaId === o.id && l.status === 'planejada' && l.planejada && l.planejada >= hoje).sort((a, b) => a.planejada.localeCompare(b.planejada))[0];
    return {
      id: o.id, nome: o.nome, estado: o.estado, receita7: round(r7[o.id] || 0), receitaSemanaAnterior: round(r14[o.id] || 0),
      gasto7: round(cs.reduce((a, c) => a + (c.d7.gasto || 0), 0)), roas7: (() => { const g = cs.reduce((a, c) => a + (c.d7.gasto || 0), 0); return g >= 50 ? round((r7[o.id] || 0) / g) : null; })(),
      rodando: cs.filter((c) => RODANDO.includes(c.status)).length, vencedores: cs.filter((c) => c.status === 'vencedor').length,
      emFila: cs.filter((c) => ['fila', 'briefing', 'producao', 'revisao', 'aprovado'].includes(c.status)).length,
      diasSemVencedor: ultimoVenc ? Math.floor((Date.now() - new Date(ultimoVenc).getTime()) / 864e5) : null,
      proximaLeva: proxima ? { id: proxima.id, data: proxima.planejada } : null,
    };
  });
  return {
    hoje, vencedoresSemana: venc7.length, metaVencedores: 5,
    ofertasAcima5k: porOferta.filter((o) => o.receita7 >= 5000).length, metaOfertas: 4,
    shareMaior: total7 > 0 && maior ? { oferta: maior[0], pct: Math.round((maior[1] / total7) * 100) } : null,
    receita7: round(total7), porOferta,
  };
}

// ---------------------------------------------------------------- histórico e transições
async function mudarStatus(sb, q, c, para, por, nota, extra = {}) {
  if (!STATUS.includes(para)) throw new Error(`Status desconhecido: ${para}`);
  const hist = [...(c.historico || []), { em: agora(), de: c.status, para, por, ...(nota ? { nota } : {}) }];
  const body = { status: para, status_em: agora(), historico: hist, atualizado_em: agora(), ...extra };
  if (para === 'no_ar' && !c.no_ar_em) body.no_ar_em = agora();
  const [r] = await sb(`esteira_cr_criativos?id=eq.${q(c.id)}`, { method: 'PATCH', body, prefer: 'return=representation' });
  return r;
}

async function garantirCriativo(sb, q, { id, oferta, status = 'no_ar', noArEm, criadoPor = 'sync', tipo, paiId, levaId }) {
  const [ex] = await sb(`esteira_cr_criativos?id=eq.${q(id)}&select=*`);
  if (ex) return ex;
  const row = {
    id, oferta_id: oferta.id, leva_id: levaId || null, tipo: tipo || 'modelagem', pai_id: paiId || null, formato: formatoDoNome(id), status, status_em: agora(),
    no_ar_em: status === 'no_ar' ? (noArEm || agora()) : null, criado_por: criadoPor, historico: [{ em: agora(), de: null, para: status, por: criadoPor }],
  };
  // A leva sai do nome (CFAM-L4-…) quando existir.
  const n = levaDoNome(id);
  if (n && !levaId) {
    const lid = `${oferta.id}-L${n}`;
    const [l] = await sb(`esteira_cr_levas?id=eq.${q(lid)}&select=id`);
    if (!l) await sb('esteira_cr_levas?on_conflict=id', { method: 'POST', body: { id: lid, oferta_id: oferta.id, numero: n, status: status === 'no_ar' ? 'no_ar' : 'planejada', no_ar: status === 'no_ar' ? diaISO() : null }, prefer: 'resolution=ignore-duplicates' });
    row.leva_id = lid;
  }
  const [criado] = await sb('esteira_cr_criativos?on_conflict=id', { method: 'POST', body: row, prefer: 'resolution=ignore-duplicates,return=representation' });
  return criado || (await sb(`esteira_cr_criativos?id=eq.${q(id)}&select=*`))[0];
}

// ---------------------------------------------------------------- Meta Marketing API
// Token: a variável META_ACCESS_TOKEN (System User, não expira) ou o token de usuário guardado em
// Ajustes › Conectar Meta (trocado por um de 60 dias e renovado pelo cron a cada 30 dias, como a UTMIFY faz).
export async function tokenMeta({ sb, env }) {
  if (env('META_ACCESS_TOKEN')) return env('META_ACCESS_TOKEN');
  const [cfg] = await sb('esteira_config?chave=eq.cr_meta_token&select=valor');
  return cfg?.valor?.token || '';
}
async function trocarTokenLongo(tokenCurto, env) {
  if (!env('META_APP_ID') || !env('META_APP_SECRET')) throw new Error('Faltam META_APP_ID e META_APP_SECRET na Netlify.');
  const u = new URL(`${META_API}/oauth/access_token`);
  u.searchParams.set('grant_type', 'fb_exchange_token'); u.searchParams.set('client_id', env('META_APP_ID')); u.searchParams.set('client_secret', env('META_APP_SECRET')); u.searchParams.set('fb_exchange_token', tokenCurto);
  const r = await fetch(u); const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Meta: ${j?.error?.message || r.status}`);
  return { token: j.access_token, exp: new Date(Date.now() + (Number(j.expires_in) || 60 * 86400) * 1000).toISOString() };
}
export async function renovarTokenMeta({ sb, env, setConfig }) {
  if (env('META_ACCESS_TOKEN')) return { ok: true, fonte: 'env' };
  const [cfg] = await sb('esteira_config?chave=eq.cr_meta_token&select=valor');
  const t = cfg?.valor; if (!t?.token) return { ok: false, motivo: 'sem token' };
  const diasRestantes = (new Date(t.exp).getTime() - Date.now()) / 864e5;
  if (diasRestantes > 30) return { ok: true, diasRestantes: Math.round(diasRestantes) };
  const novo = await trocarTokenLongo(t.token, env);
  await setConfig('cr_meta_token', { ...novo, renovadoEm: agora(), usuario: t.usuario || null });
  return { ok: true, renovado: true };
}

async function metaGet(path, params, token) {
  const u = new URL(`${META_API}/${path}`);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v)));
  u.searchParams.set('access_token', token);
  const r = await fetch(u);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Meta: ${j?.error?.message || r.status}`);
  return j;
}
async function metaTodos(path, params, token) {
  let out = [], j = await metaGet(path, params, token);
  out = out.concat(j.data || []);
  let i = 0;
  while (j.paging?.next && i++ < 40) {
    const r = await fetch(j.paging.next); j = await r.json();
    if (!r.ok) throw new Error(`Meta: ${j?.error?.message || r.status}`);
    out = out.concat(j.data || []);
  }
  return out;
}
const acao = (lista, tipo) => Number((lista || []).find((a) => a.action_type === tipo)?.value || 0);

// Sync de um intervalo de dias: insights por anúncio e por dia. Cria o criativo quando o nome bate com uma oferta.
// Tudo pré-carregado em memória: uma consulta por tabela, não uma por anúncio.
// Câmbio para converter o gasto das contas em dólar (e outras moedas) para BRL. Busca a taxa do dia (open.er-api.com, sem chave)
// e guarda em esteira_config cr_cambio; se a busca falhar, usa a última guardada ou o padrão.
const CAMBIO_PADRAO = { USD: 5.4, EUR: 5.9 };
export async function taxasCambio({ sb, setConfig }) {
  const [row] = await sb('esteira_config?chave=eq.cr_cambio&select=valor');
  const guardado = row?.valor || {};
  if (guardado.em && Date.now() - new Date(guardado.em).getTime() < 20 * 3600e3) return guardado;
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/BRL');
    const j = await r.json();
    if (j?.rates?.USD) {
      const novo = { USD: Number((1 / j.rates.USD).toFixed(4)), EUR: Number((1 / j.rates.EUR).toFixed(4)), em: agora(), fonte: 'open.er-api.com', manual: guardado.manual || null };
      await setConfig('cr_cambio', novo); return novo;
    }
  } catch {}
  return { ...CAMBIO_PADRAO, ...guardado };
}
const taxa = (cambio, moeda) => moeda === 'BRL' || !moeda ? 1 : Number(cambio.manual?.[moeda]) || Number(cambio[moeda]) || CAMBIO_PADRAO[moeda] || 1;

export async function syncMeta({ sb, q, env, setConfig }, { desde, ate, contas }) {
  const token = await tokenMeta({ sb, env });
  if (!token) throw new Error('Conecte a Meta em Criativos › Ajustes.');
  const cambio = await taxasCambio({ sb, setConfig });
  const [ofertasRows, adsRows, crRows] = await Promise.all([
    sb('esteira_cr_ofertas?select=id,prefixos'),
    sbAll(sb, 'esteira_cr_ads?select=ad_id,criativo_id'),
    sbAll(sb, 'esteira_cr_criativos?select=id'),
  ]);
  const ofertas = ofertasRows.map(ofertaApp);
  const adMap = new Map(adsRows.map((a) => [a.ad_id, a.criativo_id]));
  const criativos = new Set(crRows.map((c) => c.id));
  const resumo = { contas: 0, anuncios: 0, linhas: 0, criados: 0, semPar: 0 };
  for (const conta of contas) {
    const act = String(conta).startsWith('act_') ? conta : `act_${conta}`;
    // Moeda da conta: o gasto vem nela e é convertido para BRL (vendas da Lastlink são em BRL).
    const moeda = (await metaGet(`${act}`, { fields: 'currency' }, token).catch(() => ({})))?.currency || 'BRL';
    const fator = taxa(cambio, moeda);
    const rows = await metaTodos(`${act}/insights`, {
      level: 'ad', time_increment: 1, limit: 500, time_range: { since: desde, until: ate },
      fields: 'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,inline_link_clicks,actions,video_play_actions,video_p75_watched_actions',
    }, token);
    resumo.contas++;
    const ads = new Map();
    const novos = [];
    const metricasRows = [];
    for (const r of rows) {
      const nome = limparNome(r.ad_name);
      let info = ads.get(r.ad_id);
      if (!info) {
        let criativoId = adMap.get(r.ad_id) || null;
        if (!criativoId) {
          if (criativos.has(nome)) criativoId = nome;
          else {
            const o = ofertaDoNome(ofertas, nome);
            if (o) {
              const n = levaDoNome(nome);
              novos.push({ id: nome, oferta_id: o.id, leva_id: n ? `${o.id}-L${n}` : null, tipo: 'modelagem', formato: formatoDoNome(nome), status: 'no_ar', status_em: agora(), no_ar_em: new Date(r.date_start).toISOString(), criado_por: 'sync', historico: [{ em: agora(), de: null, para: 'no_ar', por: 'sync' }] });
              criativos.add(nome); criativoId = nome; resumo.criados++;
            } else resumo.semPar++;
          }
        }
        info = { ad_id: r.ad_id, conta_id: act.replace('act_', ''), ad_name: r.ad_name, adset_id: r.adset_id, adset_name: r.adset_name, campaign_id: r.campaign_id, campaign_name: r.campaign_name, criativo_id: criativoId, sync_em: agora() };
        ads.set(r.ad_id, info); adMap.set(r.ad_id, criativoId);
      }
      metricasRows.push({
        ad_id: r.ad_id, dia: r.date_start, criativo_id: info.criativo_id,
        gasto: Math.round((Number(r.spend) || 0) * fator * 100) / 100, gasto_orig: Number(r.spend) || 0, moeda, impressoes: Number(r.impressions) || 0, cliques: Number(r.inline_link_clicks) || 0,
        lpv: acao(r.actions, 'landing_page_view'), ic: acao(r.actions, 'initiate_checkout') || acao(r.actions, 'omni_initiated_checkout'),
        video_views: acao(r.video_play_actions, 'video_view'), video_3s: acao(r.actions, 'video_view'), video_75: acao(r.video_p75_watched_actions, 'video_view'),
      });
    }
    // Levas que os nomes novos citam, depois os criativos, depois anúncios e métricas, tudo em lotes.
    const levas = [...new Set(novos.map((c) => c.leva_id).filter(Boolean))].map((lid) => ({ id: lid, oferta_id: lid.split('-L')[0], numero: Number(lid.split('-L')[1]), status: 'no_ar' }));
    if (levas.length) await sb('esteira_cr_levas?on_conflict=id', { method: 'POST', body: levas, prefer: 'resolution=ignore-duplicates' });
    for (let i = 0; i < novos.length; i += 500) await sb('esteira_cr_criativos?on_conflict=id', { method: 'POST', body: novos.slice(i, i + 500), prefer: 'resolution=ignore-duplicates' });
    const adRows = [...ads.values()];
    for (let i = 0; i < adRows.length; i += 500) await sb('esteira_cr_ads?on_conflict=ad_id', { method: 'POST', body: adRows.slice(i, i + 500), prefer: 'resolution=merge-duplicates' });
    for (let i = 0; i < metricasRows.length; i += 1000) await sb('esteira_cr_metricas?on_conflict=ad_id,dia', { method: 'POST', body: metricasRows.slice(i, i + 1000), prefer: 'resolution=merge-duplicates' });
    resumo.anuncios += adRows.length; resumo.linhas += metricasRows.length;
  }
  await setConfig('cr_ultimo_sync', { em: agora(), desde, ate, ...resumo });
  await sb('esteira_cr_log', { method: 'POST', body: { tipo: 'sync', resumo: `${desde}→${ate}: ${resumo.linhas} linhas, ${resumo.anuncios} anúncios, ${resumo.criados} criativos novos, ${resumo.semPar} sem par`, detalhe: resumo } });
  return resumo;
}

// Liga as vendas sem criativo (chegaram antes do cadastro) e as métricas de anúncios que ganharam par depois.
async function religar(sb, q) {
  const [ads, ofertasRows, crRows] = await Promise.all([
    sbAll(sb, 'esteira_cr_ads?criativo_id=is.null&select=ad_id,ad_name'),
    sb('esteira_cr_ofertas?select=id,prefixos'),
    sbAll(sb, 'esteira_cr_criativos?select=id,oferta_id'),
  ]);
  const ofertas = ofertasRows.map(ofertaApp);
  const cr = new Map(crRows.map((c) => [c.id, c.oferta_id]));
  let ligados = 0;
  for (const a of ads) {
    const nome = limparNome(a.ad_name);
    let id = cr.has(nome) ? nome : null;
    if (!id) { const o = ofertaDoNome(ofertas, nome); if (o) { await garantirCriativo(sb, q, { id: nome, oferta: o }); cr.set(nome, o.id); id = nome; } }
    if (id) {
      await sb(`esteira_cr_ads?ad_id=eq.${q(a.ad_id)}`, { method: 'PATCH', body: { criativo_id: id } });
      await sb(`esteira_cr_metricas?ad_id=eq.${q(a.ad_id)}`, { method: 'PATCH', body: { criativo_id: id } });
      ligados++;
    }
  }
  const vendas = await sbAll(sb, 'esteira_cr_vendas?criativo_id=is.null&utm_content=not.is.null&select=id,utm_content');
  for (const v of vendas) {
    const nome = limparNome(v.utm_content);
    if (nome && cr.has(nome)) { await sb(`esteira_cr_vendas?id=eq.${q(v.id)}`, { method: 'PATCH', body: { criativo_id: nome, oferta_id: cr.get(nome) } }); ligados++; }
  }
  return { ligados };
}

// ---------------------------------------------------------------- motor de veredito
export { religar };
// Árvore de multiplicação de um vencedor: hooks visuais (mesmo áudio e body) → copies novas no ângulo → bodies novos no ângulo.
// Estático (IMG): hook_visual = arte nova com o mesmo texto; hook_falado = headline/texto novo na mesma arte.
export async function abrirArvore(sb, row, roas, R, por = 'veredito') {
  const nv = nivelDe(R, roas) || { nome: 'bronze', hookVisual: 4, hookFalado: 2, body: 0 };
  const img = String(row.formato || '').toUpperCase() === 'IMG';
  const lote = [];
  const filho = (tipo, i, letra, variavel, hip) => lote.push({ id: `${row.id}-${letra}${String(i).padStart(2, '0')}`, oferta_id: row.oferta_id, leva_id: null, tipo, pai_id: row.id, formato: row.formato, variavel, hipotese: `Vencedor ${nv.nome} (ROAS ${roas}): ${hip}`, status: 'fila', criado_por: por, historico: [{ em: agora(), de: null, para: 'fila', por, nota: `filho de ${row.id} · nível ${nv.nome} · ${variavel}` }] });
  for (let i = 1; i <= (nv.hookVisual ?? nv.variacao ?? 0); i++) filho('variacao', i, 'HV', 'hook_visual', img ? 'arte nova com o mesmo texto (headline e copy iguais)' : 'mesmo áudio e body, só os 3 primeiros segundos mudam');
  for (let i = 1; i <= (nv.hookFalado ?? 0); i++) filho('variacao', i, 'HF', 'hook_falado', img ? 'headline e texto novos no mesmo ângulo, mesma arte' : 'copy nova no mesmo ângulo: hook falado + hook visual novos, body igual');
  for (let i = 1; i <= (nv.body ?? nv.modelagem ?? 0); i++) filho('modelagem', i, 'B', 'body', img ? 'arte e texto novos dentro do ângulo validado' : 'corpo novo dentro do ângulo validado (estrutura diferente, mesma promessa)');
  if (lote.length) await sb('esteira_cr_criativos?on_conflict=id', { method: 'POST', prefer: 'resolution=ignore-duplicates', body: lote });
  return { ...nv, abertos: lote.length };
}

export async function rodarVeredito({ sb, q, setConfig }) {
  const tudo = await carregarTudo(sb);
  const R = tudo.regras;
  const porOferta = Object.fromEntries(tudo.ofertas.map((o) => [o.id, o]));
  const log = [];
  const criativosDb = await sbAll(sb, `esteira_cr_criativos?status=in.(${RODANDO.join(',')})&select=*`);
  const porId = Object.fromEntries(tudo.criativos.map((c) => [c.id, c]));
  for (const row of criativosDb) {
    const c = porId[row.id]; if (!c) continue;
    const T = c.total, D7 = c.d7, D30 = c.d30;
    const horasNoAr = c.noArEm ? (Date.now() - new Date(c.noArEm).getTime()) / 3600e3 : 0;
    const temAmostra = T.gasto >= R.gastoMin || T.vendas >= R.vendasMin;
    let para = null, nota = null;
    const parado = D30.gasto === 0 && D30.vendas === 0 && c.noArEm && (Date.now() - new Date(c.noArEm).getTime()) / 864e5 >= R.diasRisco;
    const horasStatus = row.status_em ? (Date.now() - new Date(row.status_em).getTime()) / 3600e3 : 0;
    if ((row.status === 'no_ar' || row.status === 'meio') && parado) {
      para = 'morto'; nota = 'sem gasto nem venda há 30 dias';
    } else if (row.status === 'meio' && horasStatus >= (R.diasMeio || 7) * 24 && (D7.roas ?? 0) < R.roasSegue) {
      para = 'morto'; nota = `meio há ${Math.round(horasStatus / 24)} dias sem passar de ${R.roasSegue} (ROAS 7d ${D7.roas ?? 0})`;
    } else if ((row.status === 'no_ar' || row.status === 'meio') && T.vendas >= R.vencedorVendas && (T.roas ?? 0) >= R.roasSegue) {
      para = 'vencedor'; nota = `${T.vendas} vendas, ROAS ${T.roas} · nível ${nivelDe(R, T.roas)?.nome || 'bronze'}`;
    } else if (row.status === 'no_ar' && horasNoAr >= R.horasVeredito && temAmostra) {
      if ((T.roas ?? 0) >= R.roasSegue) nota = `segue: ROAS ${T.roas} com R$ ${T.gasto}`;
      else if ((T.roas ?? 0) < R.roasMorre) { para = 'morto'; nota = `ROAS ${T.roas ?? 0} com R$ ${T.gasto} e ${T.vendas} vendas`; }
      else { para = 'meio'; nota = `ROAS ${T.roas} entre ${R.roasMorre} e ${R.roasSegue}: pede 1 variação`; }
    } else if (row.status === 'vencedor' && D30.gasto > 0 && D7.gasto > 0 && D7.roas !== null && D30.roas !== null && D7.roas < D30.roas * (1 - R.fadigaQueda)) {
      para = 'fadiga'; nota = `ROAS 7d ${D7.roas} vs 30d ${D30.roas}`;
    } else if (row.status === 'fadiga' && D7.roas !== null && D30.roas !== null && D7.roas >= D30.roas) {
      para = 'vencedor'; nota = 'voltou a performar';
    }
    if (!para) continue;
    await mudarStatus(sb, q, row, para, 'veredito', nota);
    await sb('esteira_cr_aprendizados', { method: 'POST', body: { oferta_id: row.oferta_id, leva_id: row.leva_id, criativo_id: row.id, tipo: 'veredito', texto: `${row.status} → ${para}: ${nota}`, autor: 'veredito' } });
    log.push(`${row.id}: ${row.status} → ${para} (${nota})`);
    // Vencedor novo abre filhos na fila conforme o nível (ouro: 3 modelagens + 3 variações; prata: 2+2; bronze: 1 variação).
    if (para === 'vencedor' && !(row.historico || []).some((h) => h.para === 'vencedor')) {
      const nv = await abrirArvore(sb, row, T.roas, R, 'veredito');
      if (nv.verba) await sb('esteira_cr_aprendizados', { method: 'POST', body: { oferta_id: row.oferta_id, criativo_id: row.id, tipo: 'veredito', texto: `Verba sugerida para ${row.id} (nível ${nv.nome}, ROAS ${T.roas}): ${nv.verba}.`, autor: 'veredito' } });
    }
    // Meio: abre 1 variação de hook se ainda não tem filho.
    if (para === 'meio' && !(row.historico || []).some((h) => h.para === 'meio')) {
      await sb('esteira_cr_criativos?on_conflict=id', { method: 'POST', prefer: 'resolution=ignore-duplicates', body: { id: `${row.id}-V1`, oferta_id: row.oferta_id, leva_id: null, tipo: 'variacao', pai_id: row.id, formato: row.formato, variavel: 'hook_falado', hipotese: `Meio (ROAS ${T.roas}): o body vende, o hook não para — 1 variação de hook`, status: 'fila', criado_por: 'veredito', historico: [{ em: agora(), de: null, para: 'fila', por: 'veredito', nota: `variação do meio ${row.id}` }] } });
    }
  }
  // Estado da oferta: escalando sem vencedor novo há N dias vira em_risco.
  const p = await painel(sb, await carregarTudo(sb));
  for (const o of p.porOferta) {
    const of = porOferta[o.id]; if (!of) continue;
    if (of.estado === 'escalando' && o.diasSemVencedor !== null && o.diasSemVencedor >= R.diasRisco) {
      await sb(`esteira_cr_ofertas?id=eq.${q(o.id)}`, { method: 'PATCH', body: { estado: 'em_risco', mix: MIX_POR_ESTADO.em_risco, atualizado_em: agora() } });
      await sb('esteira_cr_aprendizados', { method: 'POST', body: { oferta_id: o.id, tipo: 'veredito', texto: `Oferta em risco: ${o.diasSemVencedor} dias sem vencedor novo. Próxima leva com mais ângulo novo.`, autor: 'veredito' } });
      log.push(`${o.id}: escalando → em_risco`);
    }
  }
  await setConfig('cr_ultimo_veredito', { em: agora(), mudancas: log.length });
  await sb('esteira_cr_log', { method: 'POST', body: { tipo: 'veredito', resumo: `${log.length} mudanças`, detalhe: log } });
  return { mudancas: log };
}

// ---------------------------------------------------------------- IA: Analista e dissecação
export async function claude(env, modelo, system, user, maxTokens = 3000) {
  const r = await fetch(env('ANTHROPIC_BASE_URL') || 'https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01' },
    // Sem prefill (o modelo não aceita); o JSON é extraído do primeiro "{" ao último "}".
    // thinking desligado: os agentes devolvem JSON direto (com thinking ligado o modelo gastava todo o max_tokens pensando).
    // Haiku não aceita o campo thinking; nos outros, between_tools = sem pensar antes de responder.
    body: JSON.stringify({ model: modelo, max_tokens: maxTokens, ...(/haiku/i.test(modelo) ? {} : { thinking: { type: 'between_tools' } }), system, messages: [{ role: 'user', content: user + '\n\nResponda somente com o JSON, começando por {.' }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const msg = j?.error?.message || `A API da IA respondeu ${r.status}`; const e = new Error(msg); e.fatal = /credit balance|billing|invalid x-api-key|authentication/i.test(msg) || r.status === 401; throw e; }
  const text = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  let m = text.match(/\{[\s\S]*\}/);
  // Resposta cortada no max_tokens (sem "}" final): manda o fragmento para o conserto.
  if (!m && text.includes('{')) m = [text.slice(text.indexOf('{'))];
  if (!m) throw new Error(`A IA não devolveu JSON (${j.stop_reason || 'sem conteúdo'}; blocos ${(j.content || []).map((c) => c.type + ':' + (c.text || c.thinking || '').length).join(',') || 'nenhum'}; uso ${JSON.stringify(j.usage || {})}: ${text.slice(0, 120)}).`);
  try { return JSON.parse(m[0]); } catch {}
  try { return JSON.parse(m[0].replace(/,\s*([}\]])/g, '$1')); } catch {}
  // Último recurso: pede à IA para consertar o próprio JSON (quebras de linha e aspas dentro dos textos).
  const r2 = await fetch(env('ANTHROPIC_BASE_URL') || 'https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: modelo, max_tokens: maxTokens, ...(/haiku/i.test(modelo) ? {} : { thinking: { type: 'between_tools' } }), system: 'Você recebe um JSON inválido e devolve o MESMO conteúdo como JSON válido (escape aspas e quebras de linha dentro das strings). Responda apenas com o JSON.', messages: [{ role: 'user', content: m[0] }] }),
  });
  const j2 = await r2.json().catch(() => ({}));
  const t2 = (j2.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  const m2 = t2.match(/\{[\s\S]*\}/);
  if (!m2) throw new Error('JSON inválido da IA.');
  return JSON.parse(m2[0]);
}

const PROMPT_ANALISTA = `Você é o Analista do Setor de Criativos de uma operação de infoprodutos low-ticket (R$ 27–57) no Meta Ads. Lê os números de UMA oferta e devolve o veredito e as hipóteses da próxima leva de criativos. Regras da operação: veredito em 72h; ROAS ≥ 1,3 segue, < 1,0 morre; vencedor = 20+ vendas com ROAS ≥ 1,3; mix da leva por estado da oferta: escalando 60% modelagem / 30% variação / 10% do zero; em risco 20/30/50; validação 0/20/80. "Modelagem" = modelar um vencedor vivo (mesmo ângulo, nova execução). "Variação" = trocar hook, formato ou body de um vencedor. "Do zero" = ângulo ou mecanismo novo. REGRA DAS HIPÓTESES: as 3 hipóteses testam VARIÁVEIS DIFERENTES entre si (hook_visual, hook_falado, body, formato, angulo, avatar, mecanismo, oferta) — nunca três execuções da mesma ideia; cada uma diz o que já foi testado antes sobre aquela variável (ja_testado) olhando as levas e criativos do contexto, e muda uma coisa só em relação ao pai. Frases curtas, concretas, sem elogio. Cite IDs de criativos reais do contexto. Dentro dos textos não use aspas duplas nem quebras de linha. Responda APENAS com JSON válido:
{
 "veredito": "3 a 5 frases: o que os números dizem desta oferta nesta semana, o que está carregando a receita, o que está morrendo e por quê",
 "hipoteses": [ {"titulo": "até 10 palavras", "porque": "evidência nos dados", "tipo": "modelagem|variacao|zero", "pai": "ID do criativo que serve de base ou null", "variavel": "hook_visual|hook_falado|body|formato|angulo|avatar|mecanismo|oferta", "ja_testado": "leva ou criativo que já testou isso e o resultado, ou null"} ],
 "leva": { "mix": {"modelagem": 6, "variacao": 3, "zero": 1}, "pais": ["IDs dos vencedores a modelar"], "hipotese": "1 frase: o que esta leva testa" }
}`;

function contextoOferta(o, tudo, painelOferta, aprendizados) {
  const cs = tudo.criativos.filter((c) => c.ofertaId === o.id);
  const fmt = (c) => `${c.id} [${c.status}|${c.tipo}|${c.formato || '?'}${c.paiId ? '|pai:' + c.paiId : ''}] 7d: gasto ${c.d7.gasto} rec ${c.d7.receita} roas ${c.d7.roas ?? '-'} vendas ${c.d7.vendas} · total: gasto ${c.total.gasto} rec ${c.total.receita} roas ${c.total.roas ?? '-'} vendas ${c.total.vendas}${c.total.hookRate ? ' hook ' + c.total.hookRate + '%' : ''}${c.total.holdRate ? ' hold ' + c.total.holdRate + '%' : ''}${c.angulo ? ' · ângulo: ' + c.angulo : ''}${c.hook ? ' · hook: ' + c.hook : ''}${c.aprendizado ? ' · aprendizado: ' + c.aprendizado : ''}`;
  const rodando = cs.filter((c) => RODANDO.includes(c.status) && (c.d7.gasto > 0 || c.d7.vendas > 0)).sort((a, b) => b.d7.receita - a.d7.receita);
  const venc = cs.filter((c) => c.status === 'vencedor');
  const mortos = cs.filter((c) => c.status === 'morto' && c.statusEm >= new Date(Date.now() - 14 * 864e5).toISOString()).sort((a, b) => b.total.gasto - a.total.gasto).slice(0, 8);
  return [
    `OFERTA ${o.id} — ${o.nome} · estado: ${o.estado} · ROAS 7d da oferta: ${painelOferta.roas7 ?? '—'} (gasto R$ ${painelOferta.gasto7 ?? 0}) · regra: oferta com ROAS ≥ 2,3 = 80% em cima do validado (hooks, copies e bodies dos vencedores) e 20% ângulos novos; ROAS 1,4–2,3 = 60/40; abaixo de 1,4 = 30/70${o.notas ? ' · notas: ' + o.notas : ''}`,
    o.pesquisaResumo ? `PESQUISA DA OFERTA (resumo em 6 camadas; as hipóteses devem nascer daqui + dos números):\n${o.pesquisaResumo.slice(0, 5000)}` : '',
    `SEMANA: receita 7d R$ ${painelOferta.receita7} (semana anterior R$ ${painelOferta.receitaSemanaAnterior}) · ${painelOferta.rodando} no ar · ${painelOferta.vencedores} vencedores · ${painelOferta.emFila} na fila · último vencedor há ${painelOferta.diasSemVencedor ?? '—'} dias`,
    `VENCEDORES VIVOS (${venc.length}):\n` + (venc.map(fmt).join('\n') || 'nenhum'),
    `RODANDO NA SEMANA (${rodando.length}, top 15 por receita 7d):\n` + (rodando.slice(0, 15).map(fmt).join('\n') || 'nenhum'),
    `MORTOS NOS ÚLTIMOS 14 DIAS (top 8 por gasto):\n` + (mortos.map(fmt).join('\n') || 'nenhum'),
    `APRENDIZADOS RECENTES:\n` + (aprendizados.slice(0, 12).map((a) => `[${a.tipo}|${a.autor}|${String(a.criado_em).slice(0, 10)}] ${a.texto.slice(0, 300)}`).join('\n') || 'nenhum'),
  ].join('\n\n');
}

// Roda após o cron: por oferta viva, grava veredito + 3 hipóteses, planeja a próxima leva e abre os cards na fila.
// Também disseca vencedores novos que tenham copy/roteiro na ficha.
export async function rodarAnalista(ctx) {
  const { sb, q, env, getConfig, setConfig, promptDissecacao } = ctx;
  if (!env('ANTHROPIC_API_KEY')) return { ok: false, motivo: 'sem ANTHROPIC_API_KEY' };
  const cfg = await getConfig();
  const modelo = cfg.modelo || 'claude-sonnet-5-5';
  const tudo = await carregarTudo(sb);
  const p = await painel(sb, tudo);
  const hoje = diaISO();
  const amanha = diaISO(new Date(Date.now() + 864e5));
  const out = { ofertas: [], dissecados: 0, erros: [] };
  for (const o of tudo.ofertas.filter((x) => ['escalando', 'em_risco', 'validacao'].includes(x.estado))) {
    try {
      const po = p.porOferta.find((x) => x.id === o.id);
      const apr = await sb(`esteira_cr_aprendizados?oferta_id=eq.${q(o.id)}&select=tipo,autor,texto,criado_em&order=criado_em.desc&limit=12`);
      // Não repete no mesmo dia.
      if (apr.some((a) => a.autor === 'analista' && String(a.criado_em).slice(0, 10) === hoje)) { out.ofertas.push(`${o.id}: já analisada hoje`); continue; }
      const r = await claude(env, modelo, PROMPT_ANALISTA, contextoOferta(o, tudo, po, apr));
      const novos = [{ oferta_id: o.id, tipo: 'veredito', texto: r.veredito, autor: 'analista' }];
      for (const h of (r.hipoteses || []).slice(0, 3)) novos.push({ oferta_id: o.id, tipo: 'hipotese', texto: `${h.titulo} — ${h.porque} [${h.tipo}${h.pai ? ' · pai: ' + h.pai : ''}]`, autor: 'analista' });
      await sb('esteira_cr_aprendizados', { method: 'POST', body: novos });
      // Próxima leva: só se não houver leva planejada em aberto.
      const aberta = tudo.levas.find((l) => l.ofertaId === o.id && l.status === 'planejada');
      if (!aberta && r.leva) {
        const [ult] = await sb(`esteira_cr_levas?oferta_id=eq.${q(o.id)}&select=numero&order=numero.desc&limit=1`);
        const n = (ult?.numero || 0) + 1; const lid = `${o.id}-L${n}`;
        const hips = (r.hipoteses || []).slice(0, 3).map((h) => ({ titulo: String(h.titulo || '').slice(0, 120), porque: String(h.porque || '').slice(0, 400), tipo: h.tipo, pai: h.pai || null, variavel: String(h.variavel || 'execucao').slice(0, 20), ja_testado: h.ja_testado || null }));
        await sb('esteira_cr_levas', { method: 'POST', body: { id: lid, oferta_id: o.id, numero: n, planejada: amanha, hipotese: String(r.leva.hipotese || '').slice(0, 300), status: 'planejada', veredito: String(r.veredito || '').slice(0, 2000), hipoteses: hips } });
        // Tamanho da leva = o que falta para a meta semanal da oferta (descontando o que já nasceu nos últimos 7 dias), respeitando o mix do estado.
        const meta = Number(o.metaSemanal) || Number(R.metaSemanal) || 60;
        const criados7d = tudo.criativos.filter((c) => c.ofertaId === o.id && c.criadoEm >= new Date(Date.now() - 7 * 864e5).toISOString() && ['fila', 'briefing', 'producao', 'revisao', 'aprovado'].includes(c.status)).length;
        const alvo = Math.max(10, Math.min(40, meta - criados7d));
        const faixa = o.estado === 'em_risco' ? null : (R.mixPorRoas || REGRAS_PADRAO.mixPorRoas).find((m) => (po?.roas7 ?? 0) >= m.roas);
        const mixPct = o.estado === 'em_risco' ? MIX_POR_ESTADO.em_risco : (faixa || o.mix || MIX_POR_ESTADO[o.estado] || MIX_POR_ESTADO.escalando);
        const mix = { modelagem: Math.round(alvo * (mixPct.modelagem || 0) / 100), variacao: Math.round(alvo * (mixPct.variacao || 0) / 100), zero: Math.max(0, alvo - Math.round(alvo * (mixPct.modelagem || 0) / 100) - Math.round(alvo * (mixPct.variacao || 0) / 100)) };
        const pais = (r.leva.pais || []).filter((id) => tudo.criativos.some((c) => c.id === id && c.ofertaId === o.id));
        const cards = []; let k = 0;
        // Cada card nasce ligado a UMA hipótese (variável + pai), em rodízio dentro do tipo; sem hipótese do tipo, rodízio nos pais.
        const add = (tipo, qtd, letra) => { const hs = hips.filter((h) => h.tipo === tipo); let j = 0; for (let i = 1; i <= (Number(qtd) || 0); i++) { const h = hs.length ? hs[j++ % hs.length] : null; const pai = tipo === 'zero' ? null : ((h?.pai && tudo.criativos.some((c) => c.id === h.pai)) ? h.pai : (pais[k++ % Math.max(pais.length, 1)] || null)); cards.push({ id: `${lid}-${letra}${String(i).padStart(2, '0')}`, oferta_id: o.id, leva_id: lid, tipo, pai_id: pai, variavel: h?.variavel || (tipo === 'zero' ? 'angulo' : tipo === 'variacao' ? 'hook_falado' : 'execucao'), hipotese: h?.titulo || String(r.leva.hipotese || '').slice(0, 120), status: 'fila', criado_por: 'analista', historico: [{ em: agora(), de: null, para: 'fila', por: 'analista', nota: `leva ${n}${h ? ' · hipótese: ' + h.titulo : ''}` }] }); } };
        add('modelagem', mix.modelagem, 'M'); add('variacao', mix.variacao, 'V'); add('zero', mix.zero, 'Z');
        if (cards.length) await sb('esteira_cr_criativos?on_conflict=id', { method: 'POST', body: cards, prefer: 'resolution=ignore-duplicates' });
        out.ofertas.push(`${o.id}: veredito + ${novos.length - 1} hipóteses + ${lid} com ${cards.length} cards`);
      } else out.ofertas.push(`${o.id}: veredito + ${novos.length - 1} hipóteses`);
    } catch (e) { out.erros.push(`${o.id}: ${e.message}`); }
  }
  // Dissecação automática: vencedor com copy e sem dissecação.
  const dissRows = await sbAll(sb, "esteira_cr_aprendizados?tipo=eq.dissecacao&select=criativo_id,autor");
  const dissecadas = new Set(dissRows.filter((a) => a.autor === 'dissecacao').map((a) => a.criativo_id));
  const pendentes = new Set(dissRows.filter((a) => a.autor === 'sistema').map((a) => a.criativo_id));
  for (const c of tudo.criativos.filter((x) => x.status === 'vencedor' && !dissecadas.has(x.id))) {
    if (!c.copy || c.copy.trim().length < 20) {
      if (pendentes.has(c.id)) continue;
      await sb('esteira_cr_aprendizados', { method: 'POST', body: { oferta_id: c.ofertaId, criativo_id: c.id, tipo: 'dissecacao', texto: 'PENDENTE: cole a copy/roteiro na ficha do criativo; a dissecação roda sozinha no próximo ciclo.', autor: 'sistema' } });
      continue;
    }
    try {
      const ficha = await claude(env, cfg.modeloBarato || 'claude-haiku-5-5', promptDissecacao(), `TRANSCRIÇÃO:\n${c.copy.slice(0, 20000)}`, 2000);
      await sb('esteira_cr_aprendizados', { method: 'POST', body: { oferta_id: c.ofertaId, criativo_id: c.id, tipo: 'dissecacao', texto: JSON.stringify(ficha), autor: 'dissecacao' } });
      out.dissecados++;
    } catch (e) { out.erros.push(`dissecação ${c.id}: ${e.message}`); }
  }
  await setConfig('cr_ultimo_analista', { em: agora(), ...out });
  await sb('esteira_cr_log', { method: 'POST', body: { tipo: 'analista', resumo: `${out.ofertas.length} ofertas, ${out.dissecados} dissecações${out.erros.length ? ', erros: ' + out.erros.length : ''}`, detalhe: out } });
  return out;
}

// ---------------------------------------------------------------- Diretor de Copy + Revisor
// Pega cards em "fila", escreve ângulo/hook/body/copy modelando os vencedores da oferta (método do James),
// o Revisor pontua, reescreve uma vez se a nota for baixa, e o card vai para "revisao" esperando o gestor.
const SYSTEM_COPY = [
  { type: 'text', text: JAMES, cache_control: { type: 'ephemeral' } },
  { type: 'text', text: `\n\n# MODO AUTOMÁTICO (Diretor de Copy do app Criativos)\nVocê está escrevendo UM criativo de uma leva, sem conversa com o usuário: nada de mordomo, nada de perguntas. Use MODO COPY. Modelar, não inventar: "modelagem" = mesmo ângulo e estrutura do criativo-pai com execução nova; "variacao" = troca de hook, formato ou body do pai mantendo o ângulo; "zero" = ângulo ou mecanismo novo, escolhido das hipóteses do Analista ou da biblioteca. A oferta é low-ticket (R$ 27–57), PDF/kit pronto pra usar; o público são terapeutas, psicólogas, educadoras e praticantes holísticas no Brasil; a promessa é prática e imediata. Escreva em português do Brasil, na língua do público, sem jargão de marketing. Dentro dos textos do JSON não use aspas duplas; separe linhas com \\n. Responda APENAS com JSON válido:\n{\n "angulo": "código e nome do ângulo (ex.: S07 Mecanismo único)",\n "mecanismo": "1 frase: o como-funciona que sustenta a promessa",\n "hook": "primeira frase do criativo, literal",\n "body": "estrutura em blocos, ex.: Qualificador → Invalidação → Spoiler MSOL → Stack de valor → CTA",\n "formato": "IMG|VID|UGC|CAR",\n "copy": "texto completo do anúncio (primary text), 80 a 180 palavras, com CTA",\n "headline": "até 40 caracteres",\n "roteiro": "se VID/UGC: cenas numeradas com fala e o que aparece (hook visual nos 2 primeiros segundos); se IMG: descrição da arte e do texto na imagem",\n "porque": "2 frases: por que este criativo pode vencer, citando o pai ou a hipótese",\n "base_pesquisa": "qual público, qual dor ou desejo, qual crença ou objeção e quais expressões literais do público (da PESQUISA) este criativo usa; 2 a 4 frases",\n "fichas_usadas": "ids das fichas do REPERTÓRIO que orientaram a escolha e o que você tirou de cada uma, em 1 frase por ficha",\n "variavel": "hook_visual|hook_falado|body|formato|angulo|avatar|mecanismo|oferta|execucao — a única coisa que este card muda em relação ao pai",\n "muda": "1 a 2 frases, concretas: em relação ao pai X (cite o id), o que fica igual e o que muda"\n}` },
  { type: 'text', text: `\n\n# ORDEM DE LEITURA (regra da operação desde 30/10)\nPrimeiro a PESQUISA DA OFERTA (ela diz com quem e sobre o quê falar), depois as fichas do REPERTÓRIO (elas ensinam como). Teoria sem pesquisa dá copy bem estruturada e genérica. Use a linguagem literal do público que está na pesquisa: a copy fala como a cliente fala, não como as fichas falam. As fichas são material de estudo, não roteiro: não copie frases nem exemplos delas. Se não houver pesquisa no contexto, diga isso em base_pesquisa e escreva a partir dos vencedores.` },
];
const SYSTEM_REVISOR = `Você é o Revisor do Setor de Criativos. Recebe a ficha de UM criativo escrito pelo Diretor de Copy mais o contexto da oferta (vencedores, hipóteses, pesquisa). Pontua de 0 a 10 e devolve o que precisa mudar. Critérios: (1) hook para a rolagem em 1 frase e fala com o avatar real; (2) o ângulo é coerente com a oferta e com o tipo pedido (modelagem/variação/zero) — modelagem não pode ser cópia literal do pai nem ângulo diferente; (3) promessa concreta, imediata e crível para low-ticket; (4) linguagem do público, sem jargão; (5) CTA claro; (6) não repete um criativo morto recente; (7) se há PESQUISA DA OFERTA no contexto, a copy usa a linguagem literal do público e base_pesquisa aponta público, dor/desejo e objeção que estão de fato na pesquisa — copy genérica ou com jargão de marketing apesar da pesquisa disponível não passa de 5. Se o card é de HOOK VISUAL (copy e hook falado iguais ao pai), avalie só o conceito visual: primeiro quadro que para a rolagem, virada clara, texto na tela curto, família visual diferente dos irmãos, exequível com takes gerados (sem pessoa real). Sem elogio. Dentro dos textos não use aspas duplas. Responda APENAS com JSON válido: {"score": 0, "motivos": "até 3 frases", "ajustes": "o que reescrever, concreto; vazio se score >= 8"}`;

function contextoCard(c, o, tudo, apr, bib = []) {
  const cs = tudo.criativos.filter((x) => x.ofertaId === o.id);
  const ficha = (x) => `${x.id} [${x.status}|${x.tipo}|${x.formato || '?'}] roas ${x.total.roas ?? '-'} vendas ${x.total.vendas} gasto R$ ${x.total.gasto}${x.total.hookRate ? ' hook ' + x.total.hookRate + '%' : ''}${x.angulo ? '\n   ângulo: ' + x.angulo : ''}${x.hook ? '\n   hook: ' + x.hook : ''}${x.body ? '\n   body: ' + x.body : ''}${x.copy ? '\n   copy: ' + x.copy.slice(0, 700) : ''}${x.aprendizado ? '\n   aprendizado: ' + x.aprendizado : ''}`;
  const pai = c.paiId ? cs.find((x) => x.id === c.paiId) : null;
  const venc = cs.filter((x) => x.status === 'vencedor').sort((a, b) => b.total.receita - a.total.receita).slice(0, 6);
  const mortos = cs.filter((x) => x.status === 'morto' && x.total.gasto >= 150).sort((a, b) => b.statusEm.localeCompare(a.statusEm)).slice(0, 5);
  const diss = apr.filter((a) => a.tipo === 'dissecacao' && a.autor === 'dissecacao' && (a.criativo_id === c.paiId || venc.some((v) => v.id === a.criativo_id))).slice(0, 3);
  const leva = tudo.levas.find((l) => l.id === c.levaId);
  const fichas = escolherFichas(c, leva, o, bib);
  c._fichas = fichas.map((f) => f.id);
  // Bloco estável (vai para o system com cache: igual para todos os cards da mesma oferta/situação) + bloco do card.
  const estavel = [
    `OFERTA ${o.id} — ${o.nome}${o.familia ? ' (' + o.familia + ')' : ''} · estado ${o.estado}${o.pvUrl ? ' · PV: ' + o.pvUrl : ''}`,
    `PESQUISA DA OFERTA (6 camadas; leia antes de tudo):\n${o.pesquisaResumo || (o.pesquisaBruta ? o.pesquisaBruta.slice(0, 14000) : '(sem pesquisa cadastrada; use o que os vencedores mostram e diga isso em base_pesquisa)')}${o.notas ? '\n\nNOTAS DO GESTOR:\n' + o.notas : ''}`,
    fichas.length ? `REPERTÓRIO (fichas de estudo escolhidas pelo índice para este card; não copie frases):\n${fichas.map((f) => `### ${f.id} — ${f.titulo}\n${corpoFicha(f)}`).join('\n\n')}` : '',
    `VENCEDORES VIVOS DA OFERTA:\n${venc.map(ficha).join('\n') || 'nenhum'}`,
    `MORTOS RECENTES (não repetir):\n${mortos.map((x) => `${x.id} roas ${x.total.roas ?? 0}${x.hook ? ' · hook: ' + x.hook : ''}${x.angulo ? ' · ' + x.angulo : ''}`).join('\n') || 'nenhum'}`,
    `ANALISTA (veredito e hipóteses recentes):\n${apr.filter((a) => a.autor === 'analista').slice(0, 4).map((a) => `[${a.tipo}] ${a.texto}`).join('\n') || 'nenhum'}`,
  ].filter(Boolean).join('\n\n');
  const variavel = [
    `CARD A ESCREVER: ${c.id} · tipo ${c.tipo}${c.formato ? ' · formato ' + c.formato : ''}${leva?.hipotese ? ' · hipótese da leva: ' + leva.hipotese : ''}${c.hipotese ? '\nHIPÓTESE DESTE CARD: ' + c.hipotese : ''}${c.variavel ? '\nVARIÁVEL A TESTAR: ' + c.variavel + ' — em relação ao pai, mude SÓ isso; tudo o mais fica igual (é um teste de variável única).' : ''}${c.angulo ? ' · ângulo pedido: ' + c.angulo : ''}${c.hook ? ' · hook pedido: ' + c.hook : ''}`,
    pai ? `CRIATIVO-PAI (modelar / variar a partir dele):\n${ficha(pai)}` : 'SEM PAI: criativo do zero.',
    diss.length ? `DISSECAÇÕES:\n${diss.map((d) => `${d.criativo_id}: ${d.texto.slice(0, 900)}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
  return { estavel, variavel };
}

export async function rodarCopy(ctx, { maxCards = 15, paiId = null, ofertaId = null, variavel = null } = {}) {
  const { sb, q, env, getConfig, setConfig } = ctx;
  if (!env('ANTHROPIC_API_KEY')) return { ok: false, motivo: 'sem ANTHROPIC_API_KEY' };
  const cfg = await getConfig();
  const modelo = cfg.modelo || 'claude-sonnet-5-5';
  // Revisor dá nota, não cria: roda no modelo pequeno (config modeloBarato; Haiku por padrão).
  const modeloRev = cfg.modeloBarato || 'claude-haiku-5-5';
  const tudo = await carregarTudo(sb);
  // Prioridade opcional (pai / oferta / variável): o gestor pede "escreve primeiro os filhos do S2A".
  // Devolvido = card em briefing cuja última mudança foi de uma pessoa (nota = o motivo); o Copy reescreve até 2 vezes.
  const devolvido = (c) => { if (c.status !== 'briefing') return false; const h = (c.historico || []).slice(-1)[0]; if (!h || h.por === 'copy' || h.por === 'revisor' || h.de !== 'revisao') return false; return (c.historico || []).filter((x) => x.de === 'revisao' && x.para === 'briefing').length <= 2; };
  const fila = tudo.criativos.filter((c) => (c.status === 'fila' || devolvido(c)) && (!paiId || c.paiId === paiId) && (!ofertaId || c.ofertaId === ofertaId) && (!variavel || c.variavel === variavel)).sort((a, b) => a.ofertaId.localeCompare(b.ofertaId) || a.criadoEm.localeCompare(b.criadoEm)).slice(0, maxCards);
  const out = { escritos: 0, reescritos: 0, erros: [] };
  const aprCache = {};
  // Biblioteca (fichas do repertório) e pesquisa das ofertas: carregadas uma vez por rodada.
  const bib = fila.length ? await sbAll(sb, 'esteira_cr_biblioteca?select=id,categoria,titulo,fonte,peso,texto&categoria=neq.guia') : [];
  const pesq = fila.length ? await sb('esteira_cr_ofertas?select=id,pesquisa&pesquisa_resumo=is.null&pesquisa=not.is.null') : [];
  for (const o of tudo.ofertas) o.pesquisaBruta = pesq.find((x) => x.id === o.id)?.pesquisa || null;
  for (const c of fila) {
    const o = tudo.ofertas.find((x) => x.id === c.ofertaId); if (!o) continue;
    try {
      // Marca como briefing para ninguém pegar o mesmo card.
      const [row] = await sb(`esteira_cr_criativos?id=eq.${q(c.id)}&status=in.(fila,briefing)&select=*`);
      if (!row) continue;
      const dev = devolvido(c) ? (c.historico || []).slice(-1)[0] : null;
      await mudarStatus(sb, q, row, 'briefing', 'copy', dev ? `Diretor de Copy reescrevendo (devolvido: ${String(dev.nota || '').slice(0, 80)})` : 'Diretor de Copy escrevendo');
      aprCache[o.id] ||= await sb(`esteira_cr_aprendizados?oferta_id=eq.${q(o.id)}&select=tipo,autor,texto,criativo_id,criado_em&order=criado_em.desc&limit=30`);
      const pai = c.paiId ? tudo.criativos.find((x) => x.id === c.paiId) : null;
      const soVisual = c.variavel === 'hook_visual' && pai && pai.copy;
      const { estavel, variavel } = contextoCard(c, o, tudo, aprCache[o.id], bib);
      // Pesquisa + fichas vão no system com cache (90% mais barato quando o próximo card é da mesma oferta).
      const cache = { type: 'text', text: `\n\n# CONTEXTO DA OFERTA\n${estavel}`, cache_control: { type: 'ephemeral' } };
      const sysCopy = [...SYSTEM_COPY, cache];
      const sysRev = [{ type: 'text', text: SYSTEM_REVISOR }, cache];
      const retrabalho = dev ? `\n\nDEVOLVIDO PELO GESTOR — motivo: ${dev.nota || '(sem nota)'}\nVERSÃO DEVOLVIDA (não repita o que foi criticado; mantenha o que não foi):\nângulo: ${c.angulo || '-'}\nhook: ${c.hook || '-'}\nbody: ${c.body || '-'}\ncopy: ${(c.copy || '').slice(0, 1500)}` : '';
      const contexto = (soVisual
        ? `${variavel}\n\nMODO HOOK VISUAL: este card NÃO muda copy nem hook falado — são os do pai ${pai.id}, literalmente. Você só cria o HOOK VISUAL dos 3 primeiros segundos: o que aparece no primeiro quadro, a virada no meio do hook e o texto na tela. Famílias visuais já usadas nos irmãos: ${tudo.criativos.filter((x) => x.paiId === pai.id && x.id !== c.id && x.body).map((x) => x.body.slice(0, 80)).join(' | ') || 'nenhuma'} — use uma família DIFERENTE. Devolva no JSON: angulo = ângulo do pai; hook = hook falado do pai (igual); copy = copy do pai (igual); body = "HOOK VISUAL: <formato> — <primeiro quadro> → <virada>"; headline = texto na tela; roteiro = só as cenas dos 3 primeiros segundos; variavel = hook_visual; muda = "só o hook visual".`
        : variavel) + retrabalho;
      let ficha = await claude(env, modelo, sysCopy, contexto, 4500).catch(() => claude(env, modelo, sysCopy, contexto + '\n\nLembrete: responda apenas o JSON, sem texto antes ou depois, roteiro em no máximo 8 cenas curtas.', 4500));
      let rev = await claude(env, modeloRev, sysRev, `${contexto}\n\nFICHA ESCRITA:\n${JSON.stringify(ficha)}`, 1200);
      if (Number(rev.score) < 6 && rev.ajustes) {
        ficha = await claude(env, modelo, sysCopy, `${contexto}\n\nPRIMEIRA VERSÃO (reprovada pelo Revisor, nota ${rev.score}):\n${JSON.stringify(ficha)}\n\nAJUSTES PEDIDOS: ${rev.ajustes}\n\nReescreva aplicando os ajustes.`, 4500);
        rev = await claude(env, modeloRev, sysRev, `${contexto}\n\nFICHA ESCRITA (2ª versão):\n${JSON.stringify(ficha)}`, 1200);
        out.reescritos++;
      }
      if (soVisual) { ficha.copy = pai.copy.split('\n\nHEADLINE:')[0].split('\n\nROTEIRO')[0]; ficha.hook = pai.hook || ficha.hook; ficha.angulo = pai.angulo || ficha.angulo; ficha.mecanismo = pai.mecanismo || ficha.mecanismo; }
      const copy = [ficha.copy, ficha.headline ? `\n\nHEADLINE: ${ficha.headline}` : '', ficha.roteiro ? `\n\nROTEIRO / ARTE:\n${ficha.roteiro}` : '', ficha.porque ? `\n\nPOR QUE: ${ficha.porque}` : ''].join('');
      const formato = ['IMG', 'VID', 'UGC', 'CAR'].includes(String(ficha.formato).toUpperCase()) ? String(ficha.formato).toUpperCase() : row.formato;
      const [atual] = await sb(`esteira_cr_criativos?id=eq.${q(c.id)}`, { method: 'PATCH', prefer: 'return=representation', body: { angulo: String(ficha.angulo || '').slice(0, 200), mecanismo: String(ficha.mecanismo || '').slice(0, 400), hook: String(ficha.hook || '').slice(0, 400), body: String(ficha.body || '').slice(0, 400), copy, formato, base_pesquisa: String(ficha.base_pesquisa || '').slice(0, 1500) || null, fichas: c._fichas || [], variavel: String(ficha.variavel || c.variavel || '').slice(0, 20) || null, muda: String(ficha.muda || '').slice(0, 500) || null, score: Math.max(0, Math.min(10, Math.round(Number(rev.score) || 0))), atualizado_em: agora() } });
      await mudarStatus(sb, q, atual, 'revisao', 'revisor', `Revisor: ${rev.score}/10 — ${rev.motivos}${rev.ajustes ? ' · ajustes: ' + rev.ajustes : ''}`);
      await sb('esteira_cr_aprendizados', { method: 'POST', body: { oferta_id: o.id, leva_id: c.levaId, criativo_id: c.id, tipo: 'nota', texto: `Revisor ${rev.score}/10: ${rev.motivos}${ficha.fichas_usadas ? ' · fichas: ' + String(ficha.fichas_usadas).slice(0, 400) : ''}`, autor: 'revisor' } });
      out.escritos++;
    } catch (e) {
      out.erros.push(`${c.id}: ${e.message}`);
      const [row] = await sb(`esteira_cr_criativos?id=eq.${q(c.id)}&select=*`);
      if (row && row.status === 'briefing') await mudarStatus(sb, q, row, 'fila', 'copy', `erro: ${e.message.slice(0, 120)}`);
      if (e.fatal) { await setConfig('cr_api_erro', { em: agora(), msg: e.message.slice(0, 200) }); break; }
    }
  }
  if (!out.erros.some((x) => /credit balance|billing/i.test(x)) && out.escritos) await setConfig('cr_api_erro', {});
  if (fila.length) {
    await setConfig('cr_ultimo_copy', { em: agora(), ...out });
    await sb('esteira_cr_log', { method: 'POST', body: { tipo: 'copy', resumo: `${out.escritos} cards escritos (${out.reescritos} reescritos)${out.erros.length ? ', erros: ' + out.erros.length : ''}`, detalhe: out } });
  }
  return out;
}

// ---------------------------------------------------------------- webhook da Lastlink
async function receberLastlink(ev, { sb, q }) {
  const evento = String(pega(ev, 'Event') || '');
  const d = pega(ev, 'Data') || {};
  const utm = pega(d, 'Utm') || {};
  const compra = pega(d, 'Purchase') || {};
  const produtos = pega(d, 'Products') || [];
  const pagamento = String(pega(compra, 'PaymentId') || pega(ev, 'Id') || '');
  const valor = num(pega(compra, 'Price', 'Value'));
  const produtoNome = String(pega(produtos[0] || {}, 'Name') || '');
  const utmContent = String(pega(utm, 'UtmContent') || '').slice(0, 300);
  const utmCampaign = String(pega(utm, 'UtmCampaign') || '').slice(0, 300);
  const ehTeste = !!pega(ev, 'IsTest');
  const reembolso = /^payment_(refund|chargeback)$/i.test(evento);
  const aprovada = !reembolso && /purchase_order_confirmed/i.test(evento);
  let resultado = 'ignorado', criativoId = null, ofertaId = null;
  if (aprovada && pagamento) {
    const nome = limparNome(utmContent);
    if (nome) { const [c] = await sb(`esteira_cr_criativos?id=eq.${q(nome)}&select=id,oferta_id`); if (c) { criativoId = c.id; ofertaId = c.oferta_id; } }
    if (!ofertaId && produtoNome) {
      const ofs = (await sb('esteira_cr_ofertas?select=id,produtos')).map(ofertaApp);
      ofertaId = ofs.find((o) => (o.produtos || []).some((p) => produtoNome.toLowerCase().includes(String(p).toLowerCase())))?.id || null;
    }
    await sb('esteira_cr_vendas?on_conflict=id', {
      method: 'POST', prefer: 'resolution=merge-duplicates',
      body: { id: pagamento, criativo_id: criativoId, oferta_id: ofertaId, utm_content: utmContent, utm_campaign: utmCampaign, valor, produto: produtoNome.slice(0, 200), pago_em: pega(compra, 'PaymentDate') || pega(ev, 'CreatedAt') || agora(), is_test: ehTeste, origem: 'webhook' },
    });
    resultado = criativoId ? `venda do criativo ${criativoId}` : 'venda sem criativo conhecido';
  } else if (reembolso && pagamento) {
    await sb(`esteira_cr_vendas?id=eq.${q(pagamento)}`, { method: 'PATCH', body: { reembolso: true } });
    resultado = 'reembolso marcado';
  }
  await sb('esteira_cr_log', { method: 'POST', body: { tipo: 'webhook', resumo: resultado, detalhe: { evento, pagamento, utm_content: utmContent, produto: produtoNome.slice(0, 120), valor, is_test: ehTeste } } });
  return { ok: true, resultado };
}

// ---------------------------------------------------------------- rotas públicas (sem login)
export async function rotasCriativosPublicas(p, m, req, ctx) {
  const { json, fail, tokenWebhookCr } = ctx;
  const mw = p.match(/^\/api\/cr\/lastlink\/([\w-]+)$/);
  if (mw && m === 'POST') {
    if (mw[1] !== tokenWebhookCr()) fail(403, 'Endereço inválido.');
    const ev = await req.json().catch(() => null);
    if (!ev) fail(400, 'Corpo vazio.');
    return json(200, await receberLastlink(ev, ctx));
  }
  return null;
}

// ---------------------------------------------------------------- rotas com login
export async function rotasCriativos(p, m, ctx) {
  const { sb, json, fail, q, user, admin, body, setConfig, env, origem, tokenWebhookCr, reqUrl } = ctx;

  if (p === '/api/cr/bootstrap' && m === 'GET') {
    const tudo = await carregarTudo(sb);
    const [tk] = await sb('esteira_config?chave=eq.cr_meta_token&select=valor');
    const meta = env('META_ACCESS_TOKEN') ? { fonte: 'env' } : tk?.valor?.token ? { fonte: 'usuario', usuario: tk.valor.usuario, exp: tk.valor.exp } : null;
    return json(200, { ...tudo, painel: await painel(sb, tudo), webhook: admin ? `${origem}/api/cr/lastlink/${tokenWebhookCr()}` : null, apiErro: (await sb('esteira_config?chave=eq.cr_api_erro&select=valor'))[0]?.valor || null, metaConfigurado: !!meta, meta, cambio: (await sb('esteira_config?chave=eq.cr_cambio&select=valor'))[0]?.valor || null, lastlinkConfigurada: lastlinkConfigurada(env), magnificConfigurado: magnificConfigurado(env), status: STATUS });
  }

  // ---- ofertas
  if (p === '/api/cr/ofertas' && m === 'POST') {
    const b = await body();
    const id = String(b.id || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!id || !String(b.nome || '').trim()) fail(400, 'Oferta precisa de sigla (ex.: CFAM) e nome.');
    const row = { id, nome: b.nome.trim(), familia: b.familia || null, estado: b.estado || 'validacao', prefixos: b.prefixos || [], produtos: b.produtos || [], pasta_drive: b.pastaDrive || null, pv_url: b.pvUrl || null, notas: b.notas || null };
    if (b.mix) row.mix = b.mix;
    const [r] = await sb('esteira_cr_ofertas', { method: 'POST', body: row, prefer: 'return=representation' });
    return json(201, ofertaApp(r));
  }
  let mm = p.match(/^\/api\/cr\/ofertas\/([A-Z0-9]+)$/);
  if (mm && m === 'PATCH') {
    const b = await body();
    const patch = { atualizado_em: agora() };
    for (const [k, col] of Object.entries(CAMPOS_OFERTA)) if (k in b) patch[col] = b[k];
    if (b.estado && !b.mix && MIX_POR_ESTADO[b.estado]) patch.mix = MIX_POR_ESTADO[b.estado];
    const [r] = await sb(`esteira_cr_ofertas?id=eq.${q(mm[1])}`, { method: 'PATCH', body: patch, prefer: 'return=representation' });
    if (!r) fail(404, 'Oferta não encontrada.');
    return json(200, ofertaApp(r));
  }

  // ---- levas
  if (p === '/api/cr/levas' && m === 'POST') {
    const b = await body();
    const [of] = await sb(`esteira_cr_ofertas?id=eq.${q(b.ofertaId || '')}&select=id`);
    if (!of) fail(400, 'Escolha a oferta.');
    let numero = Number(b.numero);
    if (!numero) { const [ult] = await sb(`esteira_cr_levas?oferta_id=eq.${q(of.id)}&select=numero&order=numero.desc&limit=1`); numero = (ult?.numero || 0) + 1; }
    const row = { id: `${of.id}-L${numero}`, oferta_id: of.id, numero, planejada: b.planejada || null, hipotese: b.hipotese || null, codigo: b.codigo || null, status: 'planejada' };
    const [r] = await sb('esteira_cr_levas', { method: 'POST', body: row, prefer: 'return=representation' });
    return json(201, levaApp(r));
  }
  mm = p.match(/^\/api\/cr\/levas\/([\w-]+)$/);
  if (mm && m === 'PATCH') {
    const b = await body();
    const patch = {};
    for (const k of ['planejada', 'hipotese', 'status', 'codigo']) if (k in b) patch[k] = b[k];
    if ('noAr' in b) patch.no_ar = b.noAr;
    const [r] = await sb(`esteira_cr_levas?id=eq.${q(mm[1])}`, { method: 'PATCH', body: patch, prefer: 'return=representation' });
    if (!r) fail(404, 'Leva não encontrada.');
    return json(200, levaApp(r));
  }

  // ---- criativos (cards)
  if (p === '/api/cr/criativos' && m === 'POST') {
    const b = await body();
    const id = limparNome(b.id);
    if (!/^[A-Z0-9][A-Z0-9._-]{3,}$/i.test(id)) fail(400, 'ID inválido. Use o nome que o anúncio terá no Meta, sem espaços (ex.: CFAM-L5-UGC-01).');
    const [of] = await sb(`esteira_cr_ofertas?id=eq.${q(b.ofertaId || '')}&select=id`);
    if (!of) fail(400, 'Escolha a oferta.');
    if ((await sb(`esteira_cr_criativos?id=eq.${q(id)}&select=id`)).length) fail(409, 'Já existe um criativo com esse ID.');
    const status = STATUS.includes(b.status) ? b.status : 'fila';
    const row = { id, oferta_id: of.id, leva_id: b.levaId || null, tipo: ['modelagem', 'variacao', 'zero'].includes(b.tipo) ? b.tipo : 'modelagem', pai_id: b.paiId || null, formato: b.formato || formatoDoNome(id), angulo: b.angulo || null, mecanismo: b.mecanismo || null, hook: b.hook || null, body: b.body || null, copy: b.copy || null, arquivo_url: b.arquivoUrl || null, status, status_em: agora(), no_ar_em: status === 'no_ar' ? agora() : null, criado_por: user.id, historico: [{ em: agora(), de: null, para: status, por: user.id }] };
    const [r] = await sb('esteira_cr_criativos', { method: 'POST', body: row, prefer: 'return=representation' });
    return json(201, criativoApp(r));
  }
  mm = p.match(/^\/api\/cr\/criativos\/([^/]+)$/);
  if (mm && m === 'PATCH') {
    const b = await body();
    const patch = { atualizado_em: agora() };
    for (const [k, col] of Object.entries(CAMPOS_CRIATIVO)) if (k in b) patch[col] = b[k];
    if (b.novoId) {
      // Renomear = o nome final do anúncio no Meta (um card da fila nasce com ID provisório).
      const novo = limparNome(b.novoId);
      if (!/^[A-Z0-9][A-Z0-9 ._-]{3,}$/i.test(novo)) fail(400, 'ID inválido.');
      if ((await sb(`esteira_cr_criativos?id=eq.${q(novo)}&select=id`)).length) fail(409, 'Já existe um criativo com esse ID.');
      patch.id = novo;
      for (const t of ['esteira_cr_vendas', 'esteira_cr_metricas', 'esteira_cr_ads']) await sb(`${t}?criativo_id=eq.${q(mm[1])}`, { method: 'PATCH', body: { criativo_id: novo } });
      await sb(`esteira_cr_aprendizados?criativo_id=eq.${q(mm[1])}`, { method: 'PATCH', body: { criativo_id: novo } });
    }
    const [r] = await sb(`esteira_cr_criativos?id=eq.${q(mm[1])}`, { method: 'PATCH', body: patch, prefer: 'return=representation' });
    if (!r) fail(404, 'Criativo não encontrado.');
    return json(200, criativoApp(r));
  }
  mm = p.match(/^\/api\/cr\/criativos\/([^/]+)\/status$/);
  if (mm && m === 'POST') {
    const { para, nota } = await body();
    const [c] = await sb(`esteira_cr_criativos?id=eq.${q(mm[1])}&select=*`);
    if (!c) fail(404, 'Criativo não encontrado.');
    if (!STATUS.includes(para)) fail(400, 'Status desconhecido.');
    if (para === 'aprovado' && !admin) fail(403, 'Só o gestor aprova.');
    const r = await mudarStatus(sb, q, c, para, user.id, nota);
    // Devolveu: o Copy reescreve com a nota (até 2 vezes); a partir da 3ª o card fica em briefing esperando você.
    if (para === 'briefing' && c.status === 'revisao') {
      const n = (c.historico || []).filter((x) => x.de === 'revisao' && x.para === 'briefing').length + 1;
      if (n <= 2) fetch(`${origem}/cr-copy-bg`, { method: 'POST', headers: { 'x-cr-chave': tokenWebhookCr(), 'content-type': 'application/json' }, body: JSON.stringify({ maxCards: 15 }) }).catch(() => {});
      else await sb('esteira_cr_aprendizados', { method: 'POST', body: { oferta_id: c.oferta_id, leva_id: c.leva_id, criativo_id: c.id, tipo: 'nota', texto: `Devolvido 3 vezes; o Copy não reescreve mais. Edite na ficha ou mate o card. Último motivo: ${nota || '-'}`, autor: 'sistema' } });
    }
    // Aprovou → o Diretor de Criação monta o projeto de edição em segundo plano.
    if (para === 'aprovado' && c.copy && !c.projeto) fetch(`${origem}/cr-criacao-bg`, { method: 'POST', headers: { 'x-cr-chave': tokenWebhookCr(), 'content-type': 'application/json' }, body: '{}' }).catch(() => {});
    if (c.leva_id && para === 'no_ar') await sb(`esteira_cr_levas?id=eq.${q(c.leva_id)}&status=neq.no_ar`, { method: 'PATCH', body: { status: 'no_ar', no_ar: diaISO() } });
    return json(200, criativoApp(r));
  }
  mm = p.match(/^\/api\/cr\/criativos\/([^/]+)\/serie$/);
  if (mm && m === 'GET') {
    const [met, vendas] = await Promise.all([
      sb(`esteira_cr_metricas?criativo_id=eq.${q(mm[1])}&select=dia,gasto,impressoes,cliques,lpv,ic,video_3s,video_75&order=dia.asc`),
      sb(`esteira_cr_vendas?criativo_id=eq.${q(mm[1])}&reembolso=eq.false&is_test=eq.false&select=pago_em,valor`),
    ]);
    const dias = {};
    for (const r of met) { const d = dias[r.dia] ||= { dia: r.dia, gasto: 0, impressoes: 0, cliques: 0, lpv: 0, ic: 0, video_3s: 0, video_75: 0, vendas: 0, receita: 0 }; for (const k of ['gasto', 'impressoes', 'cliques', 'lpv', 'ic', 'video_3s', 'video_75']) d[k] += Number(r[k]) || 0; }
    for (const v of vendas) { const dia = String(v.pago_em).slice(0, 10); const d = dias[dia] ||= { dia, gasto: 0, impressoes: 0, cliques: 0, lpv: 0, ic: 0, video_3s: 0, video_75: 0, vendas: 0, receita: 0 }; d.vendas++; d.receita += Number(v.valor) || 0; }
    return json(200, Object.values(dias).sort((a, b) => a.dia.localeCompare(b.dia)));
  }

  // ---- aprendizados
  if (p === '/api/cr/aprendizados' && m === 'GET') {
    const u = new URL(req_url(ctx));
    const of = u.searchParams.get('oferta'), cr = u.searchParams.get('criativo');
    const f = of ? `oferta_id=eq.${q(of)}&` : cr ? `criativo_id=eq.${q(cr)}&` : '';
    return json(200, await sb(`esteira_cr_aprendizados?${f}select=*&order=criado_em.desc&limit=300`));
  }
  if (p === '/api/cr/aprendizados' && m === 'POST') {
    const b = await body();
    if (!String(b.texto || '').trim()) fail(400, 'Escreva o aprendizado.');
    const [r] = await sb('esteira_cr_aprendizados', { method: 'POST', body: { oferta_id: b.ofertaId || null, leva_id: b.levaId || null, criativo_id: b.criativoId || null, tipo: ['veredito', 'dissecacao', 'hipotese', 'nota'].includes(b.tipo) ? b.tipo : 'nota', texto: b.texto.trim(), autor: user.id }, prefer: 'return=representation' });
    return json(201, r);
  }

  // ---- anúncios sem par e ligação manual
  if (p === '/api/cr/ads/sem-par' && m === 'GET') return json(200, await sb('esteira_cr_ads?criativo_id=is.null&select=ad_id,ad_name,campaign_name,conta_id,sync_em&order=sync_em.desc&limit=500'));
  mm = p.match(/^\/api\/cr\/ads\/(\d+)\/ligar$/);
  if (mm && m === 'POST') {
    const { criativoId } = await body();
    const [c] = await sb(`esteira_cr_criativos?id=eq.${q(criativoId || '')}&select=id`);
    if (!c) fail(404, 'Criativo não encontrado.');
    await sb(`esteira_cr_ads?ad_id=eq.${q(mm[1])}`, { method: 'PATCH', body: { criativo_id: c.id } });
    await sb(`esteira_cr_metricas?ad_id=eq.${q(mm[1])}`, { method: 'PATCH', body: { criativo_id: c.id } });
    return json(200, { ok: true });
  }

  // ---- conectar a Meta com um token de usuário (Graph API Explorer): troca por 60 dias e guarda
  if (p === '/api/cr/meta/conectar' && m === 'POST') {
    if (!admin) fail(403, 'Só o gestor.');
    const { token } = await body();
    if (!String(token || '').trim()) fail(400, 'Cole o token.');
    const novo = await trocarTokenLongo(token.trim(), env);
    const me = await metaGet('me', { fields: 'id,name' }, novo.token).catch(() => ({}));
    await setConfig('cr_meta_token', { ...novo, conectadoEm: agora(), usuario: me.name || null });
    return json(200, { ok: true, usuario: me.name || null, exp: novo.exp });
  }
  if (p === '/api/cr/meta/renovar' && m === 'POST') { if (!admin) fail(403, 'Só o gestor.'); return json(200, await renovarTokenMeta(ctx)); }

  // ---- contas de anúncio que o token enxerga (liga/desliga igual à UTMIFY)
  if (p === '/api/cr/meta/contas' && m === 'GET') {
    const token = await tokenMeta({ sb, env });
    if (!token) fail(400, 'Conecte a Meta em Ajustes.');
    const [cfg] = await sb('esteira_config?chave=eq.cr_contas&select=valor');
    const ativas = new Set((cfg?.valor || []).map(String));
    const lista = await metaTodos('me/adaccounts', { fields: 'account_id,name,account_status,currency', limit: 200 }, token);
    const STATUS_CONTA = { 1: 'ativa', 2: 'desativada', 3: 'não liquidada', 7: 'em revisão', 8: 'pendente', 9: 'período de carência', 100: 'fechamento pendente', 101: 'fechada', 201: 'qualquer ativa', 202: 'qualquer fechada' };
    return json(200, lista.map((a) => ({ id: a.account_id, nome: a.name, status: STATUS_CONTA[a.account_status] || String(a.account_status), moeda: a.currency, bm: a.business?.name || null, ativa: ativas.has(String(a.account_id)) })).sort((a, b) => (b.ativa - a.ativa) || a.nome.localeCompare(b.nome)));
  }

  // ---- config, sync, veredito, importação (gestor)
  if (p === '/api/cr/config' && m === 'POST') {
    if (!admin) fail(403, 'Só o gestor.');
    const b = await body();
    if (b.contas) await setConfig('cr_contas', b.contas.map((c) => String(c).trim().replace(/^act_/, '')).filter(Boolean));
    if (b.regras) await setConfig('cr_regras', { ...REGRAS_PADRAO, ...b.regras });
    if (b.modeloBarato !== undefined) await setConfig('modeloBarato', b.modeloBarato || null);
    if (b.criacaoAdiantada !== undefined) await setConfig('criacaoAdiantada', Number(b.criacaoAdiantada) || 10);
    if (b.cambio) { const [row] = await sb('esteira_config?chave=eq.cr_cambio&select=valor'); await setConfig('cr_cambio', { ...(row?.valor || {}), manual: b.cambio }); }
    return json(200, { ok: true });
  }
  if (p === '/api/cr/sync' && m === 'POST') {
    if (!admin) fail(403, 'Só o gestor.');
    const b = await body();
    const [cfg] = await sb('esteira_config?chave=eq.cr_contas&select=valor');
    const contas = cfg?.valor || [];
    if (!contas.length) fail(400, 'Cadastre as contas de anúncio em Ajustes.');
    const dias = Math.min(Math.max(Number(b.dias) || 3, 1), 31);
    const ate = b.ate || diaISO(), desde = b.desde || diasAtras(dias - 1);
    const span = (new Date(ate) - new Date(desde)) / 864e5;
    if (span > 7 && origem && !b.agora) {
      // Períodos longos rodam na função em segundo plano (15 min), que avisa no log quando termina.
      const r = await fetch(`${origem}/cr-sync-bg`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cr-chave': tokenWebhookCr() }, body: JSON.stringify({ desde, ate, contas }) });
      if (r.status !== 202 && !r.ok) fail(502, `Não consegui iniciar o sync em segundo plano (${r.status}).`);
      return json(202, { segundoPlano: true, desde, ate, aviso: 'Rodando em segundo plano; acompanhe em "Ver log".' });
    }
    const r = await syncMeta(ctx, { desde, ate, contas });
    const l = await religar(sb, q);
    return json(200, { ...r, ...l, desde, ate });
  }
  if (p === '/api/cr/veredito' && m === 'POST') {
    if (!admin) fail(403, 'Só o gestor.');
    return json(200, await rodarVeredito(ctx));
  }
  // Normaliza IDs antigos (com '+', '/', ' — Cópia'): funde duplicatas e religa vendas/métricas/anúncios.
  if (p === '/api/cr/normalizar' && m === 'POST') {
    if (!admin) fail(403, 'Só o gestor.');
    const todos = await sbAll(sb, 'esteira_cr_criativos?select=id,oferta_id,status,no_ar_em,historico');
    const ids = new Set(todos.map((c) => c.id));
    const res = { renomeados: 0, fundidos: 0 };
    for (const c of todos) {
      const novo = limparNome(c.id);
      if (!novo || novo === c.id) continue;
      if (ids.has(novo)) {
        // Já existe o canônico: move as referências e apaga o duplicado.
        await sb(`esteira_cr_vendas?criativo_id=eq.${q(c.id)}`, { method: 'PATCH', body: { criativo_id: novo } });
        await sb(`esteira_cr_metricas?criativo_id=eq.${q(c.id)}`, { method: 'PATCH', body: { criativo_id: novo } });
        await sb(`esteira_cr_ads?criativo_id=eq.${q(c.id)}`, { method: 'PATCH', body: { criativo_id: novo } });
        await sb(`esteira_cr_criativos?pai_id=eq.${q(c.id)}`, { method: 'PATCH', body: { pai_id: novo } });
        await sb(`esteira_cr_criativos?id=eq.${q(c.id)}`, { method: 'DELETE' });
        res.fundidos++;
      } else {
        await sb(`esteira_cr_criativos?id=eq.${q(c.id)}`, { method: 'PATCH', body: { id: novo } });
        await sb(`esteira_cr_vendas?criativo_id=eq.${q(c.id)}`, { method: 'PATCH', body: { criativo_id: novo } });
        await sb(`esteira_cr_metricas?criativo_id=eq.${q(c.id)}`, { method: 'PATCH', body: { criativo_id: novo } });
        await sb(`esteira_cr_ads?criativo_id=eq.${q(c.id)}`, { method: 'PATCH', body: { criativo_id: novo } });
        ids.add(novo); res.renomeados++;
      }
      ids.delete(c.id);
    }
    // Vendas cujo utm_content normalizado agora bate com um criativo.
    const vendas = await sbAll(sb, 'esteira_cr_vendas?utm_content=not.is.null&select=id,criativo_id,utm_content');
    let religadas = 0;
    for (const v of vendas) {
      const nome = limparNome(v.utm_content);
      if (nome && nome !== v.criativo_id && ids.has(nome)) { await sb(`esteira_cr_vendas?id=eq.${q(v.id)}`, { method: 'PATCH', body: { criativo_id: nome } }); religadas++; }
    }
    const l = await religar(sb, q);
    return json(200, { ...res, religadas, ...l });
  }
  if (p === '/api/cr/copy' && m === 'POST') {
    if (!admin) fail(403, 'Só o gestor.');
    const b = await body().catch(() => ({}));
    const r = await fetch(`${origem}/cr-copy-bg`, { method: 'POST', headers: { 'x-cr-chave': tokenWebhookCr(), 'content-type': 'application/json' }, body: JSON.stringify({ paiId: b.paiId || null, ofertaId: b.ofertaId || null, variavel: b.variavel || null, maxCards: Number(b.maxCards) || 15 }) });
    if (r.status !== 202 && !r.ok) fail(502, `Não consegui iniciar o Diretor de Copy (${r.status}).`);
    return json(202, { segundoPlano: true, aviso: 'Diretor de Copy rodando; os cards da fila vão para Revisão.' });
  }
  if (p === '/api/cr/analista' && m === 'POST') {
    if (!admin) fail(403, 'Só o gestor.');
    const r = await fetch(`${origem}/cr-analista-bg`, { method: 'POST', headers: { 'x-cr-chave': tokenWebhookCr() } });
    if (r.status !== 202 && !r.ok) fail(502, `Não consegui iniciar o Analista (${r.status}).`);
    return json(202, { segundoPlano: true, aviso: 'Analista rodando; veja em Ver log e nos aprendizados.' });
  }
  mm = p.match(/^\/api\/cr\/criativos\/([^/]+)\/dissecar$/);
  if (mm && m === 'POST') {
    const [c] = await sb(`esteira_cr_criativos?id=eq.${q(mm[1])}&select=id,oferta_id,copy`);
    if (!c) fail(404, 'Criativo não encontrado.');
    if (!c.copy || c.copy.trim().length < 20) fail(400, 'Cole a copy/roteiro na ficha antes.');
    const cfg = await ctx.getConfig();
    const ficha = await claude(env, cfg.modeloBarato || 'claude-haiku-5-5', ctx.promptDissecacao(), `TRANSCRIÇÃO:\n${c.copy.slice(0, 20000)}`, 2000);
    const [r] = await sb('esteira_cr_aprendizados', { method: 'POST', body: { oferta_id: c.oferta_id, criativo_id: c.id, tipo: 'dissecacao', texto: JSON.stringify(ficha), autor: 'dissecacao' }, prefer: 'return=representation' });
    return json(200, r);
  }
  if (p === '/api/cr/religar' && m === 'POST') { if (!admin) fail(403, 'Só o gestor.'); return json(200, await religar(sb, q)); }
  // ---- agentes ao vivo: o que cada um está fazendo agora, última rodada, próxima, fila
  if (p === '/api/cr/agentes' && m === 'GET') {
    const tudo = await carregarTudo(sb);
    const cfg = await ctx.getConfig();
    const log = await sb('esteira_cr_log?select=em,tipo,resumo&order=em.desc&limit=40');
    const ult = (tipo) => log.find((l) => l.tipo === tipo) || null;
    const escrevendo = tudo.criativos.filter((c) => c.status === 'briefing' && (c.historico || []).some((h) => h.por === 'copy')).map((c) => ({ id: c.id, ofertaId: c.ofertaId, variavel: c.variavel, paiId: c.paiId, hipotese: c.hipotese, desde: c.statusEm }));
    const hojeIni = new Date(); hojeIni.setUTCHours(3, 0, 0, 0); if (hojeIni > new Date()) hojeIni.setUTCDate(hojeIni.getUTCDate() - 1); // 00:00 de Brasília
    const escritosHoje = tudo.criativos.filter((c) => (c.historico || []).some((h) => h.por === 'revisor' && h.em >= hojeIni.toISOString()));
    const recentes = tudo.criativos.filter((c) => ['revisao', 'aprovado', 'producao'].includes(c.status)).sort((a, b) => (b.statusEm || '').localeCompare(a.statusEm || '')).slice(0, 12).map((c) => ({ id: c.id, ofertaId: c.ofertaId, status: c.status, score: c.score, variavel: c.variavel, paiId: c.paiId, hook: (c.hook || '').slice(0, 120), em: c.statusEm }));
    const semProjeto = tudo.criativos.filter((c) => c.status === 'aprovado' && !c.projeto).map((c) => c.id);
    const agora_ = Date.now(), min = (iso) => iso ? Math.round((agora_ - new Date(iso).getTime()) / 60000) : null;
    const prox = (minuto, horas) => { const d = new Date(); d.setUTCSeconds(0, 0); const h = d.getUTCHours(); let alvo = new Date(d); alvo.setUTCMinutes(minuto); if (alvo <= d) alvo.setUTCHours(h + 1); if (horas) while (!horas.includes(alvo.getUTCHours())) alvo.setUTCHours(alvo.getUTCHours() + 1); return alvo.toISOString(); };
    const horasCopy = [...Array(15).keys()].map((i) => 9 + i).concat([0, 1]);
    return json(200, {
      agora: agora(),
      agentes: [
        { id: 'sync', nome: 'Sync Meta', fazendo: null, ultima: cfg.cr_ultimo_sync || ult('sync'), proxima: '06:10', ativo: min(ult('sync')?.em) !== null && min(ult('sync')?.em) < 3 },
        { id: 'lastlink', nome: 'Vendas Lastlink', ultima: ult('lastlink'), proxima: prox(40), ativo: false },
        { id: 'veredito', nome: 'Veredito', ultima: cfg.cr_ultimo_veredito || ult('veredito'), proxima: '06:10', ativo: false },
        { id: 'analista', nome: 'Analista', ultima: ult('analista'), proxima: '06:10 (após o veredito)', ativo: min(ult('analista')?.em) !== null && min(ult('analista')?.em) < 1 },
        { id: 'copy', nome: 'Diretor de Copy + Revisor', fazendo: escrevendo, fila: tudo.criativos.filter((c) => c.status === 'fila').length, ultima: cfg.cr_ultimo_copy || ult('copy'), proxima: tudo.criativos.some((c) => c.status === 'fila') ? 'contínuo (enquanto houver fila)' : prox(25, horasCopy), ativo: escrevendo.length > 0 || !!(cfg.cr_copy_lock?.em && Date.now() - new Date(cfg.cr_copy_lock.em).getTime() < 12 * 60e3) },
        { id: 'criacao', nome: 'Diretor de Criação', fila: semProjeto.length, fazendo: semProjeto.slice(0, 5), ultima: ult('criacao'), proxima: 'ao aprovar / :25', ativo: semProjeto.length > 0 && min(ult('criacao')?.em) !== null && min(ult('criacao')?.em) < 3 },
        { id: 'editor', nome: 'Editor (oficina)', fila: tudo.criativos.filter((c) => c.status === 'aprovado' && c.projeto).length, fazendo: tudo.criativos.filter((c) => c.status === 'producao').map((c) => ({ id: c.id, desde: c.statusEm })), ultima: ult('entrega'), proxima: 'manual', ativo: tudo.criativos.some((c) => c.status === 'producao') },
      ],
      porStatus: Object.fromEntries(['fila', 'briefing', 'revisao', 'aprovado', 'producao'].map((st) => [st, tudo.criativos.filter((c) => c.status === st).length])),
      hoje: { escritos: escritosHoje.length, notaMedia: escritosHoje.length ? Math.round(escritosHoje.reduce((a, c) => a + (c.score || 0), 0) / escritosHoje.length * 10) / 10 : null, aprovados: tudo.criativos.filter((c) => (c.historico || []).some((h) => h.para === 'aprovado' && h.em >= hojeIni.toISOString())).length },
      recentes,
      log: log.slice(0, 20),
    });
  }
  // ---- esteira ao vivo (kanban leve): só os cards em movimento + quem está mexendo neles
  if (p === '/api/cr/aovivo' && m === 'GET') {
    const lim = new Date(Date.now() - 48 * 3600e3).toISOString();
    const rows = await sbAll(sb, `esteira_cr_criativos?select=id,oferta_id,pai_id,tipo,formato,status,status_em,score,variavel,hipotese,hook,projeto_em,historico&or=(status.in.(fila,briefing,revisao,aprovado,producao),and(status.eq.no_ar,status_em.gte.${lim}))&order=status_em.desc`);
    const log = await sb('esteira_cr_log?select=em,tipo,resumo&order=em.desc&limit=12');
    const cards = rows.map((r) => {
      const h = (r.historico || []).slice(-1)[0] || {};
      return { id: r.id, ofertaId: r.oferta_id, paiId: r.pai_id, tipo: r.tipo, formato: r.formato, status: r.status, em: r.status_em, score: r.score, variavel: r.variavel, hipotese: r.hipotese, hook: (r.hook || '').slice(0, 90), por: h.por || null, nota: (h.nota || '').slice(0, 120), temProjeto: !!r.projeto_em };
    });
    const minAgo = (iso) => iso ? (Date.now() - new Date(iso).getTime()) / 60000 : 1e9;
    const copyAtivo = cards.some((c) => c.status === 'briefing' && c.por === 'copy');
    const criacaoPend = cards.filter((c) => c.status === 'aprovado' && !c.temProjeto).length;
    const ultCriacao = log.find((l) => l.tipo === 'criacao');
    const [apiErro] = await sb('esteira_config?chave=eq.cr_api_erro&select=valor');
    return json(200, {
      agora: agora(), apiErro: apiErro?.valor?.msg ? apiErro.valor : null,
      colunas: [
        { id: 'fila', nome: 'Fila', agente: 'esperando o Copy', ativo: false },
        { id: 'briefing', nome: 'Escrevendo', agente: 'Diretor de Copy + Revisor', ativo: copyAtivo },
        { id: 'revisao', nome: 'Revisão', agente: 'você', ativo: false },
        { id: 'aprovado', nome: 'Aprovado', agente: 'Diretor de Criação monta o projeto', ativo: criacaoPend > 0 && minAgo(ultCriacao?.em) < 5 || criacaoPend > 0 },
        { id: 'producao', nome: 'Produção', agente: 'Editor (oficina)', ativo: cards.some((c) => c.status === 'producao') },
        { id: 'no_ar', nome: 'No ar (48 h)', agente: 'veredito em 72 h', ativo: false },
      ],
      cards, log,
    });
  }

  // ---- aprovar em lote (por pai, leva, oferta e nota mínima)
  if (p === '/api/cr/criativos/aprovar-lote' && m === 'POST') {
    if (!admin) fail(403, 'Só o gestor.');
    const b = await body().catch(() => ({}));
    const minScore = Number(b.minScore ?? 6);
    const tudo = await carregarTudo(sb);
    const alvo = tudo.criativos.filter((c) => c.status === 'revisao' && (c.score ?? 0) >= minScore && (!b.paiId || c.paiId === b.paiId) && (!b.levaId || c.levaId === b.levaId) && (!b.ofertaId || c.ofertaId === b.ofertaId) && (!b.variavel || c.variavel === b.variavel) && (!b.ids?.length || b.ids.includes(c.id)));
    const ids = [];
    for (const c of alvo) {
      const [row] = await sb(`esteira_cr_criativos?id=eq.${q(c.id)}&select=*`);
      await mudarStatus(sb, q, row, 'aprovado', user.id, b.nota || `aprovado em lote (nota ≥ ${minScore})`);
      ids.push(c.id);
    }
    if (ids.length) fetch(`${origem}/cr-criacao-bg`, { method: 'POST', headers: { 'x-cr-chave': tokenWebhookCr(), 'content-type': 'application/json' }, body: '{}' }).catch(() => {});
    return json(200, { aprovados: ids.length, ids });
  }

  // ---- árvore retroativa de um vencedor e limpeza de cards gerados
  mm = p.match(/^\/api\/cr\/criativos\/([^/]+)\/arvore$/);
  if (mm && m === 'POST') {
    if (!admin) fail(403, 'Só o gestor.');
    const tudo = await carregarTudo(sb);
    const c = tudo.criativos.find((x) => x.id === mm[1]); if (!c) fail(404, 'Criativo não encontrado.');
    const [row] = await sb(`esteira_cr_criativos?id=eq.${q(c.id)}&select=*`);
    const nv = await abrirArvore(sb, row, c.total.roas ?? 0, tudo.regras, user.id);
    await sb('esteira_cr_log', { method: 'POST', body: { tipo: 'arvore', resumo: `${c.id}: árvore ${nv.nome} (ROAS ${c.total.roas}) — ${nv.abertos} filhos na fila`, detalhe: nv } });
    return json(200, { criativo: c.id, nivel: nv.nome, roas: c.total.roas, abertos: nv.abertos });
  }
  if (p === '/api/cr/criativos/limpar' && m === 'POST') {
    // Apaga cards gerados por agentes (sem anúncio no ar): { ofertaId?, status?: [...], criadoPor?: [...] }. Nunca apaga card com métrica ou venda.
    if (!admin) fail(403, 'Só o gestor.');
    const b = await body().catch(() => ({}));
    const status = b.status?.length ? b.status : ['fila', 'briefing', 'revisao', 'aprovado'];
    const porQuem = b.criadoPor?.length ? b.criadoPor : ['analista', 'veredito', 'copy', 'criacao'];
    const tudo = await carregarTudo(sb);
    const alvo = tudo.criativos.filter((c) => status.includes(c.status) && porQuem.includes(c.criadoPor) && (!b.ofertaId || c.ofertaId === b.ofertaId) && c.total.gasto === 0 && c.total.vendas === 0);
    for (const c of alvo) {
      await sb(`esteira_cr_aprendizados?criativo_id=eq.${q(c.id)}`, { method: 'DELETE' });
      await sb(`esteira_cr_criativos?id=eq.${q(c.id)}`, { method: 'DELETE' });
    }
    await sb('esteira_cr_log', { method: 'POST', body: { tipo: 'limpeza', resumo: `${alvo.length} cards gerados apagados${b.ofertaId ? ' (' + b.ofertaId + ')' : ''}`, detalhe: alvo.map((c) => c.id) } });
    return json(200, { apagados: alvo.length, ids: alvo.map((c) => c.id) });
  }

  // ---- "Por que esta leva?": a cadeia vencedores → veredito → hipóteses → cards, legível
  mm = p.match(/^\/api\/cr\/levas\/([\w-]+)\/porque$/);
  if (mm && m === 'GET') {
    const tudo = await carregarTudo(sb);
    const leva = tudo.levas.find((l) => l.id === mm[1]); if (!leva) fail(404, 'Leva não encontrada.');
    const o = tudo.ofertas.find((x) => x.id === leva.ofertaId);
    const cs = tudo.criativos.filter((c) => c.ofertaId === o.id);
    const byId = Object.fromEntries(cs.map((c) => [c.id, c]));
    const apr = await sb(`esteira_cr_aprendizados?oferta_id=eq.${q(o.id)}&criado_em=lte.${q(leva.criadoEm)}&autor=in.(analista,veredito)&select=tipo,autor,texto,criativo_id,criado_em&order=criado_em.desc&limit=40`);
    const resumo = (c) => ({ id: c.id, status: c.status, roas7: c.d7.roas, vendas7: c.d7.vendas, roas: c.total.roas, vendas: c.total.vendas, hook: c.hook, angulo: c.angulo, formato: c.formato, temCopy: !!(c.copy && c.copy.length > 20) });
    return json(200, {
      leva: { id: leva.id, numero: leva.numero, status: leva.status, planejada: leva.planejada, hipotese: leva.hipotese, criadoEm: leva.criadoEm },
      oferta: { id: o.id, nome: o.nome, estado: o.estado, mix: o.mix },
      vencedores: cs.filter((c) => c.status === 'vencedor').sort((a, b) => b.d7.receita - a.d7.receita).map(resumo),
      fadiga: cs.filter((c) => ['fadiga', 'meio'].includes(c.status) && c.d7.gasto > 0).sort((a, b) => b.d7.gasto - a.d7.gasto).map(resumo),
      veredito: leva.veredito || apr.find((a) => a.autor === 'analista' && a.tipo === 'veredito')?.texto || null,
      hipoteses: leva.hipoteses?.length ? leva.hipoteses : apr.filter((a) => a.autor === 'analista' && a.tipo === 'hipotese').slice(0, 3).map((a) => ({ titulo: a.texto.split(' — ')[0], porque: a.texto.split(' — ').slice(1).join(' — ') })),
      mudancasDoMotor: apr.filter((a) => a.autor === 'veredito').slice(0, 12).map((a) => ({ criativo: a.criativo_id, em: a.criado_em.slice(0, 10), texto: a.texto })),
      cards: cs.filter((c) => c.levaId === leva.id).sort((a, b) => a.id.localeCompare(b.id)).map((c) => ({ id: c.id, tipo: c.tipo, status: c.status, score: c.score, formato: c.formato, variavel: c.variavel, hipotese: c.hipotese, muda: c.muda || ((c.copy || '').includes('POR QUE:') ? c.copy.split('POR QUE:').pop().trim().slice(0, 400) : null), hook: c.hook, angulo: c.angulo, pai: c.paiId ? (byId[c.paiId] ? resumo(byId[c.paiId]) : { id: c.paiId }) : null })),
    });
  }

  // ---- biblioteca de copy (fichas do REPERTORIO) e pesquisa das ofertas
  if (p === '/api/cr/biblioteca' && m === 'GET') {
    const rows = await sbAll(sb, 'esteira_cr_biblioteca?select=id,categoria,titulo,fonte,peso,consulte_quando,drive_id,atualizado_em&order=categoria.asc,id.asc');
    return json(200, { fichas: rows, situacoes: SITUACOES });
  }
  if (p === '/api/cr/biblioteca/importar' && m === 'POST') {
    if (!admin) fail(403, 'Só o gestor.');
    const b = await body().catch(() => ({}));
    const r = await importarBiblioteca({ sb }, b.ids);
    await sb('esteira_cr_log', { method: 'POST', body: { tipo: 'biblioteca', resumo: `${r.importadas.length} fichas importadas do Drive${r.erros.length ? ', ' + r.erros.length + ' erros' : ''}`, detalhe: r } });
    return json(200, r);
  }
  mm = p.match(/^\/api\/cr\/biblioteca\/([\w.-]+)$/);
  if (mm && m === 'GET') {
    const [f] = await sb(`esteira_cr_biblioteca?id=eq.${q(mm[1])}&select=*`);
    if (!f) fail(404, 'Ficha não encontrada.');
    return json(200, f);
  }
  if (mm && m === 'PUT') {
    // Ficha escrita à mão (ou colada pelo Chat 2): o id vira "categoria--nome".
    if (!admin) fail(403, 'Só o gestor.');
    const b = await body();
    if (!String(b.texto || '').trim()) fail(400, 'Ficha precisa de texto.');
    const id = mm[1].toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const row = { id, categoria: b.categoria || id.split('--')[0], titulo: b.titulo || id, fonte: b.fonte || null, peso: b.peso || 'complementar', consulte_quando: b.consulteQuando || null, texto: b.texto, atualizado_em: agora() };
    await sb('esteira_cr_biblioteca?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates', body: row });
    return json(200, row);
  }
  if (mm && m === 'DELETE') {
    if (!admin) fail(403, 'Só o gestor.');
    await sb(`esteira_cr_biblioteca?id=eq.${q(mm[1])}`, { method: 'DELETE' });
    return json(200, { ok: true });
  }
  mm = p.match(/^\/api\/cr\/ofertas\/([A-Z0-9]+)\/pesquisa$/);
  if (mm && m === 'GET') {
    const [o] = await sb(`esteira_cr_ofertas?id=eq.${q(mm[1])}&select=id,pesquisa,pesquisa_resumo,pesquisa_drive`);
    if (!o) fail(404, 'Oferta não encontrada.');
    return json(200, { id: o.id, resumo: o.pesquisa_resumo, bruto: o.pesquisa, driveIds: o.pesquisa_drive || [], sugeridos: PESQUISA_DRIVE[o.id] || [] });
  }
  if (mm && m === 'POST') {
    // Importa a pesquisa da oferta: do Drive (driveIds, ou os já cadastrados, ou os sugeridos) ou texto colado; e resume em 6 camadas.
    if (!admin) fail(403, 'Só o gestor.');
    const b = await body().catch(() => ({}));
    const [o] = await sb(`esteira_cr_ofertas?id=eq.${q(mm[1])}&select=*`);
    if (!o) fail(404, 'Oferta não encontrada.');
    // Roda em segundo plano (download do Drive + resumo pela IA passam dos 26 s). Resultado em "Ver log" e em GET /ofertas/:id/pesquisa.
    const r = await fetch(`${origem}/cr-pesquisa-bg`, { method: 'POST', headers: { 'x-cr-chave': tokenWebhookCr(), 'content-type': 'application/json' }, body: JSON.stringify({ ofertaId: o.id, driveIds: b.driveIds, texto: b.texto }) });
    if (!r.ok && r.status !== 202) fail(502, `Não consegui disparar a importação (${r.status}).`);
    return json(202, { segundoPlano: true, aviso: 'Importando e resumindo a pesquisa (até 2 min); veja em Ver log.' });
  }

  // ---- vendas da Lastlink pela API (cobre front, bumps e upsells; o webhook fica como tempo real)
  if (p === '/api/cr/vendas/sync' && m === 'POST') {
    if (!admin) fail(403, 'Só o gestor.');
    const b = await body().catch(() => ({}));
    const desde = b.desde || diasAtras(1), ate = b.ate || diaISO();
    const dias = Math.round((new Date(ate) - new Date(desde)) / 864e5);
    if (dias > 20) {
      const r = await fetch(`${origem}/cr-lastlink-bg`, { method: 'POST', headers: { 'x-cr-chave': tokenWebhookCr(), 'content-type': 'application/json' }, body: JSON.stringify({ desde, ate }) });
      if (!r.ok && r.status !== 202) fail(502, `Não consegui disparar (${r.status}).`);
      return json(202, { segundoPlano: true, desde, ate, aviso: 'Puxando o histórico da Lastlink em segundo plano; veja em Ver log.' });
    }
    return json(200, await syncLastlink({ sb, q, env }, { desde, ate }));
  }

  // ---- Diretor de Criação: projeto de edição, fila do Editor, banco de takes
  if (p === '/api/cr/producao' && m === 'GET') {
    // "Pega os pedidos": cards aprovados (com projeto) e em produção, com o que o Editor precisa.
    const rows = await sbAll(sb, 'esteira_cr_criativos?status=in.(aprovado,producao)&select=*&order=status_em.asc');
    const ofs = await sb('esteira_cr_ofertas?select=id,nome,pasta_drive,pv_url');
    return json(200, rows.map((r) => ({ ...criativoApp(r), oferta: ofs.find((o) => o.id === r.oferta_id) || null })));
  }
  mm = p.match(/^\/api\/cr\/criativos\/([^/]+)\/criacao$/);
  if (mm && m === 'POST') {
    if (!admin) fail(403, 'Só o gestor.');
    const r = await fetch(`${origem}/cr-criacao-bg`, { method: 'POST', headers: { 'x-cr-chave': tokenWebhookCr(), 'content-type': 'application/json' }, body: JSON.stringify({ ids: [mm[1]] }) });
    if (!r.ok && r.status !== 202) fail(502, `Não consegui disparar (${r.status}).`);
    return json(202, { segundoPlano: true, aviso: 'Diretor de Criação montando o projeto (1–2 min); recarregue a ficha.' });
  }
  if (p === '/api/cr/criacao' && m === 'POST') {
    if (!admin) fail(403, 'Só o gestor.');
    const r = await fetch(`${origem}/cr-criacao-bg`, { method: 'POST', headers: { 'x-cr-chave': tokenWebhookCr(), 'content-type': 'application/json' }, body: JSON.stringify({}) });
    if (!r.ok && r.status !== 202) fail(502, `Não consegui disparar (${r.status}).`);
    return json(202, { segundoPlano: true, aviso: 'Diretor de Criação rodando nos cards aprovados sem projeto.' });
  }
  mm = p.match(/^\/api\/cr\/criativos\/([^/]+)\/producao$/);
  if (mm && m === 'POST') {
    const [c] = await sb(`esteira_cr_criativos?id=eq.${q(mm[1])}&select=*`);
    if (!c) fail(404, 'Criativo não encontrado.');
    const r = c.status === 'producao' ? c : await mudarStatus(sb, q, c, 'producao', user.id, 'Editor começou');
    // O Editor pegou um: o Diretor de Criação repõe o próximo projeto pronto (até o limite criacaoAdiantada).
    fetch(`${origem}/cr-criacao-bg`, { method: 'POST', headers: { 'x-cr-chave': tokenWebhookCr(), 'content-type': 'application/json' }, body: '{}' }).catch(() => {});
    return json(200, criativoApp(r));
  }
  mm = p.match(/^\/api\/cr\/criativos\/([^/]+)\/entrega$/);
  if (mm && m === 'POST') {
    // O Editor devolve: arquivos entregues, hooks (codigo_hook → arquivo), takes usados, marcações visuais, rejeitados.
    const b = await body();
    const [c] = await sb(`esteira_cr_criativos?id=eq.${q(mm[1])}&select=*`);
    if (!c) fail(404, 'Criativo não encontrado.');
    const entrega = { em: agora(), por: user.id, pasta: b.pasta || null, arquivos: b.arquivos || [], hooks: b.hooks || [], takesUsados: b.takesUsados || [], rejeitados: b.rejeitados || [], nota: b.nota || null };
    const patch = { entrega, atualizado_em: agora() };
    if (b.arquivoUrl) patch.arquivo_url = b.arquivoUrl;
    if (b.marcacoes) patch.marcacoes = { ...(c.marcacoes || {}), ...b.marcacoes };
    await sb(`esteira_cr_criativos?id=eq.${q(c.id)}`, { method: 'PATCH', body: patch });
    for (const t of entrega.takesUsados) { const [tk] = await sb(`esteira_cr_takes?id=eq.${q(t)}&select=usado_em`); if (tk) await sb(`esteira_cr_takes?id=eq.${q(t)}`, { method: 'PATCH', body: { usado_em: [...new Set([...(tk.usado_em || []), c.id])], atualizado_em: agora() } }); }
    for (const r of entrega.rejeitados) if (r.take) await sb(`esteira_cr_takes?id=eq.${q(r.take)}`, { method: 'PATCH', body: { rejeitado: true, motivo: String(r.motivo || '').slice(0, 200), atualizado_em: agora() } });
    const [atual] = await sb(`esteira_cr_criativos?id=eq.${q(c.id)}&select=*`);
    const r = ['aprovado', 'producao'].includes(atual.status) ? await mudarStatus(sb, q, atual, 'producao', user.id, `Entregue: ${entrega.arquivos.length} arquivo(s), ${entrega.hooks.length} hook(s)${b.nota ? ' · ' + b.nota : ''}`) : atual;
    await sb('esteira_cr_log', { method: 'POST', body: { tipo: 'entrega', resumo: `${c.id}: ${entrega.arquivos.length} arquivo(s), ${entrega.hooks.length} hook(s)`, detalhe: entrega } });
    return json(200, criativoApp(r));
  }
  if (p === '/api/cr/takes' && m === 'GET') {
    const of = new URL(reqUrl).searchParams.get('oferta');
    const rows = await sbAll(sb, `esteira_cr_takes?select=*${of ? '&oferta_id=eq.' + q(of) : ''}&order=oferta_id.asc,criado_em.asc`);
    return json(200, rows);
  }
  if (p === '/api/cr/takes' && m === 'POST') {
    const b = await body();
    if (!b.ofertaId || !b.arquivo) fail(400, 'Take precisa de ofertaId e arquivo.');
    const row = { id: `${b.ofertaId}/${String(b.arquivo).trim()}`, oferta_id: b.ofertaId, arquivo: String(b.arquivo).trim(), tipo: b.tipo || 'video', ferramenta: b.ferramenta || null, descricao: b.descricao || null, bom_para: b.bomPara || null, usado_em: b.usadoEm || [], prompt: b.prompt || null, prompt_animacao: b.promptAnimacao || null, arquivo_url: b.arquivoUrl || null, rejeitado: !!b.rejeitado, motivo: b.motivo || null, atualizado_em: agora() };
    await sb('esteira_cr_takes?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates', body: row });
    return json(200, row);
  }
  if (p === '/api/cr/takes/importar' && m === 'POST') {
    // Corpo: { ofertaId, texto } = conteúdo do _TAKES.md da oferta (tabela markdown).
    const b = await body();
    if (!b.ofertaId || !b.texto) fail(400, 'Informe ofertaId e o texto do _TAKES.md.');
    const rows = lerTakesMd(b.ofertaId, String(b.texto));
    if (rows.length) await sb('esteira_cr_takes?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates', body: rows });
    return json(200, { importados: rows.length, ids: rows.map((r) => r.id) });
  }
  mm = p.match(/^\/api\/cr\/takes\/(.+?)\/gerar$/);
  if (mm && (m === 'POST' || m === 'GET')) {
    if (!admin) fail(403, 'Só o gestor.');
    const [t] = await sb(`esteira_cr_takes?id=eq.${q(decodeURIComponent(mm[1]))}&select=*`);
    if (!t) fail(404, 'Take não encontrado.');
    if (m === 'POST') return json(202, await gerarTake({ sb, q, env }, t));
    return json(200, await conferirTake({ sb, q, env }, t));
  }
  mm = p.match(/^\/api\/cr\/takes\/(.+)$/);
  if (mm && m === 'PATCH') {
    const b = await body();
    const patch = { atualizado_em: agora() };
    for (const [k, col] of Object.entries({ tipo: 'tipo', ferramenta: 'ferramenta', descricao: 'descricao', bomPara: 'bom_para', usadoEm: 'usado_em', prompt: 'prompt', promptAnimacao: 'prompt_animacao', arquivoUrl: 'arquivo_url', rejeitado: 'rejeitado', motivo: 'motivo' })) if (k in b) patch[col] = b[k];
    const [r] = await sb(`esteira_cr_takes?id=eq.${q(decodeURIComponent(mm[1]))}`, { method: 'PATCH', body: patch, prefer: 'return=representation' });
    if (!r) fail(404, 'Take não encontrado.');
    return json(200, r);
  }

  if (p === '/api/cr/log' && m === 'GET') return json(200, await sb('esteira_cr_log?select=*&order=em.desc&limit=100'));

  // Importação da semente: linhas de criativos e de vendas vindas de CSV (o navegador faz o parse).
  if (p === '/api/cr/importar' && m === 'POST') {
    if (!admin) fail(403, 'Só o gestor.');
    const b = await body();
    const ofertas = (await sb('esteira_cr_ofertas?select=*')).map(ofertaApp);
    const res = { ofertas: 0, criativos: 0, vendas: 0, metricas: 0, ignorados: 0 };
    for (const o of b.ofertas || []) {
      if (!o.id) continue;
      await sb('esteira_cr_ofertas?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates', body: { id: String(o.id).toUpperCase(), nome: o.nome || o.id, familia: o.familia || null, estado: o.estado || 'validacao', prefixos: o.prefixos || [], produtos: o.produtos || [] } });
      res.ofertas++;
    }
    const ofs = (await sb('esteira_cr_ofertas?select=*')).map(ofertaApp);
    for (const c of b.criativos || []) {
      const id = limparNome(c.id); if (!id) { res.ignorados++; continue; }
      const of = ofs.find((o) => o.id === String(c.ofertaId || '').toUpperCase()) || ofertaDoNome(ofs, id);
      if (!of) { res.ignorados++; continue; }
      const status = STATUS.includes(c.status) ? c.status : 'no_ar';
      const row = { id, oferta_id: of.id, tipo: ['modelagem', 'variacao', 'zero'].includes(c.tipo) ? c.tipo : 'modelagem', pai_id: c.paiId || null, formato: c.formato || formatoDoNome(id), angulo: c.angulo || null, hook: c.hook || null, body: c.body || null, status, status_em: c.statusEm || agora(), no_ar_em: c.noArEm || null, aprendizado: c.aprendizado || null, criado_por: 'importacao', historico: [{ em: agora(), de: null, para: status, por: 'importacao' }] };
      const n = levaDoNome(id);
      if (n) { row.leva_id = `${of.id}-L${n}`; await sb('esteira_cr_levas?on_conflict=id', { method: 'POST', prefer: 'resolution=ignore-duplicates', body: { id: row.leva_id, oferta_id: of.id, numero: n, status: 'encerrada', no_ar: c.noArEm ? String(c.noArEm).slice(0, 10) : null } }); }
      await sb('esteira_cr_criativos?on_conflict=id', { method: 'POST', prefer: 'resolution=ignore-duplicates', body: row });
      res.criativos++;
    }
    const vendas = (b.vendas || []).map((v) => ({ id: String(v.id), criativo_id: v.criativoId ? limparNome(v.criativoId) : null, oferta_id: v.ofertaId ? String(v.ofertaId).toUpperCase() : null, utm_content: v.utmContent || null, utm_campaign: v.utmCampaign || null, valor: num(v.valor), produto: v.produto || null, pago_em: v.pagoEm, reembolso: v.reembolso === true || /^(true|1|sim)$/i.test(String(v.reembolso || '')), origem: 'importacao' })).filter((v) => v.id && v.pago_em);
    for (let i = 0; i < vendas.length; i += 500) { await sb('esteira_cr_vendas?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates', body: vendas.slice(i, i + 500) }); res.vendas += Math.min(500, vendas.length - i); }
    const mets = (b.metricas || []).map((x) => ({ ad_id: String(x.adId), dia: x.dia, criativo_id: x.criativoId ? limparNome(x.criativoId) : null, gasto: num(x.gasto) || 0, impressoes: Number(x.impressoes) || 0, cliques: Number(x.cliques) || 0, lpv: Number(x.lpv) || 0, ic: Number(x.ic) || 0, video_views: Number(x.videoViews) || 0, video_3s: Number(x.video3s) || 0, video_75: Number(x.video75) || 0 })).filter((x) => x.ad_id && x.dia);
    for (let i = 0; i < mets.length; i += 500) { await sb('esteira_cr_metricas?on_conflict=ad_id,dia', { method: 'POST', prefer: 'resolution=merge-duplicates', body: mets.slice(i, i + 500) }); res.metricas += Math.min(500, mets.length - i); }
    await religar(sb, q);
    await sb('esteira_cr_log', { method: 'POST', body: { tipo: 'importacao', resumo: JSON.stringify(res), detalhe: res } });
    return json(200, res);
  }

  fail(404, 'Rota não encontrada.');
}
const req_url = (ctx) => ctx.reqUrl;
