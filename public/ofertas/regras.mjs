// Regras do processo de ofertas (Mineração e Modelagem), usadas pela tela e pela API.
// Tudo aqui saiu do mapa no Miro e das decisões do Kaian.

export const ORIGENS = ['Scale Ads', 'Feed do Facebook', 'Biblioteca', 'Ideia', 'Caçador', 'Mecanismo vencedor'];

export const STATUS = {
  caixa: 'Na caixa',
  monitorar: 'Monitorando',
  descartada: 'Descartada',
  cacador_descartou: 'Descartada pelo Caçador',
  modelagem: 'Em modelagem',
  teste: 'Em teste',
  otimizar: 'Otimizando',
  escala: 'Escalando',
  manutencao: 'Manutenção',
  arquivada: 'Arquivada',
};
export const FASES_MODELAGEM = ['modelagem', 'teste', 'otimizar', 'escala', 'manutencao'];

export const MOTIVOS_DESCARTE = [
  'Saturado demais',
  'Fora do ticket (acima de R$ 67)',
  'Precisa de expert ou rosto',
  'Nicho com risco de bloqueio no Meta',
  'Sazonal',
  'Já tenho parecida',
  'Não acredito na promessa',
  'Outro',
];

export const IDIOMAS = ['Português (sem Brasil)', 'Espanhol (LATAM)', 'Inglês', 'Italiano', 'Francês', 'Alemão'];

export const TRILHAS = {
  oferta_nova: {
    nome: 'Oferta nova',
    teste: '10 anúncios em imagem, 1-1-10 CBO, US$ 10 a 20 por dia, 3 dias',
    etapas: [
      ['pesquisa', 'Pesquisa de público', 'Com os seus prompts de pesquisa.'],
      ['concepcao', 'Concepção da oferta', ''],
      ['mvp', 'Criação do MVP', ''],
      ['checkout', 'Checkout', ''],
      ['pagina', 'Página de vendas', 'Skill criar-pv-completo.'],
      ['scripts', 'Scripts de rastreamento e trackeamento', ''],
      ['integracoes', 'Integrações e app de membros', 'App de membros nas ofertas de psicologia e terapia.'],
      ['anuncios', 'Anúncios diretos em imagem', '10 anúncios.'],
    ],
  },
  mecanismo: {
    nome: 'Teste de mecanismo',
    teste: '1-1-X em CBO (X = nº de mecanismos), 5 dias a US$ 10 ou 2 dias a US$ 30',
    etapas: [
      ['pesquisa_mec', 'Pesquisa de mecanismos na oferta mãe', 'Skill criar-mecanismos.'],
      ['clonar', 'Clonar a página principal da mãe', ''],
      ['criativos_mec', 'Um criativo para cada mecanismo', ''],
      ['mvp', 'MVP único, checkout e integrações', 'Um MVP só para todos os mecanismos.'],
      ['scripts', 'Scripts de rastreamento e trackeamento', ''],
    ],
  },
  lateralizacao: {
    nome: 'Lateralização',
    teste: '1-1-10 no mundo todo no idioma, sem o Brasil, R$ 50 por dia, uns 5 dias',
    etapas: [
      ['pesquisa', 'Pesquisa de público da oferta', ''],
      ['cultura', 'Pesquisa da cultura do idioma', ''],
      ['baixar', 'Baixar a página', ''],
      ['adaptar', 'Adaptar a copy da página à cultura', ''],
      ['plataforma', 'Subir na Hotmart ou plataforma, checkout e integrações', ''],
      ['scripts', 'Scripts de rastreamento e trackeamento', ''],
      ['criativos_trad', 'Criativos traduzidos (da mãe ou novos)', ''],
    ],
  },
};

// Todo low ticket tem que ser assim. Confere a oferta pronta, antes de subir o teste.
export const CHECKLIST = ['Específico', 'Tangível', 'Melhoria', 'Praticidade', 'Organização', 'Visual', 'Economiza tempo', 'Rápido de consumir', 'Ferramental', 'Fácil de utilizar'];

// Gap de oferta do Caçador: quantos anunciantes rodam a promessa exata no BR.
export function classeDeAnunciantes(n) {
  if (n === null || n === undefined || n === '' || Number.isNaN(Number(n))) return null;
  n = Number(n);
  return n <= 0 ? 'A' : n <= 2 ? 'B' : n <= 9 ? 'C' : 'D';
}
export const CLASSES = {
  A: 'Ouro: ninguém anunciando. Rodar a oferta principal.',
  B: 'Mecanismo: 1 ou 2 anunciantes. Variação de mecanismo.',
  C: 'Diferencial: 3 a 9 anunciantes. Ângulo ou mecanismo novo.',
  D: 'Saturado: 10+ anunciantes. Só com brecha de mecanismo, ou lateralizar.',
};

export function trilhaSugerida(of) {
  const c = String(of?.cacador?.caminho || '').toLowerCase();
  if (/lateraliz/.test(c)) return 'lateralizacao';
  if (/mecanismo/.test(c)) return 'mecanismo';
  if (/oferta principal|rodar a oferta/.test(c)) return 'oferta_nova';
  if (of?.classe === 'A') return 'oferta_nova';
  if (of?.classe) return 'mecanismo';
  return 'oferta_nova';
}

