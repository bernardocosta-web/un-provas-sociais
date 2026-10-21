-- ADR 0001 (subprojeto #2, importador do Google).
--
-- 1) Colunas novas em depoimento:
--    id_externo      identificador na fonte (o dep_id_externo do export);
--                    nulo para depoimento manual; unique (fonte, id_externo)
--                    -> o dedupe da importacao e garantido pelo banco.
--                    NULLs nao colidem no unique, entao manuais repetem a vontade.
--    nota            estrelas da avaliacao (1 a 5).
--    autor_foto_url  URL da foto do autor na fonte.
--    imagens         jsonb, sempre array (padrao []), URLs anexadas.
--    Curtidas nao entram (decisao do dono).
--    As colunas herdam a RLS e o GRANT da tabela (0006/0011): nada novo a conceder.
--
-- 2) Transicoes: EM_REVISAO (0018) sai para DISPONIVEL ou DESCARTADO
--    (DESCARTADO ja valia a partir de qualquer estado). Nada entra em
--    EM_REVISAO por UPDATE: o status nasce assim na importacao.
--
-- 3) buscar_depoimentos: copia da 0016 com uma clausula a mais (migracoes sao
--    append-only). Sem filtro de status, EM_REVISAO fica de fora da busca;
--    com o filtro explicito, aparece. Mesma assinatura: o GRANT EXECUTE da
--    0011 continua valendo e testes/rls/privilegios.test.js segue conferindo.

alter table public.depoimento
  add column id_externo     text,
  add column nota           smallint,
  add column autor_foto_url text,
  add column imagens        jsonb not null default '[]'::jsonb,
  add constraint uq_depoimento_fonte_id_externo unique (fonte, id_externo),
  add constraint ck_id_externo_nao_vazio check (id_externo is null or btrim(id_externo) <> ''),
  add constraint ck_nota_estrelas check (nota is null or nota between 1 and 5),
  add constraint ck_imagens_array check (jsonb_typeof(imagens) = 'array');

create or replace function public.valida_transicao_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status_uso = old.status_uso then
    return new;
  end if;

  if new.status_uso = 'DESCARTADO'
     or (old.status_uso = 'DESCARTADO' and new.status_uso = 'DISPONIVEL')
     or (old.status_uso, new.status_uso) in (
          ('DISPONIVEL',  'EM_PRODUCAO'),
          ('EM_PRODUCAO', 'FEITO'),
          ('EM_PRODUCAO', 'DISPONIVEL'),
          ('FEITO',       'POSTADO'),
          ('FEITO',       'EM_PRODUCAO'),
          ('POSTADO',     'FEITO'),
          ('EM_REVISAO',  'DISPONIVEL')
        )
  then
    return new;
  end if;

  raise exception 'transicao de status invalida: % -> %', old.status_uso, new.status_uso
    using errcode = 'check_violation';
end $$;

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

    -- 0019 (ADR 0001): sem filtro de status, EM_REVISAO fica de fora;
    -- so aparece quando pedido explicitamente.
    and (case when coalesce(jsonb_array_length(filtros->'status'), 0) = 0
           then d.status_uso::text <> 'EM_REVISAO'
           else d.status_uso::text in (select jsonb_array_elements_text(filtros->'status'))
         end)

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

    and (filtros->'tem_link_original' is null
      or (filtros->>'tem_link_original')::boolean
         = coalesce(btrim(d.link_original) <> '', false))
  order by d.criado_em desc;
end;
$$;
