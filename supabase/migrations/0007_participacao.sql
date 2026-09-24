create table participacao (
  id            bigint generated always as identity primary key,
  depoimento_id bigint not null references depoimento(id) on delete cascade,
  prova_id      bigint not null references prova(id) on delete restrict,
  ano           smallint not null,
  constraint ck_ano check (ano between 1990 and 2100)
);
create index on participacao (depoimento_id);
create index on participacao (ano);

create table nota (
  id              bigint generated always as identity primary key,
  participacao_id bigint not null references participacao(id) on delete cascade,
  materia_id      bigint not null references materia(id) on delete restrict,
  valor_original  numeric(8,2) not null,
  escala          escala_nota not null,
  valor_maximo    numeric(8,2),

  -- Coluna GERADA. Nenhum codigo a escreve, logo ela nao tem como
  -- divergir do valor original. TRI nunca vira percentual.
  percentual numeric(6,2) generated always as (
    case escala
      when 'PERCENTUAL' then valor_original
      when 'PONTOS'     then round(valor_original / valor_maximo * 100, 2)
      else null
    end
  ) stored,

  -- Regra 2: "18 de 20" sem o 20 e dado inutil.
  constraint ck_pontos_exige_maximo
    check (escala <> 'PONTOS' or (valor_maximo is not null and valor_maximo > 0))
);
create index on nota (participacao_id);
create index on nota (materia_id, percentual);

create table resultado (
  id              bigint generated always as identity primary key,
  participacao_id bigint not null references participacao(id) on delete cascade,
  instituicao_id  bigint references instituicao(id) on delete restrict,
  curso_id        bigint references curso(id) on delete set null,
  situacao        situacao_resultado not null,

  -- Regra 3: aprovado em lugar nenhum nao existe.
  constraint ck_aprovado_exige_instituicao
    check (situacao <> 'APROVADO' or instituicao_id is not null)
);
create index on resultado (participacao_id);
create index on resultado (instituicao_id);

do $$
declare t text;
begin
  foreach t in array array['participacao','nota','resultado']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all using (public.eh_membro_equipe())
         with check (public.eh_membro_equipe())',
      t || '_equipe', t);
  end loop;
end $$;
