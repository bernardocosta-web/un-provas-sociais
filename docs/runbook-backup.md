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
  2. ping anti-pausa pela API REST (`GET /rest/v1/curso?select=id&limit=1`
     com a chave de serviço; o grant é da migração `0017_ping_backup.sql`) —
     antes de tudo, para um problema no Drive não deixar também o projeto pausar;
  3. **verificação da pasta do Drive** — se não conseguir acessá-la, para
     aqui, antes de qualquer dump ou upload, com uma mensagem que diz o que
     conferir (ver "Ler a mensagem do verificador de pasta");
  4. `pg_dump` 17 do banco (é também o ping anti-pausa pela conexão de
     banco) → `banco-AAAA-MM-DD.sql.gz` no Drive. A senha vai por
     `PGPASSWORD`, nunca na linha de comando; um `pg_dump` travado é morto em
     10 minutos, com mensagem;
  5. espelho dos buckets `prints` e `logos` nas subpastas `prints/` e `logos/`
     da pasta do backup — **incremental**: só sobe objeto novo ou alterado;
  6. retenção dos dumps: **30 diários + 12 mensais**; o excedente vai para a
     **lixeira** do Drive (recuperável por 30 dias), não é apagado de vez;
  7. ping de **sucesso** no Healthchecks — sempre a última ação.
  Em qualquer erro: ping `/fail` com o motivo, e o job termina vermelho. Um
  passo final do workflow (`if: failure() || cancelled()`) também manda
  `/fail`, para falhas antes do script (checkout, Node, instalação do
  `pg_dump`) e para job cancelado ou estourado no tempo.
- **O alarme é a ausência** do ping de sucesso (check `backup-un-provas-sociais`,
  período 1 dia, tolerância 6 horas). `/fail` só antecipa e explica o alerta.

### O que fica no Drive

Dentro da pasta `GDRIVE_FOLDER_ID` ("Backups UN Provas Sociais"):

| Item | Conteúdo | Apagado? |
|---|---|---|
| `banco-AAAA-MM-DD.sql.gz` | `pg_dump --no-owner --no-acl` do banco inteiro, SQL puro comprimido | Vai para a lixeira, pela retenção |
| `prints/<caminho>` | cópia de cada objeto do bucket `prints` (nome = caminho no bucket) | Nunca |
| `logos/<caminho>` | idem, bucket `logos` | Nunca |

- **Data do dump:** fuso de São Paulo. Dois dumps no mesmo dia (execução
  manual) → a retenção fica com o mais recente.
- **Retenção:** ficam os 30 dumps mais recentes (conta *backups*, não dias de
  calendário: dias sem backup não encurtam a janela) mais o **primeiro dump de
  cada mês** dos 12 meses mais recentes que têm backup. O resto vai para a
  lixeira do Drive (some sozinho em 30 dias). Só mexe em arquivo que o
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
| `pg_dump passou do tempo limite` | O pooler não respondeu em 10 min. Conferir o status do Supabase e rodar de novo. |
| `SUPABASE_DB_URL tem de ser uma URI postgresql://` | Recadastrar o Secret com a URI do Session pooler. |
| `Storage …` | Chave de serviço ou `VITE_SUPABASE_URL` errados, ou objeto corrompido no bucket (o caminho vem na mensagem). |
| `Drive respondeu 403 (storageQuotaExceeded)` | Drive da conta da UN cheio. Esvaziar a lixeira do Drive (os dumps retirados pela retenção ficam lá 30 dias) e liberar espaço. |
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

**Data do último ensaio:** ainda não houve (Task 24, depois do primeiro
backup real). Registrar aqui: data, nome do dump ensaiado, resultado
("ENSAIO OK" ou os problemas) e quem rodou.

O dump é SQL puro do banco inteiro (`public`, `auth`, `storage` etc.), sem dono
e sem GRANTs. Ele restaura limpo num **banco novo de um cluster que já tenha os
papéis do Supabase** (`anon`, `authenticated`, `service_role`, …) — é o que o
ensaio abaixo faz, no contêiner da stack local, e o que
`testes/backup/integracao.test.js` e `testes/ensaio/ensaio.test.js` fazem a cada
`npm test`.

### Ensaio de restauração

Roda na sua máquina, contra a stack **local**, num banco descartável
(`ensaio_restauro_…`) criado só para isso. Não toca o banco `postgres` local
(o dos testes) nem o projeto hospedado. Pré-requisitos: Docker de pé e
`npx supabase start`.

1. **Baixar o backup mais recente.** No Google Drive da conta da UN, abrir a
   pasta **"Backups UN Provas Sociais"**:
   - botão direito no `banco-AAAA-MM-DD.sql.gz` mais recente → **Fazer
     download**;
   - botão direito na subpasta `prints` → **Fazer download** (o Drive entrega
     um `.zip`); o mesmo com a subpasta `logos`.
2. **Onde pôr os arquivos** (a pasta `backups/` é ignorada pelo git — nada disso
   vai para o repositório):

   ```
   backups/ensaio/banco-AAAA-MM-DD.sql.gz
   backups/ensaio/arquivos/prints/...   (conteúdo do zip de prints)
   backups/ensaio/arquivos/logos/...    (conteúdo do zip de logos)
   ```

   Extrair cada zip de modo que os arquivos fiquem **dentro** de
   `arquivos/prints/` e `arquivos/logos/` (se o zip criar uma pasta a mais, por
   exemplo `prints-2026…/prints/`, mover o conteúdo um nível acima). Se o Drive
   trocar `/` por `_` em algum nome, tudo bem: o ensaio aceita as duas formas.
