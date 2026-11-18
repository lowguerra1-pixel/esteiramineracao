// Biblioteca de copy do Setor de Criativos.
// Fusão com o "Controle de Levas" do João: as 29 fichas do _SISTEMA\REPERTORIO (+ índice e vocabulário) e a
// pesquisa de público de cada oferta (KAIAN DIGITAL\Ofertas\<oferta>\) passam a morar no banco, e o Diretor
// de Copy lê pesquisa + 2–3 fichas antes de escrever cada card — a mesma regra que vale para os chats de oferta.

// Arquivos públicos do Drive (pasta CONTROLE (LEVAS) é "qualquer pessoa com o link").
export const BIBLIOTECA_DRIVE = {
  'INDICE': '1KTJxGGsUardM2qxrc5qM055CCmrIQRr0',
  'VOCABULARIO': '1YjogP5Xwn3rGCoKkHcmkrA-kdttfG0cJ',
  'LEIA-ME': '1rHrsXpVU9VOSRdbtEPQcQjCBo1oGLzpt',
  'angulo--breakthrough-consciencia-sofisticacao': '1OPqC_6zibRCppX1XB_yLAXVGQLrJrECB',
  'angulo--hooks-and-mechanisms': '14YvyDLWqnN4mC6X8FT2jhVCyK7T80Nte',
  'angulo--seduzindo-estranhos': '1gZGHk0U2JNV6bigcLJQ_exx_o3pKW6se',
  'formato--diogo-gomes-bastidores-8-digitos': '1JX4qhyQ8Q_SdOFjUDloSSV8Ko9xibvlH',
  'formato--matheus-lourenco-segredos-escala-171': '1XdsDWEnk76IDeBLegDoZDQzyChygBPd7',
  'headline--21-bullet-secrets': '1kW2x3AHAchqZQ12h8oUIP-G6RYerd2qj',
  'headline--copywriting-secrets-edwards': '1YLqPxvRzUZBrXNxvHMPL9ikUQhKtrE0V',
  'headline--powerful-headlines': '1uImaEvCAMaizgBKiYy64dbozNCazqJiV',
  'headline--tested-advertising-methods': '1TUkSwPGddffJN3n_oHlWzTN7lm_FhuB5',
  'hook--biblia-dos-hooks': '1oQUTVGme_pju6G2SoWbBFH9hknVsCW2b',
  'lead-body--100-great-sales-letters': '1u3EW1oGQMvmFW_SO6OaRamwCsBB8sL2n',
  'lead-body--adweek-sugarman': '14VPP5FHmXU46Y2_8sVnt77SxDB6rWCSQ',
  'lead-body--dotcom-secrets': '1P5yO5E1GXfFRENOGYgT6JpK4UtTgw-7i',
  'lead-body--great-leads': '1pI7IRD32p_jMDM0DucHx9LmaxSztD3jP',
  'mecanismo--breakthrough-mecanizacao': '1-MUJ2dj5qBZVMtpVK457MKSCuuRjqGaw',
  'mecanismo--carta-de-vendas-16-palavras': '1FVQEFU34bgF3su1toiZb7RMu5nst09zv',
  'mecanismo--e5-method': '1gQeZSyDiqH9m2cfljnr3bqA6mrsEXfPG',
  'oferta--100m-offers': '1j3e0WZSXRaLiXXJTNrR8ObJN_5E6qAgP',
  'oferta--arthur-funis-1m-dia': '1FIVW_hc3to1Kzt8IhwGK0wH9UEoLcxGa',
  'oferta--big-black-book-3': '11eh4aeeLyvBVRW8rK1LclYb8vW-aH_6q',
  'oferta--segredos-do-upsell': '1QR3EcVC6cMvJhTlrJO_2T6UlF5XsyqwC',
  'oficio--arthur-criativos-1m-dia': '16lP1-R4esGWiLfvCNJwHXK_auEyNZmFO',
  'oficio--call-melz-comunicacao': '1XWqUJgf77lDQPrJgbPCZS7fjhqZkNEoJ',
  'oficio--diagnostico-forde-thomson': '1BP2aKJaoDMfRoaXKosz6-k9-ZUWC1UVv',
  'oficio--scientific-advertising': '1o8s4KTov2OPCQrrlp87dh2W70hCAKHhX',
  'pesquisa--quick-start-makepeace': '1Etonu-QhcCBaBggqlTqVXQVP1zo-xNTv',
  'prova-crenca--fazendo-os-acreditar': '1UfHHPWji5rUVpzBxveobQdJokE2ncAbb',
  'psicologia--cashvertising': '18xELQijBWS9A8oq68g-ArCdbol_iGzOP',
  'psicologia--mark-builds-brands-neuro-8-anos': '1ophqpEdkTiWus59AkOp4BnbqJddDdaA_',
};

