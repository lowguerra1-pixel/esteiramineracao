# Front do App Criativos — especificação de telas

Para quem constrói: o backend está pronto e documentado em `docs/criativos-api.md`. Este doc diz **o que** cada tela mostra, de onde vem cada número e como o usuário interage. Nada aqui exige mudança na API.

## 0. Princípios

- **Uma pergunta por tela.** Visão geral = "como está a operação?". Aprovar = "o que preciso decidir?". Board = "onde está cada criativo?". Ofertas = "como está cada oferta?". Criativos = "me deixa cavar um número".
- **Menu esquerdo fixo**, 5 itens + engrenagem no rodapé. Sem abas dentro das telas.
- **Tema escuro** (referência: CashFlow). Fundo `#0F1115`, cartão `#161A21`, borda `#242A33`, texto `#E6E9EE`, texto fraco `#8B95A3`, acento verde `#2EE59D` (positivo/lucro), vermelho `#FF5C5C` (negativo), amarelo `#FFD23F` (atenção), azul `#5B8CFF` (ação). Números grandes em fonte com `tabular-nums`, 36–44 px; rótulos em caixa alta 11 px com espaçamento.
- **Cada número diz de onde veio** (tooltip "ⓘ": "Meta Ads, últimos 7 dias" / "Lastlink, vendas aprovadas sem reembolso").
- Mobile: menu vira barra inferior; cartões empilham.
- Login: o mesmo dos outros apps (`/api/usuarios` + `/api/login`, token em `localStorage.esteira.token`). Entrar e sair iguais ao hub.

## 1. Carregamento de dados

Uma chamada ao abrir e a cada 60 s: `GET /api/cr/bootstrap`. Tudo abaixo deriva dela, salvo onde indicado. Campos usados:

- `painel`: `vencedoresSemana, metaVencedores, ofertasAcima5k, metaOfertas, shareMaior{oferta,pct}, receita7, porOferta[]{id,nome,estado,receita7,receitaSemanaAnterior,rodando,vencedores,emFila,diasSemVencedor,proximaLeva}`
- `criativos[]` com `status, tipo, ofertaId, levaId, paiId, formato, score, copy, hook, angulo, historico[], total{…}, d7{…}, d30{…}`
- `ofertas[]`, `levas[]`, `regras`, `ultimoSync`, `ultimoVeredito`, `meta`, `contas`, `webhook`
- Derivados no front (não existem prontos): **gasto 7d** = soma de `criativos[].d7.gasto`; **ROAS 7d** = `receita7 / gasto7`; **lucro 7d** = `receita7 × 0,91 − gasto7` (0,91 = líquido após taxa Lastlink; deixar o fator em uma constante); **mortos na semana** = criativos com `status = morto` e `statusEm` nos últimos 7 dias; **no ar** = status em `no_ar | meio | vencedor | fadiga` com `d7.gasto > 0`.

## 2. Menu esquerdo

| Item | Ícone | Badge | Rota |
| --- | --- | --- | --- |
| Visão geral | grade | — | `#/` |
| Aprovar | check | nº de cards em `revisao` (vermelho se > 0) | `#/aprovar` |
| Board | colunas | — | `#/board` |
| Ofertas | etiqueta | nº de ofertas `em_risco` (amarelo) | `#/ofertas` |
| Criativos | tabela | — | `#/criativos` |
| Biblioteca | livro | — | `#/biblioteca` |
| ⚙ Ajustes (rodapé) | engrenagem | ponto vermelho se `meta` for null ou `ultimoSync` > 36 h | `#/ajustes` |

Topo do conteúdo, em todas as telas: título da tela à esquerda; à direita, chip "Ao vivo · sync 06:10 · veredito 06:10" com as horas reais de `ultimoSync.em` / `ultimoVeredito.em`, e o nome do usuário com "Sair".

## 3. Visão geral (`#/`)

Filtro no topo: período (`Hoje | 7 dias | 30 dias` — padrão 7 dias; muda `d7`→`d30` nos cálculos; "Hoje" usa `/criativos/:id/serie` só se o usuário abrir um criativo, senão fica como 7 dias) e oferta (`Todas` | lista).

