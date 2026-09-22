-- Cambiare il colore della scheda di un gruppo, dal menu nella home.
--
-- Il colore c'è già (`groups.color`, scelto alla creazione), ma `groups` non
-- ha una regola di modifica: una generica permetterebbe di cambiare anche
-- il nome o chi l'ha creato. Qui si apre una porta sola: il colore, per chi
-- fa parte del gruppo, e solo un colore vero (#RRGGBB).
--
-- Il colore è del gruppo, non della persona: cambiandolo lo si cambia per
-- tutti, come le categorie di link e posti.

create or replace function public.cambia_colore_gruppo(p_group_id text, p_color text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception 'Gruppo non trovato.';
  end if;
  if p_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Colore non valido.';
  end if;
  update public.groups set color = upper(p_color) where id = p_group_id;
end;
$$;

revoke all on function public.cambia_colore_gruppo(text, text) from public;
grant execute on function public.cambia_colore_gruppo(text, text) to authenticated;
