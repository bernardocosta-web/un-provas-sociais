# Marco 5 — checklist manual (total: ~16 min)

Só o que não dá para automatizar (`CLAUDE.md`, seção 5). A lista, os filtros,
as abas, a URL e o critério de pronto já são cobertos por
`e2e/lista.spec.js` e `e2e/lista-filtros.spec.js`. A conferência no site
publicado fica para o Marco 6 (o deploy é a Task 25): `docs/checklists/marco-6.md`.

## Produção: migração 0016 (~8 min)

- [ ] (~2 min) `npx supabase migration list` — do lado remoto, todas até a `0015`; só a `0016_busca_link_original` falta.
- [ ] (~1 min) `npx supabase db push --dry-run` — lista **só** a `0016_busca_link_original.sql`. Se aparecer outra, parar.
- [ ] (~2 min) `npx supabase db push` — termina sem erro.
- [ ] (~3 min) No SQL Editor do painel: `select proacl, prosrc like '%tem_link_original%' as tem_filtro from pg_proc where proname = 'buscar_depoimentos';` — esperado `{postgres=X/postgres,authenticated=X/postgres} | true` (nada para `anon` nem `public`, e a função já é a da 0016).

## Aparência e produto (~8 min)

As telas estão em `docs/checklists/marco-5-telas/` (dados inventados de e2e;
para refazer: `npx supabase start` e `npm run test:e2e:capturas`).

- [ ] (~4 min) Lista em cada aba — `lista-todos.png`, `lista-google.png`, `lista-forms.png`, `lista-manual.png`: painel à esquerda, colunas de cada aba e o destaque (fundo amarelo; autorização em negrito só no Forms) estão bons para a equipe? — decisão do dono.
- [ ] (~2 min) Painel com condições — `painel-com-condicoes.png` (Física = 100%, Matemática TRI ≥ 700, instituição ITA): percentual e TRI em controles separados ficaram claros? — decisão do dono.
- [ ] (~1 min) "Limpar filtros" mantém a aba escolhida (hoje mantém) — é isso que a equipe espera? — decisão do dono.
- [ ] (~1 min) Ficha — `ficha.png`: ela só tem "Voltar" no estado de erro; da ficha, volta-se à lista com os filtros pelo Voltar do navegador. Quer um botão "Voltar à lista" na ficha? — decisão do dono.
