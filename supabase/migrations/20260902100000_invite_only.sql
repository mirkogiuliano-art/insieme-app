-- Insieme — si entra in un gruppo solo tramite invito.
--
-- PROBLEMA CHIUSO QUI. Prima di questa migrazione bastava avere un account
-- qualsiasi per entrare in qualunque gruppo del progetto, e i buchi erano
-- due, indipendenti:
--
--   1. `groups` aveva lettura `using (true)`: chiunque poteva elencare
--      tutti i gruppi con il loro codice, che era anche la credenziale
--      d'ingresso.
--   2. `group_members` aveva inserimento `with check (user_id = auth.uid())`,
--      che controlla solo *chi* si iscrive e niente sul gruppo: noto un
--      codice, ci si aggiungeva da soli. Chiudere solo il punto 1 non
--      sarebbe servito.
--
-- Da qui in avanti il codice del gruppo torna a essere un semplice
-- identificatore, e l'unico modo per entrare è riscattare un invito.

-- ── 1. I gruppi li leggono solo i loro membri ────────────────────────
drop policy if exists "groups: lettura autenticati" on public.groups;

create policy "groups: lettura membri"
  on public.groups for select
  to authenticated
  using (public.is_group_member(id, auth.uid()));

-- ── 2. Niente più auto-iscrizione ────────────────────────────────────
-- Si entra solo passando da redeem_invite(). La policy di uscita resta:
-- andarsene dal proprio gruppo dev'essere sempre possibile.
drop policy if exists "group_members: entra solo per sé" on public.group_members;

-- ── 3. Inviti ────────────────────────────────────────────────────────
-- Il token nasce da gen_random_uuid(), che fa parte di Postgres: usare
-- gen_random_bytes richiederebbe l'estensione pgcrypto, qui non
-- raggiungibile (vedi 20260902110000_fix_invite_token.sql).
create function public.new_invite_token()
returns text
language sql
volatile
as $$
  select replace(gen_random_uuid()::text, '-', '');
$$;

-- Un invito per gruppo (`unique` su group_id): il modello è "il link del
-- gruppo", non una collezione di link. Rigenerarlo invalida il precedente.
-- Non scade: si disattiva solo revocandolo a mano.
create table public.group_invites (
  token text primary key,
  group_id text not null unique references public.groups(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index group_invites_group_id_idx on public.group_invites (group_id);

alter table public.group_invites enable row level security;

-- Il token lo vedono solo i membri: è quello che permette di condividerlo.
create policy "group_invites: lettura membri"
  on public.group_invites for select
  to authenticated
  using (public.is_group_member(group_id, auth.uid()));

-- Revocare = cancellare la riga. Qualsiasi membro può farlo, coerentemente
-- con il resto dell'app, che non ha ruoli.
create policy "group_invites: revoca membri"
  on public.group_invites for delete
  to authenticated
  using (public.is_group_member(group_id, auth.uid()));

-- Nessuna policy di inserimento di proposito: gli inviti nascono solo da
-- create_group e rotate_invite, così il token è sempre generato dal
-- database e non può essere scelto dal client.

-- ── 4. create_group: ora security definer ────────────────────────────
-- Serve perché iscrive chi crea il gruppo, e l'inserimento diretto in
-- group_members non è più permesso a nessuno. Crea anche il primo invito,
-- così il gruppo è condivisibile da subito.
create or replace function public.create_group(p_code text, p_name text, p_color text)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.groups;
begin
  if auth.uid() is null then
    raise exception 'Devi essere autenticato per creare un gruppo.';
  end if;

  insert into public.groups (id, name, color, created_by)
  values (p_code, p_name, p_color, auth.uid())
  returning * into g;

  insert into public.group_members (group_id, user_id)
  values (p_code, auth.uid());

  insert into public.group_invites (token, group_id, created_by)
  values (public.new_invite_token(), p_code, auth.uid());

  insert into public.link_categories (group_id, name, color)
  values (p_code, 'Generale', '#75828C');

  insert into public.place_categories (group_id, name, color)
  values
    (p_code, 'Da visitare', '#2F9C86'),
    (p_code, 'Ristorante', '#D9555C'),
    (p_code, 'Bar', '#8C7CE0'),
    (p_code, 'Evento', '#D9932E'),
    (p_code, 'Altro', '#75828C');

  return g;
end;
$$;

grant execute on function public.create_group(text, text, text) to authenticated;

-- ── 5. rotate_invite: genera (o rigenera) il link del gruppo ──────────
-- Cancellazione e creazione nella stessa transazione: non esiste un istante
-- in cui il gruppo resta senza invito o ne ha due validi.
create function public.rotate_invite(p_group_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception 'Non sei membro di questo gruppo.';
  end if;

  delete from public.group_invites where group_id = p_group_id;

  v_token := public.new_invite_token();
  insert into public.group_invites (token, group_id, created_by)
  values (v_token, p_group_id, auth.uid());

  return v_token;
end;
$$;

grant execute on function public.rotate_invite(text) to authenticated;

-- ── 6. redeem_invite: l'unico modo per entrare ───────────────────────
-- Idempotente: riaprire lo stesso link da membri non è un errore, riporta
-- semplicemente al gruppo.
create function public.redeem_invite(p_token text)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id text;
  g public.groups;
begin
  if auth.uid() is null then
    raise exception 'Devi essere autenticato per accettare un invito.';
  end if;

  select group_id into v_group_id
  from public.group_invites
  where token = p_token;

  if v_group_id is null then
    raise exception 'Invito non valido o revocato.';
  end if;

  if not public.is_group_member(v_group_id, auth.uid()) then
    insert into public.group_members (group_id, user_id)
    values (v_group_id, auth.uid());
  end if;

  select * into g from public.groups where id = v_group_id;
  return g;
end;
$$;

grant execute on function public.redeem_invite(text) to authenticated;
