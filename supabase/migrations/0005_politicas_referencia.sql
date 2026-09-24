do $$
declare t text;
begin
  foreach t in array array['instituicao','instituicao_apelido','prova','curso','materia']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all using ((select public.eh_membro_equipe()))
         with check ((select public.eh_membro_equipe()))',
      t || '_equipe', t);
  end loop;
end $$;