// Pesquisa de cada oferta no Drive (KAIAN DIGITAL\Ofertas\<oferta>\01 - Pesquisa de Público.md, 02 - Formato…).
// Só funciona depois que a pasta "Ofertas" estiver compartilhada como "qualquer pessoa com o link"; antes disso o Drive
// devolve a tela de login e a importação avisa.
export const PESQUISA_DRIVE = {
  RADICIG: ['1C5sftvUPbd0p-CbFPtHKwGdCP8J202OB', '1PLqQgN7WO5aFVAtyJHc07JdeRw5bhw1X'],
  CFAM: ['1VaFnQWa9ZFzOUYx2WWDEHpdEHntY7iM-', '1WoUTNIEwC8RQfZCFip555Mq1mPqzK53d', '10lk8dY8t3LJajWsNt-YXpoDhjWM7i8kJ'],
  KSN: ['1UC_D9h2PMPABlVdsvqNux5ldUXER1Gkj'],
  ARTJUNG: ['1utcg6BNZUnZTQmivCKqetbNCC1qcJNb2', '1D-tyDDHMR90Vivpvhu0eWbSV9AT1I9OL'],
  AFRI: ['1waSFRHMr0XF3HWww5WfcUkl1SincyOpb', '1bnyp-sMoAyUFhVot1-LjjL7MPcfMWnWT'],
  ARTDQ: ['1m_cDnnR52YI2sGAbBnb34JVg-CKV6n4G'],
  ARTCHI: ['1wpcRp1i_xCpiUq55RZT1sXuxzcTuxvWW', '1LOfF310NefoIaU3JNafv-m3OEzRhxL7M'],
  ARTARG: ['1p15RimFRY5vMOmpoT-3BUwXyvo-1L8Q6', '18LtQd8X6gftJg3wiLV1BEjjc7zR8X-6R'],
  LUTO: ['18jMwApTk-iXzZ8lL5ITtdv7KasuJ_9-C', '1ltmzU5NZdF948aK0WtqAQYQ7v5bVWOv_'],
  FRAN: ['1A-pxnYDzUkJ3rArVzEwwmZEDaVqFKksE', '12u1wjDrxuB7yfSxKibUyOIzYY4tCyIWU'],
  IDOSOS: ['1aSwm-xevu4BliU3jBm618Cu8M9LXgw14', '1v9NJ0iwmkaX4csC9yrlLSLEk-bHrU4H9'],
  HAVA: ['1GQYLCmVb06vBFs0s8Gd4K4ximXFmDcUN', '1lVM9VumBVXn34P0uP2BUEkzLM15E6nYT'],
  JAPO: ['1qq8HUGQE0SnKTn8AUj2OCqOA9adbfxz3', '19lko8NwsFFhnZbr0G-zJRn8Iq9XjS7yK'],
  MEXI: ['1h1VSWnTKlPmHYAEqLf4xHCjxHn2rDU3f', '1vdZao5XbMTVxh9b1a00J2zpN0KhAj_4s'],
  HOOP: ['1R1Ve0J7VWUhu2tLbrkMHHhTdGt34xtwF', '1vD8Ccc66wFwVaQpkrIXniI8_JESZYr5x'],
  ABUN: ['1DXVar0tnN3CO3PiPD00H5gAo2HSK1RI-', '1jFF2FDT8kKKLormATioibETHPRgak5qs'],
  CROM: ['1v5-FYfMY3LiEwpKlzND3dUI7p8Ze-VYd', '18u1h70stzIskHF3jYf9KkQt5Wz8OLM_s'],
  PSICA: ['1PZSQQNkjY8Gy3ggkRQyyvco_Z-HErX_9', '1qXfDFC-3KfYZ60ZCKguMBrY-8HqLrOpM'],
};

