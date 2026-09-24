-- SECURITY INVOKER (padrao): a RLS continua valendo dentro da funcao.
--
-- p_filtros (todo campo opcional; ausente OU null == "nao filtra por isso",
-- normalizado uma unica vez com jsonb_strip_nulls; lista vazia [] tambem
-- significa "nao filtra", em toda familia):
--   texto        text      (busca literal em texto_completo/resumo_curto;
--                            % _ e \ sao escapados, nao agem como coringa)
--   fontes       text[]    (fonte_depoimento)
--   status       text[]    (status_uso)
--   tipos        text[]    (tipo_depoimento)
--   canais       text[]    (canal_un)
--   ano          smallint  (igualdade exata)
--   ano_de       smallint  (faixa inclusiva; combina com ano_ate)
--   ano_ate      smallint  (faixa inclusiva; combina com ano_de)
--   provas       bigint[]
--   instituicoes bigint[]  (via resultado.situacao = 'APROVADO')
--   cursos       bigint[]  (via resultado.curso_id)
--   notas        {materia_id, minimo, operador}[]
--                  operador: '>=' (padrao se ausente) ou '=' — qualquer
--                  outro valor derruba a chamada com excecao.
--   tri          {materia_id, minimo}[]  (sempre >=; familia separada,
--                  nunca le percentual — TRI nao vira percentual)
--   tem_print    boolean
create or replace function public.buscar_depoimentos(p_filtros jsonb default '{}'::jsonb)
returns setof public.depoimento
language plpgsql
stable
set search_path = ''
as $$
declare
  -- Normalizacao unica: chave ausente e chave com null explicito viram a
  -- mesma coisa (ausente), e p_filtros nulo vira objeto vazio. A partir
  -- daqui a funcao inteira le "filtros", nunca p_filtros diretamente.
  filtros jsonb := jsonb_strip_nulls(coalesce(p_filtros, '{}'::jsonb));
  texto_escapado text;
  item_nota jsonb;
  operador_nota text;
begin
  -- % _ e \ sao coringas do ILIKE: escapa para que texto seja busca
  -- literal, nao padrao. replace do '\' vem primeiro, senao os '\' que
  -- os replaces seguintes inserem seriam escapados de novo.
  texto_escapado := replace(replace(replace(filtros->>'texto', '\', '\\'), '%', '\%'), '_', '\_');

  -- Valida o operador de cada condicao de nota ANTES de rodar a busca:
  -- falha cedo com causa clara, em vez de tratar valor invalido como
  -- ">=" silenciosamente.
  for item_nota in select * from jsonb_array_elements(coalesce(filtros->'notas', '[]'::jsonb))
  loop
    operador_nota := item_nota->>'operador';
    if operador_nota is not null and operador_nota not in ('=', '>=') then
      raise exception 'operador invalido: %', operador_nota;
    end if;
  end loop;

  return query
  select d.*
  from public.depoimento d
  where
    -- Cada condicao e um EXISTS independente sobre as participacoes do
    -- depoimento. O AND acontece no nivel do depoimento, NAO da participacao.
    (filtros->'texto' is null
      or d.texto_completo ilike '%' || texto_escapado || '%'
      or coalesce(d.resumo_curto, '') ilike '%' || texto_escapado || '%')

    and (coalesce(jsonb_array_length(filtros->'fontes'), 0) = 0
      or d.fonte::text in (select jsonb_array_elements_text(filtros->'fontes')))

    and (coalesce(jsonb_array_length(filtros->'status'), 0) = 0
      or d.status_uso::text in (select jsonb_array_elements_text(filtros->'status')))

    and (coalesce(jsonb_array_length(filtros->'tipos'), 0) = 0 or exists (
      select 1 from public.depoimento_tipo dt
      where dt.depoimento_id = d.id
        and dt.tipo::text in (select jsonb_array_elements_text(filtros->'tipos'))))

    and (coalesce(jsonb_array_length(filtros->'canais'), 0) = 0 or exists (
      select 1 from public.depoimento_canal dc
      where dc.depoimento_id = d.id
        and dc.canal::text in (select jsonb_array_elements_text(filtros->'canais'))))

    and (filtros->'ano' is null or exists (
      select 1 from public.participacao p
      where p.depoimento_id = d.id and p.ano = (filtros->>'ano')::smallint))

    -- Faixa de ano: cada lado e opcional; -32768/32767 (limites de
    -- smallint) fazem o lado ausente nao restringir nada.
    and ((filtros->'ano_de' is null and filtros->'ano_ate' is null) or exists (
      select 1 from public.participacao p
      where p.depoimento_id = d.id
        and p.ano >= coalesce((filtros->>'ano_de')::smallint, (-32768)::smallint)
        and p.ano <= coalesce((filtros->>'ano_ate')::smallint, 32767::smallint)))

    and (coalesce(jsonb_array_length(filtros->'provas'), 0) = 0 or exists (
      select 1 from public.participacao p
      where p.depoimento_id = d.id
        and p.prova_id in (
          select (jsonb_array_elements_text(filtros->'provas'))::bigint)))

    and (coalesce(jsonb_array_length(filtros->'instituicoes'), 0) = 0 or exists (
      select 1 from public.participacao p
      join public.resultado r on r.participacao_id = p.id
      where p.depoimento_id = d.id
        and r.situacao = 'APROVADO'
        and r.instituicao_id in (
          select (jsonb_array_elements_text(filtros->'instituicoes'))::bigint)))

    and (coalesce(jsonb_array_length(filtros->'cursos'), 0) = 0 or exists (
      select 1 from public.participacao p
      join public.resultado r on r.participacao_id = p.id
      where p.depoimento_id = d.id
        and r.curso_id in (
          select (jsonb_array_elements_text(filtros->'cursos'))::bigint)))

    -- N condicoes de nota somadas: "nao existe condicao insatisfeita".
    -- Resolve numero arbitrario de condicoes com SQL estatico. Operador
    -- ja validado acima: aqui so sobra '>=' (padrao) ou '='.
    and (coalesce(jsonb_array_length(filtros->'notas'), 0) = 0 or not exists (
      select 1 from jsonb_array_elements(filtros->'notas') cond
      where not exists (
        select 1 from public.participacao p
        join public.nota n on n.participacao_id = p.id
        where p.depoimento_id = d.id
          and n.materia_id = (cond->>'materia_id')::bigint
          and n.percentual is not null
          and (
            case coalesce(cond->>'operador', '>=')
              when '=' then n.percentual = (cond->>'minimo')::numeric
              else n.percentual >= (cond->>'minimo')::numeric
            end
          ))))

    -- TRI e familia separada: nunca vira percentual, filtro proprio.
    and (coalesce(jsonb_array_length(filtros->'tri'), 0) = 0 or not exists (
      select 1 from jsonb_array_elements(filtros->'tri') cond
      where not exists (
        select 1 from public.participacao p
        join public.nota n on n.participacao_id = p.id
        where p.depoimento_id = d.id
          and n.escala = 'TRI'
          and n.materia_id = (cond->>'materia_id')::bigint
          and n.valor_original >= (cond->>'minimo')::numeric)))

    and (filtros->'tem_print' is null
      or (filtros->>'tem_print')::boolean = (d.print_path is not null))
  order by d.criado_em desc;
end;
$$;
