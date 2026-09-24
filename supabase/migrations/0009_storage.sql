-- Dois buckets por argumento de raio de explosao: um erro na politica de
-- logos (a mais frouxa) nao pode alcancar um print (o dado mais sensivel).
insert into storage.buckets (id, name, public)
values ('prints', 'prints', false),
       ('logos',  'logos',  true)
on conflict (id) do nothing;

-- Prints: leitura so para a equipe. URL assinada e gerada pelo cliente.
create policy prints_leitura on storage.objects
  for select using (bucket_id = 'prints' and (select public.eh_membro_equipe()));

create policy prints_escrita on storage.objects
  for insert with check (bucket_id = 'prints' and (select public.eh_membro_equipe()));

create policy prints_remocao on storage.objects
  for delete using (bucket_id = 'prints' and (select public.eh_membro_equipe()));

-- Logos: leitura publica (marca de instituicao nao e dado sensivel, e a lista
-- renderiza dezenas por pagina). Escrita restrita: bucket publico onde
-- qualquer um grava e defacement esperando acontecer.
--
-- A leitura publica de fato (pagina publica) passa pela URL publica da
-- Storage API, nao por RLS. Esta politica de select e para a equipe: sem
-- ela, o proprio membro nao enxerga a linha que acabou de inserir/apagar
-- (insert ... returning e delete ... where dependem de SELECT para
-- identificar a linha), quebrando o upload de logo pelo navegador.
create policy logos_leitura on storage.objects
  for select using (bucket_id = 'logos' and (select public.eh_membro_equipe()));

create policy logos_escrita on storage.objects
  for insert with check (bucket_id = 'logos' and (select public.eh_membro_equipe()));

create policy logos_remocao on storage.objects
  for delete using (bucket_id = 'logos' and (select public.eh_membro_equipe()));
