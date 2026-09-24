-- Transicao depende do valor anterior, que um CHECK nao enxerga.
-- E a unica regra do sistema que exige trigger.
create or replace function public.valida_transicao_status()
returns trigger
language plpgsql
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
          ('POSTADO',     'FEITO')
        )
  then
    return new;
  end if;

  raise exception 'transicao de status invalida: % -> %', old.status_uso, new.status_uso
    using errcode = 'check_violation';
end $$;

create trigger trg_valida_transicao
  before update of status_uso on depoimento
  for each row execute function public.valida_transicao_status();
