# CLAUDE.md — UN Provas Sociais

Constituição do projeto. Leia por inteiro antes de qualquer ação.

## 1. O que é

Dashboard para centralizar, classificar e filtrar depoimentos de alunos do
Universo Narrado, preparando posts de prova social no Instagram. Subprojeto #1
de quatro — ver `docs/superpowers/specs/`.

## 2. Stack

Site estático no GitHub Pages sobre Supabase (Postgres, Auth, Storage). Sem
back-end próprio. Vite + Vue 3. Vitest. Interface e documentação em pt-BR.

## 3. Invariantes — o que NUNCA quebrar

- **RLS em toda tabela de `public`.** Tabela nova sem RLS reprova a suíte. RLS
  desligada entrega o dado para a internet inteira, e nada no código denuncia.
- **`GRANT` explícito para toda tabela e função usada pelo app**, na migração
  que a cria, tabela por tabela (nunca `on all tables`). O projeto hospedado
  não expõe tabelas novas automaticamente, e o local foi igualado a ele na
  `0011_privilegios.sql`: sem `GRANT`, o app recebe "permission denied" — e o
  local agora falha igual. `authenticated` recebe o CRUD (a RLS decide as
  linhas), só `select` em `membro_equipe`; `anon` não recebe nada. Existe teste
  de catálogo (`testes/rls/privilegios.test.js`) que reprova tabela sem
  `GRANT` e função com `EXECUTE` para quem não deve.
- **`nota.percentual` é coluna gerada.** Nenhum código a escreve. Não
  transformar em coluna comum "para simplificar".
- **Nenhum dado real no repositório** — nem de aluno, nem de e-mail da equipe.
  Fixtures são inventadas, com domínio `@exemplo.test`.
- **`anon key` é publicável; `service_role key` nunca sai dos Secrets.**
- **Filtros valem no nível do depoimento**, satisfeitos por qualquer
  participação. Não "consertar" para `JOIN` na mesma participação — existe um
  teste nomeado que reprova essa mudança, e ele está certo.
- **Lógica pura em `src/lib/`**, sem Vue e sem Supabase.
- **Login só pelo Google.** Todo outro provedor (e-mail/senha, magic
  link/OTP, telefone, anônimo) fica desligado, tanto em
  `supabase/config.toml` quanto no painel hospedado. `eh_membro_equipe()`
  confia no e-mail do JWT (`auth.jwt() ->> 'email'`); qualquer provedor que
  emita e-mail não comprovado entrega a base a quem simplesmente digitar o
  e-mail de um membro da equipe. O e-mail do JWT só pode vir de um endereço
  comprovado: confirmação de e-mail (`auth.email.enable_confirmations`) e
  troca segura de e-mail (`auth.email.double_confirm_changes`, confirma nos
  dois endereços) ficam sempre ligadas — nunca "desligar para simplificar
  teste". Existe um teste nomeado (`testes/auth/provedores.test.js`) que
  reprova essa mudança.

## 4. Como trabalhar aqui

Brainstorm → plano → TDD → commit pequeno. Decisões de arquitetura viram ADR em
`docs/decisions/`. Instruções diretas do Bernardo têm precedência sobre skills.
Arquivos em UTF-8 sem BOM; `testes/repo/sem_bom.test.js` reprova quem tiver.
