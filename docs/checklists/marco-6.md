# Marco 6 — checklist manual (total: ~74 min)

Só o que não dá para automatizar (`CLAUDE.md`, seção 5). O Marco 6 acrescenta
os itens dele (backup, anti-pausa, publicação): a Task 22 (destino do backup e
Healthchecks, ~18 min) não depende do deploy e pode ser feita a qualquer
momento; a primeira execução real do backup (Task 23, ~19 min) depende da
Task 22 e do push; os demais (~37 min) dependem do deploy (Task 25) e vieram
do Marco 5.

## Task 22 — destino do backup, Rota B (OAuth) (~18 min)

A UN não tem Google Workspace: a rota usada é a B (conta pessoal via OAuth),
não a A (Drive compartilhado). Reaproveita o projeto Google Cloud **"UN
Aprovados"** e o OAuth client **"UN Aprovados Web"** já criados na Task 13 —
não "un-provas-sociais"/"Supabase" como um texto anterior do plano dizia
(corrigido lá também). Porque o escopo é `drive.file`, o app só alcança
arquivos e pastas que ele mesmo criou: **a pasta de backup não pode ser
criada pela interface normal do Drive**, só pelo passo a passo abaixo.

- [ ] (~2 min) No Google Cloud, projeto "UN Aprovados" → **APIs e serviços →
  Credenciais** → abrir o client OAuth "UN Aprovados Web" e conferir que
  `https://developers.google.com/oauthplayground` está entre os **URIs de
  redirecionamento autorizados**; se não estiver, adicionar e salvar.
