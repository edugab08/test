# Finanças a Dois — v2

App de finanças do casal com **login individual**. Cada pessoa lança o que é seu e cadastra a própria renda, e o app calcula sozinho o seguinte:
- a divisão das despesas do casal, pela renda ou meio a meio;
- o acerto do mês, ou seja, quem passa quanto para quem;
- quanto sobra livre para cada um.

O que um lança aparece no celular do outro na hora.

Stack: React + TypeScript + Tailwind (Vite), Supabase (Postgres, login e tempo real), PWA instalável, deploy no Vercel.

---

## 1. Criar o banco no Supabase (uns 10 minutos)

1. Crie uma conta em <https://supabase.com> e clique em **New project**. O plano grátis basta, e a região `South America (São Paulo)` é a mais rápida.
2. No menu **SQL Editor**, clique em **New query**, cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
3. O login é por **e-mail e senha**, que já vem ligado no Supabase.
   - Em **Authentication → Sign In / Providers → Email**, deixe *Confirm email* ligado. Assim cada conta confirma o e-mail antes do primeiro acesso.
   - O "Esqueci minha senha" usa esse mesmo e-mail.
4. Em **Authentication → URL Configuration**:
   - Em **Site URL**, coloque o endereço do Vercel (ex.: `https://financas-a-dois.vercel.app`).
   - Em **Redirect URLs**, adicione esse mesmo endereço e `http://localhost:5173`.
5. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public**.

## 2. Publicar no Vercel

1. Suba esta pasta para o GitHub. Pode ser no lugar do código antigo do repositório `test` ou num repositório novo.
2. No Vercel, abra o projeto (ou **Add New → Project**, se for repositório novo). Ele detecta o **Vite** sozinho.
3. Em **Settings → Environment Variables**, cadastre:
   - `VITE_SUPABASE_URL`, com a Project URL;
   - `VITE_SUPABASE_ANON_KEY`, com a chave anon public.
4. Faça o deploy. Sem essas variáveis, o app abre em **modo demonstração**, com dados de exemplo salvos só no navegador.

## 3. Entrar como casal

1. Você cria sua conta com e-mail e senha, escolhe **Começar um casal**, seu nome e sua cor.
2. Em **Ajustes → Casal**, toque em **Enviar convite**. Ela abre o link, cria a conta dela com e-mail e senha e cai direto no casal.
3. Cada um vai em **Ajustes → Renda de cada um** e cadastra o próprio salário uma única vez. Ele entra sozinho todo mês.

## 4. Trazer os dados do app antigo

1. No app antigo, use o botão de **backup (JSON)** para baixar o arquivo.
2. **Depois que os dois tiverem entrado**, vá em **Ajustes → Importar backup do app antigo**.
3. Diga quem era a "Pessoa 1" no app antigo.

O importador converte:
- lançamentos, salários mês a mês (cada um no nome do dono);
- cartões, recorrentes, orçamentos, reservas, metas e acertos;
- categorias personalizadas.

Rode a importação uma vez só: importar duas vezes duplica os lançamentos.

---

## Estilos visuais

Em **Ajustes → Visual** há quatro estilos para comparar: Aurora, Holográfico, Risografia e Reserva. Para abrir direto em um deles, use `?visual=holo` (ou `riso`, `reserva`, `aurora`) no endereço. A escolha vale para o aparelho.

## Como usar no dia a dia

Toque em **+** (ou aperte **N** no computador) e escreva do seu jeito:

| Você escreve | O app entende |
|---|---|
| `mercado 230,50` | despesa do casal, paga por você, hoje, categoria Mercado |
| `tv 2.400 nubank 10x` | 10 parcelas no Nubank, cada uma na fatura certa (pelo dia de fechamento), sem perder centavos |
| `farmácia 85 só eu ontem` | despesa só sua, com data de ontem |
| `luz 210 marina pagou` | quem pagou foi ela (entra no acerto) |
| `aluguel 1650 conjunta` | pago pela conta conjunta |
| `+ freela 800` | renda extra sua |
| `caixinha 300` | aporte (vira investimento) |

Todos os campos aparecem preenchidos embaixo e dá para ajustar antes de salvar.

## Desenvolvimento

```bash
npm install
npm run dev      # http://localhost:5173 (modo demonstração se não houver .env.local)
npm test         # 20 testes da lógica: parser, faturas, parcelas, divisão, acerto, importação
npm run build
```

Para usar o Supabase localmente, copie `.env.example` para `.env.local` e preencha.

### Estrutura

```
src/domain/    regras puras e testadas: datas, dinheiro, fatura, parser, métricas do mês, importador
src/data/      Supabase / modo demonstração, fila offline, tempo real, estado global
src/screens/   Início, Lançamentos, Cartões, Planejar, Ajustes, Login
src/ui/        componentes (formulário de lançamento, gráficos SVG, folhas, ícones)
supabase/      schema.sql: tabelas, regras de segurança, funções e tempo real
```

### Decisões importantes

- **Segurança no banco (RLS):**
  - Cada casal só enxerga os próprios dados.
  - A renda de uma pessoa só pode ser criada, editada ou apagada por ela mesma.
  - O casal tem no máximo 2 pessoas.
- **Recorrências no servidor** (`ensure_recurring`): o salário dela aparece no mês mesmo que ela ainda não tenha aberto o app. Um índice único impede duplicar quando os dois celulares abrem juntos.
- **Offline primeiro:**
  - Toda alteração aparece na hora e vai para uma fila.
  - Sem internet, a fila espera e envia quando a conexão volta.
  - Os dados ficam em cache para abrir instantaneamente.
- **Cartão:** cada compra guarda a data real e o mês da fatura (`month`), calculado pelo dia de fechamento e de vencimento.
- **PWA com atualização automática:** um deploy novo no Vercel chega aos celulares sem ficar preso no cache.
