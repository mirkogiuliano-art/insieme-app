-- Insieme — correzione della generazione del token d'invito.
--
-- La migrazione precedente usava `gen_random_bytes(16)`, che appartiene
-- all'estensione pgcrypto: su questo progetto non è raggiungibile e la
-- chiamata falliva con "function gen_random_bytes(integer) does not exist",
-- rompendo la creazione dei gruppi.
--
-- `gen_random_uuid()` invece fa parte di Postgres dalla 13 e qui è già usata
-- ovunque come valore predefinito delle chiavi. Un UUID v4 porta 122 bit di
-- casualità: privato dei trattini dà un token di 32 caratteri esadecimali,
-- del tutto fuori portata per un tentativo a forza bruta.

create function public.new_invite_token()
returns text
language sql
volatile
as $$
  select replace(gen_random_uuid()::text, '-', '');
$$;

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

create or replace function public.rotate_invite(p_group_id text)
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

grant execute on function public.create_group(text, text, text) to authenticated;
grant execute on function public.rotate_invite(text) to authenticated;
