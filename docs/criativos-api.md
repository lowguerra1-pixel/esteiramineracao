# API do App Criativos — contrato

Base: `https://esteiramineracao.netlify.app/api/cr`. Tudo em JSON. Erros vêm como `{ "erro": "mensagem" }`.

## Autenticação

1. `GET /api/usuarios` → lista de usuários.
2. `POST /api/login` `{ "id": "kaian", "pin": "0000" }` → `{ "token": "…", "usuario": {…} }`. Token vale 30 dias.
3. Toda chamada seguinte: header `Authorization: Bearer <token>`. Rotas marcadas **(gestor)** exigem o usuário admin (Kaian).

## Modelo

**Oferta** `{ id, nome, familia, estado, mix, prefixos[], produtos[], pastaDrive, pvUrl, notas, tetoIc, pesquisaDrive[], temPesquisa, pesquisaResumo }`
- `id` = sigla, é o prefixo dos anúncios (`CFAM`, `RADICIG`, `KSN`).
- `estado`: `validacao | escalando | em_risco | pausada | encerrada`.
- `mix`: `{ modelagem, variacao, zero }` em %. `prefixos`: outros prefixos de anúncio que pertencem à oferta. `produtos`: trechos do nome do produto na Lastlink.

**Leva** `{ id, ofertaId, numero, planejada, noAr, hipotese, status, codigo }` — `id` = `CFAM-L8`; `codigo` = id da leva no Controle de Levas (`CFAM-VID-20261118`), opcional; `status`: `planejada | producao | no_ar | encerrada`.

**Criativo (card)** `{ id, ofertaId, levaId, tipo, paiId, formato, angulo, mecanismo, hook, body, copy, arquivoUrl, status, statusEm, noArEm, score, aprendizado, basePesquisa, fichas[], marcacoes, historico[], criadoPor, total, d7, d30 }`
- `basePesquisa`: "Base na pesquisa" escrita pelo Copy (público, dor/desejo, objeção, expressões do público usadas). `fichas[]`: ids das fichas do repertório que o Copy leu.
- `marcacoes`: marcações visuais do Editor, livres, no padrão do Controle de Levas: `{ formato_hook, primeiro_frame, legenda, duracao_s, cortes_por_10s, produto_aparece_em_s, avatar }`. Grave via `PATCH /criativos/:id {marcacoes}`.
- `id` **= nome do anúncio no Meta**. Cards da fila nascem com ID provisório (`CFAM-L8-M01`); renomeie para o nome final antes de subir, ou use o provisório como nome do anúncio.
- `tipo`: `modelagem | variacao | zero`. `formato`: `IMG | VID | UGC | CAR`.
- `status` (colunas do kanban, nesta ordem): `fila → briefing → producao → revisao → aprovado → no_ar → meio → vencedor | fadiga | morto`. `meio` = veredito pediu 1 variação.
- `historico[]`: `{ em, de, para, por, nota }`.
- `total`, `d7`, `d30`: `{ gasto, vendas, receita, reembolsos, roas, cpa, impressoes, cliques, lpv, ic, ctr, hookRate, holdRate, conversao, primeiroDia, ultimoDia }` (R$; percentuais em %).

**Aprendizado** `{ id, ofertaId, levaId, criativoId, tipo, texto, autor, criado_em }` — `tipo`: `veredito | dissecacao | hipotese | nota`; `autor`: `veredito` (motor), `analista` (IA), `dissecacao` (IA, `texto` é o JSON da ficha), `sistema`, ou id de usuário.

## Rotas

