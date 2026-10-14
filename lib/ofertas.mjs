// API do app Ofertas: Mineração (caixa, triagem, decisão, Caçador) e Modelagem (trilhas, teste, otimização, escala).
// Recebe as ferramentas do api.mjs (banco, Google, erros) para não duplicar nada.
import { STATUS, TRILHAS, CHECKLIST, MOTIVOS_DESCARTE, ORIGENS, classeDeAnunciantes, faixaTeste, trilhaSugerida } from '../public/ofertas/regras.mjs';

const PLANILHA_PADRAO = '1H8ZnvAcsUQ93vkeAiB9OOb3z-rLD3MxyIu3_iqrtLjU';
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const m = String(v).replace(/\s/g, '').match(/-?\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(',', '.')) : null;
};
const inteiro = (v) => { const m = String(v ?? '').match(/\d+/); return m ? Number(m[0]) : null; };
const hojeISO = (tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const maisDias = (iso, d) => { const t = new Date(iso + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };
const idDaPlanilha = (s) => (String(s || '').match(/\/d\/([\w-]{20,})/) || [])[1] || String(s || '').trim();
const letra = (i) => { let s = ''; i += 1; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };
const fmtRoas = (r) => (Number.isFinite(Number(r)) ? Number(r).toFixed(2).replace('.', ',') : '');

const paraApp = (r) => ({
  id: r.id, numero: r.numero, criadoEm: r.criado_em, atualizadoEm: r.atualizado_em, criadoPor: r.criado_por, criadoPorNome: r.criado_por_nome,
  frase: r.frase, notas: r.notas, origem: r.origem, link: r.link, maeLink: r.mae_link, maeId: r.mae_id, nicho: r.nicho, ticket: r.ticket,
  anunciantes: r.anunciantes, classe: r.classe, score: r.score, status: r.status, monitorarAte: r.monitorar_ate, motivoDescarte: r.motivo_descarte,
  teimosia: r.teimosia, trilha: r.trilha, idioma: r.idioma, cacador: r.cacador, etapas: r.etapas || {}, checklist: r.checklist || {},
  teste: r.teste, funil: r.funil, escalou: r.escalou, historico: r.historico || [],
});
const EDITAVEIS = { frase: 'frase', notas: 'notas', link: 'link', maeLink: 'mae_link', nicho: 'nicho', ticket: 'ticket', anunciantes: 'anunciantes', classe: 'classe', score: 'score', trilha: 'trilha', idioma: 'idioma', etapas: 'etapas', checklist: 'checklist', funil: 'funil', escalou: 'escalou' };

export async function rotasOfertas(p, m, ctx) {
  const { sb, json, fail, q, user, admin, body, getConfig, setConfig, googleAccessToken } = ctx;
  const cfg = await getConfig();
  const hoje = hojeISO(cfg.fuso);
  const evento = (txt) => ({ em: new Date().toISOString(), por: user.nome, txt });

  async function carregar(id) {
    const [r] = await sb(`esteira_ofertas?id=eq.${q(id)}&select=*`);
    if (!r) fail(404, `A oferta ${id} não existe.`);
    return r;
  }
  async function salvar(id, patch, txt) {
    const atual = patch.historico ? null : await sb(`esteira_ofertas?id=eq.${q(id)}&select=historico`).then((x) => x[0]);
    const historico = patch.historico || [...(atual?.historico || []), ...(txt ? [evento(txt)] : [])];
    const [r] = await sb(`esteira_ofertas?id=eq.${q(id)}`, { method: 'PATCH', body: { ...patch, historico, atualizado_em: new Date().toISOString() }, prefer: 'return=representation' });
    return r;
  }
  async function criar(campos, txt) {
    const numero = await sb('rpc/esteira_proxima_oferta', { method: 'POST', body: {} });
    const row = { id: 'OF-' + String(numero).padStart(4, '0'), numero, criado_por: user.id, criado_por_nome: user.nome, historico: [evento(txt)], ...campos };
    const [r] = await sb('esteira_ofertas', { method: 'POST', body: row, prefer: 'return=representation' });
    return r;
  }

  // ------------------------------------------------------------ Google Sheets (planilha do Caçador)
  const planilhaId = () => idDaPlanilha(cfg.cacadorPlanilha || PLANILHA_PADRAO);
  async function sheets(path, { method = 'GET', body: b } = {}) {
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${planilhaId()}${path}`, {
      method, headers: { authorization: `Bearer ${await googleAccessToken()}`, ...(b ? { 'content-type': 'application/json' } : {}) },
      body: b ? JSON.stringify(b) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = j?.error?.message || String(r.status);
      if (/insufficient|scope/i.test(msg)) fail(409, 'O Google ainda não liberou a planilha para o app. Em Ajustes do Ofertas, clique em "Reconectar Google".');
      if (/has not been used|disabled|SERVICE_DISABLED/i.test(msg)) fail(409, 'A Google Sheets API está desligada no Google Cloud. Ative-a no projeto da Esteira e tente de novo.');
      if (r.status === 404) fail(404, 'Não achei a planilha do Caçador. Confira o link em Ajustes do Ofertas.');
      fail(502, `Erro no Google Sheets: ${msg}`);
    }
    return j;
  }
  async function lerAbas(nomes) {
    const qs = nomes.map((n) => `ranges=${encodeURIComponent(`'${n}'`)}`).join('&');
    const j = await sheets(`/values:batchGet?${qs}&valueRenderOption=FORMATTED_VALUE`);
    return Object.fromEntries(nomes.map((n, i) => [n, j.valueRanges?.[i]?.values || []]));
  }
  const coluna = (cab, prefixo) => cab.findIndex((h) => norm(h).startsWith(norm(prefixo)));
  async function escreverCelula(aba, linha, col, valor) {
    const range = encodeURIComponent(`'${aba}'!${letra(col)}${linha}`);
    await sheets(`/values/${range}?valueInputOption=USER_ENTERED`, { method: 'PUT', body: { values: [[valor]] } });
  }
  // Acha a linha (1-based) de uma oportunidade numa aba. Prefere a mesma semana; senão, a última.
  async function acharLinha(aba, oportunidade, semana) {
    const { [aba]: rows } = await lerAbas([aba]);
    const cab = rows[0] || [];
    const cOp = coluna(cab, 'Oportunidade'), cSem = coluna(cab, 'Semana');
    let achou = -1;
    rows.forEach((r, i) => {
      if (i === 0 || norm(r[cOp]) !== norm(oportunidade)) return;
      if (semana && cSem >= 0 && norm(r[cSem]) === norm(semana)) achou = i; else if (achou < 0 || !semana) achou = i;
    });
    return { cab, linha: achou >= 0 ? achou + 1 : null };
  }
  // Escreve de volta na planilha sem travar o app: erros viram aviso no histórico da oferta.
  async function devolver(of, tarefas) {
    if (!of.cacador && !tarefas.calibracao) return null;
    const avisos = [];
    for (const [nome, fn] of Object.entries(tarefas)) {
      if (!fn) continue;
      try { await fn(); } catch (e) { avisos.push(`${nome}: ${e.message}`); }
    }
    return avisos.length ? `Não consegui atualizar a planilha do Caçador (${avisos.join('; ')}).` : null;
  }
  const statusNaPlanilha = (of, valor) => of.cacador?.aba === 'Ranking' && (async () => {
    const { cab, linha } = await acharLinha('Ranking', of.cacador.oportunidade, of.cacador.semana);
    const c = coluna(cab, 'Status');
    if (linha && c >= 0) await escreverCelula('Ranking', linha, c, valor);
  });
  const resultadoNaPlanilha = (of, roas) => of.cacador && (async () => {
    for (const aba of ['Ranking', 'Histórico']) {
      if (aba === 'Ranking' && of.cacador.aba !== 'Ranking') continue;
      const { cab, linha } = await acharLinha(aba, of.cacador.oportunidade, aba === 'Ranking' ? of.cacador.semana : null);
      const c = coluna(cab, 'Resultado');
      if (linha && c >= 0) await escreverCelula(aba, linha, c, fmtRoas(roas));
      const cd = coluna(cab, 'Data do resultado');
      if (aba === 'Histórico' && linha && cd >= 0) await escreverCelula(aba, linha, cd, hoje.split('-').reverse().join('/'));
    }
  });
  const calibracaoNova = (of, resultado, nota) => async () => {
    const linha = [of.frase, of.cacador ? `Caçador ${of.cacador.semana || ''}`.trim() : of.origem, of.anunciantes ?? '', of.classe || '', of.ticket ? `R$ ${of.ticket}` : '', resultado, nota || ''];
    const j = await sheets(`/values/${encodeURIComponent("'Calibração'!A:G")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, { method: 'POST', body: { values: [linha] } });
    const m = (j.updates?.updatedRange || '').match(/!A(\d+)/);
    if (m) await sb(`esteira_ofertas?id=eq.${q(of.id)}`, { method: 'PATCH', body: { cacador: { ...(of.cacador || {}), calibracaoLinha: Number(m[1]) } } });
  };
  const calibracaoAtualiza = (of, resultado) => of.cacador?.calibracaoLinha && (() => escreverCelula('Calibração', of.cacador.calibracaoLinha, 5, resultado));

  // ------------------------------------------------------------ rotas
  if (p === '/api/ofertas' && m === 'GET') {
    return json(200, (await sb('esteira_ofertas?select=*&order=numero.desc&limit=5000')).map(paraApp));
  }

  if (p === '/api/ofertas' && m === 'POST') {
    const b = await body();
    const frase = String(b.frase || '').trim();
    if (!frase) fail(400, 'Escreva pelo menos uma frase sobre a oferta.');
    const origem = ORIGENS.includes(b.origem) ? b.origem : 'Ideia';
    const anunciantes = b.anunciantes === '' || b.anunciantes === undefined || b.anunciantes === null ? null : inteiro(b.anunciantes);
    const link = String(b.link || '').trim() || null;
    if (link) {
      const dup = [...await sb(`esteira_ofertas?link=eq.${q(link)}&select=id,frase`), ...await sb(`esteira_ofertas?mae_link=eq.${q(link)}&select=id,frase`)];
      if (dup.length) fail(409, `Esse link já está na ${dup[0].id} (${dup[0].frase}).`);
    }
    const r = await criar({
      frase, notas: String(b.notas || '').trim() || null, origem, link, mae_link: /facebook\.com\/ads\/library/.test(link || '') ? link : null,
      nicho: String(b.nicho || '').trim() || null, ticket: num(b.ticket), anunciantes, classe: classeDeAnunciantes(anunciantes), status: 'caixa',
    }, `Anotada na caixa (origem: ${origem}).`);
    return json(201, paraApp(r));
  }

  if (p === '/api/ofertas/config' && m === 'GET') {
    return json(200, {
      planilha: cfg.cacadorPlanilha || `https://docs.google.com/spreadsheets/d/${PLANILHA_PADRAO}/edit`,
      sheetsLiberado: /spreadsheets/.test(cfg.googleEscopos || ''), driveConectado: !!cfg.googleRefreshToken,
      ultimaPuxada: cfg.cacadorUltimaPuxada || null, benchmarks: cfg.benchmarks || null,
    });
  }
  if (p === '/api/ofertas/config' && m === 'POST') {
    if (!admin) fail(403, 'Só o gestor muda os ajustes.');
    const b = await body();
    if (typeof b.planilha === 'string' && b.planilha.trim()) await setConfig('cacadorPlanilha', b.planilha.trim());
    if (Array.isArray(b.benchmarks)) await setConfig('benchmarks', b.benchmarks);
    if (b.benchmarks === null) await setConfig('benchmarks', null);
    return json(200, { ok: true });
  }

  // Puxa a planilha do Caçador: Ranking (Top 10 da semana) e Histórico (descartadas), com as evidências.
  if (p === '/api/ofertas/cacador/puxar' && m === 'POST') {
    const abas = await lerAbas(['Ranking', 'Evidências', 'Histórico']);
    const existentes = new Set((await sb('esteira_ofertas?cacador=not.is.null&select=cacador->>chave')).map((r) => r.chave));
    const [rk, ev, hi] = [abas['Ranking'], abas['Evidências'], abas['Histórico']];
    const cR = rk[0] || [], cE = ev[0] || [], cH = hi[0] || [];
    const g = (row, cab, pref) => { const i = coluna(cab, pref); return i >= 0 ? String(row[i] ?? '').trim() : ''; };
    const evid = (sem, op) => ev.slice(1).filter((r) => norm(g(r, cE, 'Oportunidade')) === norm(op) && (!sem || norm(g(r, cE, 'Semana')) === norm(sem)))
      .map((r) => ({ sinal: g(r, cE, 'Sinal'), fonte: g(r, cE, 'Fonte'), metrica: g(r, cE, 'Métrica'), valor: g(r, cE, 'Valor'), data: g(r, cE, 'Data'), link: g(r, cE, 'Link') }));
    const links = (s) => String(s || '').split(/\s*\|\s*|\s+/).map((x) => x.trim()).filter((x) => /\w+\.\w+\//.test(x)).map((x) => (/^https?:/.test(x) ? x : 'https://' + x));
    let novas = 0, descartadas = 0, puladas = 0;
    for (const r of rk.slice(1)) {
      const op = g(r, cR, 'Oportunidade'); const sem = g(r, cR, 'Semana');
      if (!op) continue;
      const chave = `ranking|${norm(sem)}|${norm(op)}`;
      if (existentes.has(chave)) { puladas++; continue; }
      const ls = links(g(r, cR, 'Links'));
      const mae = ls.find((l) => /facebook\.com\/ads\/library/.test(l)) || null;
      const anunciantes = inteiro(g(r, cR, 'Anunciantes'));
      const classe = /^[ABCD]$/i.test(g(r, cR, 'Classe').slice(0, 1)) ? g(r, cR, 'Classe').slice(0, 1).toUpperCase() : classeDeAnunciantes(anunciantes);
      const cacador = {
        chave, aba: 'Ranking', veredito: 'recomendou', semana: sem, rank: inteiro(g(r, cR, 'Rank')), oportunidade: op,
        promessa: g(r, cR, 'Promessa'), persona: g(r, cR, 'Persona'), os: num(g(r, cR, 'O.S')),
        notas: { demanda: num(g(r, cR, 'Demanda')), organico: num(g(r, cR, 'Orgânico')), gap: num(g(r, cR, 'Gap')), prova: num(g(r, cR, 'Prova')), amplitude: num(g(r, cR, 'Amplitude')), ajustes: num(g(r, cR, 'Ajustes')) },
        caminho: g(r, cR, 'Caminho'), referencia: g(r, cR, 'Oferta-mãe'), anunciantesTexto: g(r, cR, 'Anunciantes'), sinalEUA: g(r, cR, 'Sinal EUA'),
        porQueAgora: g(r, cR, 'Por que agora'), riscos: g(r, cR, 'Riscos'), confianca: g(r, cR, 'Confiança'), links: ls, observacoes: g(r, cR, 'Observações'),
        evidencias: evid(sem, op),
      };
      await criar({
        frase: op, notas: cacador.promessa || null, origem: 'Caçador', link: mae || ls[0] || null, mae_link: mae, nicho: g(r, cR, 'Nicho') || null,
        anunciantes, classe, score: cacador.os, status: 'caixa', cacador,
      }, `Veio do Caçador (${sem}, rank ${cacador.rank || '?'}).`);
      existentes.add(chave); novas++;
    }
    for (const r of hi.slice(1)) {
      if (!/descart/i.test(g(r, cH, 'Decisão'))) continue;
      const op = g(r, cH, 'Oportunidade'); const data = g(r, cH, 'Data');
      if (!op) continue;
      const chave = `historico|${norm(data)}|${norm(op)}`;
      if (existentes.has(chave)) { puladas++; continue; }
      const classe = /^[ABCD]$/i.test(g(r, cH, 'Classe').slice(0, 1)) ? g(r, cH, 'Classe').slice(0, 1).toUpperCase() : null;
      const cacador = { chave, aba: 'Histórico', veredito: 'descartou', data, oportunidade: op, os: num(g(r, cH, 'O.S')), motivo: g(r, cH, 'Motivo'), reavaliarEm: g(r, cH, 'Pode reavaliar'), evidencias: [] };
      await criar({
        frase: op, origem: 'Caçador', nicho: g(r, cH, 'Nicho') || null, classe, score: cacador.os, status: 'cacador_descartou', motivo_descarte: cacador.motivo || null, cacador,
      }, `O Caçador descartou (${cacador.motivo || 'sem motivo'}).`);
      existentes.add(chave); descartadas++;
    }
    await setConfig('cacadorUltimaPuxada', new Date().toISOString());
    return json(200, { novas, descartadas, puladas });
  }

  const mUm = p.match(/^\/api\/ofertas\/(OF-\d+)$/);
  if (mUm && m === 'GET') return json(200, paraApp(await carregar(mUm[1])));
  if (mUm && m === 'PATCH') {
    const of = await carregar(mUm[1]);
    const b = await body();
    const patch = Object.fromEntries(Object.entries(EDITAVEIS).filter(([k]) => b[k] !== undefined).map(([k, col]) => [col, b[k] === '' ? null : b[k]]));
    if (patch.ticket !== undefined) patch.ticket = num(patch.ticket);
    if (patch.anunciantes !== undefined) { patch.anunciantes = patch.anunciantes === null ? null : inteiro(patch.anunciantes); if (b.classe === undefined && !of.cacador) patch.classe = classeDeAnunciantes(patch.anunciantes); }
    if (patch.trilha && !TRILHAS[patch.trilha]) fail(400, 'Trilha desconhecida.');
    if (patch.classe && !/^[ABCD]$/.test(patch.classe)) fail(400, 'Classe vai de A a D.');
    const quietos = ['etapas', 'checklist', 'funil'];
    const txt = Object.keys(patch).every((k) => quietos.includes(k)) ? null : `Editou: ${Object.keys(b).filter((k) => EDITAVEIS[k]).join(', ')}.`;
    return json(200, paraApp(await salvar(of.id, patch, txt)));
  }

  const mAcao = p.match(/^\/api\/ofertas\/(OF-\d+)\/acao$/);
  if (mAcao && m === 'POST') {
    const of = await carregar(mAcao[1]);
    const b = await body();
    const A = b.acao;
    let patch = {}, txt = '', tarefas = {};

    if (A === 'modelar') {
      const trilha = TRILHAS[b.trilha] ? b.trilha : trilhaSugerida(paraApp(of));
      if (trilha === 'lateralizacao' && !b.idioma && !of.idioma) fail(400, 'Escolha o idioma da lateralização.');
      patch = { status: 'modelagem', trilha, idioma: b.idioma || of.idioma || null, monitorar_ate: null };
      txt = `Decisão: modelar na trilha ${TRILHAS[trilha].nome}${patch.idioma ? ` (${patch.idioma})` : ''}.`;
      tarefas.status = statusNaPlanilha(of, 'Aprovado');
    } else if (A === 'monitorar') {
      const dias = Number(b.dias) > 0 ? Number(b.dias) : 7;
      patch = { status: 'monitorar', monitorar_ate: maisDias(hoje, dias) };
      txt = `Decisão: monitorar por ${dias} dias (revisar em ${patch.monitorar_ate.split('-').reverse().join('/')}).`;
    } else if (A === 'descartar') {
      const motivo = String(b.motivo || '').trim();
      if (!motivo) fail(400, 'Escolha o motivo do descarte.');
      patch = { status: 'descartada', motivo_descarte: motivo, monitorar_ate: null };
      txt = `Decisão: descartar (${motivo}).`;
      tarefas.status = statusNaPlanilha(of, 'Reprovado');
    } else if (A === 'teimosia') {
      if (of.status !== 'cacador_descartou') fail(400, 'Só dá para teimar com uma oferta que o Caçador descartou.');
      patch = { status: 'caixa', teimosia: true };
      txt = 'Teimosia: vai para a triagem mesmo com o Caçador tendo descartado.';
    } else if (A === 'voltar_caixa') {
      patch = { status: 'caixa', monitorar_ate: null };
      txt = 'Voltou para a caixa.';
    } else if (A === 'subir_teste') {
      if (of.status !== 'modelagem') fail(400, 'A oferta precisa estar em modelagem.');
      const falta = CHECKLIST.filter((c) => !(of.checklist || {})[c]);
      if (falta.length && !b.forcar) fail(400, `O checklist low ticket ainda não bateu: ${falta.join(', ')}.`);
      patch = { status: 'teste', teste: { ...(of.teste || {}), inicio: b.inicio || hoje, verba: b.verba || null } };
      txt = `Teste no ar desde ${(b.inicio || hoje).split('-').reverse().join('/')}.${falta.length ? ` Subiu sem bater: ${falta.join(', ')}.` : ''}`;
    } else if (A === 'resultado') {
      const gasto = num(b.gasto), fat = num(b.faturamento);
      const roas = num(b.roas) ?? (gasto ? (fat ?? 0) / gasto : null);
      if (roas === null) fail(400, 'Informe o ROAS do teste, ou o gasto e o faturamento.');
      const faixa = faixaTeste(roas);
      const teste = { ...(of.teste || {}), gasto, faturamento: fat, vendas: inteiro(b.vendas), dias: inteiro(b.dias) || 3, roas: Math.round(roas * 100) / 100, faixa, registradoEm: hoje };
      patch = { teste };
      if (faixa === 'negativa') { patch.status = 'arquivada'; patch.escalou = 'nao'; patch.motivo_descarte = 'Teste negativo'; }
      else if (faixa === 'caso_a_caso') patch.status = 'teste';
      else patch.status = 'otimizar';
      txt = `Resultado do teste: ROAS ${fmtRoas(roas)} (${{ negativa: 'negativa, arquivada', caso_a_caso: 'caso a caso, decidir pelas métricas', otimizar: 'vai para otimização', escalar: 'teste bom, vai para otimização' }[faixa]}).`;
      const resultado = faixa === 'negativa' ? 'Floppou' : `ROAS ${fmtRoas(roas)} no teste`;
      tarefas.resultado = resultadoNaPlanilha(of, roas);
      tarefas.calibracao = !of.cacador?.calibracaoLinha && calibracaoNova({ ...of, ...patch }, resultado, `Teste ${teste.dias} dias${teste.vendas !== null ? `, ${teste.vendas} vendas` : ''}`);
    } else if (A === 'otimizar') {
      patch = { status: 'otimizar' };
      txt = 'Decisão: otimizar.';
    } else if (A === 'escalar') {
      patch = { status: 'escala', escalou: 'sim' };
      txt = 'Foi para a escala: mais criativos e mais orçamento até achar o teto.';
      tarefas.calibracao = calibracaoAtualiza(of, `Escalou (ROAS ${fmtRoas(of.teste?.roas)} no teste)`);
    } else if (A === 'teto') {
      patch = { status: 'manutencao' };
      txt = 'Achou o teto: entrou em manutenção.';
    } else if (A === 'desistir' || A === 'arquivar') {
      const motivo = String(b.motivo || '').trim() || (A === 'desistir' ? 'Não vendeu com ROAS bom' : 'Arquivada');
      patch = { status: 'arquivada', motivo_descarte: motivo };
      if (['teste', 'otimizar'].includes(of.status)) patch.escalou = 'nao';
      txt = `Arquivada: ${motivo}.`;
      if (patch.escalou === 'nao') tarefas.calibracao = calibracaoAtualiza(of, `Não escalou (ROAS ${fmtRoas(of.teste?.roas)} no teste)`);
    } else if (A === 'reabrir') {
      patch = { status: 'caixa', motivo_descarte: null };
      txt = 'Reaberta: voltou para a caixa.';
    } else if (A === 'filha') {
      if (of.trilha !== 'mecanismo') fail(400, 'Só um teste de mecanismo gera oferta filha.');
      const nome = String(b.nome || '').trim();
      if (!nome) fail(400, 'Dê um nome ao mecanismo vencedor.');
      const filha = await criar({
        frase: nome, notas: `Mecanismo vencedor do teste da ${of.id} (${of.frase}). Ganha página própria e orderbump.`, origem: 'Mecanismo vencedor',
        mae_id: of.id, mae_link: of.mae_link, nicho: of.nicho, ticket: of.ticket, classe: of.classe, status: 'modelagem', trilha: 'oferta_nova',
      }, `Nasceu do mecanismo vencedor da ${of.id}.`);
      await salvar(of.id, {}, `Mecanismo vencedor virou a ${filha.id} (${nome}).`);
      return json(201, { oferta: paraApp(await carregar(of.id)), filha: paraApp(filha) });
    } else fail(400, 'Ação desconhecida.');

    const salvo = await salvar(of.id, patch, txt);
    const aviso = await devolver({ ...of, ...salvo }, tarefas);
    if (aviso) await salvar(of.id, {}, aviso);
    return json(200, { oferta: paraApp(Object.keys(tarefas).some((k) => tarefas[k]) ? await carregar(of.id) : salvo), aviso });
  }

  fail(404, 'Rota não encontrada.');
}

export const STATUS_VALIDOS = Object.keys(STATUS);
export { MOTIVOS_DESCARTE };
