# Esteira de Repertório

App para João e Jeff minerarem, dissecarem e guardarem criativos no Swipe.

- **Site e API:** Netlify (páginas em `public/`, API em `netlify/functions/api.mjs` → `lib/api.mjs`)
- **Swipe, usuários e ajustes:** Supabase
- **Vídeos:** Google Drive do Kaian, pasta `Esteira de Repertório/AAAA-MM/`, arquivo `SW-0001 · nicho · Nome.mp4`
- **Transcrição:** Whisper no navegador de quem usa (grátis). Use Chrome ou Edge atualizado.
- **Dissecação:** API da Anthropic (modelo configurável em Ajustes)

## Configurar (uma vez só)

### 1. Supabase
1. Crie um projeto em supabase.com.
2. Abra **SQL Editor**, cole todo o arquivo `supabase/schema.sql` e clique em **Run**.
3. Em **Project Settings › API**, copie a **Project URL** e a chave **service_role** (secreta).

### 2. Google Cloud (para o Drive)
1. Em console.cloud.google.com, crie um projeto (ex.: "Esteira").
2. **APIs e serviços › Biblioteca**: ative a **Google Drive API**.
3. **Tela de consentimento OAuth**: tipo Externo, preencha nome e e-mail. Depois clique em **Publicar app** (status "Em produção"); em modo de teste o acesso expira em 7 dias.
4. **Credenciais › Criar credenciais › ID do cliente OAuth › Aplicativo da Web**.
   Em **URIs de redirecionamento autorizados**, coloque: `https://SEU-SITE.netlify.app/api/google/callback`
5. Copie o **ID do cliente** e a **Chave secreta do cliente**.

### 3. Netlify
Em **Site configuration › Environment variables**, cadastre:

| Variável | Valor |
|---|---|
| `SUPABASE_URL` | Project URL do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | chave service_role do Supabase |
| `APP_SECRET` | uma frase longa e aleatória qualquer |
| `ANTHROPIC_API_KEY` | chave da API da Anthropic (sem ela, a dissecação fica em modo demo) |
| `GOOGLE_CLIENT_ID` | ID do cliente do Google |
| `GOOGLE_CLIENT_SECRET` | chave secreta do Google |

Depois, **Deploys › Trigger deploy**.

### 4. No app
1. Entre como **Kaian** (PIN `0000`).
2. **Ajustes › Conectar Google Drive** e autorize com a conta onde os vídeos devem ficar.
3. Troque os PINs (João `1111`, Jeff `2222`, Kaian `0000`) e confira o fuso horário da equipe.

## Rodar no computador
Crie um arquivo `.env` (copie de `.env.example`) e rode `node dev.mjs`. Abre em http://localhost:4747.

## App Ofertas (`/ofertas/`)
Mineração e Modelagem de ofertas, no mesmo site, com o mesmo login.

- **Mineração:** anote a oferta em uma frase (link, nicho, ticket e anunciantes são opcionais; o nº de anunciantes define a classe A a D). Trie e decida: Modelar (escolhe a trilha), Monitorar 7 dias ou Descartar com motivo.
- **Caçador:** em Mineração, "Puxar Caçador" lê a planilha (abas Ranking, Evidências e Histórico). As descartadas pelo Caçador ficam numa aba própria, com "Testar mesmo assim". A decisão volta para a coluna Status (Kaian); o ROAS do teste vai para Resultado e para uma linha nova na aba Calibração.
- **Modelagem:** etapas por trilha (com responsável), checklist low ticket de 10 itens, teste, resultado (abaixo de 1 arquiva; 1 a 1,4 caso a caso; 1,4 a 1,8 otimiza; 1,8+ teste bom), diagnóstico do funil pela régua do SOP MVT, escala e manutenção. Mecanismo vencedor vira oferta filha.
- **Placar do Caçador:** acerto nas recomendadas e nas descartadas, por faixa de score e por classe.

Para o app ler e escrever na planilha: em **Ofertas › Ajustes**, clique em **Reconectar Google** e aceite a permissão de planilhas (a Google Sheets API precisa estar ativa no projeto do Google Cloud). O SQL das ofertas está no fim de `supabase/schema.sql`.

## App Testes A/B (/testes)

Teste de páginas de vendas sem redirecionar e sem perder o rastreio.

- **Divisor**: uma edge function no site da oferta (`netlify/edge-functions/ab.js`, hoje na radicigana). Sem teste ligado, não faz nada. Com teste ligado, sorteia a página, guarda em cookie por 90 dias e entrega a página escolhida no mesmo endereço. Qualquer erro abre a página A.
- **Página B**: fica numa pasta do mesmo site (ex.: `/b/index.html` com `css/ js/ images/` dentro). Os caminhos relativos são ajustados na entrega.
- **Etiqueta**: a variante vai no parâmetro `vtid` do link da Lastlink. `src` (UTMIFY) e `sck` (ID do visitante da Stape) não são tocados. O `sck` serve de segunda prova: o divisor liga o ID da Stape à página.
- **Vendas**: webhook da Lastlink em Testes → Ajustes (evento de compra completa e de reembolso). Nenhum dado do comprador é guardado.
- **Variável**: `AB_CHAVE` igual no Hub e no site da oferta (eventos do divisor para o Hub).
- **Ver uma página sem contar visita**: `https://dominio/?ab_ver=b`.
- **Banco**: rodar o bloco "App Testes" do `supabase/schema.sql`.
