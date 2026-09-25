# Marco 6 — checklist manual (total: ~17 min)

Só o que não dá para automatizar (`CLAUDE.md`, seção 5). O Marco 6 acrescenta
os itens dele (backup, anti-pausa, publicação); por enquanto só os itens que
dependem do deploy (Task 25) e vieram do Marco 5.

## Antes do deploy (~5 min)

- [ ] (~1 min) No GitHub, o repositório se chama **exatamente** `un-provas-sociais` — é o `base` do Vite (`vite.config.js`) e o caminho do Pages. Outro nome quebra todos os caminhos do site.
- [ ] (~4 min) No painel do Supabase hospedado, Authentication → URL Configuration: **Site URL** = `https://<usuário-do-GitHub>.github.io/un-provas-sociais/` e o mesmo endereço em **Redirect URLs**. Sem isso, o login com Google volta para o lugar errado.

## Depois do deploy, no site publicado (~12 min)

A produção começa sem depoimentos; o teste cria dois e os apaga no fim.

- [ ] (~5 min) Pela ficha ("Novo depoimento"), criar dois depoimentos de teste, fonte Manual: um com texto `TESTE link sim` e link original `https://exemplo.test/`, outro com texto `TESTE link nao` e sem link.
- [ ] (~4 min) Na lista, filtrar Texto = `TESTE`: "2 depoimentos". "Tem link original?" = Sim → "1 depoimento" (o com link); = Não → "1 depoimento" (o sem link); = Tanto faz → "2 depoimentos". Copiar a URL com um dos filtros, abrir noutra aba: mesmos filtros e mesmo resultado.
- [ ] (~3 min) Limpar no SQL Editor do painel: `select count(*) from depoimento where texto_completo like 'TESTE%';` deve dar `2`; então `delete from depoimento where texto_completo like 'TESTE%';` — apaga 2 linhas (tipos e participações vão em cascata). Se a contagem não for 2, parar e conferir antes de apagar.
