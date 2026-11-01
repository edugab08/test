# Finanças a Dois

App estático (HTML + JS) que grava na sua planilha via Google Apps Script. Abra `index.html` por um servidor (ex.: GitHub Pages).

- `js/config.js` categorias (com cor e ícone), formatação · `js/cloud.js` sincronização, fila de gravação e detecção de conflito
- `js/cards.js` cartões · `js/app.js` núcleo · `js/features.js` orçamento, patrimônio, recorrentes, salários
- `js/extras.js` acerto de contas, importação com prévia, filtros, lembretes, comparativo · `js/extras2.js` backup/restore, categorias editáveis, relatório do ano · `js/icons.js` ícones SVG · `js/ui.js` abas e gráficos
- `css/tailwind.css` é gerado: **depois de usar classes Tailwind novas, rode `npm run build:css`**
- Testes: `npm i && npm test`

## Atualizar o Apps Script (recomendado)
1. Abra a planilha → Extensões → Apps Script → substitua o código por `apps-script/Code.gs` e preencha `SENHA_CASAL` (a mesma de hoje).
2. Implantar → **Gerenciar implantações** → ✏️ editar → Versão: **Nova versão** → Implantar. (A URL continua a mesma.)
3. Abra o app nos dois celulares. Ele detecta o script novo sozinho.
4. Depois, mude `PERMITIR_GET_LEGADO` para `false` e publique outra nova versão: a senha deixa de aceitar a URL.

O que o script novo resolve: limite de 50.000 caracteres da célula (dados em blocos), gravações simultâneas (trava + controle de versão), senha na URL e tentativas ilimitadas de senha.
