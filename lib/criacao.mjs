// Diretor de Criação do Setor de Criativos.
// Pega um card APROVADO (copy pronta) e entrega ao Editor (skill editar-criativo + motor editor.py) o projeto de edição:
// demanda, roteiro por frase no vocabulário do motor, conceitos de hook, takes a gerar (com prompts) e takes do banco
// a reaproveitar. A geração do avatar (HeyGen), a animação (Grok) e o render continuam com o Editor; a imagem dos takes
// novos pode ser gerada aqui pelo Magnific (API da Freepik) quando MAGNIFIC_API_KEY existir.
import { claude, sbAll, agora, ofertaApp } from './criativos.mjs';

// Vocabulário do motor (_SISTEMA/engine): tipos de segmento do body.json e formatos de hook.
const SEGMENTOS = 'A (avatar HeyGen falando) · vid (take de vídeo nosso) · kit (página real do PDF: "page") · kit2/flip/collage2 (páginas em sequência/folheando/colagem) · split (tela dividida, 2 takes) · caderno (escrita à mão composta pelo motor) · chat/chat2 (conversa WhatsApp) · story/story2 (UGC com celular) · counter (contador) · checklist · collage · email · calendario · cctv (câmera de segurança) · dissolver (pessoa some) · react (vídeo de fundo + avatar em moldura) · carta_vibra (carta protagonista animada) · leque/viram/fio/mesa (cartas reais) · draw (desenho se fazendo) · imgpan (imagem com pan)';
const FORMATOS_HOOK = 'UGC · Avatar · Tela dividida · Animado · Chat · Caderno · Imagem animada · Vídeo realista · Câmera de segurança · Tablet · React · Estático · Podcast · Listicle · Páginas do kit';

const SYSTEM_CRIACAO = `Você é o Diretor de Criação do Setor de Criativos de uma operação de infoprodutos low-ticket (R$ 27–57: baralhos, kits e PDFs para terapeutas e praticantes holísticas no Brasil). Recebe UM criativo já aprovado (copy pronta, hook falado, ângulo, formato) e devolve o PROJETO DE EDIÇÃO que o Editor (Claude com a skill editar-criativo + motor editor.py) executa sem perguntar nada.

O que o Editor faz com o seu projeto: gera o avatar no HeyGen com o áudio da copy; cria os takes NOVOS em duas etapas (imagem no ChatGPT/Magnific → animação no Grok 6 s 9:16); monta planos/body.json e planos/hooks/*.json a partir do seu roteiro (o motor mede os segundos de cada frase; você NÃO escreve segundos); renderiza hook e body separados, cortados no fim da frase do hook.

Regras fixas da operação (não quebrar):
- Takes sempre nossos; nunca take do AD original. Produto = páginas REAIS dos PDFs (segmento kit), não mockup de site.
- NUNCA figura religiosa explícita (santos, Jesus, altares com imagens). Nenhuma pessoa real, @, print real; sem interface de TikTok.
- Ritmo: troca de take a cada 1,2–2,5 s; avatar intercalado (nunca mais de 2 frases seguidas de avatar); zoom leve (z ≤ 1,5) nas frases de benefício; CTA no fim com título "SAIBA MAIS". Poucos takes estáticos.
- Hook forte: primeiro quadro que prende + uma virada no meio do hook. Cada hook é de uma FAMÍLIA visual diferente (não variações do mesmo).
- Variação de hook nunca mexe no body. Variável única por leva: só muda o que o card diz que está testando.
- Legenda cinética embaixo; headline na tela maior que a legenda, com emoji ligado ao sentido quando couber.
- Prompts de imagem em português, para o ChatGPT, pedindo UMA imagem, com o produto real anexado quando o take mostra o produto. Prompt de animação em inglês, curto, terminando com: keep the scene exactly as in the image, no new objects, no added text.
- Reaproveite takes do BANCO quando a cena serve (mesma oferta): cite o id. Takes rejeitados e conceitos rejeitados não voltam.
- UGC "feito por cliente": defeitos de propósito (foco, flash, torto, grão). Se parece anúncio, falhou.

Vocabulário de segmentos do motor: ${SEGMENTOS}.
Formatos de hook: ${FORMATOS_HOOK}.

Dentro dos textos não use aspas duplas; separe linhas com \\n. Responda APENAS com JSON válido:
{
 "demanda": "texto 'Para o editor — leia primeiro': tipo (AD novo | hooks novos | ajuste de body), variável testada, o que manter, o que evitar, nomes exatos dos arquivos, onde entregar; 6 a 12 linhas",
 "corte_hook_body": "a última frase do hook (literal, igual à copy): o corte é no fim dela",
 "roteiro": [ {"n": 1, "frase": "frase literal da copy", "seg": "A|vid|kit|split|caderno|chat|story|counter|checklist|collage|email|calendario|cctv|dissolver|react|carta_vibra|leque|draw|imgpan", "take": "id do banco ou NOVO-01 (vid/split) ou null", "page": "página do kit se seg=kit (ex.: m-1, g-07, capa, ou descreva: página do manual que fala de X) ou null", "z": 1.0, "titulo": "texto na tela ou null", "nota": "direção curta para o editor ou null"} ],
 "hooks": [ {"id": "H1-nome-curto", "formato": "um dos formatos", "conceito": "1 a 2 frases: o que aparece do primeiro quadro até a virada", "takes": ["ids do banco ou NOVO-xx"], "titulo": "headline na tela ou null"} ],
 "takes_novos": [ {"id": "NOVO-01", "arquivo": "nome_sugerido.mp4", "tipo": "video|imagem", "descricao": "o que mostra, 1 frase", "bom_para": "para que serve", "prompt_imagem": "prompt completo em português para o ChatGPT (cena, enquadramento 9:16, luz, idade/aparência genérica, produto real se houver, 'Gere só UMA imagem')", "prompt_animacao": "prompt em inglês para o Grok (movimento + keep the scene exactly as in the image, no new objects, no added text)", "usa_produto_real": false} ],
 "takes_reaproveitados": ["ids do banco"],
 "imagem": {"prompt_arte": "se formato IMG: prompt da arte 4:5 com espaço em branco para a headline", "headline": "texto exato a compor por cima (PIL)", "estilo": "UGC mal tirada | arte limpa | print"} ,
 "porque": "2 frases: por que este projeto serve ao ângulo e à variável testada"
}`;

