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
-- Due sondaggi aperti, uno di A e uno di B.
insert into public.polls (id, group_id, created_by, question, options) values
  ('00000000-0000-4000-8000-0000000000a1', 'REGOLE', '00000000-0000-4000-8000-00000000000a', 'Dove si cena?', array['Qui', 'Lì']),
  ('00000000-0000-4000-8000-0000000000b1', 'REGOLE', '00000000-0000-4000-8000-00000000000b', 'Quando si parte?', array['Ora', 'Dopo']);

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
  -- Nemmeno come ultimo messaggio, e i suoi sondaggi non sono da votare
  -- (20261026120000_anteprime_ultimo_e_sondaggi.sql).
  if (select last_text from public.group_previews() where group_id = 'REGOLE') is not null then
    raise exception 'in home l''ultimo messaggio è di chi ho bloccato';
  end if;
  if (select da_votare_n from public.group_previews() where group_id = 'REGOLE') <> 1
     or (select da_votare from public.group_previews() where group_id = 'REGOLE') <> 'Dove si cena?' then
    raise exception 'da votare: non è solo il sondaggio di A';
  end if;
  perform public.vota_sondaggio('00000000-0000-4000-8000-0000000000a1', array[0]::smallint[]);
  if (select da_votare_n from public.group_previews() where group_id = 'REGOLE') <> 0
     or (select da_votare from public.group_previews() where group_id = 'REGOLE') is not null then
    raise exception 'da votare: resta un sondaggio già votato';
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

-- ── Gruppi pubblici (20261026090000_gruppi_pubblici.sql) ────────────
-- A ha creato REGOLE. F è fuori da tutto e non ha blocchi.
reset role;
insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000000f', 'regole.f@example.com');
update public.profiles set display_name = 'Anna Regole' where id = '00000000-0000-4000-8000-00000000000a';
insert into public.links (group_id, url, title, user_id)
  values ('REGOLE', 'https://example.com', 'Un link', '00000000-0000-4000-8000-00000000000a');
insert into public.pins (group_id, lat, lng, name, user_id)
  values ('REGOLE', 45, 9, 'Un posto', '00000000-0000-4000-8000-00000000000a');
insert into public.group_facts (group_id, created_by, label, value)
  values ('REGOLE', '00000000-0000-4000-8000-00000000000a', 'Hotel', 'Via Roma 1');

do $$
begin
  if has_function_privilege('anon', 'public.cerca_gruppi_pubblici(text)', 'execute')
     or has_function_privilege('anon', 'public.cerca_persone(text)', 'execute')
     or has_function_privilege('anon', 'public.profilo_pubblico(uuid)', 'execute')
     or has_function_privilege('anon', 'public.pagina_gruppo(text)', 'execute')
     or has_function_privilege('anon', 'public.rendi_pubblico(text, boolean)', 'execute')
     or has_function_privilege('anon', 'public.segnala_gruppo(text, text)', 'execute') then
    raise exception 'le funzioni dei gruppi pubblici rispondono a chi non ha fatto l''accesso';
  end if;
end $$;

set local role authenticated;

-- F, finché il gruppo è privato, non vede niente.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000f","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.links where group_id = 'REGOLE') <> 0
     or (select count(*) from public.groups where id = 'REGOLE') <> 0
     or (select count(*) from public.group_facts where group_id = 'REGOLE') <> 0
     or public.pagina_gruppo('REGOLE') is not null then
    raise exception 'un gruppo privato si vede da fuori';
  end if;
end $$;

-- B è nel gruppo ma non l'ha creato: non decide la visibilità.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.rendi_pubblico('REGOLE', true);
    raise exception 'passato';
  exception when others then
    if sqlerrm = 'passato' then raise exception 'rende pubblico chi non ha creato il gruppo'; end if;
  end;
end $$;

-- A: senza nome utente no; un nome utente storto no; poi sì.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.rendi_pubblico('REGOLE', true);
    raise exception 'passato';
  exception when others then
    if sqlerrm = 'passato' then raise exception 'si rende pubblico senza nome utente'; end if;
  end;
  begin
    update public.profiles set nome_utente = '.Anna' where id = '00000000-0000-4000-8000-00000000000a';
    raise exception 'passato';
  exception when others then
    if sqlerrm = 'passato' then raise exception 'accetta un nome utente storto'; end if;
  end;
  update public.profiles set nome_utente = 'anna.regole' where id = '00000000-0000-4000-8000-00000000000a';
  perform public.rendi_pubblico('REGOLE', true);
end $$;

-- F, ora: vede gruppo, cose da sapere, salvati e posti, mai messaggi e
-- membri; trova il gruppo e la persona; non scrive; può segnalare.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000f","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.groups where id = 'REGOLE') <> 1
     or (select count(*) from public.group_facts where group_id = 'REGOLE') <> 1
     or (select count(*) from public.links where group_id = 'REGOLE') <> 1
     or (select count(*) from public.pins where group_id = 'REGOLE') <> 1 then
    raise exception 'da fuori non si vede un gruppo pubblico';
  end if;
  if (select count(*) from public.messages where group_id = 'REGOLE') <> 0
     or (select count(*) from public.group_members where group_id = 'REGOLE') <> 0 then
    raise exception 'da fuori si vedono chat o membri di un gruppo pubblico';
  end if;
  if (select count(*) from public.cerca_gruppi_pubblici('regole')) <> 1
     or (select count(*) from public.cerca_persone('@anna')) <> 1
     or (select count(*) from public.cerca_persone('anna reg')) <> 1
     or jsonb_array_length(public.profilo_pubblico('00000000-0000-4000-8000-00000000000a')->'gruppi') <> 1
     or public.pagina_gruppo('REGOLE')->'autore'->>'nome_utente' <> 'anna.regole' then
    raise exception 'la ricerca o le pagine pubbliche non trovano il gruppo';
  end if;
  begin
    insert into public.links (group_id, url, title, user_id)
    values ('REGOLE', 'https://example.org', 'Intruso', '00000000-0000-4000-8000-00000000000f');
    raise exception 'passato';
  exception when others then
    if sqlerrm = 'passato' then raise exception 'da fuori si scrive in un gruppo pubblico'; end if;
  end;
  begin
    insert into public.group_facts (group_id, created_by, label, value)
    values ('REGOLE', '00000000-0000-4000-8000-00000000000f', 'Intruso', 'x');
    raise exception 'passato';
  exception when others then
    if sqlerrm = 'passato' then raise exception 'da fuori si scrivono le cose da sapere'; end if;
  end;
  perform public.segnala_gruppo('REGOLE', 'prova');
end $$;

-- C ha bloccato A: non vede i suoi gruppi e non la trova.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.links where group_id = 'REGOLE') <> 0
     or (select count(*) from public.cerca_persone('anna')) <> 0
     or public.profilo_pubblico('00000000-0000-4000-8000-00000000000a') is not null then
    raise exception 'chi ha bloccato vede ancora i gruppi pubblici dell''altro';
  end if;
end $$;

-- A esce dal gruppo: torna privato.
reset role;
delete from public.group_members where group_id = 'REGOLE' and user_id = '00000000-0000-4000-8000-00000000000a';
do $$
begin
  if (select pubblico from public.groups where id = 'REGOLE') then
    raise exception 'il gruppo resta pubblico dopo l''uscita di chi l''ha creato';
  end if;
end $$;

rollback;