3. **Rodar:**

   ```bash
   npm run ensaio:restauracao -- --dump backups/ensaio/banco-AAAA-MM-DD.sql.gz --arquivos backups/ensaio/arquivos
   ```

   Acrescente `--manter` para deixar o banco de ensaio de pé e inspecioná-lo
   (o relatório imprime o nome e o comando `dropdb` para apagá-lo depois). Sem
   `--manter`, o banco de ensaio é apagado no fim, passe ou não.
4. **O que é sucesso:** a última parte do relatório diz **`ENSAIO OK`** e o
   comando sai com código 0. Antes disso, o relatório mostra:
   - **linhas por tabela** de `public` — compare `depoimento`, `participacao`,
     `nota` e `resultado` com a mesma contagem em produção (SQL Editor do
     painel):

     ```sql
     select
       (select count(*) from depoimento)   as depoimentos,
       (select count(*) from participacao) as participacoes,
       (select count(*) from nota)         as notas,
       (select count(*) from resultado)    as resultados;
     ```

     Diferença só pode ser o que foi cadastrado depois do horário do dump;
   - **`membro_equipe`** com pelo menos um membro ativo (sem isso ninguém
     entraria no app restaurado);
   - um **depoimento de amostra** com suas participações, notas e resultados
     (prova de que as ligações entre as tabelas voltaram);
   - **arquivos:** quantos objetos do Storage (metadados restaurados em
     `storage.objects`) têm cópia na pasta baixada, e os que faltarem; também
     os prints citados em `depoimento.print_path` sem arquivo. "Arquivos a mais"
     é normal: versões antigas e objetos removidos do bucket continuam no
     espelho;
   - **erros da restauração:** dois são esperados e marcados `[ok]` — o do
     **Vault** (`permission denied for table secrets`: a tabela de segredos do
     Vault do Supabase só pode ser gravada pelo papel interno da plataforma; o
     projeto não usa o Vault) e o de **`log_min_messages`** (configuração de log
     que só o superusuário da plataforma muda; não é dado). Qualquer outro erro
     aparece como `[!!]` e reprova o ensaio.
5. **Registrar** a data e o resultado em "Data do último ensaio", no topo desta
   seção, e marcar o item da Task 24 em `docs/checklists/marco-6.md`. Depois,
   apagar `backups/ensaio/` (tem dados reais de alunos).

Se o ensaio reprovar, os problemas vêm listados no fim do relatório. "Sem
cópia" quase sempre é zip extraído no lugar errado (passo 2); erro `[!!]` na
restauração ou contagem divergente é motivo para investigar o backup antes de
confiar nele.

### Desastre de verdade (projeto hospedado perdido)

O dump não vai direto para um projeto novo: ele traz também os schemas internos
do Supabase (`auth`, `storage`…), que o projeto novo já tem. O caminho passa por
um banco local de ensaio e leva só os dados do app:

1. Criar um projeto Supabase novo (Postgres 17) e aplicar as migrações nele
   (`supabase link` + `supabase db push`, ou o workflow "Aplicar migracoes em
   producao" com os Secrets do projeto novo). Schema e GRANTs vêm das
   migrações, não do dump.
2. Restaurar o dump num banco local de ensaio e deixá-lo de pé:
   `npm run ensaio:restauracao -- --dump … --arquivos … --manter` (anotar o
   nome `ensaio_restauro_…` impresso no fim).
3. Tirar dele **só os dados de `public`**:

   ```bash
   docker exec supabase_db_marco-1-schema-rls pg_dump -U postgres \
     --data-only --schema=public --no-owner --no-acl ensaio_restauro_… > backups/dados-public.sql
   ```

4. Carregar no projeto novo com os gatilhos desligados durante a carga (as
   regras de transição e o `atualizado_em` não podem reagir a dado antigo),
   pela URI do Session pooler do projeto novo:

   ```bash
   ( echo "set session_replication_role = replica;"; cat backups/dados-public.sql ) | \
     docker exec -i supabase_db_marco-1-schema-rls psql "<URI do Session pooler do projeto novo>" -v ON_ERROR_STOP=1
   ```

   (o `psql` do contêiner local serve só de cliente; `session_replication_role`
   vale apenas para esta sessão).
5. Subir os arquivos de volta **pela Storage API** (painel do Supabase →
   Storage → bucket → Upload, ou supabase-js com a chave de serviço): cada
   arquivo de `arquivos/prints/` vai para o bucket `prints` e cada um de
   `arquivos/logos/` para `logos`, no caminho igual ao nome do arquivo. As
   linhas de `storage.objects` são recriadas pelo próprio upload — **não**
   copiar `storage.objects` do dump.
6. Os usuários de `auth` não precisam voltar: o acesso é por `membro_equipe` +
   login Google, e cada membro entra de novo.
7. Atualizar os Secrets (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
   `SUPABASE_DB_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_REF`),
   republicar o site e apagar o banco de ensaio
   (`docker exec supabase_db_marco-1-schema-rls dropdb -U postgres --force ensaio_restauro_…`).

Este caminho nunca foi executado de ponta a ponta; o ensaio de restauração
prova que o dump está íntegro, completo e restaurável.

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
  próprio alarme. `testes/backup/so_nativos.test.js` reprova import que não seja
  `node:` ou relativo.
- **Dump no script, não num passo do workflow:** o executor do `pg_dump` é
  injetado, e o mesmo código roda no CI (cliente 17 do PGDG) e nos testes (o
  `pg_dump` 17 de dentro do contêiner local, via `docker exec`). Dump sem o
  rodapé "dump complete" é recusado.
- **Testes:** `testes/backup/` — Drive, token do Google e Healthchecks
  simulados em servidores HTTP locais; integração contra a stack local.
  Nenhum teste fala com Google, healthchecks.io ou o projeto hospedado.
