-- Insieme — in home, i messaggi di chi ho bloccato non contano fra i nuovi.
--
-- In chat i messaggi di una persona bloccata non compaiono, ma la scheda del
-- gruppo in home li contava: diceva «5 nuovi», e aprendo la chat non c'era
-- niente di nuovo. Cambia solo il conteggio dei non letti; il resto della
-- funzione è quello di 20260907090000_group_previews.sql.

create or replace function public.group_previews()
returns table(group_id text, last_text text, last_kind text, last_name text, last_user_id uuid, last_author text, last_at timestamp with time zone, unread integer, member_count integer, member_names text[])
language sql
stable
security definer
set search_path = public
as $$
  with miei as (
    select gm.group_id, gm.last_read_at
    from public.group_members gm
    where gm.user_id = auth.uid()
  ),
  -- Un solo messaggio per gruppo, il più recente. `distinct on` sfrutta
  -- l'indice (group_id, created_at) creato in
  -- 20260902130000_composite_indexes.sql: nessuna scansione completa.
  ultimo as (
    select distinct on (m.group_id)
      m.group_id,
      m.text,
      m.attachment_type,
      m.attachment_name,
      m.user_id,
      m.created_at
    from public.messages m
    join miei on miei.group_id = m.group_id
    order by m.group_id, m.created_at desc
  ),
  -- Quattro nomi bastano: la scheda ne mostra tre più il "+N".
  membri as (
    select
      gm.group_id,
      count(*)::integer as quanti,
      (array_agg(coalesce(p.display_name, 'Utente') order by gm.joined_at))[1:4] as nomi
    from public.group_members gm
    join miei on miei.group_id = gm.group_id
    left join public.profiles p on p.id = gm.user_id
    group by gm.group_id
  )
  select
    miei.group_id,
    u.text,
    u.attachment_type,
    u.attachment_name,
    u.user_id,
    autore.display_name,
    u.created_at,
    (
      select count(*)::integer
      from public.messages m2
      where m2.group_id = miei.group_id
        and m2.user_id <> auth.uid()
        -- I messaggi di chi ho bloccato in chat non compaiono: non contano
        -- nemmeno fra i nuovi.
        and not exists (
          select 1 from public.blocked_users b
          where b.blocker_id = auth.uid() and b.blocked_id = m2.user_id
        )
        and (miei.last_read_at is null or m2.created_at > miei.last_read_at)
    ),
    coalesce(membri.quanti, 0),
    coalesce(membri.nomi, array[]::text[])
  from miei
  left join ultimo u on u.group_id = miei.group_id
  left join public.profiles autore on autore.id = u.user_id
  left join membri on membri.group_id = miei.group_id;
$$;
