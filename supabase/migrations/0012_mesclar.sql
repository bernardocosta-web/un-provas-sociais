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

-- Grava uma instituicao (insert sem id, update com id — id e generated
-- always) e substitui TODOS os seus apelidos, numa transacao so.
--
-- Por que isto e uma funcao e nao tres chamadas do client (update
-- instituicao -> delete apelidos -> insert apelidos): apelido e unico
-- globalmente (instituicao_apelido.apelido). Com tres chamadas separadas, um
-- apelido colidindo com o de outra instituicao so falhava na insercao, DEPOIS
-- de logo_path ja ter sido trocado — a instituicao ficava com uma logo nova e
-- nenhum apelido. Aqui, se a insercao dos apelidos falhar (23505), a
-- transacao inteira desfaz, inclusive o update de instituicao.
--
-- SECURITY INVOKER (padrao): roda com os privilegios e a RLS de quem chama.
-- search_path vazio e tudo qualificado por public. (convencao da Task 11).
--
-- p_dados: {"id"?: bigint, "nome_canonico": text, "logo_path"?: text,
-- "ativo"?: boolean, "apelidos"?: text[]}. "id" ausente ou nulo insere;
-- presente, atualiza (erro se nao existir). "ativo" ausente preserva o valor
-- atual no update, ou usa o default true no insert.
create or replace function public.salvar_instituicao(p_dados jsonb)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_id bigint;
  v_apelidos text[];
begin
  v_id := (p_dados->>'id')::bigint;

  if v_id is null then
    insert into public.instituicao (nome_canonico, logo_path, ativo)
    values (
      p_dados->>'nome_canonico',
      p_dados->>'logo_path',
      coalesce((p_dados->>'ativo')::boolean, true))
    returning id into v_id;
  else
    update public.instituicao set
      nome_canonico = p_dados->>'nome_canonico',
      logo_path = p_dados->>'logo_path',
      ativo = coalesce((p_dados->>'ativo')::boolean, ativo)
    where id = v_id;
    if not found then
      raise exception 'instituicao % nao existe', v_id;
    end if;
  end if;

  delete from public.instituicao_apelido where instituicao_id = v_id;

  select array_agg(valor) into v_apelidos
    from jsonb_array_elements_text(coalesce(p_dados->'apelidos', '[]'::jsonb)) as valor;

  if v_apelidos is not null then
    insert into public.instituicao_apelido (instituicao_id, apelido)
    select v_id, apelido from unnest(v_apelidos) as apelido;
  end if;

  return v_id;
end $$;

revoke all on function public.salvar_instituicao(jsonb) from public, anon, service_role;
grant execute on function public.salvar_instituicao(jsonb) to authenticated;
