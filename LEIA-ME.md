# Esteira de Repertório

App local para João e Jeff minerarem, dissecarem e guardarem criativos no Swipe.

## Abrir
Dois cliques em **Abrir Esteira.command**. O navegador abre em http://localhost:4747.
Para fechar, feche a janela do Terminal.
(Se o macOS bloquear: clique com o botão direito no arquivo > Abrir. Ou no Terminal: `cd ~/Sites/esteira-repertorio && node server.js`.)

## Acessos de teste
| Pessoa | PIN |
|---|---|
| João Guerra | 1111 |
| Jeff Figueredo | 2222 |
| Kaian (gestor) | 0000 |
Troque os PINs em **Ajustes**.

## Ligar a IA
Sem chave, a dissecação devolve uma ficha de exemplo (modo demo).
Entre como Kaian > Ajustes > cole a chave da API da Anthropic.

## Onde ficam os dados
- Swipe: `data/db.json` (e o botão "Baixar planilha (CSV)" abre no Google Sheets/Excel)
- Vídeos: `data/videos/AAAA-MM/SW-0001 · nicho · Nome.mp4`
- Para mandar os vídeos para o Google Drive: em Ajustes, troque a pasta para uma pasta do Drive para computador.

## Transcrição
Roda no navegador com Whisper (igual ao Combinator). Use Chrome ou Edge atualizado.
Na primeira vez o navegador baixa o modelo (~145 MB); depois fica em cache.