**Linha 1 — 4 cartões grandes** (altura igual, número em 40 px):

| Cartão | Número | Linha de baixo | Cor |
| --- | --- | --- | --- |
| Vencedores novos na semana | `painel.vencedoresSemana` | "meta ≥ 5" + barra de progresso | verde ≥ 5, amarelo 3–4, vermelho < 3 |
| Receita rastreada | `painel.receita7` em R$ | "Lastlink · vendas ligadas a criativo" | — |
| Gasto em ads | gasto7 em R$ | "Meta Ads · contas ativas" | — |
| ROAS | receita7 / gasto7, 2 casas | "lucro ≈ R$ lucro7" | verde ≥ 1,45, amarelo 1,30–1,44, vermelho < 1,30 |

**Linha 2 — 5 números pequenos em uma régua** (como "Nº de vendas / pendentes / reembolso…" do CashFlow): No ar · Em revisão (clicável → Aprovar) · Aprovados pra produzir · Mortos na semana · Share da maior oferta (`shareMaior.pct`% + nome; vermelho > 55%).

**Linha 3 — "Top 3 ofertas em destaque"**: as 3 maiores por `receita7`. Cada cartão: coroa/medalha, nome, estado (chip colorido: escalando verde, em_risco vermelho, validacao azul, pausada cinza), 4 mini-blocos (Receita 7d · Gasto 7d (soma de `d7.gasto` dos criativos da oferta) · ROAS · Vencedores vivos), seta ▲/▼ vs `receitaSemanaAnterior`, e dois botões: **Board** (abre `#/board?oferta=ID`) e **Leva** (abre a próxima leva em `#/ofertas/ID`). Link "Todas as ofertas" → `#/ofertas`.

**Linha 4 — duas colunas (2/3 + 1/3)**:
- **Evolução da operação**: gráfico de linhas por dia, 30 dias: receita (verde), gasto (cinza), lucro (verde claro, área). Dados: somar `/criativos/:id/serie` é caro; em vez disso usar `GET /api/cr/aprendizados`? Não — **pedir um endpoint novo é proibido neste doc**; usar os campos `d7`/`d30` para os totais e desenhar o gráfico só quando o usuário clicar em "ver evolução", carregando `/criativos/:id/serie` dos até 40 criativos com `d30.gasto > 0` da oferta filtrada e somando por dia no front (cache de 10 min).
- **Últimos vereditos**: lista dos 12 últimos itens de `GET /api/cr/aprendizados` (sem filtro) com `autor ∈ {veredito, analista}`: ícone por tipo, texto curto, oferta, hora. Clique no criativo abre a ficha (seção 8).

## 4. Aprovar (`#/aprovar`)

A tela de decisão. Lista à esquerda (30%) com os cards em `revisao`, ordenados por `score` desc, mostrando ID, oferta, tipo, formato e nota como badge (verde ≥ 8, amarelo 6–7, vermelho < 6). Ao clicar, o painel direito (70%) mostra:

- Cabeçalho: ID (editável inline → `PATCH /criativos/:id {novoId}`), chips de oferta/tipo/formato/leva, **criativo-pai** com seus números (`total.roas`, `total.vendas`) e link para abrir.
- **Nota do Revisor** em destaque (número grande + motivos + ajustes), tirada da última entrada de `historico` com `por = revisor`.
- **Base na pesquisa** (`basePesquisa`, caixa cinza, 2–4 linhas) e chips das fichas lidas (`fichas[]`, clicar abre `GET /biblioteca/:id` num modal de leitura).
- Blocos: Ângulo · Mecanismo · Hook (em fonte maior) · Body (estrutura) · Copy completa (texto do anúncio, HEADLINE, ROTEIRO/ARTE, POR QUE — é um único campo `copy`; mostrar como está, com quebras).
- Campo "Arquivo (Drive)" (`arquivoUrl`) e campo de nota.
- **Dois botões grandes fixos no rodapé**: `Aprovar` (verde, → `POST /criativos/:id/status {para:'aprovado'}`) e `Devolver` (vermelho, abre caixa de nota obrigatória → `{para:'briefing', nota}`). Atalhos: `A` aprova, `D` devolve, `↓/↑` navega. Depois da ação, avança para o próximo da lista.
- Estado vazio: "Nada pra aprovar. O Diretor de Copy roda a cada hora; a próxima leva nasce às 06:10."

