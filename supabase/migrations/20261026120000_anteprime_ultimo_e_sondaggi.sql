-- Insieme — la scheda del gruppo in home dice l'ultimo messaggio e cosa c'è
-- da votare.
--
-- 1. L'ultimo messaggio salta quelli di chi ho bloccato, come la chat: prima
--    li saltava solo il conteggio dei nuovi (20261022130000), e la scheda
--    avrebbe mostrato le parole di una persona bloccata.
-- 2. `da_votare` e `da_votare_n`: la domanda del sondaggio aperto più recente
--    in cui non ho ancora votato, e quanti sono. Non contano quelli di chi ho
--    bloccato: in chat non si vedono.
--
-- Il resto della funzione è quello di 20261022130000_anteprime_senza_bloccati.sql.
-- Le colonne nuove cambiano il tipo restituito, quindi la funzione si ricrea;
-- l'app di prima ignora le colonne che non conosce.

drop function public.group_previews();

create function public.group_previews()
returns table(group_id text, last_text text, last_kind text, last_name text, last_user_id uuid, last_author text, last_at timestamp with time zone, unread integer, member_count integer, member_names text[], da_votare text, da_votare_n integer)
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
  -- Un solo messaggio per gruppo, il più recente fra quelli che vedo.
  -- `distinct on` sfrutta l'indice (group_id, created_at) creato in
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
    where not exists (
      select 1 from public.blocked_users b
      where b.blocker_id = auth.uid() and b.blocked_id = m.user_id
    )
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
  ),
  da_votare as (
    select
      p.group_id,
      (array_agg(p.question order by p.created_at desc))[1] as domanda,
      count(*)::integer as quanti
    from public.polls p
    join miei on miei.group_id = p.group_id
    where p.closed_at is null
      and not exists (
        select 1 from public.poll_votes v
        where v.poll_id = p.id and v.user_id = auth.uid()
      )
      and not exists (
        select 1 from public.blocked_users b
        where b.blocker_id = auth.uid() and b.blocked_id = p.created_by
      )
    group by p.group_id
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
    coalesce(membri.nomi, array[]::text[]),
    dv.domanda,
    coalesce(dv.quanti, 0)
  from miei
  left join ultimo u on u.group_id = miei.group_id
  left join public.profiles autore on autore.id = u.user_id
  left join membri on membri.group_id = miei.group_id
  left join da_votare dv on dv.group_id = miei.group_id;
$$;

grant execute on function public.group_previews() to authenticated;
