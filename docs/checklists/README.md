# Checklists manuais por marco

Um arquivo por marco: `marco-N.md` (ex.: `marco-4.md`). Cada um é o único
checklist manual daquele marco — curto, para o Bernardo rodar de uma vez.

## O que entra

Só itens das três categorias que não dá para automatizar (regra do dono,
`CLAUDE.md`, seção 5):

1. **Contas ou credenciais do Bernardo** — Google Cloud, painel do Supabase
   hospedado, GitHub (Secrets, Pages).
2. **Produção** — o site publicado e o projeto hospedado (ex.: aplicar uma
   migração, conferir o login de verdade com Google).
3. **Decisões de produto ou de aparência** — "o texto está claro?", "a tela
   está boa?".

Todo o resto é teste automatizado (vitest em `testes/`, e2e em `e2e/`) e não
entra no checklist. Se um item poderia ser automatizado, ele vira teste, não
linha de checklist.

## Formato

- Um item por linha, como caixa de seleção, dizendo **o que fazer** e **o que
  esperar**.
- Tempo estimado em cada item e o **total** no topo do arquivo.

```markdown
# Marco N — checklist manual (total: ~10 min)

- [ ] (~3 min) Aplicar a migração 00XX no projeto hospedado — sem erro no painel.
- [ ] (~5 min) Entrar com Google no site publicado — a tela de Cadastros abre.
- [ ] (~2 min) Rótulos da ficha claros para a equipe? — decisão do dono.
```
