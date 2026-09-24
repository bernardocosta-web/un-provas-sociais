-- Grava o depoimento inteiro (pai + tipos, canais, participacoes, notas e
-- resultados) numa transacao so: gravar em cinco tabelas pelo cliente, uma
-- chamada por vez, deixaria lixo se a terceira falhasse.
--
-- SECURITY INVOKER (padrao): roda com os privilegios e a RLS de quem chama,
-- entao so um membro ativo da equipe grava. search_path vazio e tudo
-- qualificado por public. (convencao da Task 11), inclusive os casts de enum.
--
-- Branco vira NULL aqui tambem (defesa em profundidade: prepararFicha, em
-- src/lib/ficha.js, ja faz isso no cliente). Todo texto opcional passa por
-- nullif(btrim(...), ''); todo numero/data/FK/enum opcional passa por
-- nullif(btrim(...), '')::tipo — sem isso, '' vira erro de cast
-- ('' nao e date, bigint, numeric nem valor de enum).
--
-- atualizado_em nao e tocado aqui: o trigger trg_tocar_atualizado_em
-- (0006) e a unica fonte. O update do pai roda em todo salvamento de ficha
-- existente, mesmo quando so os filhos mudaram, e e isso que avanca
-- atualizado_em.
create or replace function public.salvar_depoimento(p_ficha jsonb)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_id   bigint := nullif(btrim(p_ficha->>'id'), '')::bigint;
  v_part jsonb;
  v_pid  bigint;
  v_item jsonb;
begin
  if v_id is null then
    insert into public.depoimento (
      texto_completo, resumo_curto, autor_bruto, autor_contato_bruto, fonte,
      link_original, data_depoimento, print_path, aluno_id,
      autorizacao_publicacao, status_uso, data_postagem, link_post,
      motivo_descarte, observacao_descarte)
    values (
      p_ficha->>'texto_completo',
      nullif(btrim(p_ficha->>'resumo_curto'), ''),
      nullif(btrim(p_ficha->>'autor_bruto'), ''),
      nullif(btrim(p_ficha->>'autor_contato_bruto'), ''),
      nullif(btrim(p_ficha->>'fonte'), '')::public.fonte_depoimento,
      nullif(btrim(p_ficha->>'link_original'), ''),
      nullif(btrim(p_ficha->>'data_depoimento'), '')::date,
      nullif(btrim(p_ficha->>'print_path'), ''),
      nullif(btrim(p_ficha->>'aluno_id'), '')::bigint,
      coalesce(nullif(btrim(p_ficha->>'autorizacao_publicacao'), '')
                 ::public.autorizacao_publicacao, 'NAO_INFORMADO'),
      coalesce(nullif(btrim(p_ficha->>'status_uso'), '')::public.status_uso,
               'DISPONIVEL'),
      nullif(btrim(p_ficha->>'data_postagem'), '')::date,
      nullif(btrim(p_ficha->>'link_post'), ''),
      nullif(btrim(p_ficha->>'motivo_descarte'), '')::public.motivo_descarte,
      nullif(btrim(p_ficha->>'observacao_descarte'), ''))
    returning id into v_id;
  else
    -- autorizacao_publicacao e status_uso sao not null: ausentes na ficha,
    -- mantem o valor atual em vez de estourar.
    update public.depoimento set
      texto_completo = p_ficha->>'texto_completo',
      resumo_curto = nullif(btrim(p_ficha->>'resumo_curto'), ''),
      autor_bruto = nullif(btrim(p_ficha->>'autor_bruto'), ''),
      autor_contato_bruto = nullif(btrim(p_ficha->>'autor_contato_bruto'), ''),
      fonte = nullif(btrim(p_ficha->>'fonte'), '')::public.fonte_depoimento,
      link_original = nullif(btrim(p_ficha->>'link_original'), ''),
      data_depoimento = nullif(btrim(p_ficha->>'data_depoimento'), '')::date,
      print_path = nullif(btrim(p_ficha->>'print_path'), ''),
      aluno_id = nullif(btrim(p_ficha->>'aluno_id'), '')::bigint,
      autorizacao_publicacao = coalesce(
        nullif(btrim(p_ficha->>'autorizacao_publicacao'), '')
          ::public.autorizacao_publicacao,
        autorizacao_publicacao),
      status_uso = coalesce(
        nullif(btrim(p_ficha->>'status_uso'), '')::public.status_uso, status_uso),
      data_postagem = nullif(btrim(p_ficha->>'data_postagem'), '')::date,
      link_post = nullif(btrim(p_ficha->>'link_post'), ''),
      motivo_descarte = nullif(btrim(p_ficha->>'motivo_descarte'), '')::public.motivo_descarte,
      observacao_descarte = nullif(btrim(p_ficha->>'observacao_descarte'), '')
    where id = v_id;
    -- id inexistente (ou invisivel pela RLS) nao pode seguir para os filhos
    -- e falhar com um erro de chave estrangeira que nao explica nada.
    if not found then
      raise exception 'Depoimento % não encontrado.', v_id using errcode = 'P0002';
    end if;
  end if;

  -- Substituicao total dos filhos: mais simples e mais seguro que
  -- reconciliar item a item, e o volume por depoimento e minusculo.
  -- (nota e resultado saem em cascata com participacao.)
  delete from public.depoimento_tipo  where depoimento_id = v_id;
  delete from public.depoimento_canal where depoimento_id = v_id;
  delete from public.participacao     where depoimento_id = v_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_ficha->'tipos', '[]'))
  loop
    insert into public.depoimento_tipo (depoimento_id, tipo)
    values (v_id, (v_item #>> '{}')::public.tipo_depoimento);
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_ficha->'canais', '[]'))
  loop
    insert into public.depoimento_canal (depoimento_id, canal)
    values (v_id, (v_item #>> '{}')::public.canal_un);
  end loop;

  for v_part in select * from jsonb_array_elements(coalesce(p_ficha->'participacoes', '[]'))
  loop
    insert into public.participacao (depoimento_id, prova_id, ano)
    values (v_id,
            nullif(btrim(v_part->>'prova_id'), '')::bigint,
            nullif(btrim(v_part->>'ano'), '')::smallint)
    returning id into v_pid;

    for v_item in select * from jsonb_array_elements(coalesce(v_part->'notas', '[]'))
    loop
      insert into public.nota (participacao_id, materia_id, valor_original, escala, valor_maximo)
      values (v_pid,
              nullif(btrim(v_item->>'materia_id'), '')::bigint,
              nullif(btrim(v_item->>'valor_original'), '')::numeric,
              nullif(btrim(v_item->>'escala'), '')::public.escala_nota,
              nullif(btrim(v_item->>'valor_maximo'), '')::numeric);
    end loop;

    for v_item in select * from jsonb_array_elements(coalesce(v_part->'resultados', '[]'))
    loop
      insert into public.resultado (participacao_id, instituicao_id, curso_id, situacao)
      values (v_pid,
              nullif(btrim(v_item->>'instituicao_id'), '')::bigint,
              nullif(btrim(v_item->>'curso_id'), '')::bigint,
              nullif(btrim(v_item->>'situacao'), '')::public.situacao_resultado);
    end loop;
  end loop;

  return v_id;
end $$;

revoke all on function public.salvar_depoimento(jsonb) from public, anon, service_role;
grant execute on function public.salvar_depoimento(jsonb) to authenticated;
