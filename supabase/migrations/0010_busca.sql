-- SECURITY INVOKER (padrao): a RLS continua valendo dentro da funcao.
create or replace function public.buscar_depoimentos(p_filtros jsonb default '{}'::jsonb)
returns setof depoimento
language sql
stable
as $$
  select d.*
  from depoimento d
  where
    -- Cada condicao e um EXISTS independente sobre as participacoes do
    -- depoimento. O AND acontece no nivel do depoimento, NAO da participacao.
    (p_filtros->'texto' is null
      or d.texto_completo ilike '%' || (p_filtros->>'texto') || '%'
      or coalesce(d.resumo_curto, '') ilike '%' || (p_filtros->>'texto') || '%')

    and (p_filtros->'fontes' is null
      or d.fonte::text in (select jsonb_array_elements_text(p_filtros->'fontes')))

    and (p_filtros->'status' is null
      or d.status_uso::text in (select jsonb_array_elements_text(p_filtros->'status')))

    and (p_filtros->'tipos' is null or exists (
      select 1 from depoimento_tipo dt
      where dt.depoimento_id = d.id
        and dt.tipo::text in (select jsonb_array_elements_text(p_filtros->'tipos'))))

    and (p_filtros->'canais' is null or exists (
      select 1 from depoimento_canal dc
      where dc.depoimento_id = d.id
        and dc.canal::text in (select jsonb_array_elements_text(p_filtros->'canais'))))

    and (p_filtros->'ano' is null or exists (
      select 1 from participacao p
      where p.depoimento_id = d.id and p.ano = (p_filtros->>'ano')::smallint))

    and (p_filtros->'provas' is null or exists (
      select 1 from participacao p
      where p.depoimento_id = d.id
        and p.prova_id in (
          select (jsonb_array_elements_text(p_filtros->'provas'))::bigint)))

    and (p_filtros->'instituicoes' is null or exists (
      select 1 from participacao p
      join resultado r on r.participacao_id = p.id
      where p.depoimento_id = d.id
        and r.situacao = 'APROVADO'
        and r.instituicao_id in (
          select (jsonb_array_elements_text(p_filtros->'instituicoes'))::bigint)))

    and (p_filtros->'cursos' is null or exists (
      select 1 from participacao p
      join resultado r on r.participacao_id = p.id
      where p.depoimento_id = d.id
        and r.curso_id in (
          select (jsonb_array_elements_text(p_filtros->'cursos'))::bigint)))

    -- N condicoes de nota somadas: "nao existe condicao insatisfeita".
    -- Resolve numero arbitrario de condicoes com SQL estatico.
    and (p_filtros->'notas' is null or not exists (
      select 1 from jsonb_array_elements(p_filtros->'notas') cond
      where not exists (
        select 1 from participacao p
        join nota n on n.participacao_id = p.id
        where p.depoimento_id = d.id
          and n.materia_id = (cond->>'materia_id')::bigint
          and n.percentual is not null
          and n.percentual >= (cond->>'minimo')::numeric)))

    -- TRI e familia separada: nunca vira percentual, filtro proprio.
    and (p_filtros->'tri' is null or not exists (
      select 1 from jsonb_array_elements(p_filtros->'tri') cond
      where not exists (
        select 1 from participacao p
        join nota n on n.participacao_id = p.id
        where p.depoimento_id = d.id
          and n.escala = 'TRI'
          and n.materia_id = (cond->>'materia_id')::bigint
          and n.valor_original >= (cond->>'minimo')::numeric)))

    and (p_filtros->'tem_print' is null
      or (p_filtros->>'tem_print')::boolean = (d.print_path is not null))
  order by d.criado_em desc;
$$;
