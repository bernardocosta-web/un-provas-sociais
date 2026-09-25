# Marco 5 — checklist manual (total: ~15 min)

Só o que não dá para automatizar (`CLAUDE.md`, seção 5). A lista, os filtros,
as abas, a URL e o critério de pronto já são cobertos por
`e2e/lista.spec.js` e `e2e/lista-filtros.spec.js`.

- [ ] (~3 min) Aplicar a migração `0016_busca_link_original.sql` no projeto hospedado — sem erro; `buscar_depoimentos` continua com `EXECUTE` só para `authenticated`.
- [ ] (~5 min) No site publicado, depois do deploy: abrir a lista, filtrar "Tem link original? Sim" e uma instituição — a contagem muda e a URL copiada abre com os mesmos filtros.
- [ ] (~4 min) Aparência da lista: painel à esquerda, colunas de cada aba (Todos, Google, Forms, Manual) e destaque da autorização no Forms estão bons para a equipe? — decisão do dono.
- [ ] (~1 min) "Limpar filtros" mantém a aba escolhida (hoje mantém) — é isso que a equipe espera? — decisão do dono.
- [ ] (~2 min) Da ficha, volta-se à lista com os filtros pelo Voltar do navegador (a ficha só tem "Voltar" no estado de erro). Quer um botão "Voltar à lista" na ficha? — decisão do dono.
