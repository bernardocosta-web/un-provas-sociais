# ADR 0001 — Importador de avaliações do Google (subprojeto #2)

**Data:** 2026-10-21 · **Status:** aceita (decisões do dono, Bernardo)

## Contexto

O primeiro importador do subprojeto #2 lê o export CSV que o time tech gera
do banco deles (`depoimentos.csv`, colunas `dep_*`). O núcleo (#1) não tinha
onde guardar o identificador externo, a nota em estrelas, a foto do autor nem
as imagens anexadas, e não tinha um status para depoimentos que ainda não
estão prontos para uso (os `rascunho` do export).

## Decisões

1. **Identificador externo próprio.** Coluna `depoimento.id_externo` (texto,
   nulo para depoimentos manuais) com `unique (fonte, id_externo)`. O dedupe da
   importação é garantido pelo banco, não só pelo script. `autor_contato_bruto`
   volta a ser só contato (o @ do Forms) e não recebe o id do Google.
2. **Texto original no banco.** `texto_completo` guarda o texto exatamente
   como veio (com o markdown `**`). A remoção do markdown acontece só na
   exibição (`src/lib/lista.js`, `semMarkdown`). Assim nada se perde e a regra
   de exibição pode mudar sem reimportar.
3. **Status `EM_REVISAO`.** Valor novo de `status_uso`, para os `rascunho` do
   export. Fica **fora da busca padrão**: sem filtro de status,
   `buscar_depoimentos` não devolve `EM_REVISAO`; com o filtro explícito, devolve.
   Transições novas: `EM_REVISAO → DISPONIVEL` e `EM_REVISAO → DESCARTADO`
   (esta já valia para qualquer estado).
4. **Campos da fonte que entram:** `nota` (smallint, 1–5), `autor_foto_url`
   (texto) e `imagens` (jsonb, sempre array, padrão `[]`). Curtidas não entram.
5. **Credencial do dry-run.** O script lê `SUPABASE_URL` e
   `SUPABASE_SERVICE_ROLE_KEY` de `importadores/.env` (ignorado pelo Git pelo
   padrão `.env`). Nunca do `.env` do Vite: lá só pode haver a anon key, e
   variável com prefixo `VITE_` vai para o bundle publicado.

## Consequências

- O enum ganha valor numa migração isolada (`0018`), porque um valor novo
  de enum não pode ser usado na mesma transação em que é criado. As colunas, a
  trigger de transição e a busca vão na `0019`.
- A busca é uma cópia da `0016` com uma cláusula a mais (migrações são
  append-only). A assinatura não muda, então o `GRANT EXECUTE` da `0011` vale.
- A inserção pelo importador ainda não existe: só o dry-run. Habilitá-la é o
  próximo passo, depois de a `0018`/`0019` estarem no hospedado.
