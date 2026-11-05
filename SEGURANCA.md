# Segurança — Finanças a Dois

Revisão feita em 04/11/2026. Os ataques abaixo foram executados de verdade contra o banco (Postgres) antes e depois das correções.

## Quem pode ver e mexer em quê

| Situação | Resultado |
|---|---|
| Pessoa de fora (outro casal) lê os lançamentos de vocês | Bloqueado |
| Pessoa de fora tenta entrar no casal mudando o próprio cadastro | Bloqueado |
| Visitante sem login lê qualquer dado ou chama qualquer função | Bloqueado |
| Um de vocês cria, edita ou apaga a renda do outro | Bloqueado (só o dono mexe na própria renda) |
| Terceira pessoa entra no casal | Bloqueado (máximo de 2) |
| Alguém tenta adivinhar o código de convite | Código de 8 caracteres e no máximo 8 tentativas a cada 15 minutos por conta |
| Apontar categoria, cartão, reserva ou pessoa de outro casal | Bloqueado *(corrigido no `002_seguranca.sql`)* |
| Forjar "quem lançou" um gasto | Bloqueado: o banco grava sempre quem está logado *(corrigido)* |
| Pedir milhares de meses de recorrência de uma vez | Bloqueado: máximo de 6 *(corrigido)* |
| Mudar campos do cadastro além de nome e cor | Bloqueado *(corrigido)* |

## O que protege o app

- **Regras no próprio banco (RLS):** mesmo que alguém pegue a chave pública do app (ela é pública por natureza), o banco só entrega e aceita os dados do casal de quem está logado.
- **Login por e-mail e senha** com confirmação de e-mail e senha de no mínimo 8 caracteres. As senhas ficam com o Supabase (com hash), nunca no app.
- **Conexão sempre criptografada (HTTPS)**, com o navegador obrigado a nunca usar HTTP (HSTS).
- **Cabeçalhos de segurança no site** (`vercel.json`):
  - O app só carrega código dele mesmo e só conversa com o Supabase (CSP).
  - Não pode ser aberto dentro de outro site (proteção contra clickjacking).
  - Não envia o endereço da página para outros sites.
  - Não tem acesso a câmera, microfone ou localização.
- **Nenhum HTML montado a partir de texto do usuário**, o que impede injeção de script (XSS).
- **Erros de permissão** fazem o app desfazer a alteração e avisar. Nada fica "meio salvo".

## Recomendações para vocês

1. **Rodar o `supabase/002_seguranca.sql`** no SQL Editor do Supabase. As correções só valem depois disso.
2. **Desligar o app antigo** depois de importar o backup. O Apps Script antigo continua no ar com todos os dados na planilha e aceita a senha pela URL. No Apps Script, vá em *Implantar → Gerenciar implantações → Arquivar*. Se quiser, depois apague a aba com os dados.
3. **No Supabase, em Authentication → Sign In / Providers → Email**, deixe *Confirm email* ligado e, se aparecer a opção, *Minimum password length* em 8.
4. **No celular:** o app guarda uma cópia dos dados no aparelho para abrir rápido e funcionar sem internet. Use a trava de tela do celular. Ao sair da conta, a cópia é apagada.
5. **A chave `service_role` / `secret` do Supabase nunca vai para o app nem para o Vercel.** Só a `anon` / `publishable`.
