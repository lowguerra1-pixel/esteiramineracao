// Regras do app Testes (A/B de páginas). Usado pelo servidor e pela tela.

export const STATUS_TESTE = {
  rascunho: 'Rascunho',
  ativo: 'Rodando',
  pausado: 'Pausado',
  encerrado: 'Encerrado',
};

// Régua da vencedora. Ajustável em Ajustes do app.
export const REGUA_PADRAO = {
  confianca: 95,     // % de chance de ser a melhor, em receita por visitante
  minVendas: 30,     // vendas somadas de todas as páginas
  minDias: 3,        // dias rodando
  minVisitas: 300,   // visitantes por página
};

// Etiqueta que viaja no link da Lastlink (parâmetro vtid) e volta no webhook.
export const etiqueta = (testeId, variante) => `ab-${String(testeId).toLowerCase().replace(/[^a-z0-9]/g, '')}-${variante}`;
export function lerEtiqueta(v) {
  const m = String(v || '').toLowerCase().match(/^ab-ts(\d{1,6})-([a-z])$/);
  return m ? { testeId: 'TS-' + m[1].padStart(4, '0'), variante: m[2] } : null;
}

// ---------------------------------------------------------------- estatística
// Gerador pseudoaleatório com semente: o placar dá o mesmo número toda vez que abre.
function rng(seed = 42) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function normal(r) { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function gamma(k, r) {
  if (k < 1) return gamma(k + 1, r) * Math.pow(r(), 1 / k);
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { x = normal(r); v = 1 + c * x; } while (v <= 0);
    v = v * v * v; const u = r();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
const beta = (a, b, r) => { const x = gamma(a, r); return x / (x + gamma(b, r)); };

// Chance de cada página ser a melhor em receita por visitante.
// Conversão: Beta(1 + vendas, 1 + visitas - vendas). Ticket: média observada, puxada para a média geral quando há poucas vendas.
export function chanceDeSerMelhor(linhas, sorteios = 20000) {
  const vivas = linhas.filter((l) => l.visitas > 0);
  if (vivas.length < 2) return Object.fromEntries(linhas.map((l) => [l.id, null]));
  const vendasTot = vivas.reduce((s, l) => s + l.vendas, 0);
  const fatTot = vivas.reduce((s, l) => s + l.faturamento, 0);
  const ticketGeral = vendasTot ? fatTot / vendasTot : 1;
  const ticket = vivas.map((l) => (l.faturamento + ticketGeral * 3) / (l.vendas + 3));
  const r = rng(vivas.reduce((s, l) => s + l.visitas * 31 + l.vendas * 7, 17));
  const ganhos = vivas.map(() => 0);
  for (let i = 0; i < sorteios; i++) {
    let melhor = -1, idx = 0;
    vivas.forEach((l, j) => {
      const v = beta(1 + l.vendas, 1 + Math.max(0, l.visitas - l.vendas), r) * ticket[j];
      if (v > melhor) { melhor = v; idx = j; }
    });
    ganhos[idx]++;
  }
  const out = Object.fromEntries(linhas.map((l) => [l.id, null]));
  vivas.forEach((l, j) => { out[l.id] = ganhos[j] / sorteios; });
  return out;
}

// ---------------------------------------------------------------- placar
// contagem: [{variante, visitas, ics}], vendas: [{variante, valor, upsell, reembolso}], gasto: número (total do período) ou null
export function calcularPlacar({ variantes, contagem = [], vendas = [], gasto = null, inicio = null, fim = null, regua = REGUA_PADRAO }) {
  const linhas = variantes.map((v) => {
    const c = contagem.filter((x) => x.variante === v.id);
    const vs = vendas.filter((x) => x.variante === v.id && !x.reembolso);
    const front = vs.filter((x) => !x.upsell);
    const visitas = c.reduce((s, x) => s + (x.visitas || 0), 0);
    const ics = c.reduce((s, x) => s + (x.ics || 0), 0);
    const faturamento = vs.reduce((s, x) => s + Number(x.valor || 0), 0);
    return {
      id: v.id, nome: v.nome, arquivo: v.arquivo, peso: v.peso,
      visitas, ics, vendas: front.length, upsells: vs.length - front.length, faturamento,
      reembolsos: vendas.filter((x) => x.variante === v.id && x.reembolso).length,
      taxaIC: visitas ? ics / visitas : null,
      convCheckout: ics ? front.length / ics : null,
      conversao: visitas ? front.length / visitas : null,
      rpv: visitas ? faturamento / visitas : null,
      ticket: front.length ? faturamento / front.length : null,
    };
  });
  const visitasTot = linhas.reduce((s, l) => s + l.visitas, 0);
  // O gasto é dividido pela parte do tráfego que cada página recebeu (o anúncio é o mesmo).
  for (const l of linhas) {
    const g = Number.isFinite(Number(gasto)) && gasto > 0 && visitasTot ? (gasto * l.visitas) / visitasTot : null;
    l.gasto = g;
    l.roas = g ? l.faturamento / g : null;
    l.custoIC = g && l.ics ? g / l.ics : null;
    l.cpa = g && l.vendas ? g / l.vendas : null;
  }
  const chances = chanceDeSerMelhor(linhas);
  for (const l of linhas) l.chance = chances[l.id];

  const vendasTot = linhas.reduce((s, l) => s + l.vendas, 0);
  const dias = inicio ? Math.max(0, ((fim ? new Date(fim) : new Date()) - new Date(inicio)) / 864e5) : 0;
  const lider = [...linhas].filter((l) => l.chance !== null).sort((a, b) => b.chance - a.chance)[0] || null;
  const faltas = [];
  if (vendasTot < regua.minVendas) faltas.push(`${regua.minVendas - vendasTot} vendas`);
  if (dias < regua.minDias) faltas.push(`${Math.ceil(regua.minDias - dias)} ${Math.ceil(regua.minDias - dias) === 1 ? 'dia' : 'dias'}`);
  const poucas = linhas.filter((l) => l.peso > 0 && l.visitas < regua.minVisitas);
  if (poucas.length) faltas.push(`${regua.minVisitas} visitas em ${poucas.map((l) => l.id.toUpperCase()).join(' e ')}`);

  let veredito;
  if (!visitasTot) veredito = { tipo: 'vazio', txt: 'Ainda sem visitas.' };
  else if (lider && lider.chance * 100 >= regua.confianca && !faltas.length) veredito = { tipo: 'vencedora', id: lider.id, txt: `Página ${lider.id.toUpperCase()} venceu: ${Math.round(lider.chance * 100)}% de chance de ser a melhor em receita por visitante.` };
  else if (faltas.length) veredito = { tipo: 'cedo', id: lider?.id, txt: `Ainda é cedo. Falta: ${faltas.join(', ')}.` + (lider && vendasTot ? ` Por enquanto, ${lider.id.toUpperCase()} na frente (${Math.round(lider.chance * 100)}%).` : '') };
  else veredito = { tipo: 'empate', id: lider?.id, txt: `Sem vencedora clara ainda. ${lider ? `${lider.id.toUpperCase()} tem ${Math.round(lider.chance * 100)}%` : ''}; a régua pede ${regua.confianca}%. Se ficar assim por muitos dias, as páginas convertem parecido.` };

  return { linhas, visitasTot, vendasTot, dias, veredito };
}
