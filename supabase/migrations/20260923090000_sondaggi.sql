-- Insieme — sondaggi in chat.
--
-- Un sondaggio è un messaggio come gli altri: sta nella chat, si cerca, si
-- risponde, finisce nell'archivio. Per questo `messages` guadagna una
-- colonna `poll_id` invece di avere una tabella di messaggi a parte: tutto
-- quello che già funziona sui messaggi (realtime, lettura per membri,
-- notifiche push, risposte con citazione) continua a funzionare da solo.
--
-- Le risposte stanno in `polls.options` come array di testo e non in una
-- tabella a parte: sono da 2 a 10 stringhe che nascono e muoiono col
-- sondaggio, e tenerle in riga evita un JOIN a ogni lettura della chat.
-- I voti invece sono righe vere, perché vanno contati, cambiati e mostrati
-- per persona.
--
-- ── Perché i conteggi stanno anche su `polls` ──────────────────────
-- Col voto segreto nessuno può leggere i voti altrui, quindi il conteggio
-- non si può fare dal client. E anche senza segreto, gli eventi realtime
-- dei voti arrivano filtrati dalle RLS: chi non può vedere una riga non
-- riceve il suo evento, e le barre resterebbero indietro. Perciò ogni voto
-- aggiorna `counts` e `voters_count` sulla riga del sondaggio: quella la
-- vedono tutti i membri, e il suo UPDATE arriva a tutti in tempo reale.

create table public.polls (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references public.groups(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 1 and 200),
  options text[] not null check (array_length(options, 1) between 2 and 10),
  -- Più risposte: ognuno può sceglierne più di una.
  multi boolean not null default false,
  -- Voto segreto: si vedono i numeri, non chi ha votato cosa.
  secret boolean not null default false,
  counts integer[] not null default '{}',
  voters_count integer not null default 0,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
create index polls_group_id_idx on public.polls (group_id);

create table public.poll_votes (
  poll_id uuid not null references public.polls(id) on delete cascade,
  -- Denormalizzato come in links/pins e nelle reazioni: semplifica le RLS
  -- e il filtro `group_id=eq.${groupId}` delle subscription realtime.
  group_id text not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_index smallint not null check (option_index >= 0),
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id, option_index)
);
create index poll_votes_group_id_idx on public.poll_votes (group_id);
create index poll_votes_poll_id_idx on public.poll_votes (poll_id);

-- Necessaria perché gli eventi DELETE realtime filtrati per group_id (non
-- chiave primaria) vengano consegnati — vedi 20260828120000_replica_identity_full.sql.
alter table public.polls replica identity full;
alter table public.poll_votes replica identity full;

-- Il sondaggio muore col suo messaggio e viceversa: cancellato il
-- sondaggio, sparisce anche la scheda in chat.
alter table public.messages add column poll_id uuid references public.polls(id) on delete cascade;

alter table public.polls enable row level security;
alter table public.poll_votes enable row level security;

create policy "polls: lettura membri"
  on public.polls for select
  to authenticated
  using (public.is_group_member(polls.group_id, auth.uid()));

-- Nessuna regola di scrittura: si crea, si vota e si chiude solo dalle
-- funzioni qui sotto, che controllano di volta in volta chi può fare cosa.

create policy "poll_votes: lettura membri, salvo voto segreto"
  on public.poll_votes for select
  to authenticated
  using (
    public.is_group_member(poll_votes.group_id, auth.uid())
    and (
      poll_votes.user_id = auth.uid()
      or exists (select 1 from public.polls p where p.id = poll_votes.poll_id and not p.secret)
    )
  );

-- ── Creare un sondaggio ─────────────────────────────────────────────
-- Nasce il sondaggio e, nella stessa transazione, il messaggio che lo
-- porta in chat: così non esiste mai un sondaggio senza messaggio.
-- Il testo del messaggio è la domanda, perché la ricerca nella chat e la
-- notifica push leggono da lì.
create or replace function public.crea_sondaggio(
  p_group_id text,
  p_question text,
  p_options text[],
  p_multi boolean default false,
  p_secret boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poll_id uuid;
  v_options text[];
  v_len int;
begin
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception 'Gruppo non trovato.';
  end if;

  -- Le risposte vuote non contano, e i doppioni renderebbero il risultato
  -- incomprensibile.
  select array_agg(distinct btrim(o) order by btrim(o))
    into v_options
  from unnest(coalesce(p_options, '{}')) as o
  where btrim(o) <> '';

  v_len := coalesce(array_length(v_options, 1), 0);
  if v_len < 2 then
    raise exception 'Servono almeno due risposte diverse.';
  end if;
  if v_len > 10 then
    raise exception 'Al massimo dieci risposte.';
  end if;
  if btrim(coalesce(p_question, '')) = '' then
    raise exception 'Serve una domanda.';
  end if;

  insert into public.polls (group_id, created_by, question, options, multi, secret, counts)
  values (
    p_group_id,
    auth.uid(),
    btrim(p_question),
    -- L'ordine scelto da chi scrive conta: `array_agg(distinct)` lo
    -- riordina, quindi si ricostruisce quello originale tenendo la prima
    -- comparsa di ogni risposta.
    (select array_agg(o order by n)
     from (select btrim(o) as o, min(n) as n
           from unnest(p_options) with ordinality as t(o, n)
           where btrim(o) <> ''
           group by btrim(o)) u),
    coalesce(p_multi, false),
    coalesce(p_secret, false),
    array_fill(0, array[v_len])
  )
  returning id into v_poll_id;

  insert into public.messages (group_id, user_id, text, poll_id)
  values (p_group_id, auth.uid(), btrim(p_question), v_poll_id);

  return v_poll_id;
end;
$$;

revoke all on function public.crea_sondaggio(text, text, text[], boolean, boolean) from public;
grant execute on function public.crea_sondaggio(text, text, text[], boolean, boolean) to authenticated;

-- ── Votare ──────────────────────────────────────────────────────────
-- Un solo passaggio per tutto: si cancellano i voti di chi chiama e si
-- riscrivono quelli nuovi. Un array vuoto toglie il voto.
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
  select * into v_poll from public.polls where id = p_poll_id;
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

revoke all on function public.vota_sondaggio(uuid, smallint[]) from public;
grant execute on function public.vota_sondaggio(uuid, smallint[]) to authenticated;

-- ── Chiudere ────────────────────────────────────────────────────────
-- Solo chi l'ha aperto: dopo, nessuno vota più e restano i risultati.
create or replace function public.chiudi_sondaggio(p_poll_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poll public.polls;
begin
  select * into v_poll from public.polls where id = p_poll_id;
  if not found or not public.is_group_member(v_poll.group_id, auth.uid()) then
    raise exception 'Sondaggio non trovato.';
  end if;
  if v_poll.created_by <> auth.uid() then
    raise exception 'Può chiuderlo solo chi l’ha aperto.';
  end if;
  update public.polls set closed_at = now() where id = p_poll_id and closed_at is null;
end;
$$;

revoke all on function public.chiudi_sondaggio(uuid) from public;
grant execute on function public.chiudi_sondaggio(uuid) to authenticated;

alter publication supabase_realtime add table public.polls;
alter publication supabase_realtime add table public.poll_votes;
