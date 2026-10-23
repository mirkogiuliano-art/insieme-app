-- Insieme — prova delle regole del database: chi può leggere e chiamare cosa.
--
-- Va eseguita dopo ogni migrazione, nell'editor SQL di Supabase. Tutto
-- avviene dentro una transazione annullata alla fine (`rollback`): le persone
-- e il gruppo di prova non restano. Se una regola non vale si ferma con un
-- errore che dice quale; se arriva in fondo, valgono tutte.
--
-- È nata dopo una migrazione che diceva di togliere un permesso e non lo
-- toglieva: nessuno se ne sarebbe accorto.

begin;

-- Tre persone di prova: A e B nel gruppo, C fuori. A ha bloccato B.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'regole.a@example.com'),
  ('00000000-0000-4000-8000-00000000000b', 'regole.b@example.com'),
  ('00000000-0000-4000-8000-00000000000c', 'regole.c@example.com');
insert into public.groups (id, name, color, created_by)
  values ('REGOLE', 'Prova delle regole', '#E9A23B', '00000000-0000-4000-8000-00000000000a');
insert into public.group_members (group_id, user_id) values
  ('REGOLE', '00000000-0000-4000-8000-00000000000a'),
  ('REGOLE', '00000000-0000-4000-8000-00000000000b');
insert into public.messages (group_id, user_id, text)
  values ('REGOLE', '00000000-0000-4000-8000-00000000000b', 'ciao');
insert into public.blocked_users (blocker_id, blocked_id)
  values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b');

-- Chi non ha fatto l'accesso non usa le funzioni di controllo
-- (20261022120000_voti_in_fila.sql).
do $$
begin
  if has_function_privilege('anon', 'public.is_group_member(text, uuid)', 'execute') then
    raise exception 'is_group_member risponde a chi non ha fatto l''accesso';
  end if;
  if has_function_privilege('anon', 'public.shares_group_with(uuid, uuid)', 'execute') then
    raise exception 'shares_group_with risponde a chi non ha fatto l''accesso';
  end if;
end $$;

-- Da qui si è un utente con l'accesso, come l'app.
set local role authenticated;

-- C, fuori dal gruppo, non legge niente.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.messages where group_id = 'REGOLE') <> 0 then
    raise exception 'chi non è nel gruppo legge i messaggi';
  end if;
  if (select count(*) from public.groups where id = 'REGOLE') <> 0 then
    raise exception 'chi non è nel gruppo vede il gruppo';
  end if;
end $$;

-- A, nel gruppo, legge i messaggi; ma quelli di B, che ha bloccato, non
-- contano fra i nuovi (20261022130000_anteprime_senza_bloccati.sql).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.messages where group_id = 'REGOLE') <> 1 then
    raise exception 'un membro non legge i messaggi del gruppo';
  end if;
  if (select unread from public.group_previews() where group_id = 'REGOLE') <> 0 then
    raise exception 'in home i messaggi di chi ho bloccato contano fra i nuovi';
  end if;
end $$;

-- ── Inviti a persona (20261023120000_inviti_persona.sql) ────────────
-- Un secondo gruppo: A con C, D ed E. A ha bloccato D; C ha bloccato A.
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000d', 'regole.d@example.com'),
  ('00000000-0000-4000-8000-00000000000e', 'regole.e@example.com');
insert into public.groups (id, name, color, created_by)
  values ('REGOL2', 'Altro gruppo', '#5FA8DE', '00000000-0000-4000-8000-00000000000a');
insert into public.group_members (group_id, user_id) values
  ('REGOL2', '00000000-0000-4000-8000-00000000000a'),
  ('REGOL2', '00000000-0000-4000-8000-00000000000c'),
  ('REGOL2', '00000000-0000-4000-8000-00000000000d'),
  ('REGOL2', '00000000-0000-4000-8000-00000000000e');
insert into public.blocked_users (blocker_id, blocked_id) values
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000d'),
  ('00000000-0000-4000-8000-00000000000c', '00000000-0000-4000-8000-00000000000a');

do $$
begin
  if has_function_privilege('anon', 'public.persone_che_conosco(text)', 'execute')
     or has_function_privilege('anon', 'public.invita_persona(text, uuid)', 'execute')
     or has_function_privilege('anon', 'public.miei_inviti()', 'execute')
     or has_function_privilege('anon', 'public.rispondi_invito(text, boolean)', 'execute') then
    raise exception 'le funzioni degli inviti rispondono a chi non ha fatto l''accesso';
  end if;
end $$;

set local role authenticated;

-- A, in REGOLE: conosce C ed E (D l'ha bloccato, B è già dentro).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
begin
  if (select array_agg(id order by id) from public.persone_che_conosco('REGOLE'))
     is distinct from array['00000000-0000-4000-8000-00000000000c', '00000000-0000-4000-8000-00000000000e']::uuid[] then
    raise exception 'chi conosci: non sono C ed E';
  end if;
  begin
    perform public.invita_persona('REGOLE', '00000000-0000-4000-8000-00000000000d');
    raise exception 'passato';
  exception when others then
    if sqlerrm = 'passato' then raise exception 'si invita chi hai bloccato'; end if;
  end;
  perform public.invita_persona('REGOLE', '00000000-0000-4000-8000-00000000000c');
  perform public.invita_persona('REGOLE', '00000000-0000-4000-8000-00000000000e');
end $$;

-- C, fuori da REGOLE, non invita nessuno lì; e l'invito di A, che ha
-- bloccato, non lo vede.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.invita_persona('REGOLE', '00000000-0000-4000-8000-00000000000e');
    raise exception 'passato';
  exception when others then
    if sqlerrm = 'passato' then raise exception 'invita chi non è nel gruppo'; end if;
  end;
  if (select count(*) from public.miei_inviti()) <> 0 then
    raise exception 'si vede l''invito di chi hai bloccato';
  end if;
end $$;

-- E vede l'invito ed entra.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000e","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.miei_inviti() where group_id = 'REGOLE') <> 1 then
    raise exception 'l''invitato non vede l''invito';
  end if;
  if (select id from public.rispondi_invito('REGOLE', true)) <> 'REGOLE' then
    raise exception 'accettando non torna il gruppo';
  end if;
  if not public.is_group_member('REGOLE', '00000000-0000-4000-8000-00000000000e') then
    raise exception 'accettando non si entra';
  end if;
end $$;

-- B, nel gruppo, vede l'invito ancora in attesa (C), non quello usato (E).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.inviti_persona where group_id = 'REGOLE') <> 1 then
    raise exception 'i membri non vedono gli inviti in attesa giusti';
  end if;
  begin
    insert into public.inviti_persona (group_id, invitato_id, da_id)
    values ('REGOLE', '00000000-0000-4000-8000-00000000000d', '00000000-0000-4000-8000-00000000000b');
    raise exception 'passato';
  exception when others then
    if sqlerrm = 'passato' then raise exception 'si scrive un invito senza passare dalle funzioni'; end if;
  end;
end $$;

rollback;
