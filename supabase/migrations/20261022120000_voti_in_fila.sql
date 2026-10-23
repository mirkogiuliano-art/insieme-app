-- Insieme — i voti di uno stesso sondaggio si mettono in fila, e due
-- funzioni di controllo non rispondono più a chi non ha fatto l'accesso.
--
-- 1. vota_sondaggio ricalcola i totali dai voti dopo aver scritto il
--    proprio. Due persone che votavano nello stesso istante ricalcolavano
--    ognuna senza il voto dell'altra, e vinceva l'ultimo ricalcolo: su un
--    sondaggio appena mandato, quando tutti votano dalla notifica, si
--    leggeva «2 hanno votato» con tre voti. Ora la riga del sondaggio si
--    blocca all'inizio, e il secondo voto aspetta il primo.
--
-- 2. is_group_member e shares_group_with servono alle regole di accesso, che
--    girano con l'utente che ha fatto l'accesso. Chiamate a mano con la sola
--    chiave pubblica dell'app dicevano a chiunque se una persona è in un
--    gruppo, o se due persone hanno un gruppo in comune.

create or replace function public.vota_sondaggio(p_poll_id uuid, p_options smallint[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poll public.polls;
  v_len int;
  v_scelte smallint[];
  v_counts integer[];
  v_voters int;
begin
  -- `for update`: due voti sullo stesso sondaggio si mettono in fila. Senza,
  -- due persone che votano nello stesso istante ricalcolavano i totali
  -- senza vedersi a vicenda, e un voto spariva dal conteggio.
  select * into v_poll from public.polls where id = p_poll_id for update;
  if not found then
    raise exception 'Sondaggio non trovato.';
  end if;
  if not public.is_group_member(v_poll.group_id, auth.uid()) then
    raise exception 'Sondaggio non trovato.';
  end if;
  if v_poll.closed_at is not null then
    raise exception 'Questo sondaggio è chiuso.';
  end if;

  v_len := array_length(v_poll.options, 1);
  select array_agg(distinct o) into v_scelte from unnest(coalesce(p_options, '{}')) as o;
  v_scelte := coalesce(v_scelte, '{}');

  if exists (select 1 from unnest(v_scelte) as o where o < 0 or o >= v_len) then
    raise exception 'Risposta non valida.';
  end if;
  if not v_poll.multi and coalesce(array_length(v_scelte, 1), 0) > 1 then
    raise exception 'Questo sondaggio accetta una risposta sola.';
  end if;

  delete from public.poll_votes where poll_id = p_poll_id and user_id = auth.uid();
  insert into public.poll_votes (poll_id, group_id, user_id, option_index)
  select p_poll_id, v_poll.group_id, auth.uid(), o from unnest(v_scelte) as o;

  select array_agg(x.cnt order by x.idx) into v_counts
  from (
    select g.idx,
           (select count(*) from public.poll_votes pv where pv.poll_id = p_poll_id and pv.option_index = g.idx)::int as cnt
    from generate_series(0, v_len - 1) as g(idx)
  ) x;
  select count(distinct user_id)::int into v_voters from public.poll_votes where poll_id = p_poll_id;

  update public.polls set counts = v_counts, voters_count = v_voters where id = p_poll_id;
end;
$$;

-- Anche da `public`: è da lì che il permesso arrivava a chi non ha fatto
-- l'accesso. Chi l'ha fatto (authenticated) e il server (service_role)
-- hanno un permesso proprio, che resta.
revoke execute on function public.is_group_member(text, uuid) from public, anon;
revoke execute on function public.shares_group_with(uuid, uuid) from public, anon;
