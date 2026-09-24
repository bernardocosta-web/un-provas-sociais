-- Remove cadastros de referencia (instituicao, prova, curso, materia) quando
-- SEM uso; recusa em pt-BR, dizendo onde esta em uso, quando EM uso. Pedido
-- do dono (Task 17c): dado cadastrado errado ou duplicado hoje so podia ser
-- editado ou (no caso de instituicao) mesclado — nunca apagado.
--
-- SECURITY INVOKER (padrao, sem a palavra-chave): roda com os privilegios e
-- a RLS de quem chama, como mesclar_instituicoes/salvar_instituicao (0012).
-- Nao-membro nao enxerga a linha (RLS de SELECT) nem apaga (RLS de DELETE) —
-- ambas usam a mesma politica (eh_membro_equipe()), entao a checagem inicial
-- (um SELECT simples) ja cobre os dois casos: id inexistente e id invisivel
-- pela RLS levam a mesma excecao "nao existe" (mesmo padrao da 0012, ver o
-- teste do estranho em remover_cadastros_estranho.test.js).
--
-- Checagem de uso e delete na MESMA funcao/transacao: atomico, nao depende
-- da ordem de chamadas do cliente. A FK "on delete restrict" (resultado,
-- participacao, nota) continua como rede de seguranca por baixo — se um dia
-- a contagem de uso divergir da FK, o delete falha com 23503 em vez de
-- apagar em silencio.
--
-- "on delete set null" TAMBEM conta como uso (prova.instituicao_id,
-- resultado.curso_id): apagar sem avisar mudaria prova/resultado existentes
-- por baixo — silencioso demais para um cadastro de referencia.

-- instituicao: apelidos somem sozinhos (instituicao_apelido e "on delete
-- cascade", 0003). A logo NAO e apagada aqui — o Supabase nao deixa apagar
-- de storage.objects por SQL (so pela Storage API, ver storage.protect_delete
-- na Task 17); devolve o logo_path para quem chama remover o arquivo do
-- bucket "logos" DEPOIS de a remocao confirmar (removerInstituicao,
-- src/dados/referencia.js), igual mesclar_instituicoes faz com a perdedora.
create or replace function public.remover_instituicao(p_id bigint)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_nome text;
  v_logo text;
  v_resultados int;
  v_provas int;
begin
  select nome_canonico, logo_path into v_nome, v_logo
    from public.instituicao where id = p_id;
  if v_nome is null then
    raise exception 'instituição % não existe', p_id;
  end if;

  select count(*) into v_resultados from public.resultado where instituicao_id = p_id;
  select count(*) into v_provas     from public.prova     where instituicao_id = p_id;

  if v_resultados > 0 or v_provas > 0 then
    raise exception
      '"%" está em uso em % resultado(s) e % prova(s). Para juntar com outra instituição, use Mesclar.',
      v_nome, v_resultados, v_provas;
  end if;

  delete from public.instituicao where id = p_id;

  return v_logo;
end $$;

revoke all on function public.remover_instituicao(bigint) from public, anon, service_role;
grant execute on function public.remover_instituicao(bigint) to authenticated;

-- prova, curso e materia: mesma forma (checa uso, apaga), uma funcao so em
-- vez de tres identicas. p_tabela e validado contra uma lista fechada de tres
-- valores literais (if/elsif) — nunca SQL dinamico com texto livre (nada de
-- EXECUTE format(%I, p_tabela)): um p_tabela que nao bater com nenhum dos
-- tres cai no "else" e e recusado.
create or replace function public.remover_cadastro_simples(p_tabela text, p_id bigint)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_nome text;
  v_uso int;
begin
  if p_tabela = 'prova' then
    select nome into v_nome from public.prova where id = p_id;
    if v_nome is null then
      raise exception 'prova % não existe', p_id;
    end if;

    select count(*) into v_uso from public.participacao where prova_id = p_id;
    if v_uso > 0 then
      raise exception 'A prova "%" está em uso em % participação(ões).', v_nome, v_uso;
    end if;

    delete from public.prova where id = p_id;

  elsif p_tabela = 'curso' then
    select nome into v_nome from public.curso where id = p_id;
    if v_nome is null then
      raise exception 'curso % não existe', p_id;
    end if;

    select count(*) into v_uso from public.resultado where curso_id = p_id;
    if v_uso > 0 then
      raise exception 'O curso "%" está em uso em % resultado(s).', v_nome, v_uso;
    end if;

    delete from public.curso where id = p_id;

  elsif p_tabela = 'materia' then
    select nome into v_nome from public.materia where id = p_id;
    if v_nome is null then
      raise exception 'matéria % não existe', p_id;
    end if;

    select count(*) into v_uso from public.nota where materia_id = p_id;
    if v_uso > 0 then
      raise exception 'A matéria "%" está em uso em % nota(s).', v_nome, v_uso;
    end if;

    delete from public.materia where id = p_id;

  else
    raise exception 'tabela "%" inválida', p_tabela;
  end if;
end $$;

revoke all on function public.remover_cadastro_simples(text, bigint) from public, anon, service_role;
grant execute on function public.remover_cadastro_simples(text, bigint) to authenticated;
