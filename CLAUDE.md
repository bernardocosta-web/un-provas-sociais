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
- **`nota.percentual` é coluna gerada.** Nenhum código a escreve. Não
  transformar em coluna comum "para simplificar".
- **Nenhum dado real no repositório** — nem de aluno, nem de e-mail da equipe.
  Fixtures são inventadas, com domínio `@exemplo.test`.
- **`anon key` é publicável; `service_role key` nunca sai dos Secrets.**
- **Filtros valem no nível do depoimento**, satisfeitos por qualquer
  participação. Não "consertar" para `JOIN` na mesma participação — existe um
  teste nomeado que reprova essa mudança, e ele está certo.
- **Lógica pura em `src/lib/`**, sem Vue e sem Supabase.

## 4. Como trabalhar aqui

Brainstorm → plano → TDD → commit pequeno. Decisões de arquitetura viram ADR em
`docs/decisions/`. Instruções diretas do Bernardo têm precedência sobre skills.
