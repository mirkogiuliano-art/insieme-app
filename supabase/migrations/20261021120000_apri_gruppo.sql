-- Insieme — un gruppo si apre con una richiesta sola.
--
-- Aprendo un gruppo l'app faceva una quindicina di letture: messaggi,
-- reazioni, sondaggi, voti, membri e i loro nomi, chi ho bloccato, posti,
-- link e categorie, le info. Android ne manda al server cinque alla volta,
-- e su una rete da telefono la prima apertura arrivava a cinque secondi.
-- Questa funzione le fa tutte insieme, in un solo viaggio.
--
-- Non cambia chi vede cosa: gira con i permessi di chi la chiama
-- (security invoker), quindi ogni lettura passa dalle stesse regole RLS
-- delle letture separate. Chi non è nel gruppo riceve elenchi vuoti.
-- Colonne e ordine sono quelli delle letture dell'app (src/lib/api), che
-- restano per tutto il resto: questa serve solo ad aprire.

create or replace function public.apri_gruppo(p_group_id text, p_limite int default 150)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  select json_build_object(
    -- Gli ultimi messaggi, dal più recente: come listMessages.
    'messaggi', coalesce((
      select json_agg(m order by m.created_at desc)
      from (
        select id, user_id, "text", created_at, reply_to_id, attachment_url, attachment_type,
               attachment_duration_seconds, attachment_name, attachment_size, poll_id
        from messages
        where group_id = p_group_id
        order by created_at desc
        limit least(greatest(p_limite, 1), 500)
      ) m
    ), '[]'::json),
    'reazioni', coalesce((
      select json_agg(r)
      from (select id, message_id, user_id, emoji from message_reactions where group_id = p_group_id) r
    ), '[]'::json),
    'sondaggi', coalesce((
      select json_agg(s order by s.created_at desc)
      from (
        select id, group_id, created_by, question, options, multi, secret, counts, voters_count, closed_at, created_at
        from polls where group_id = p_group_id
      ) s
    ), '[]'::json),
    -- Nei sondaggi segreti la regola RLS lascia vedere solo il proprio voto.
    'voti', coalesce((
      select json_agg(v)
      from (select poll_id, user_id, option_index from poll_votes where group_id = p_group_id) v
    ), '[]'::json),
    'membri', coalesce((
      select json_agg(g)
      from (select user_id, last_read_at from group_members where group_id = p_group_id) g
    ), '[]'::json),
    'nomi', coalesce((
      select json_agg(p)
      from (
        select id, display_name from profiles
        where id in (select user_id from group_members where group_id = p_group_id)
      ) p
    ), '[]'::json),
    'bloccati', coalesce((
      select json_agg(b.blocked_id) from blocked_users b where b.blocker_id = auth.uid()
    ), '[]'::json),
    'posti', coalesce((
      select json_agg(x order by x.created_at desc)
      from (select id, user_id, lat, lng, name, category_id, maps_url, created_at from pins where group_id = p_group_id) x
    ), '[]'::json),
    'categorie_posti', coalesce((
      select json_agg(x order by x.created_at)
      from (select id, name, color, created_at from place_categories where group_id = p_group_id) x
    ), '[]'::json),
    'link', coalesce((
      select json_agg(x order by x.created_at desc)
      from (
        select id, user_id, url, title, platform, label, thumb, category_id, is_favorite, created_at
        from links where group_id = p_group_id
      ) x
    ), '[]'::json),
    'categorie_link', coalesce((
      select json_agg(x order by x.created_at)
      from (select id, name, color, created_at from link_categories where group_id = p_group_id) x
    ), '[]'::json),
    'collegamenti', coalesce((
      select json_agg(x order by x.created_at desc)
      from (select id, pin_id, link_id, created_by, created_at from place_links where group_id = p_group_id) x
    ), '[]'::json),
    'info', coalesce((
      select json_agg(x order by x.position, x.created_at)
      from (select id, label, value, position, created_by, created_at from group_facts where group_id = p_group_id) x
    ), '[]'::json)
  );
$$;

revoke all on function public.apri_gruppo(text, int) from public, anon;
grant execute on function public.apri_gruppo(text, int) to authenticated;
