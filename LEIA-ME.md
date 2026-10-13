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