- [ ] (~3 min) No [OAuth 2.0 Playground](https://developers.google.com/oauthplayground):
  engrenagem (canto superior direito) → **Use your own OAuth credentials** →
  colar o Client ID e o Client Secret de "UN Aprovados Web".
- [ ] (~1 min) **Step 1** (coluna da esquerda) → em "Input your own scopes",
  colar `https://www.googleapis.com/auth/drive.file` → **Authorize APIs** →
  entrar com a conta Google da UN.
- [ ] (~1 min) **Step 2 — Exchange authorization code for tokens** → copiar o
  **refresh token** → Secret `GDRIVE_REFRESH_TOKEN`.
- [ ] (~3 min) **Step 3**: método `POST`; Request URI
  `https://www.googleapis.com/drive/v3/files`; **Add headers** →
  `Content-Type: application/json`; corpo da requisição
  `{"name":"Backups UN Provas Sociais","mimeType":"application/vnd.google-apps.folder"}`
  → **Send the request** → copiar o `"id"` da resposta → Secret
  `GDRIVE_FOLDER_ID`.
- [ ] (~1 min) Secret `GDRIVE_OAUTH_CLIENT` =
  `{"client_id":"…","client_secret":"…"}` (mesmo client "UN Aprovados Web").
- [ ] (~1 min) Confirmar que o app OAuth continua **"Em produção"** (não "Em
  teste") — em teste o refresh token expira em 7 dias e o backup pararia toda
  semana.
- [ ] (~2 min) Secret `SUPABASE_DB_URL` = a URI do **Session pooler** (Supabase
  → Settings → Database → Connection string → aba Session pooler), **não** a
  conexão direta — os runners do GitHub Actions são só IPv4, e a conexão
  direta do plano gratuito é só IPv6.
- [ ] (~1 min) Secret `SUPABASE_SERVICE_ROLE_KEY` = a **Secret key** nova
  (`sb_secret_…`) ou a `service_role` legada — qualquer uma serve.
- [ ] (~3 min) Conta gratuita em [healthchecks.io](https://healthchecks.io) →
  **Add Check** → nome `backup-un-provas-sociais` → **Period** 1 day, **Grace
  time** 6 hours → confirmar que o e-mail de alerta é o seu → copiar a **Ping
  URL** para o Secret `HEALTHCHECKS_PING_URL` (é segredo: quem a tiver
  consegue silenciar o alarme pingando no lugar do job).

Rota A (Drive compartilhado) fica sem uso — só se aplica se a UN vier a ter
Google Workspace no futuro.

## Conectar o repositório e publicar pela primeira vez (~25 min)

O repositório local (`master`) ainda não tem `remote` configurado — a Task 25
implementou os workflows sem tocar em `git remote`/`git push` (fora do escopo
dela, decisão do dono). O repositório no GitHub já existe, criado **vazio**
na Task 2 (nenhum commit, nenhuma branch ainda). A ordem abaixo deixa tudo que
a primeira publicação precisa pronto **antes** do push, para o primeiro push
já disparar "Testes" e, se passar, "Publicar" sem mais nenhuma configuração
pelo meio.

### Antes do push (~13 min)

- [ ] (~1 min) No GitHub, o repositório se chama **exatamente**
  `un-provas-sociais` — é o `base` do Vite (`vite.config.js`) e o caminho do
  Pages. Outro nome quebra todos os caminhos do site.
- [ ] (~4 min) No painel do Supabase hospedado, Authentication → URL
  Configuration: **Site URL** = `https://<usuário-do-GitHub>.github.io/un-provas-sociais/`
  e o mesmo endereço em **Redirect URLs**. Sem isso, o login com Google volta
  para o lugar errado.
- [ ] (~1 min) Em **Settings → Pages → Source**, escolher **GitHub Actions**
  (Step 5 da Task 25) — sem isso o job `publicar` falha ao publicar, mesmo
  com o build ok.
- [ ] (~2 min) Em **Settings → Secrets and variables → Actions**, conferir
  que `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` já estão cadastrados
  (Task 13, Step 6). Se não estiverem, cadastrar agora (valores em Supabase →
  Settings → API) — sem eles o `deploy.yml` builda com URL/chave vazias.
- [ ] (~5 min) Cadastrar os três Secrets que `migracoes.yml` usa (**Settings
  → Secrets and variables → Actions → New repository secret**), nenhum deles
  digitável de memória:

  | Secret | Valor / onde achar |
  |---|---|
  | `SUPABASE_PROJECT_REF` | `urnflqgeaeyrblsabphc` — não é segredo (é o `ref` da URL do projeto), mas o workflow o lê como `secrets.SUPABASE_PROJECT_REF`, então precisa estar cadastrado como Secret para os passos `supabase link`/`db push` funcionarem. |
  | `SUPABASE_ACCESS_TOKEN` | supabase.com → conta → **Access Tokens** → gerar um novo (só aparece uma vez). |
  | `SUPABASE_DB_PASSWORD` | a senha do banco Postgres do projeto hospedado, definida na criação do projeto (Task 13) — não é a `service_role key`. Se perdida, resetar em Supabase → Settings → Database. |

### O push (~3 min)

- [ ] (~3 min) Conectar o repositório local ao GitHub e enviar o histórico —
  **o Claude executa depois da sua autorização**:

      git remote add origin https://github.com/<sua-conta>/un-provas-sociais.git
      git push -u origin master:main

  O repositório do GitHub foi criado **vazio** na Task 2 (sem branch
  nenhuma ainda) — não há "branch padrão" para conferir antes: este push
  cria a branch `main` lá e, sendo a primeira e única branch do
  repositório, o GitHub a define como padrão automaticamente. `deploy.yml`
  já está com `branches: [main]` esperando exatamente isso; não precisa
  trocar nada.

### Depois do push (~9 min)

- [ ] (~2 min) Confirmar no GitHub que os arquivos chegaram (aba Code, branch
  `main`) e que a Action "Testes" disparou sozinha.
- [ ] (~4 min) Acompanhar a aba **Actions**: primeiro "Testes" (job único,
  com limite de 30 minutos); se ele passar, "Publicar" dispara sozinho logo em
  seguida (gatilho `workflow_run`, fix round 1 — só publica depois de
  "Testes" concluir com sucesso). Se "Testes" falhar, parar e investigar
  antes de mais nada — "Publicar" não vai rodar sozinho, mas também não
  fazer novo push por cima sem entender o motivo.
- [ ] (~3 min) Abrir `https://<sua-conta>.github.io/un-provas-sociais/` (URL
  também aparece na aba Actions, na execução do "Publicar") e confirmar que
  a tela de login aparece.

## Task 23 — primeira execução real do backup (~19 min)

Depende da Task 22 (Secrets do backup e Healthchecks) e do push acima
(`backup.yml` só roda da branch padrão). Tudo o que dá para testar sem
produção já é coberto por `npm test` (`testes/backup/`, com Drive e
Healthchecks simulados); aqui é só a primeira vez contra o Google, o
healthchecks.io e o projeto hospedado de verdade. Se algo ficar vermelho, a
mensagem de erro diz o que conferir: `docs/runbook-backup.md`, seção 2.

- [ ] (~4 min) Aplicar a migração `0017_ping_backup.sql` no hospedado: aba
  **Actions** → "Aplicar migracoes em producao" → **Run workflow**. No log do
  passo `supabase db push --dry-run`, a única migração listada deve ser a
  `0017_ping_backup.sql`; o job termina verde. Sem ela, o ping anti-pausa do
  backup falha com "permission denied".
- [ ] (~5 min) **Actions** → "Backup diario" → **Run workflow**. Esperar
  verde (~2–3 min; a maior parte é instalar o `pg_dump` 17). No passo
  "Backup (…)", o log mostra, nesta ordem: "pasta do Drive acessivel (Rota
  B)", "ping anti-pausa pela API REST: ok", `banco-AAAA-MM-DD.sql.gz: N bytes
  enviados`, as linhas de `prints` e `logos` e a de `retencao`.
- [ ] (~3 min) No Google Drive da conta da UN, pasta **"Backups UN Provas
  Sociais"**: tem `banco-AAAA-MM-DD.sql.gz` de hoje, com tamanho maior que
  zero, e as subpastas `prints` e `logos` (vazias se a produção ainda não tem
  prints nem logos — o log diz quantos objetos cada bucket tem).
- [ ] (~2 min) No healthchecks.io, o check `backup-un-provas-sociais` está
  **up** (verde), com um evento "start" e um "success" desta execução; o
  corpo do "success" traz o resumo (nome do dump e quantos arquivos novos).
- [ ] (~3 min) Só se o passo anterior falhou em "Nao consegui acessar a pasta
  do backup": ler a mensagem (runbook, "Ler a mensagem do verificador de
  pasta") — quase sempre é a pasta criada pela interface do Drive em vez do
  Step 3 do OAuth Playground. Corrigir e rodar de novo.
- [ ] (~2 min) **No dia seguinte:** em **Actions** → "Backup diario", há uma
  execução com evento `schedule` (por volta das 03:00 de Brasília), verde, e o
  check do Healthchecks continua **up**. O ensaio de restauração e o teste do
  alarme são a Task 24.

## Depois do deploy, no site publicado (~12 min)

A produção começa sem depoimentos; o teste cria dois e os apaga no fim.

- [ ] (~5 min) Pela ficha ("Novo depoimento"), criar dois depoimentos de teste, fonte Manual: um com texto `TESTE link sim` e link original `https://exemplo.test/`, outro com texto `TESTE link nao` e sem link.
- [ ] (~4 min) Na lista, filtrar Texto = `TESTE`: "2 depoimentos". "Tem link original?" = Sim → "1 depoimento" (o com link); = Não → "1 depoimento" (o sem link); = Tanto faz → "2 depoimentos". Copiar a URL com um dos filtros, abrir noutra aba: mesmos filtros e mesmo resultado.
- [ ] (~3 min) Limpar no SQL Editor do painel: `select count(*) from depoimento where texto_completo like 'TESTE%';` deve dar `2`; então `delete from depoimento where texto_completo like 'TESTE%';` — apaga 2 linhas (tipos e participações vão em cascata). Se a contagem não for 2, parar e conferir antes de apagar.
