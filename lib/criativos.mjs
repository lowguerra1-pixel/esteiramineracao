// API do app Criativos (Setor de Criativos): a base de criativos, o kanban de 72h, o motor de veredito,
// o sync com a Meta Marketing API e o webhook de vendas da Lastlink.
// Rotas em /api/cr/* (o prefixo /api/criativos já é do Swipe da Esteira de Repertório).

const META_API = 'https://graph.facebook.com/v21.0';
const STATUS = ['fila', 'briefing', 'producao', 'revisao', 'aprovado', 'no_ar', 'meio', 'vencedor', 'fadiga', 'morto'];
const RODANDO = ['no_ar', 'meio', 'vencedor', 'fadiga'];
const REGRAS_PADRAO = { gastoMin: 150, vendasMin: 5, roasSegue: 1.3, roasMorre: 1.0, vencedorVendas: 20, fadigaQueda: 0.3, filhos: 3, horasVeredito: 72, diasRisco: 14 };

const agora = () => new Date().toISOString();
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
export const limparNome = (s) => String(s || '').split('|')[0].replace(/\s*[—–-]\s*c[oó]pia(\s*\d*)?\s*$/gi, '').replace(/\//g, '-').replace(/\s+/g, ' ').trim();
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
const ofertaApp = (r) => ({ id: r.id, nome: r.nome, familia: r.familia, estado: r.estado, mix: r.mix, prefixos: r.prefixos || [], produtos: r.produtos || [], pastaDrive: r.pasta_drive, pvUrl: r.pv_url, notas: r.notas, criadoEm: r.criado_em, atualizadoEm: r.atualizado_em });
const levaApp = (r) => ({ id: r.id, ofertaId: r.oferta_id, numero: r.numero, planejada: r.planejada, noAr: r.no_ar, hipotese: r.hipotese, status: r.status, criadoEm: r.criado_em });
const criativoApp = (r) => ({
  id: r.id, ofertaId: r.oferta_id, levaId: r.leva_id, tipo: r.tipo, paiId: r.pai_id, formato: r.formato, angulo: r.angulo, mecanismo: r.mecanismo,
  hook: r.hook, body: r.body, copy: r.copy, arquivoUrl: r.arquivo_url, status: r.status, statusEm: r.status_em, noArEm: r.no_ar_em, score: r.score,
  aprendizado: r.aprendizado, historico: r.historico || [], criadoPor: r.criado_por, criadoEm: r.criado_em, atualizadoEm: r.atualizado_em,
});
const CAMPOS_CRIATIVO = { ofertaId: 'oferta_id', levaId: 'leva_id', tipo: 'tipo', paiId: 'pai_id', formato: 'formato', angulo: 'angulo', mecanismo: 'mecanismo', hook: 'hook', body: 'body', copy: 'copy', arquivoUrl: 'arquivo_url', score: 'score', aprendizado: 'aprendizado' };
const CAMPOS_OFERTA = { nome: 'nome', familia: 'familia', estado: 'estado', mix: 'mix', prefixos: 'prefixos', produtos: 'produtos', pastaDrive: 'pasta_drive', pvUrl: 'pv_url', notas: 'notas' };

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
    sb('esteira_cr_criativos?select=*&order=criado_em.desc&limit=10000'),
    sb('rpc/esteira_cr_resumo', { method: 'POST', body: {} }),
    sb('rpc/esteira_cr_resumo', { method: 'POST', body: { p_desde: diasAtras(6) } }),
    sb('rpc/esteira_cr_resumo', { method: 'POST', body: { p_desde: diasAtras(29) } }),
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
    sb(`esteira_cr_vendas?pago_em=gte.${diasAtras(6)}&reembolso=eq.false&is_test=eq.false&select=oferta_id,criativo_id,valor`),
    sb(`esteira_cr_vendas?pago_em=gte.${diasAtras(13)}&pago_em=lt.${diasAtras(6)}&reembolso=eq.false&is_test=eq.false&select=oferta_id,valor`),
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
export async function syncMeta({ sb, q, env, setConfig }, { desde, ate, contas }) {
  const token = await tokenMeta({ sb, env });
  if (!token) throw new Error('Conecte a Meta em Criativos › Ajustes.');
  const ofertas = (await sb('esteira_cr_ofertas?select=id,prefixos')).map(ofertaApp);
  // Tudo em lote: um mapa dos anúncios já vistos e dos criativos existentes, nada de consulta por anúncio.
  const adsConhecidos = new Map((await sb('esteira_cr_ads?select=ad_id,criativo_id&limit=20000')).map((a) => [a.ad_id, a.criativo_id]));
  const criativosExistentes = new Set((await sb('esteira_cr_criativos?select=id&limit=20000')).map((c) => c.id));
  const levasExistentes = new Set((await sb('esteira_cr_levas?select=id&limit=5000')).map((l) => l.id));
  const resumo = { contas: 0, anuncios: 0, linhas: 0, criados: 0, semPar: 0 };
  for (const conta of contas) {
    const act = String(conta).startsWith('act_') ? conta : `act_${conta}`;
    const rows = await metaTodos(`${act}/insights`, {
      level: 'ad', time_increment: 1, limit: 1000, time_range: { since: desde, until: ate },
      fields: 'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,inline_link_clicks,actions,video_play_actions,video_p75_watched_actions',
    }, token);
    resumo.contas++;
    const ads = new Map(), novosCriativos = new Map(), novasLevas = new Map(), metricasRows = [];
    for (const r of rows) {
      const nome = limparNome(r.ad_name);
      let info = ads.get(r.ad_id);
      if (!info) {
        let criativoId = adsConhecidos.get(r.ad_id) || null;
        if (!criativoId) {
          if (criativosExistentes.has(nome) || novosCriativos.has(nome)) criativoId = nome;
          else {
            const o = ofertaDoNome(ofertas, nome);
            if (o) {
              const n = levaDoNome(nome);
              const levaId = n ? `${o.id}-L${n}` : null;
              if (levaId && !levasExistentes.has(levaId) && !novasLevas.has(levaId)) novasLevas.set(levaId, { id: levaId, oferta_id: o.id, numero: n, status: 'no_ar', no_ar: r.date_start });
              novosCriativos.set(nome, { id: nome, oferta_id: o.id, leva_id: levaId, tipo: 'modelagem', formato: formatoDoNome(nome), status: 'no_ar', status_em: agora(), no_ar_em: new Date(r.date_start).toISOString(), criado_por: 'sync', historico: [{ em: agora(), de: null, para: 'no_ar', por: 'sync' }] });
              criativoId = nome; resumo.criados++;
            } else resumo.semPar++;
          }
        }
        info = { ad_id: r.ad_id, conta_id: act.replace('act_', ''), ad_name: r.ad_name, adset_id: r.adset_id, adset_name: r.adset_name, campaign_id: r.campaign_id, campaign_name: r.campaign_name, criativo_id: criativoId, sync_em: agora() };
        ads.set(r.ad_id, info);
      }
      metricasRows.push({
        ad_id: r.ad_id, dia: r.date_start, criativo_id: info.criativo_id,
        gasto: Number(r.spend) || 0, impressoes: Number(r.impressions) || 0, cliques: Number(r.inline_link_clicks) || 0,
        lpv: acao(r.actions, 'landing_page_view'), ic: acao(r.actions, 'initiate_checkout') || acao(r.actions, 'omni_initiated_checkout'),
        video_views: acao(r.video_play_actions, 'video_view'), video_3s: acao(r.actions, 'video_view'), video_75: acao(r.video_p75_watched_actions, 'video_view'),
      });
    }
    const lotes = (arr, n = 1000) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, (i + 1) * n));
    for (const l of lotes([...novasLevas.values()])) await sb('esteira_cr_levas?on_conflict=id', { method: 'POST', body: l, prefer: 'resolution=ignore-duplicates' });
    for (const l of lotes([...novosCriativos.values()])) await sb('esteira_cr_criativos?on_conflict=id', { method: 'POST', body: l, prefer: 'resolution=ignore-duplicates' });
    novosCriativos.forEach((_, id) => criativosExistentes.add(id)); novasLevas.forEach((_, id) => levasExistentes.add(id));
    const adRows = [...ads.values()];
    for (const l of lotes(adRows)) await sb('esteira_cr_ads?on_conflict=ad_id', { method: 'POST', body: l, prefer: 'resolution=merge-duplicates' });
    adRows.forEach((a) => adsConhecidos.set(a.ad_id, a.criativo_id));
    for (const l of lotes(metricasRows)) await sb('esteira_cr_metricas?on_conflict=ad_id,dia', { method: 'POST', body: l, prefer: 'resolution=merge-duplicates' });
    resumo.anuncios += adRows.length; resumo.linhas += metricasRows.length;
  }
  await setConfig('cr_ultimo_sync', { em: agora(), desde, ate, ...resumo });
  await sb('esteira_cr_log', { method: 'POST', body: { tipo: 'sync', resumo: `${desde}→${ate}: ${resumo.linhas} linhas, ${resumo.anuncios} anúncios, ${resumo.criados} criativos novos, ${resumo.semPar} sem par`, detalhe: resumo } });
  return resumo;
}