export async function contextoCriacao(ctx, c, o) {
  const { sb, q } = ctx;
  const [takes, irmaos, apr] = await Promise.all([
    sbAll(sb, `esteira_cr_takes?oferta_id=eq.${q(o.id)}&select=id,arquivo,tipo,ferramenta,descricao,bom_para,usado_em,rejeitado,motivo&order=criado_em.asc`),
    sb(`esteira_cr_criativos?oferta_id=eq.${q(o.id)}&projeto=not.is.null&select=id,projeto,entrega&order=projeto_em.desc&limit=6`),
    sb(`esteira_cr_aprendizados?oferta_id=eq.${q(o.id)}&tipo=in.(veredito,nota)&select=texto,autor&order=criado_em.desc&limit=8`),
  ]);
  const vivos = takes.filter((t) => !t.rejeitado);
  const rejeitados = [
    ...takes.filter((t) => t.rejeitado).map((t) => `${t.id}: ${t.motivo || 'rejeitado'}`),
    ...irmaos.flatMap((i) => (i.entrega?.rejeitados || []).map((r) => `${r.id || r.conceito || r}: ${r.motivo || ''}`)),
  ];
  const hooksUsados = irmaos.flatMap((i) => (i.projeto?.hooks || []).map((h) => `${h.formato}: ${h.conceito}`)).slice(0, 12);
  return [
    `OFERTA ${o.id} — ${o.nome}${o.familia ? ' (' + o.familia + ')' : ''}${o.pvUrl ? ' · PV: ' + o.pvUrl : ''}${o.notas ? '\nNOTAS DO GESTOR: ' + o.notas : ''}`,
    o.pesquisaResumo ? `PESQUISA (resumo):\n${o.pesquisaResumo.slice(0, 3500)}` : '',
    c.variavel === 'hook_visual' ? `MODO HOOK VISUAL: este card reaproveita áudio, avatar e body do pai ${c.pai_id} (projeto já existe na oficina). Entregue SÓ o hook: roteiro = apenas as frases do hook (até o corte), hooks = 1 conceito (o que está em BODY do card), takes só do hook. demanda deve dizer: hooks novos numa leva existente, body = o do pai.` : '',
    `CARD: ${c.id} · tipo ${c.tipo} · variável ${c.variavel || '-'} · hipótese: ${c.hipotese || '-'} · formato ${c.formato || 'VID'}${c.pai_id ? ' · pai ' + c.pai_id : ''}\nÂNGULO: ${c.angulo || '-'}\nMECANISMO: ${c.mecanismo || '-'}\nHOOK FALADO: ${c.hook || '-'}\nBODY (estrutura): ${c.body || '-'}\nBASE NA PESQUISA: ${c.base_pesquisa || '-'}\n\nCOPY E ROTEIRO DO COPYWRITER:\n${c.copy || '(sem copy)'}`,
    `BANCO DE TAKES DA OFERTA (reaproveite quando a cena servir):\n${vivos.map((t) => `${t.id} [${t.tipo}|${t.ferramenta || '?'}] ${t.descricao || ''}${t.bom_para ? ' · bom para: ' + t.bom_para : ''}${(t.usado_em || []).length ? ' · usado em ' + t.usado_em.slice(0, 3).join(', ') : ''}`).join('\n') || 'vazio'}`,
    rejeitados.length ? `REJEITADOS (não repetir):\n${rejeitados.slice(0, 20).join('\n')}` : '',
    hooksUsados.length ? `HOOKS JÁ FEITOS NESTA OFERTA (não repetir a família visual):\n${hooksUsados.join('\n')}` : '',
    apr.length ? `APRENDIZADOS RECENTES:\n${apr.map((a) => `[${a.autor}] ${a.texto.slice(0, 300)}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

// Roda para os cards dados (ou para todos os aprovados sem projeto, até max).
export async function rodarCriacao(ctx, { ids, max = 5 } = {}) {
  const { sb, q, env, getConfig } = ctx;
  if (!env('ANTHROPIC_API_KEY')) return { ok: false, motivo: 'sem ANTHROPIC_API_KEY' };
  const cfg = await getConfig();
  const modelo = cfg.modelo || 'claude-sonnet-5-5';
  // Trabalha só na frente do Editor: mantém até `criacaoAdiantada` projetos prontos (aprovados com projeto, ainda não em produção).
  // Cada projeto custa ~US$ 0,20; montar 150 de uma vez para um Editor que produz 10/dia é dinheiro parado.
  const adiantada = Number(cfg.criacaoAdiantada ?? 10);
  const prontos = (await sb('esteira_cr_criativos?status=eq.aprovado&projeto=not.is.null&select=id')).length;
  const vaga = ids?.length ? ids.length : Math.max(0, Math.min(max, adiantada - prontos));
  if (!vaga) return { projetos: 0, takesNovos: 0, erros: [], motivo: `já há ${prontos} projetos prontos esperando o Editor (limite ${adiantada})` };
  const cards = ids?.length
    ? await sb(`esteira_cr_criativos?id=in.(${ids.map(q).join(',')})&select=*`)
    : await sb(`esteira_cr_criativos?status=eq.aprovado&projeto=is.null&copy=not.is.null&select=*&order=status_em.asc&limit=${vaga}`);
  const ofertas = (await sb('esteira_cr_ofertas?select=*')).map((r) => ({ ...ofertaApp(r), notas: r.notas }));
  const out = { projetos: 0, takesNovos: 0, erros: [] };
  for (const c of cards) {
    const o = ofertas.find((x) => x.id === c.oferta_id);
    if (!o) continue;
    try {
      const contexto = await contextoCriacao(ctx, c, o);
      const p = await claude(env, modelo, SYSTEM_CRIACAO, contexto, c.variavel === 'hook_visual' ? 2500 : 6000);
      p.gerado_em = agora();
      p.modelo = modelo;
      await sb(`esteira_cr_criativos?id=eq.${q(c.id)}`, { method: 'PATCH', body: { projeto: p, projeto_em: agora(), atualizado_em: agora() } });
      // Takes novos entram no banco como "a gerar" (sem arquivo), já ligados ao card.
      const novos = Array.isArray(p.takes_novos) ? p.takes_novos : [];
      for (const t of novos) {
        const arquivo = String(t.arquivo || `${c.id}_${t.id}`).replace(/[^\w.\-]/g, '_').slice(0, 120);
        await sb('esteira_cr_takes?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates', body: { id: `${o.id}/${arquivo}`, oferta_id: o.id, arquivo, tipo: t.tipo === 'imagem' ? 'imagem' : 'video', ferramenta: 'a gerar', descricao: String(t.descricao || '').slice(0, 400), bom_para: String(t.bom_para || '').slice(0, 200), prompt: String(t.prompt_imagem || '').slice(0, 3000), prompt_animacao: String(t.prompt_animacao || '').slice(0, 1000), usado_em: [c.id], atualizado_em: agora() } });
        out.takesNovos++;
      }
      for (const id of Array.isArray(p.takes_reaproveitados) ? p.takes_reaproveitados : []) {
        const [t] = await sb(`esteira_cr_takes?id=eq.${q(id)}&select=usado_em`);
        if (t) await sb(`esteira_cr_takes?id=eq.${q(id)}`, { method: 'PATCH', body: { usado_em: [...new Set([...(t.usado_em || []), c.id])], atualizado_em: agora() } });
      }
      await sb('esteira_cr_aprendizados', { method: 'POST', body: { oferta_id: o.id, leva_id: c.leva_id, criativo_id: c.id, tipo: 'nota', texto: `Criação: projeto pronto — ${(p.hooks || []).length} hooks, ${novos.length} takes novos, ${(p.takes_reaproveitados || []).length} reaproveitados. ${p.porque || ''}`.slice(0, 900), autor: 'criacao' } });
      out.projetos++;
    } catch (e) { out.erros.push(`${c.id}: ${e.message}`); }
  }
  if (cards.length) await sb('esteira_cr_log', { method: 'POST', body: { tipo: 'criacao', resumo: `${out.projetos} projetos de edição (${out.takesNovos} takes novos)${out.erros.length ? ', erros: ' + out.erros.length : ''}`, detalhe: out } });
  return out;
}

// ---------------------------------------------------------------- Magnific (API da Freepik): imagem do take
const FREEPIK = 'https://api.freepik.com/v1/ai/mystic';
export const magnificConfigurado = (env) => !!env('MAGNIFIC_API_KEY');

export async function gerarTake(ctx, take) {
  const { sb, q, env } = ctx;
  if (!magnificConfigurado(env)) throw new Error('Falta MAGNIFIC_API_KEY na Netlify.');
  if (!take.prompt) throw new Error('Take sem prompt de imagem.');
  const r = await fetch(FREEPIK, { method: 'POST', headers: { 'content-type': 'application/json', 'x-freepik-api-key': env('MAGNIFIC_API_KEY') }, body: JSON.stringify({ prompt: take.prompt, aspect_ratio: take.tipo === 'imagem' && /4:5|feed/i.test(take.bom_para || '') ? 'social_post_4_5' : 'social_story_9_16', resolution: '2k', model: 'realism', creative_detailing: 33 }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Magnific ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  const tarefa = { id: j.data?.task_id, status: j.data?.status || 'CREATED', em: agora() };
  await sb(`esteira_cr_takes?id=eq.${q(take.id)}`, { method: 'PATCH', body: { tarefa, ferramenta: 'Magnific', atualizado_em: agora() } });
  return tarefa;
}

export async function conferirTake(ctx, take) {
  const { sb, q, env } = ctx;
  if (!take.tarefa?.id) return { status: take.arquivo_url ? 'COMPLETED' : 'sem tarefa' };
  const r = await fetch(`${FREEPIK}/${take.tarefa.id}`, { headers: { 'x-freepik-api-key': env('MAGNIFIC_API_KEY') } });
  const j = await r.json().catch(() => ({}));
  const status = j.data?.status || 'desconhecido';
  const url = j.data?.generated?.[0] || null;
  const patch = { tarefa: { ...take.tarefa, status, conferido: agora() }, atualizado_em: agora() };
  if (status === 'COMPLETED' && url) patch.arquivo_url = url;
  await sb(`esteira_cr_takes?id=eq.${q(take.id)}`, { method: 'PATCH', body: patch });
  return { status, url };
}

// Linhas do _TAKES.md (tabela markdown) → registros do banco.
export function lerTakesMd(ofertaId, texto) {
  const linhas = texto.split('\n').filter((l) => l.trim().startsWith('|'));
  if (!linhas.length) return [];
  const cab = linhas[0].split('|').map((s) => s.trim().toLowerCase());
  const col = (nomes) => cab.findIndex((h) => nomes.some((n) => h.includes(n)));
  const iArq = col(['arquivo']), iDesc = col(['o que', 'mostra']), iBom = col(['bom para', 'uso']), iUsado = col(['usado', 'onde']), iFerr = col(['ferramenta']);
  const out = [];
  for (const l of linhas.slice(2)) {
    const c = l.split('|').map((s) => s.trim());
    const arquivo = (c[iArq] || '').replace(/\\_/g, '_').replace(/`/g, '');
    if (!arquivo) continue;
    const desc = (c[iDesc] || '').replace(/\\_/g, '_');
    const rejeitado = /rejeitad|removid|não usado|nao usado/i.test(`${arquivo} ${desc} ${c[iBom] || ''}`);
    out.push({
      id: `${ofertaId}/${arquivo.replace(/\s+/g, '_').slice(0, 140)}`, oferta_id: ofertaId, arquivo: arquivo.slice(0, 200),
      tipo: /\.png|\.jpg|imagem|\(imagem\)/i.test(`${arquivo} ${c[iFerr] || ''}`) && !/\.mp4/i.test(arquivo) ? 'imagem' : /pdf|página|pagina|cartas/i.test(`${arquivo} ${c[iFerr] || ''}`) ? 'pagina' : 'video',
      ferramenta: (c[iFerr] || (/grok/i.test(arquivo) ? 'Grok' : /gpt|chatgpt/i.test(`${arquivo} ${desc}`) ? 'ChatGPT' : null)) || null,
      descricao: desc.slice(0, 400), bom_para: (c[iBom] || '').slice(0, 200), usado_em: (c[iUsado] || '').split(/[,·;]/).map((s) => s.trim()).filter((s) => s && s !== '—'),
      rejeitado, motivo: rejeitado ? desc.slice(0, 200) : null, atualizado_em: agora(),
    });
  }
  return out;
}