| Método | Rota | O que faz |
| --- | --- | --- |
| GET | `/bootstrap` | Tudo de uma vez: `{ ofertas, levas, criativos (com total/d7/d30), regras, contas, ultimoSync, ultimoVeredito, painel, webhook, meta, status[] }` |
| POST | `/ofertas` | Cria `{ id, nome, familia?, estado?, mix?, prefixos?, produtos?, pastaDrive?, pvUrl?, notas? }` |
| PATCH | `/ofertas/:id` | Altera qualquer campo acima |
| POST | `/levas` | `{ ofertaId, numero?, planejada?, hipotese? }` → numera sozinha |
| PATCH | `/levas/:id` | `{ status?, planejada?, noAr?, hipotese? }` |
| POST | `/criativos` | `{ id, ofertaId, levaId?, tipo?, formato?, paiId?, angulo?, mecanismo?, hook?, body?, copy?, arquivoUrl?, status? }` |
| PATCH | `/criativos/:id` | Qualquer campo da ficha + `score`, `aprendizado`; `novoId` renomeia (move vendas/métricas/anúncios junto) |
| POST | `/criativos/:id/status` | `{ para, nota? }` — grava no histórico. `aprovado` só gestor. `no_ar` marca a leva como no ar |
| GET | `/criativos/:id/serie` | Série diária `[{ dia, gasto, impressoes, cliques, lpv, ic, video_3s, video_75, vendas, receita }]` |
| POST | `/criativos/:id/dissecar` | Disseca a `copy` da ficha com a IA e grava aprendizado `dissecacao` |
| GET | `/aprendizados?oferta=CFAM` ou `?criativo=ID` | Últimos 300 |
| POST | `/aprendizados` | `{ ofertaId?, levaId?, criativoId?, tipo, texto }` |
| GET | `/ads/sem-par` | Anúncios da Meta sem criativo (nome não bate com nenhuma oferta) |
| POST | `/ads/:adId/ligar` | `{ criativoId }` |
| POST | `/config` (gestor) | `{ contas?: [ids], regras?: {…} }` |
| GET | `/meta/contas` | Contas de anúncio que o token enxerga, com `ativa` |
| POST | `/meta/conectar` (gestor) | `{ token }` de usuário (Graph Explorer) → troca por 60 dias, renova sozinho |
| POST | `/sync` (gestor) | `{ dias }` ou `{ desde, ate }`; > 7 dias roda em segundo plano |
| POST | `/veredito` (gestor) | Aplica as regras agora |
| POST | `/analista` (gestor) | Roda o Analista agora (segundo plano) |
| POST | `/religar` (gestor) | Religa vendas/anúncios sem par |
| POST | `/normalizar` (gestor) | Normaliza IDs antigos e funde duplicatas |
| POST | `/importar` (gestor) | `{ ofertas?, criativos?, vendas?, metricas? }` (lotes de até 1500) |
| GET | `/log` | Últimos 100 eventos (webhook, sync, veredito, analista, importacao) |
| POST | `/lastlink/<token>` | **Webhook da Lastlink** (sem login, opcional: tempo real nos produtos onde estiver configurado). URL completa em `/bootstrap.webhook` |
| POST | `/lastlink/sync {desde?, ate?}` (gestor) | **Vendas pela API da Lastlink** (`sales.list` do MCP): front, bumps, upsells, reembolsos e chargebacks, ligados ao criativo pelo `ad_id` do `utm_content`. Até 20 dias responde na hora; mais que isso vai para segundo plano (202). Precisa de `LASTLINK_CLIENT_ID/SECRET` na Netlify; `bootstrap.lastlinkConfigurada` diz se está. |

## Regras do veredito (editáveis em `/config.regras`)

`{ horasVeredito: 72, gastoMin: 150, vendasMin: 5, roasSegue: 1.3, roasMorre: 1.0, vencedorVendas: 20, fadigaQueda: 0.3, filhos: 3, diasRisco: 14 }`

- `no_ar` há ≥ 72h com ≥ R$150 ou ≥ 5 vendas: ROAS ≥ 1,3 segue · < 1,0 → `morto` · entre → `meio`.
- 20+ vendas com ROAS ≥ 1,3 → `vencedor`; na primeira vez abre `filhos` cards `modelagem` na `fila` com `paiId`.
- `vencedor` com ROAS 7d < 70% do ROAS 30d → `fadiga`; volta a `vencedor` se recuperar.
- Oferta `escalando` sem vencedor novo há 14 dias → `em_risco`.

## Automático (sem ninguém clicar)

| Quando | O quê |
| --- | --- |
| Toda hora (:40) | Sync da Lastlink pela API: vendas dos últimos 2 dias (todos os produtos) → `vendas`, ligadas ao criativo pelo `ad_id` do `utm_content` |
| Toda venda (onde há webhook) | Webhook da Lastlink grava na hora; o sync horário confirma e completa (mesmo id, sem duplicar) |
| 06:10 (Brasília), diário | Sync Meta (3 dias) → veredito → **Analista**: por oferta viva grava `veredito` + 3 `hipotese`, cria a próxima leva (`planejada` = amanhã) com os cards na `fila` já com `tipo` e `paiId` sugeridos, e disseca vencedores novos que tenham `copy` |
| Mensal | Renovação do token da Meta |

## Fluxo esperado do dia a dia (quem faz o quê)