// Liga as vendas sem criativo (chegaram antes do cadastro) e as métricas de anúncios que ganharam par depois.
async function religar(sb, q) {
  const ofertas = (await sb('esteira_cr_ofertas?select=id,prefixos')).map(ofertaApp);
  const criativos = new Map((await sb('esteira_cr_criativos?select=id,oferta_id&limit=20000')).map((c) => [c.id, c.oferta_id]));
  let ligados = 0;
  const ads = await sb('esteira_cr_ads?criativo_id=is.null&select=ad_id,ad_name&limit=5000');
  for (const a of ads) {
    const nome = limparNome(a.ad_name);
    let id = criativos.has(nome) ? nome : null;
    if (!id) { const o = ofertaDoNome(ofertas, nome); if (o) { await garantirCriativo(sb, q, { id: nome, oferta: o }); criativos.set(nome, o.id); id = nome; } }
    if (id) {
      await sb(`esteira_cr_ads?ad_id=eq.${q(a.ad_id)}`, { method: 'PATCH', body: { criativo_id: id } });
      await sb(`esteira_cr_metricas?ad_id=eq.${q(a.ad_id)}`, { method: 'PATCH', body: { criativo_id: id } });
      ligados++;
    }
  }
  const vendas = await sb('esteira_cr_vendas?criativo_id=is.null&utm_content=not.is.null&select=id,utm_content&limit=5000');
  for (const v of vendas) {
    const nome = limparNome(v.utm_content);
    if (nome && criativos.has(nome)) { await sb(`esteira_cr_vendas?id=eq.${q(v.id)}`, { method: 'PATCH', body: { criativo_id: nome, oferta_id: criativos.get(nome) } }); ligados++; }
  }
  return { ligados };
}

