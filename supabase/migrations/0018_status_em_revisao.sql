-- ADR 0001 (subprojeto #2, importador do Google): status para depoimento
-- importado que ainda nao esta pronto para uso (os "rascunho" do export).
--
-- Fica sozinho nesta migracao: um valor novo de enum nao pode ser usado na
-- mesma transacao em que e criado. A trigger de transicao e a busca que o
-- referenciam vem na 0019.
alter type public.status_uso add value 'EM_REVISAO';