// Resultado do teste (3 dias, sem orderbump).
export const FAIXAS_TESTE = {
  negativa: { nome: 'Negativa', txt: 'ROAS abaixo de 1: arquivar. Não otimizamos o que está ruim.' },
  caso_a_caso: { nome: 'Caso a caso', txt: 'ROAS de 1 a 1,4: você decide olhando as métricas.' },
  otimizar: { nome: 'Otimizar', txt: 'ROAS de 1,4 a 1,8: vai para otimização.' },
  escalar: { nome: 'Teste bom', txt: 'ROAS de 1,8 ou mais: otimiza o funil e escala.' },
};
export function faixaTeste(roas) {
  const r = Number(roas);
  if (!(r >= 0)) return null;
  return r < 1 ? 'negativa' : r < 1.4 ? 'caso_a_caso' : r < 1.8 ? 'otimizar' : 'escalar';
}

// O que esperar na escala (SOP MVT).
export function roasNaEscala(roas) {
  const r = Number(roas);
  if (r > 2.5) return 'tende a ficar entre 1,5 e 2,0 na escala';
  if (r >= 2.0) return 'tende a ficar entre 1,3 e 1,7 na escala';
  if (r >= 1.5) return 'tende a ficar entre 1,0 e 1,4 na escala';
  if (r >= 1.4) return 'fica no limite: a escala tende a ficar perto de 1,0';
  return 'não tende a performar na escala';
}

// Benchmarks do SOP MVT. "pct" = porcentagem do ticket. Ajustáveis em Ajustes.
// sentido: "menor" = quanto menor melhor; "maior" = quanto maior melhor.
export const BENCHMARKS = [
  { k: 'cpm', camada: 'Criativo', nome: 'CPM', un: 'R$', sentido: 'menor', bom: 25, ruim: 50 },
  { k: 'cpv', camada: 'Criativo', nome: 'CPV (custo por view da página)', un: '% do ticket', sentido: 'menor', bom: 5, ruim: 8 },
  { k: 'connect', camada: 'Criativo', nome: 'Connect rate', un: '%', sentido: 'maior', bom: 90, ruim: 80 },
  { k: 'pv_checkout', camada: 'Página', nome: 'Página para checkout', un: '%', sentido: 'maior', bom: 20, ruim: 8 },
  { k: 'pv_compra', camada: 'Página', nome: 'Página para compra', un: '%', sentido: 'maior', bom: 10, ruim: 3 },
  { k: 'custo_checkout', camada: 'Página', nome: 'Custo por checkout', un: '% do ticket', sentido: 'menor', bom: 25, ruim: 35 },
  { k: 'cv_checkout', camada: 'Oferta', nome: 'Checkout para compra', un: '%', sentido: 'maior', bom: 35, ruim: 10 },
  { k: 'cv_ob', camada: 'Oferta', nome: 'Adesão ao orderbump', un: '%', sentido: 'maior', bom: 20, ruim: 10 },
  { k: 'cpa', camada: 'Oferta', nome: 'CPA', un: '% do ticket', sentido: 'menor', bom: 60, ruim: 60 },
  { k: 'roas', camada: 'Oferta', nome: 'ROAS', un: '', sentido: 'maior', bom: 1.8, ruim: 1.2 },
];

// Calcula as métricas do funil a partir dos números brutos.
export function calcularFunil(f = {}, benchmarks = BENCHMARKS) {
  const n = (k) => (f[k] === '' || f[k] === null || f[k] === undefined ? null : Number(String(f[k]).replace(',', '.')));
  const ticket = n('ticket'), gasto = n('gasto'), impr = n('impressoes'), cliques = n('cliques'), views = n('views');
  const checkouts = n('checkouts'), compras = n('compras'), ob = n('ob');
  let fat = n('faturamento');
  if (fat === null && compras !== null && ticket !== null) fat = compras * ticket;
  const div = (a, b) => (a === null || b === null || b === 0 ? null : a / b);
  const pctTicket = (v) => (v === null || !ticket ? null : (v / ticket) * 100);
  const val = {
    cpm: div(gasto, impr) !== null ? div(gasto, impr) * 1000 : null,
    cpv: pctTicket(div(gasto, views)),
    connect: div(views, cliques) !== null ? div(views, cliques) * 100 : null,
    pv_checkout: div(checkouts, views) !== null ? div(checkouts, views) * 100 : null,
    pv_compra: div(compras, views) !== null ? div(compras, views) * 100 : null,
    custo_checkout: pctTicket(div(gasto, checkouts)),
    cv_checkout: div(compras, checkouts) !== null ? div(compras, checkouts) * 100 : null,
    cv_ob: div(ob, compras) !== null ? div(ob, compras) * 100 : null,
    cpa: pctTicket(div(gasto, compras)),
    roas: div(fat, gasto),
  };
  const linhas = benchmarks.map((b) => {
    const v = val[b.k];
    let nivel = null;
    if (v !== null && Number.isFinite(v)) {
      if (b.sentido === 'menor') nivel = v < b.bom ? 'bom' : v <= b.ruim ? (b.bom === b.ruim ? 'bom' : 'medio') : 'ruim';
      else nivel = v >= b.bom ? 'bom' : v >= b.ruim ? 'medio' : 'ruim';
      if (b.k === 'cpa' && v <= b.bom) nivel = 'bom';
    }
    return { ...b, valor: v !== null && Number.isFinite(v) ? v : null, nivel };
  });
  return { faturamento: fat, linhas, vazamento: linhas.find((l) => l.nivel === 'ruim') || null };
}