// ---------------------------------------------------------------- motor de veredito
export async function rodarVeredito({ sb, q, setConfig }) {
  const tudo = await carregarTudo(sb);
  const R = tudo.regras;
  const porOferta = Object.fromEntries(tudo.ofertas.map((o) => [o.id, o]));
  const log = [];
  const criativosDb = await sb(`esteira_cr_criativos?status=in.(${RODANDO.join(',')})&select=*`);
  const porId = Object.fromEntries(tudo.criativos.map((c) => [c.id, c]));
  for (const row of criativosDb) {
    const c = porId[row.id]; if (!c) continue;
    const T = c.total, D7 = c.d7, D30 = c.d30;
    const horasNoAr = c.noArEm ? (Date.now() - new Date(c.noArEm).getTime()) / 3600e3 : 0;
    const temAmostra = T.gasto >= R.gastoMin || T.vendas >= R.vendasMin;
    let para = null, nota = null;
    if ((row.status === 'no_ar' || row.status === 'meio') && T.vendas >= R.vencedorVendas && (T.roas ?? 0) >= R.roasSegue) {
      para = 'vencedor'; nota = `${T.vendas} vendas, ROAS ${T.roas}`;
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
    // Vencedor novo abre os filhos de modelagem na fila.
    if (para === 'vencedor' && !(row.historico || []).some((h) => h.para === 'vencedor')) {
      for (let i = 1; i <= R.filhos; i++) {
        const id = `${row.id}-M${i}`;
        await sb('esteira_cr_criativos?on_conflict=id', { method: 'POST', prefer: 'resolution=ignore-duplicates', body: { id, oferta_id: row.oferta_id, leva_id: null, tipo: 'modelagem', pai_id: row.id, formato: row.formato, status: 'fila', criado_por: 'veredito', historico: [{ em: agora(), de: null, para: 'fila', por: 'veredito', nota: `filho de ${row.id}` }] } });
      }
    }
  }
  // Estado da oferta: escalando sem vencedor novo há N dias vira em_risco.
  const p = await painel(sb, await carregarTudo(sb));
  for (const o of p.porOferta) {
    const of = porOferta[o.id]; if (!of) continue;
    if (of.estado === 'escalando' && o.diasSemVencedor !== null && o.diasSemVencedor >= R.diasRisco) {
      await sb(`esteira_cr_ofertas?id=eq.${q(o.id)}`, { method: 'PATCH', body: { estado: 'em_risco', atualizado_em: agora() } });
      await sb('esteira_cr_aprendizados', { method: 'POST', body: { oferta_id: o.id, tipo: 'veredito', texto: `Oferta em risco: ${o.diasSemVencedor} dias sem vencedor novo. Próxima leva com mais ângulo novo.`, autor: 'veredito' } });
      log.push(`${o.id}: escalando → em_risco`);
    }
  }
  await setConfig('cr_ultimo_veredito', { em: agora(), mudancas: log.length });
  await sb('esteira_cr_log', { method: 'POST', body: { tipo: 'veredito', resumo: `${log.length} mudanças`, detalhe: log } });
  return { mudancas: log };
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
  const { sb, json, fail, q, user, admin, body, setConfig, env, origem, tokenWebhookCr } = ctx;

  if (p === '/api/cr/bootstrap' && m === 'GET') {
    const tudo = await carregarTudo(sb);
    const [tk] = await sb('esteira_config?chave=eq.cr_meta_token&select=valor');
    const meta = env('META_ACCESS_TOKEN') ? { fonte: 'env' } : tk?.valor?.token ? { fonte: 'usuario', usuario: tk.valor.usuario, exp: tk.valor.exp } : null;
    return json(200, { ...tudo, painel: await painel(sb, tudo), webhook: admin ? `${origem}/api/cr/lastlink/${tokenWebhookCr()}` : null, metaConfigurado: !!meta, meta, status: STATUS });
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
    const row = { id: `${of.id}-L${numero}`, oferta_id: of.id, numero, planejada: b.planejada || null, hipotese: b.hipotese || null, status: 'planejada' };
    const [r] = await sb('esteira_cr_levas', { method: 'POST', body: row, prefer: 'return=representation' });
    return json(201, levaApp(r));
  }
  mm = p.match(/^\/api\/cr\/levas\/([\w-]+)$/);
  if (mm && m === 'PATCH') {
    const b = await body();
    const patch = {};
    for (const k of ['planejada', 'hipotese', 'status']) if (k in b) patch[k] = b[k];
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
    const r = await syncMeta(ctx, { desde, ate, contas });
    const l = await religar(sb, q);
    return json(200, { ...r, ...l, desde, ate });
  }
  if (p === '/api/cr/veredito' && m === 'POST') {
    if (!admin) fail(403, 'Só o gestor.');
    return json(200, await rodarVeredito(ctx));
  }
  if (p === '/api/cr/religar' && m === 'POST') { if (!admin) fail(403, 'Só o gestor.'); return json(200, await religar(sb, q)); }
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
    const vendas = (b.vendas || []).map((v) => ({ id: String(v.id), criativo_id: v.criativoId ? limparNome(v.criativoId) : null, oferta_id: v.ofertaId ? String(v.ofertaId).toUpperCase() : null, utm_content: v.utmContent || null, utm_campaign: v.utmCampaign || null, valor: num(v.valor), produto: v.produto || null, pago_em: v.pagoEm, reembolso: !!v.reembolso, origem: 'importacao' })).filter((v) => v.id && v.pago_em);
    for (let i = 0; i < vendas.length; i += 500) { await sb('esteira_cr_vendas?on_conflict=id', { method: 'POST', prefer: 'resolution=ignore-duplicates', body: vendas.slice(i, i + 500) }); res.vendas += Math.min(500, vendas.length - i); }
    const mets = (b.metricas || []).map((x) => ({ ad_id: String(x.adId), dia: x.dia, criativo_id: x.criativoId ? limparNome(x.criativoId) : null, gasto: num(x.gasto) || 0, impressoes: Number(x.impressoes) || 0, cliques: Number(x.cliques) || 0, lpv: Number(x.lpv) || 0, ic: Number(x.ic) || 0, video_views: Number(x.videoViews) || 0, video_3s: Number(x.video3s) || 0, video_75: Number(x.video75) || 0 })).filter((x) => x.ad_id && x.dia);
    for (let i = 0; i < mets.length; i += 500) { await sb('esteira_cr_metricas?on_conflict=ad_id,dia', { method: 'POST', prefer: 'resolution=merge-duplicates', body: mets.slice(i, i + 500) }); res.metricas += Math.min(500, mets.length - i); }
    await religar(sb, q);
    await sb('esteira_cr_log', { method: 'POST', body: { tipo: 'importacao', resumo: JSON.stringify(res), detalhe: res } });
    return json(200, res);
  }

  fail(404, 'Rota não encontrada.');
}
const req_url = (ctx) => ctx.reqUrl;
