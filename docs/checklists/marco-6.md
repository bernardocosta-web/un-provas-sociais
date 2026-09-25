# Marco 6 — checklist manual (total: ~37 min)

Só o que não dá para automatizar (`CLAUDE.md`, seção 5). O Marco 6 acrescenta
os itens dele (backup, anti-pausa, publicação); por enquanto só os itens que
dependem do deploy (Task 25) e vieram do Marco 5.

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

## Depois do deploy, no site publicado (~12 min)

A produção começa sem depoimentos; o teste cria dois e os apaga no fim.

- [ ] (~5 min) Pela ficha ("Novo depoimento"), criar dois depoimentos de teste, fonte Manual: um com texto `TESTE link sim` e link original `https://exemplo.test/`, outro com texto `TESTE link nao` e sem link.
- [ ] (~4 min) Na lista, filtrar Texto = `TESTE`: "2 depoimentos". "Tem link original?" = Sim → "1 depoimento" (o com link); = Não → "1 depoimento" (o sem link); = Tanto faz → "2 depoimentos". Copiar a URL com um dos filtros, abrir noutra aba: mesmos filtros e mesmo resultado.
- [ ] (~3 min) Limpar no SQL Editor do painel: `select count(*) from depoimento where texto_completo like 'TESTE%';` deve dar `2`; então `delete from depoimento where texto_completo like 'TESTE%';` — apaga 2 linhas (tipos e participações vão em cascata). Se a contagem não for 2, parar e conferir antes de apagar.
