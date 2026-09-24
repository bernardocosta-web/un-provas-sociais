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
  --
  -- O ramo PONTOS retorna nulo sempre que a linha vai ser recusada de
  -- qualquer forma por um dos checks abaixo (valor negativo, maximo ausente
  -- ou invalido, ou valor acima do maximo). A coluna gerada e calculada
  -- ANTES das constraints de check serem avaliadas, entao sem essa guarda
  -- cobrir os quatro casos o Postgres tenta calcular a divisao primeiro e
  -- falha com o erro tecnico errado em vez da causa de negocio:
  --   -1000 de 0.01 -> round(-1000/0.01*100, 2) estoura numeric(6,2)
  --                    (22003 numeric field overflow), quando devia ser
  --                    ck_nota_nao_negativa;
  --   0 de 0        -> round(0/0*100, 2) e divisao por zero (22012), quando
  --                    devia ser ck_pontos_exige_maximo.
  -- Nenhum desses casos chega a ser gravado (a linha e sempre recusada por
  -- algum check), entao o retorno nulo nunca muda o significado de uma
  -- linha aceita.
  percentual numeric(6,2) generated always as (
    case escala
      when 'PERCENTUAL' then valor_original
      when 'PONTOS'     then case
                                when valor_original < 0
                                  or valor_maximo is null
                                  or valor_maximo <= 0
                                  or valor_original > valor_maximo
                                  then null
                                else round(valor_original / valor_maximo * 100, 2)
                              end
      else null
    end
  ) stored,

  -- Regra 2: "18 de 20" sem o 20 e dado inutil.
  constraint ck_pontos_exige_maximo
    check (escala <> 'PONTOS' or (valor_maximo is not null and valor_maximo > 0)),

  -- Nenhuma nota negativa faz sentido em nenhuma escala.
  constraint ck_nota_nao_negativa
    check (valor_original >= 0),

  -- Percentual e sempre 0-100 por definicao da escala.
  constraint ck_percentual_ate_100
    check (escala <> 'PERCENTUAL' or valor_original <= 100),

  -- Nao da para tirar mais pontos do que o maximo da prova. So se aplica
  -- quando ha um maximo valido (>0): um maximo ausente ou invalido ja e
  -- recusado por ck_pontos_exige_maximo, e as duas constraints nao podem
  -- disputar qual reporta a causa para o mesmo valor invalido de maximo.
  constraint ck_pontos_ate_maximo
    check (escala <> 'PONTOS' or valor_maximo is null or valor_maximo <= 0
           or valor_original <= valor_maximo),

  -- Faixa do TRI (0 a 1000): a unica prova TRI do dominio e o ENEM; as
  -- areas objetivas ficam na pratica abaixo de 1000 (escala centrada em
  -- 500) e a redacao vai de 0 a 1000. O teto admite todo valor real e
  -- recusa o erro de digitacao classico (820 digitado como 8200).
  constraint ck_tri_faixa
    check (escala <> 'TRI' or valor_original <= 1000)
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
      'create policy %I on %I for all using ((select public.eh_membro_equipe()))
         with check ((select public.eh_membro_equipe()))',
      t || '_equipe', t);
  end loop;
end $$;