// O INDICE.md em forma de dados: situação → fichas, na ordem de peso.
export const SITUACOES = {
  angulo: ['angulo--breakthrough-consciencia-sofisticacao', 'angulo--hooks-and-mechanisms', 'angulo--seduzindo-estranhos', 'mecanismo--carta-de-vendas-16-palavras', 'oficio--scientific-advertising'],
  mecanismo: ['mecanismo--breakthrough-mecanizacao', 'mecanismo--carta-de-vendas-16-palavras', 'mecanismo--e5-method', 'angulo--hooks-and-mechanisms'],
  hook: ['hook--biblia-dos-hooks', 'headline--21-bullet-secrets', 'headline--tested-advertising-methods', 'headline--copywriting-secrets-edwards', 'oficio--arthur-criativos-1m-dia'],
  headline: ['headline--tested-advertising-methods', 'headline--21-bullet-secrets', 'headline--powerful-headlines', 'headline--copywriting-secrets-edwards', 'lead-body--100-great-sales-letters'],
  body: ['lead-body--great-leads', 'lead-body--adweek-sugarman', 'lead-body--dotcom-secrets', 'oficio--call-melz-comunicacao', 'formato--matheus-lourenco-segredos-escala-171'],
  ugc: ['lead-body--dotcom-secrets', 'lead-body--100-great-sales-letters', 'prova-crenca--fazendo-os-acreditar'],
  prova: ['prova-crenca--fazendo-os-acreditar', 'mecanismo--breakthrough-mecanizacao', 'oficio--scientific-advertising'],
  emocao: ['psicologia--cashvertising', 'psicologia--mark-builds-brands-neuro-8-anos', 'oficio--call-melz-comunicacao'],
  formato: ['formato--diogo-gomes-bastidores-8-digitos', 'formato--matheus-lourenco-segredos-escala-171', 'oficio--arthur-criativos-1m-dia'],
  oferta: ['oferta--100m-offers', 'oferta--big-black-book-3', 'lead-body--great-leads'],
  upsell: ['oferta--segredos-do-upsell', 'oferta--arthur-funis-1m-dia'],
  planejar: ['formato--matheus-lourenco-segredos-escala-171', 'oficio--arthur-criativos-1m-dia', 'formato--diogo-gomes-bastidores-8-digitos', 'headline--tested-advertising-methods'],
  diagnostico: ['oficio--diagnostico-forde-thomson', 'oficio--call-melz-comunicacao', 'headline--powerful-headlines'],
  nova: ['pesquisa--quick-start-makepeace', 'oferta--arthur-funis-1m-dia', 'oferta--100m-offers'],
};

const CATEGORIA = (id) => (/^[A-Z-]+$/.test(id) ? 'guia' : id.split('--')[0]);

