# Runbook — backup diário e dead man's switch

Documento de incidente: tudo que é preciso para entender, consertar e restaurar
o backup está aqui, sem precisar abrir o plano.

## O que roda, quando e onde

- **Workflow:** `.github/workflows/backup.yml` ("Backup diario"), todo dia às
  06:00 UTC (03:00 em São Paulo) e manualmente (aba **Actions** → "Backup
  diario" → **Run workflow**).
- **Script:** `scripts/backup.mjs` (fino) + módulos em `scripts/backup/`.
  Só módulos nativos do Node 22: o workflow não instala nada do npm.
- **Ordem, dentro do script:**
  1. ping `/start` no Healthchecks;
  2. **verificação da pasta do Drive** — se não conseguir acessá-la, para
     aqui com uma mensagem que diz o que conferir (ver "Ler a mensagem do
     verificador de pasta");
  3. ping anti-pausa pela API REST (`GET /rest/v1/curso?select=id&limit=1`
     com a chave de serviço; o grant é da migração `0017_ping_backup.sql`);
  4. `pg_dump` 17 do banco (é também o ping anti-pausa pela conexão de
     banco) → `banco-AAAA-MM-DD.sql.gz` no Drive;
  5. espelho dos buckets `prints` e `logos` nas subpastas `prints/` e `logos/`
     da pasta do backup — **incremental**: só sobe objeto novo ou alterado;
  6. retenção dos dumps: **30 diários + 12 mensais**;
  7. ping de **sucesso** no Healthchecks — sempre a última ação.
  Em qualquer erro: ping `/fail` com o motivo, e o job termina vermelho. Um
  passo final do workflow (`if: failure()`) também manda `/fail`, para falhas
  antes do script (checkout, Node, instalação do `pg_dump`).
- **O alarme é a ausência** do ping de sucesso (check `backup-un-provas-sociais`,
  período 1 dia, tolerância 6 horas). `/fail` só antecipa e explica o alerta.

### O que fica no Drive

Dentro da pasta `GDRIVE_FOLDER_ID` ("Backups UN Provas Sociais"):

| Item | Conteúdo | Apagado? |
|---|---|---|
| `banco-AAAA-MM-DD.sql.gz` | `pg_dump --no-owner --no-acl` do banco inteiro, SQL puro comprimido | Sim, pela retenção |
| `prints/<caminho>` | cópia de cada objeto do bucket `prints` (nome = caminho no bucket) | Nunca |
| `logos/<caminho>` | idem, bucket `logos` | Nunca |

- **Data do dump:** fuso de São Paulo. Dois dumps no mesmo dia (execução
  manual) → a retenção fica com o mais recente.
- **Retenção:** ficam os 30 dumps mais recentes (conta *backups*, não dias de
  calendário: dias sem backup não encurtam a janela) mais o **primeiro dump de
  cada mês** dos 12 meses mais recentes que têm backup. Só apaga arquivo que o
  próprio backup criou (marcado com `appProperties.origem =
  un-provas-sociais-backup`); qualquer outro arquivo na pasta fica intocado.
- **Espelho dos buckets:** o "já enviado" mora no próprio Drive
  (`appProperties.chave` = hash de bucket + caminho + versão do objeto), não no
  runner. Objeto sobrescrito no bucket sobe de novo; a versão anterior continua
  no Drive. Nada é apagado do espelho, então todo dump retido tem os seus
  prints e logos.

## 1. Qual rota está em uso, e por quê

**Rota B — OAuth com a conta Google da UN.** A UN não tem Google Workspace, então
não existe Drive compartilhado (Rota A). A Rota A continua suportada pelo script
(basta existir o Secret `GDRIVE_SA_JSON`), mas está sem uso — só passa a valer se
a UN vier a ter Workspace.

Fatos da Rota B (os mesmos do checklist `docs/checklists/marco-6.md`, seção
"Task 22"):

- **Projeto Google Cloud "UN Aprovados"**, OAuth client **"UN Aprovados Web"**
  — os mesmos do login (Task 13). Não existe projeto "un-provas-sociais" nem
  client "Supabase".
- **Escopo `https://www.googleapis.com/auth/drive.file`:** o app só alcança
  arquivos e pastas que **ele próprio** criou. **A pasta de backup não pode ser
  criada pela interface normal do Drive** — o app não a enxergaria (404). Ela foi
  criada pela API, no OAuth Playground, com a mesma credencial.
- **Passo a passo (OAuth 2.0 Playground,
  <https://developers.google.com/oauthplayground>)** — para gerar
  `GDRIVE_REFRESH_TOKEN` e `GDRIVE_FOLDER_ID` de novo:
  1. O client "UN Aprovados Web" precisa ter
     `https://developers.google.com/oauthplayground` entre os **URIs de
     redirecionamento autorizados** (Google Cloud → APIs e serviços →
     Credenciais → editar o client).
  2. Engrenagem (canto superior direito) → **Use your own OAuth credentials** →
     colar Client ID e Client Secret de "UN Aprovados Web".
  3. **Step 1**, em "Input your own scopes":
     `https://www.googleapis.com/auth/drive.file` → **Authorize APIs** → entrar
     com a conta Google da UN.
  4. **Step 2 — Exchange authorization code for tokens** → copiar o **refresh
     token** → Secret `GDRIVE_REFRESH_TOKEN`.
  5. **Step 3**: método `POST`, Request URI
     `https://www.googleapis.com/drive/v3/files`, header
     `Content-Type: application/json`, corpo
     `{"name":"Backups UN Provas Sociais","mimeType":"application/vnd.google-apps.folder"}`
     → **Send the request** → o `"id"` da resposta é o Secret
     `GDRIVE_FOLDER_ID`. (Só se a pasta tiver de ser recriada: um token novo
     continua enxergando a pasta antiga se for do mesmo client e da mesma
     conta.)
  6. Secret `GDRIVE_OAUTH_CLIENT` = `{"client_id":"…","client_secret":"…"}` do
     client "UN Aprovados Web".
- **O app OAuth tem de continuar "Em produção"** (não "Em teste"). Em "Modo de
  teste" o refresh token expira em 7 dias e o backup para toda semana, com um
  erro `invalid_grant` que não parece problema de código.
- **`SUPABASE_DB_URL` é a URI do Session pooler** (Supabase → Settings →
  Database → Connection string → aba **Session pooler**), não a conexão
  direta: os runners do GitHub Actions são só IPv4, e a conexão direta do plano
  gratuito é só IPv6.
- `SUPABASE_SERVICE_ROLE_KEY` pode ser a **Secret key** nova (`sb_secret_…`) ou
  a `service_role` legada.

### Secrets usados pelo `backup.yml`

`SUPABASE_DB_URL`, `VITE_SUPABASE_URL` (chega ao script como `SUPABASE_URL`),
`SUPABASE_SERVICE_ROLE_KEY`, `GDRIVE_OAUTH_CLIENT`, `GDRIVE_REFRESH_TOKEN`,
`GDRIVE_FOLDER_ID`, `HEALTHCHECKS_PING_URL` e, só na Rota A, `GDRIVE_SA_JSON`
(não cadastrado = Rota B). A URL do Healthchecks é segredo: quem a tem silencia o
alarme pingando no lugar do job. Nenhuma mensagem do script imprime valor de
Secret.

## 2. Resposta ao alerta do Healthchecks

Nesta ordem:

1. Na aba **Actions** do repositório, verificar se o workflow agendado foi
   **desativado por inatividade**. Reativar pelo painel ("Enable workflow").
   *(O GitHub desativa workflows agendados em repositório público após 60 dias
   sem atividade.)*
2. No painel do Supabase, verificar se o projeto **pausou**. Restaurar por lá —
   leva alguns minutos e não perde dados.
3. Se houve execução vermelha, abrir o log do passo "Backup (…)" e ler a linha
   `Error:` (anotação `::error::`); o `/fail` no Healthchecks traz o mesmo
   texto. Consertar conforme a tabela abaixo.
4. Rodar `backup.yml` manualmente e confirmar que o **ping de sucesso chegou ao
   Healthchecks antes** de encerrar o incidente.

| Mensagem começa com | O que fazer |
|---|---|
| `Faltam variaveis de ambiente` | Cadastrar os Secrets listados (Settings → Secrets and variables → Actions). |
| `… nao e um JSON valido` / `nao tem o(s) campo(s)` | Recadastrar o Secret citado no formato indicado acima. |
| `Nao consegui acessar a pasta do backup no Google Drive` | Ver "Ler a mensagem do verificador de pasta". |
| `O Google recusou GDRIVE_REFRESH_TOKEN: invalid_grant` | Token revogado/expirado. Conferir que o app está "Em produção" e gerar outro refresh token (passos 2–4 do Playground acima). |
| `O Google recusou o client de GDRIVE_OAUTH_CLIENT` | `client_id`/`client_secret` errados ou client apagado. |
| `Ping anti-pausa (GET /rest/v1/curso) falhou` | Projeto pausado, chave de serviço trocada, ou a `0017_ping_backup.sql` não foi aplicada no hospedado (rodar "Aplicar migracoes em producao"). |
| `pg_dump terminou com codigo …` | Conferir `SUPABASE_DB_URL` (Session pooler, senha atual do banco) e se o passo "Conferir pg_dump 17" passou. |
| `Dump incompleto` | Conexão caiu no meio; rodar de novo. Se repetir, investigar o pooler. |
| `Storage …` | Chave de serviço ou `VITE_SUPABASE_URL` errados, ou objeto corrompido no bucket (o caminho vem na mensagem). |
| `Drive respondeu 403 (storageQuotaExceeded)` | Drive da conta da UN cheio. Liberar espaço (a retenção só apaga dumps). |
| `Healthchecks nao recebeu o ping de sucesso` | O backup em si terminou; conferir `HEALTHCHECKS_PING_URL` e o status do healthchecks.io. |

### Ler a mensagem do verificador de pasta

É a primeira coisa que o backup faz; quando falha, **nada** foi enviado e o ping
de sucesso não sai. A mensagem diz a rota e o código do Drive:

- **404 (pasta não encontrada para esta credencial)** — o caso mais comum. Ou o
  `GDRIVE_FOLDER_ID` está errado (é o trecho final da URL da pasta, ou o `"id"`
  do Step 3 do Playground), ou — na Rota B — a pasta **não foi criada pelo
  próprio app**, ou foi criada com outro client/outra conta. Pasta criada pela
  interface do Drive responde 404 mesmo existindo e estando visível para você.
  Correção: criar a pasta pelo Step 3 do Playground e atualizar
  `GDRIVE_FOLDER_ID`.
- **403** — Google Drive API desabilitada no projeto "UN Aprovados", escopo
  concedido diferente de `drive.file`, ou a pasta pertence a outra conta.
- **401** — credencial recusada pelo Drive: refazer `GDRIVE_REFRESH_TOKEN`
  (e conferir `GDRIVE_OAUTH_CLIENT`).
- **"nao e uma pasta"** — o id aponta para um arquivo.
- **"esta na lixeira"** — restaurar a pasta pela lixeira do Drive. Não criar
  outra pela interface (na Rota B ela ficaria invisível para o app).
- Mensagem com `O Google recusou …` — o problema é antes do Drive: a troca do
  token falhou (ver a tabela acima).
- Na Rota A, 404 também pode ser a conta de serviço fora dos membros do Drive
  compartilhado.

## 3. Procedimento de restauração

**Data do último ensaio:** ainda não houve (Task 24). Registrar aqui a data e o
resultado.

O dump é SQL puro do banco inteiro (`public`, `auth`, `storage` etc.), sem dono
e sem GRANTs. Ele restaura limpo num **banco novo de um cluster que já tenha os
papéis do Supabase** (`anon`, `authenticated`, `service_role`, …) — o teste
`testes/backup/integracao.test.js` faz exatamente isso contra a stack local a
cada `npm test`. Duas mensagens de erro são esperadas e inofensivas:
`permission denied for table secrets` (Vault) e
`permission denied to set parameter "log_min_messages"`.

### Ensaio local (Task 24)

1. Baixar do Drive o `banco-AAAA-MM-DD.sql.gz` mais recente para `backups/`
   (pasta ignorada pelo git).
2. Com a stack local de pé (`npx supabase start`):

   ```bash
   docker exec supabase_db_marco-1-schema-rls createdb -U postgres restauro
   gunzip -c backups/banco-AAAA-MM-DD.sql.gz | \
     docker exec -i supabase_db_marco-1-schema-rls psql -U postgres -d restauro -q -o /dev/null
   ```

3. Conferir os números em `restauro` e em produção (SQL Editor) — divergência
   reprova o ensaio:

   ```sql
   select
     (select count(*) from depoimento)   as depoimentos,
     (select count(*) from participacao) as participacoes,
     (select count(*) from nota)         as notas,
     (select count(*) from resultado)    as resultados;
   ```

   (`docker exec supabase_db_marco-1-schema-rls psql -U postgres -d restauro -c "…"`)
4. Conferir que um print citado em `depoimento.print_path` existe em
   `prints/<print_path>` no Drive.
5. Apagar o banco do ensaio:
   `docker exec supabase_db_marco-1-schema-rls dropdb -U postgres --force restauro`.

### Desastre de verdade (projeto hospedado perdido)

1. Criar um projeto Supabase novo (Postgres 17), aplicar as migrações
   (`supabase link` + `supabase db push`, ou o workflow "Aplicar migracoes em
   producao" com os Secrets do projeto novo).
2. Restaurar os **dados** de `public` do dump sobre o schema recém-criado,
   seguindo o guia oficial do Supabase para restaurar de dump (dados com
   `session_replication_role = replica`, para os gatilhos não rodarem). Os
   usuários de `auth` só importam para o log de quem criou o quê: o acesso é
   pela tabela `membro_equipe` + login Google, e cada membro entra de novo.
3. Subir de volta os arquivos: cada item de `prints/` e `logos/` no Drive vai
   para o bucket de mesmo nome, no caminho igual ao nome do arquivo.
4. Atualizar os Secrets (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
   `SUPABASE_DB_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_REF`) e
   republicar o site.

Este caminho nunca foi ensaiado; o ensaio local acima prova que o dump está
íntegro e completo.

## 4. Reforço não implementado

Disparo diário externo pelo cron-job.org chamando `workflow_dispatch`, com token
de escopo mínimo. Fora do escopo porque o dead man's switch já cobre os três
modos de falha (workflow desativado, projeto pausado, erro no job), e porque a
documentação do GitHub não esclarece se um workflow desativado ainda aceita
`workflow_dispatch`.

## Decisões de implementação

- **Sem `googleapis`:** o pacote tem dezenas de MB para cinco chamadas REST.
  A Drive API é chamada por `fetch` (`scripts/backup/drive.js`), o token da
  Rota B vem do endpoint de token do Google e o da Rota A de um JWT assinado com
  `node:crypto` (`scripts/backup/google-token.js`). Upload sempre *resumable*,
  que não tem o teto de 5 MB do multipart.
- **Sem `npm ci` no workflow:** sem dependência externa, instalar pacotes só
  acrescentaria o registro do npm como ponto de falha a um job cujo sucesso é o
  próprio alarme. `testes/backup/principal.test.js` reprova import que não seja
  `node:` ou relativo.
- **Dump no script, não num passo do workflow:** o executor do `pg_dump` é
  injetado, e o mesmo código roda no CI (cliente 17 do PGDG) e nos testes (o
  `pg_dump` 17 de dentro do contêiner local, via `docker exec`). Dump sem o
  rodapé "dump complete" é recusado.
- **Testes:** `testes/backup/` — Drive, token do Google e Healthchecks
  simulados em servidores HTTP locais; integração contra a stack local.
  Nenhum teste fala com Google, healthchecks.io ou o projeto hospedado.
