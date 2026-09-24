-- Mescla duas instituicoes: o nome da perdedora vira apelido da vencedora,
-- resultados, provas e apelidos migram, e a perdedora e apagada — tudo numa
-- transacao so.
--
-- SECURITY INVOKER (padrao): roda com os privilegios e a RLS de quem chama.
-- search_path vazio e tudo qualificado por public. (convencao da Task 11).
--
-- Devolve o logo_path da perdedora (ou null). O arquivo nao e apagado aqui:
-- o Supabase nao deixa apagar de storage.objects por SQL (so pela Storage
-- API), entao quem chama remove o arquivo do bucket logos depois de a
-- mesclagem confirmar (mesclarInstituicoes, src/dados/referencia.js).
create or replace function public.mesclar_instituicoes(
  p_vencedor bigint, p_perdedor bigint)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_nome_perdedor text;
  v_logo_perdedor text;
begin
  if p_vencedor = p_perdedor then
    raise exception 'nao da para mesclar uma instituicao com ela mesma';
  end if;

  if not exists (select 1 from public.instituicao where id = p_vencedor) then
    raise exception 'instituicao vencedora % nao existe', p_vencedor;
  end if;

  select nome_canonico, logo_path into v_nome_perdedor, v_logo_perdedor
    from public.instituicao where id = p_perdedor;
  if v_nome_perdedor is null then
    raise exception 'instituicao perdedora % nao existe', p_perdedor;
  end if;

  update public.resultado set instituicao_id = p_vencedor where instituicao_id = p_perdedor;
  update public.prova     set instituicao_id = p_vencedor where instituicao_id = p_perdedor;

  update public.instituicao_apelido set instituicao_id = p_vencedor
   where instituicao_id = p_perdedor;

  insert into public.instituicao_apelido (instituicao_id, apelido)
  values (p_vencedor, v_nome_perdedor)
  on conflict (apelido) do nothing;

  delete from public.instituicao where id = p_perdedor;

  return v_logo_perdedor;
end $$;

revoke all on function public.mesclar_instituicoes(bigint, bigint) from public, anon, service_role;
grant execute on function public.mesclar_instituicoes(bigint, bigint) to authenticated;
