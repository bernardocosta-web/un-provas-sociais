# Marco 6 — checklist manual (total: ~40 min)

Só o que não dá para automatizar (`CLAUDE.md`, seção 5). O Marco 6 acrescenta
os itens dele (backup, anti-pausa, publicação); por enquanto só os itens que
dependem do deploy (Task 25) e vieram do Marco 5.

## Conectar o repositório e publicar pela primeira vez (~23 min)

O repositório local (`master`) ainda não tem `remote` configurado — a Task 25
implementou os workflows sem tocar em `git remote`/`git push` (fora do escopo
dela, decisão do dono). O repositório no GitHub já existe (criado na Task 2),
mas sua branch padrão não foi conferida por nenhum agente até aqui.

- [ ] (~1 min) Conferir, no GitHub, a **branch padrão** do repositório (Settings → Branches). Se for `main`, seguir os comandos abaixo apontando `master` local para lá. Se for `master`, ou trocar `branches: [main]` por `branches: [master]` em `.github/workflows/deploy.yml`, ou renomear a branch padrão do GitHub para `main` — o `deploy.yml` como está só dispara por push em `main`; até essa decisão, ele sempre pode ser rodado manualmente (aba Actions → Publicar → Run workflow).
- [ ] (~3 min) Conectar o repositório local ao GitHub e enviar o histórico — **o Claude executa depois da sua autorização** (os comandos abaixo pressupõem branch padrão `main`; trocar por `master` se for o caso):

      git remote add origin https://github.com/<sua-conta>/un-provas-sociais.git
      git push -u origin master:main

- [ ] (~2 min) Confirmar no GitHub que os arquivos chegaram (aba Code) e que a Action "Testes" dispara sozinha no push.
- [ ] (~1 min) Em **Settings → Pages → Source**, escolher **GitHub Actions** (Step 5 da Task 25) — sem isso o job `publicar` falha ao publicar, mesmo com o build ok.
- [ ] (~2 min) Em **Settings → Secrets and variables → Actions**, conferir que `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` já estão cadastrados (Task 13, Step 6). Se não estiverem, cadastrar agora (valores em Supabase → Settings → API) — sem eles o `deploy.yml` builda com URL/chave vazias.
- [ ] (~8 min) Cadastrar os três Secrets que `migracoes.yml` usa (**Settings → Secrets and variables → Actions → New repository secret**), nenhum deles digitável de memória:

  | Secret | Valor / onde achar |
  |---|---|
  | `SUPABASE_PROJECT_REF` | `urnflqgeaeyrblsabphc` — não é segredo (é o `ref` da URL do projeto), mas o workflow o lê como `secrets.SUPABASE_PROJECT_REF`, então precisa estar cadastrado como Secret para o passo `supabase link` funcionar. |
  | `SUPABASE_ACCESS_TOKEN` | supabase.com → conta → **Access Tokens** → gerar um novo (só aparece uma vez). |
  | `SUPABASE_DB_PASSWORD` | a senha do banco Postgres do projeto hospedado, definida na criação do projeto (Task 13) — não é a `service_role key`. Se perdida, resetar em Supabase → Settings → Database. |

- [ ] (~3 min) Fazer merge/push do trabalho pendente para a branch de deploy (`main`, ou `master` se for a escolhida acima) e esperar os dois workflows da aba **Actions**: "Testes" e "Publicar", ambos verdes. Se "Testes" falhar, parar e investigar antes de seguir — não fazer novo push por cima.
- [ ] (~3 min) Abrir `https://<sua-conta>.github.io/un-provas-sociais/` (URL também aparece na aba Actions, na execução do "Publicar") e confirmar que a tela de login aparece.

## Antes do próximo deploy de rotina (~5 min)

- [ ] (~1 min) No GitHub, o repositório se chama **exatamente** `un-provas-sociais` — é o `base` do Vite (`vite.config.js`) e o caminho do Pages. Outro nome quebra todos os caminhos do site.
- [ ] (~4 min) No painel do Supabase hospedado, Authentication → URL Configuration: **Site URL** = `https://<usuário-do-GitHub>.github.io/un-provas-sociais/` e o mesmo endereço em **Redirect URLs**. Sem isso, o login com Google volta para o lugar errado.

## Depois do deploy, no site publicado (~12 min)

A produção começa sem depoimentos; o teste cria dois e os apaga no fim.

- [ ] (~5 min) Pela ficha ("Novo depoimento"), criar dois depoimentos de teste, fonte Manual: um com texto `TESTE link sim` e link original `https://exemplo.test/`, outro com texto `TESTE link nao` e sem link.
- [ ] (~4 min) Na lista, filtrar Texto = `TESTE`: "2 depoimentos". "Tem link original?" = Sim → "1 depoimento" (o com link); = Não → "1 depoimento" (o sem link); = Tanto faz → "2 depoimentos". Copiar a URL com um dos filtros, abrir noutra aba: mesmos filtros e mesmo resultado.
- [ ] (~3 min) Limpar no SQL Editor do painel: `select count(*) from depoimento where texto_completo like 'TESTE%';` deve dar `2`; então `delete from depoimento where texto_completo like 'TESTE%';` — apaga 2 linhas (tipos e participações vão em cascata). Se a contagem não for 2, parar e conferir antes de apagar.
