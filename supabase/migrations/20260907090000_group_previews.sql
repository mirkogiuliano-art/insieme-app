-- Insieme — anteprima di ogni gruppo per la schermata "I tuoi gruppi".
--
-- La home passa dalle righe alle schede a colore pieno, e una scheda
-- grande ha bisogno di qualcosa da dire: oggi mostra solo il nome e la
-- scritta "Gruppo condiviso", che non è un'informazione. Al suo posto
-- servono, per ogni gruppo di cui faccio parte: l'ultimo messaggio con
-- chi l'ha scritto, quanti messaggi non ho ancora letto, e chi sono i
-- membri (per le facce in alto a destra).
--
-- Tutto in una funzione sola invece che in tre giri di query per gruppo:
-- con cinque gruppi sarebbero quindici richieste a ogni apertura della
-- home. Qui è una chiamata, e il lavoro lo fa il database dove i dati
-- già stanno.
--
-- `security definer` serve perché la funzione legge `profiles` di tutti i
-- membri: le regole di lettura su quella tabella sono ristrette a sé
-- stessi e ai compagni di gruppo (20260903090000_close_write_gaps.sql),
-- quindi il risultato sarebbe comunque lo stesso — ma passando dalla
-- funzione si evita che PostgREST debba applicare quella policy riga per
-- riga. La riservatezza resta garantita dal filtro `user_id = auth.uid()`
-- nella CTE `miei`: qualunque cosa esca da qui riguarda solo gruppi di
-- cui chi chiama è membro.
--
-- I "non letti" si appoggiano a group_members.last_read_at, che esiste
-- già per le spunte di lettura (20260831110000_read_receipts.sql): non
-- serve nessuna colonna nuova. I propri messaggi non contano mai, e chi
-- non ha mai aperto la chat vede tutto come non letto.

create function public.group_previews()
returns table (
  group_id text,
  last_text text,
  last_kind text,
  last_name text,
  last_user_id uuid,
  last_author text,
  last_at timestamptz,
  unread integer,
  member_count integer,
  member_names text[]
)
language sql
security definer
set search_path = public
stable
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
        and (miei.last_read_at is null or m2.created_at > miei.last_read_at)
    ),
    coalesce(membri.quanti, 0),
    coalesce(membri.nomi, array[]::text[])
  from miei
  left join ultimo u on u.group_id = miei.group_id
  left join public.profiles autore on autore.id = u.user_id
  left join membri on membri.group_id = miei.group_id;
$$;

grant execute on function public.group_previews() to authenticated;