Abaixo da lista, segunda seção dobrável **"Pede variação"**: cards em `meio` (o veredito pediu 1 variação). Botões: `Criar variação` (abre o formulário de novo card já com `tipo: variacao`, `paiId` = este, `levaId` = leva planejada aberta da oferta) e `Matar` (`{para:'morto'}`).

## 5. Board (`#/board`)

Filtros no topo: oferta (chip por oferta, multi), tipo, busca por ID. Toggle "ocultar mortos" ligado por padrão.

Colunas, com cor de fundo sutil e contador: **Fila · Briefing · Produção · Revisão · Aprovado · No ar · Variar · Vencedor · Fadiga · Morto**. Agrupar visualmente: as 5 primeiras sob o título "Produção", as 5 últimas sob "Resultado".

Card (compacto, 2 linhas): ID em negrito; chips tipo (modelagem cinza, variação azul, zero preto com texto branco) e formato; nas colunas de resultado: `ROAS 7d` colorido pelas regras (`regras.roasSegue`/`roasMorre`), `vendas` e `gasto 7d`; nas colunas de produção: pai ou primeiras palavras do hook; se `score`, badge. Arrastar entre colunas = `POST /criativos/:id/status` (confirmar com nota quando for para `morto` ou `briefing`); `aprovado` só se `usuario.papel = admin`. Clique abre a ficha (seção 8). Botão "+ Criativo" no topo (seção 9).

## 6. Ofertas (`#/ofertas` e `#/ofertas/:id`)

Lista: um cartão por oferta, ordenado por `receita7` desc, com: nome, sigla, chip de estado, mix (três barras finas modelagem/variação/zero), Receita 7d ▲/▼, Vencedores vivos, No ar, Na fila, "Último vencedor há N dias" (vermelho ≥ `regras.diasRisco`), Próxima leva (data + id) ou "não planejada". Botão "Abrir".

Detalhe (`#/ofertas/:id`), em duas colunas:
- Esquerda: formulário da oferta (`PATCH /ofertas/:id`): nome, família, estado (mudar estado ajusta o mix sozinho no backend), prefixos, produtos Lastlink, página de vendas, pasta no Drive, teto de custo por IC (`tetoIc`, USD), e **Notas do gestor** (`notas`, textarea).
- Bloco **Pesquisa da oferta** (`GET /ofertas/:id/pesquisa`): se `temPesquisa`, mostra o resumo em 6 camadas (`resumo`, pré-formatado, dobrável) com botão "Reimportar do Drive" (`POST /ofertas/:id/pesquisa {}`); se não, estado vazio "Sem pesquisa — o Copy escreve só pelos vencedores" com dois botões: "Importar do Drive" (usa `sugeridos`; se falhar com erro de arquivo não público, mostrar a mensagem do backend) e "Colar pesquisa" (textarea → `POST {texto}`). Mostrar spinner: leva ~20 s.
- Direita: **Levas** (tabela: id, status, planejada, no ar, hipótese, criativos, vencedores; botão "+ Leva" → `POST /levas`; clicar abre edição inline `PATCH /levas/:id`) e **Aprendizados** (`GET /aprendizados?oferta=ID`, mais recentes primeiro, filtro por tipo; caixa "Anotar" → `POST /aprendizados {ofertaId, tipo:'nota', texto}`).

## 7. Criativos (`#/criativos`)

A tabela atual, mantida: colunas ordenáveis (ID, oferta, status, tipo, formato, leva, gasto 7d, vendas 7d, ROAS 7d, gasto total, vendas, receita, ROAS, CPA, hook %, hold %, CTR, no ar desde), filtros de oferta/status/tipo/busca, "Baixar CSV". Linhas densas (32 px). Clique abre a ficha.

## 8. Ficha do criativo (painel lateral deslizante, 720 px, em qualquer tela)