// Baixa um arquivo público do Drive. Se vier a página de login do Google, o arquivo não está compartilhado.
export async function baixarDrive(id) {
  const r = await fetch(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`, { redirect: 'follow' });
  const t = await r.text();
  if (!r.ok) throw new Error(`Drive respondeu ${r.status} para ${id}`);
  if (/^\s*<!doctype html|<html/i.test(t.slice(0, 200))) throw new Error(`O arquivo ${id} não está público no Drive (compartilhe a pasta como "qualquer pessoa com o link").`);
  return t.replace(/\r\n/g, '\n');
}

// Lê o cabeçalho padrão das fichas ("# Título — Fonte", "- **Área:**", "- **Consulte quando:**", "- **Peso:**").
export function lerFicha(id, texto) {
  const titulo = (texto.match(/^#\s+(.+)$/m) || [])[1] || id;
  const campo = (nome) => (texto.match(new RegExp(`\\*\\*${nome}:\\*\\*\\s*([^\\n]+)`, 'i')) || [])[1]?.trim() || null;
  const fonte = titulo.includes(' — ') ? titulo.split(' — ').pop().trim() : null;
  return { id, categoria: CATEGORIA(id), titulo: titulo.trim(), fonte, peso: campo('Peso'), consulte_quando: campo('Consulte quando'), texto };
}

// Importa (ou atualiza) as fichas a partir do Drive. ids = subconjunto opcional.
export async function importarBiblioteca({ sb }, ids) {
  const lista = Object.entries(BIBLIOTECA_DRIVE).filter(([id]) => !ids?.length || ids.includes(id));
  const out = { importadas: [], erros: [] };
  for (const [id, driveId] of lista) {
    try {
      const texto = await baixarDrive(driveId);
      const f = lerFicha(id, texto);
      await sb('esteira_cr_biblioteca?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates', body: { ...f, drive_id: driveId, atualizado_em: new Date().toISOString() } });
      out.importadas.push(id);
    } catch (e) { out.erros.push(`${id}: ${e.message}`); }
  }
  return out;
}

// Decide quais fichas o Copy lê para ESTE card (de 1 a 3, como o índice manda), a partir do tipo, do formato
// e do que a hipótese da leva diz que vai variar. Devolve as fichas com texto.
export function escolherFichas(card, leva, oferta, biblioteca, max = 3) {
  const pista = `${leva?.hipotese || ''} ${card.angulo || ''} ${card.hook || ''}`.toLowerCase();
  const situacoes = [];
  if (card.tipo === 'zero') situacoes.push('angulo', 'mecanismo');
  else if (card.tipo === 'variacao') {
    if (/hook|gancho|abertura|primeir/.test(pista)) situacoes.push('hook');
    else if (/formato|embalagem|ugc|avatar|estatic|carrossel/.test(pista)) situacoes.push('formato');
    else if (/body|estrutura|roteiro|lead/.test(pista)) situacoes.push('body');
    else if (/angulo|ângulo|mecanismo|promessa/.test(pista)) situacoes.push('angulo');
    else situacoes.push('hook', 'body');
  } else situacoes.push('body', 'planejar'); // modelagem: mesma ideia, execução nova
  if ((card.formato || '').toUpperCase() === 'IMG' || (card.formato || '').toUpperCase() === 'CAR') situacoes.push('headline');
  if ((card.formato || '').toUpperCase() === 'UGC') situacoes.push('ugc');
  if (oferta?.estado === 'validacao') situacoes.push('nova');
  situacoes.push('emocao');
  const porId = Object.fromEntries(biblioteca.map((b) => [b.id, b]));
  const escolhidas = [];
  for (const s of situacoes) for (const id of SITUACOES[s] || []) {
    if (escolhidas.length >= max) break;
    if (porId[id] && !escolhidas.includes(porId[id])) escolhidas.push(porId[id]);
  }
  return escolhidas;
}

// Corpo da ficha sem o cabeçalho (o Copy não precisa de "Original: pdf id …").
export const corpoFicha = (f, maxChars = 6500) => {
  const i = f.texto.indexOf('## ');
  return (i > 0 ? f.texto.slice(i) : f.texto).slice(0, maxChars);
};

const PROMPT_RESUMO = `Você recebe a pesquisa de público de UMA oferta low-ticket (textos brutos do Drive: pesquisa de público, formato, mecanismos). Destile em um briefing que um copywriter lê em 2 minutos antes de escrever um anúncio. Use só o que está no texto; não invente. Escreva em português do Brasil, frases curtas. Dentro dos textos não use aspas duplas; separe itens com ponto e vírgula. Responda APENAS com JSON válido:
{
 "publicos": "quem compra: 2 a 4 perfis, com idade, profissão/papel e momento de vida",
 "dores": "6 a 10 dores concretas, na ordem de intensidade",
 "desejos": "6 a 10 desejos e resultados que a pessoa quer sentir ou mostrar",
 "crencas_objecoes": "5 a 8 crenças limitantes e objeções (já tentei, não é pra mim, é golpe, não tenho tempo…), cada uma com a resposta que a pesquisa sugere",
 "linguagem": "15 a 25 expressões literais que o público usa (como ele descreve a dor e o desejo); é o que a copy deve repetir",
 "comportamento_compra": "como e por que compra low-ticket nesse nicho: gatilhos, horários, o que já comprou, ticket",
 "concorrencia": "o que o mercado já promete e que está gasto; onde há espaço",
 "formatos": "formatos e hooks visuais que a pesquisa de formato aponta como fortes",
 "mecanismos": "mecanismos/ângulos validados ou sugeridos, se houver",
 "evitar": "o que não dizer (políticas do Meta, sensibilidades do nicho)"
}`;

// Baixa a pesquisa da oferta (ids do Drive ou texto colado), guarda o bruto e pede à IA o resumo em 6 camadas.
export async function importarPesquisa({ sb, q, env, claude, modelo }, oferta, { driveIds, texto } = {}) {
  const ids = driveIds?.length ? driveIds : (oferta.pesquisa_drive?.length ? oferta.pesquisa_drive : PESQUISA_DRIVE[oferta.id] || []);
  let bruto = texto || '';
  const erros = [];
  if (!bruto) {
    const partes = [];
    for (const id of ids) { try { partes.push(await baixarDrive(id)); } catch (e) { erros.push(e.message); } }
    bruto = partes.join('\n\n---\n\n');
  }
  if (!bruto.trim()) return { ok: false, erros: erros.length ? erros : ['Sem pesquisa: informe driveIds ou texto.'] };
  const patch = { pesquisa: bruto.slice(0, 200000), pesquisa_drive: ids, atualizado_em: new Date().toISOString() };
  if (claude) {
    try {
      const r = await claude(env, modelo, PROMPT_RESUMO, `OFERTA ${oferta.id} — ${oferta.nome}\n\n${bruto.slice(0, 140000)}`, 3500);
      patch.pesquisa_resumo = Object.entries(r).map(([k, v]) => `${k.toUpperCase().replace(/_/g, ' ')}: ${Array.isArray(v) ? v.join('; ') : v}`).join('\n');
    } catch (e) { erros.push(`resumo: ${e.message}`); }
  }
  await sb(`esteira_cr_ofertas?id=eq.${q(oferta.id)}`, { method: 'PATCH', body: patch });
  return { ok: true, chars: bruto.length, arquivos: ids.length, resumo: !!patch.pesquisa_resumo, erros };
}