1. **Analista (automático, 06:10)** deixa a leva do dia em `fila` e as hipóteses em `/aprendizados`.
2. **Estrategista/Redator (seu chat com o James)**: lê `/aprendizados?oferta=X`, os vencedores em `/bootstrap`, a pasta da oferta; preenche cada card (`PATCH /criativos/:id` com `angulo, hook, body, copy, formato`) e move para `revisao` (`/status`).
3. **Revisor (mesmo chat ou humano)**: dá `score`; aprova (`aprovado`) ou devolve (`briefing` com `nota`).
4. **Produção**: produz, renomeia o card para o nome final (`novoId`), sobe no Meta com esse nome, marca `no_ar`.
5. **Motor (automático)**: 72h depois decide; vencedor abre filhos; Analista do dia seguinte já lê o resultado.

## Biblioteca de copy e pesquisa da oferta (o que o Copy lê antes de escrever)

Mesma regra dos chats de oferta do Controle de Levas: **primeiro a pesquisa da oferta, depois 1–3 fichas do repertório, só então a copy.**

**Ficha** `{ id, categoria, titulo, fonte, peso, consulte_quando, drive_id, texto, atualizado_em }` — `id` = nome do arquivo (`lead-body--great-leads`); `categoria` = prefixo (`angulo | formato | headline | hook | lead-body | mecanismo | oferta | oficio | pesquisa | prova-crenca | psicologia`; `guia` = INDICE, VOCABULARIO, LEIA-ME).

| Rota | O que faz |
| --- | --- |
| `GET /biblioteca` | lista as fichas (sem texto) + `situacoes` (o INDICE em dados: situação → fichas) |
| `GET /biblioteca/:id` | a ficha com texto |
| `POST /biblioteca/importar {ids?}` (gestor) | baixa do Drive (pasta `_SISTEMA\REPERTORIO`, pública) e grava; sem `ids` importa todas (chame em lotes de 5 — cada download leva uns 4 s) |
| `PUT /biblioteca/:id {titulo, categoria, fonte, peso, consulteQuando, texto}` (gestor) | ficha escrita à mão (para o Chat 2 fichar material novo) |
| `DELETE /biblioteca/:id` (gestor) | remove |
| `GET /ofertas/:id/pesquisa` | `{ resumo, bruto, driveIds, sugeridos }` |
| `POST /ofertas/:id/pesquisa {driveIds?, texto?}` (gestor) | importa a pesquisa (dos ids do Drive, dos já cadastrados, dos sugeridos para a sigla, ou de `texto` colado), guarda o bruto e pede à IA o **resumo em 6 camadas** (públicos, dores, desejos, crenças/objeções, linguagem literal, comportamento de compra, concorrência, formatos, mecanismos, evitar). Roda em segundo plano (202); resultado em `/log` e em `GET /ofertas/:id/pesquisa`, até 2 min. |

Como o Copy escolhe as fichas (1 a 3, pelo tipo do card e pela hipótese da leva): `zero` → ângulo + mecanismo; `variacao` → hook, formato, body ou ângulo conforme a hipótese fala em gancho/formato/estrutura/ângulo; `modelagem` → body + planejar; formato `IMG/CAR` soma headline; `UGC` soma a ficha de pessoa falando; oferta em `validacao` soma a ficha de oferta nova. A lista completa está em `situacoes` no `GET /biblioteca`.

Pré-requisito da importação da pesquisa pelo Drive: a pasta `KAIAN DIGITAL › Ofertas` compartilhada como "qualquer pessoa com o link" (leitor). Sem isso, use `texto`.

## Diretor de Copy + Revisor (automático)

- A cada hora (06h–22h), se houver cards em `fila`, o Diretor de Copy escreve até 8 por rodada: `angulo`, `mecanismo`, `hook`, `body`, `formato` e `copy` (texto do anúncio + HEADLINE + ROTEIRO/ARTE + POR QUE), modelando o `paiId` e lendo, nesta ordem: **pesquisa da oferta** (`pesquisaResumo`, ou o bruto, ou `notas`), **1–3 fichas do repertório** escolhidas pelo índice, vencedores, mortos recentes, hipóteses do Analista e dissecações. Método: skill James + biblioteca. Devolve também `basePesquisa` e as `fichas` lidas.
- O Revisor pontua (`score` 0–10) e devolve ajustes; nota < 6 gera uma reescrita. Critério 7: se há pesquisa, copy genérica ou com jargão (sem a linguagem literal do público) não passa de 5. O card vai para `revisao` com a nota no histórico e em `/aprendizados` (`autor: revisor`).
- Você aprova em `revisao → aprovado` (gestor) ou devolve para `briefing` com nota; cards em `briefing` não são reescritos pelo agente — é o seu espaço (ou do chat do James).
- `POST /copy` (gestor) roda agora. A pesquisa da oferta entra por `POST /ofertas/:id/pesquisa`; `notas` fica para observações do gestor (também vão no contexto).