- Cabeçalho: ID, status (chip), oferta, leva, tipo, formato, pai (link), "no ar há N dias".
- Duas réguas de 6 métricas: (gasto total · vendas · receita · ROAS total · ROAS 7d · CPA) e (hook % · hold % · CTR · conversão · IC · reembolsos).
- Sparkline diário (`GET /criativos/:id/serie`): barras de receita (verde) sobre gasto (cinza).
- Botões de transição permitidos a partir do status atual (mesma tabela `PROXIMO` do front atual), "Dissecar" (`POST /criativos/:id/dissecar`, só se houver copy).
- Formulário da ficha (`PATCH`): tipo, formato, leva, pai (autocomplete entre vencedores da oferta), ângulo, mecanismo, hook, body, arquivo, copy (textarea grande), aprendizado (1 linha), nota do revisor, base na pesquisa (`basePesquisa`).
- Seção dobrável **Marcações do Editor** (`marcacoes`, `PATCH`): formato do hook (select: UGC · Avatar · Tela dividida · Animado · Chat · Caderno · Imagem animada · Vídeo realista · Câmera de segurança · Tablet · React · Estático · Podcast · Listicle · Outro), primeiro frame (texto), legenda (sim/não), duração (s), cortes por 10 s, produto aparece em (s), avatar (texto). São os campos da aba VISUAL do Controle de Levas.
- Histórico (lista cronológica inversa) e aprendizados do criativo (`GET /aprendizados?criativo=ID`), incluindo a dissecação renderizada como ficha (JSON → blocos: hook literal, modelo de gancho, ângulos, avatar, consciência, emoções, esqueleto).

## 9. Novo criativo (modal)

Campos: oferta, leva (só da oferta, não encerradas), ID (ajuda: "nome que o anúncio terá no Meta; comece pela sigla da oferta"), tipo, formato, pai, ângulo, hook, copy, status inicial (`fila` padrão; `no_ar` para anúncio já rodando). `POST /criativos`.

## 10. Ajustes (`#/ajustes`, só admin)

Quatro cartões, como hoje, mas limpos: **Meta** (status da conexão, "Conectar/trocar token" com instrução, lista de contas com toggles → `POST /config {contas}`, botões "Sincronizar 3 dias" e "Puxar histórico até data"), **Lastlink** (status "API conectada" se `lastlinkConfigurada`, senão instrução das 2 variáveis na Netlify; botões "Sincronizar 2 dias" e "Puxar histórico até data" → `POST /vendas/sync`; URL do webhook como opção avançada dobrável; "Ver log" abre lista do `/log`), **Regras do veredito** (formulário → `POST /config {regras}`), **Agentes** (botões "Rodar Analista agora" `POST /analista`, "Rodar Copy agora" `POST /copy`, "Rodar veredito" `POST /veredito`, "Religar" `POST /religar`; mostra `cr_ultimo_*` quando vierem no bootstrap). Importação de CSV fica num link discreto "Importar semente".

## 10b. Biblioteca (`#/biblioteca`, item do menu abaixo de Ofertas)

Lista das fichas (`GET /biblioteca`) agrupada por categoria, com título, fonte e peso (chip "essencial"). Clicar abre leitura em modal (markdown renderizado de `GET /biblioteca/:id`). Painel lateral "Por situação" com as chaves de `situacoes` → fichas (é o INDICE). Gestor vê "Nova ficha" (formulário → `PUT /biblioteca/:id`) e "Reimportar do Drive" (chama `POST /biblioteca/importar` em lotes de 5 ids, com barra de progresso).

## 11. Estados vazios e erros

- Sem Meta conectada: faixa amarela no topo de todas as telas: "Meta não conectada — gasto e ROAS zerados. Conectar".
- Último sync > 36 h: faixa amarela "Última sincronização há N h".
- Erro de API: toast vermelho com a mensagem do `erro`; nunca bloquear a tela.
- Números sem dado mostram "—", nunca 0 falso (ex.: ROAS sem gasto).

## 12. Fora de escopo (não construir)

Painel "sessões ao vivo" dos agentes, geração de imagem/vídeo, publicação no Meta, multiusuário além do que existe. Tudo isso vem depois, por cima da mesma API.
