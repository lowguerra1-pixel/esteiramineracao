#!/bin/bash
# Dois cliques neste arquivo abrem a Esteira em http://localhost:4747
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
if ! command -v node >/dev/null 2>&1; then
  echo "Não encontrei o Node.js neste Mac. Instale a versão LTS em https://nodejs.org e abra de novo."
  read -n 1; exit 1
fi
(sleep 1.5; open "http://localhost:4747") &
node server.js
