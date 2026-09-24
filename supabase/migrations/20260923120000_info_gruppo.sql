-- Insieme — le info del gruppo: descrizione, date, meta e "cose da sapere".
--
-- Tre pezzi diversi, tenuti separati perché servono a cose diverse:
--
-- * la **descrizione** è testo libero e sta sulla riga del gruppo, come il
--   nome e il colore: è una frase sola, non ha senso una tabella;
-- * **date e meta** sono campi veri, non testo: solo così l'app può dire
--   "mancano 24 giorni" e rendere la meta un posto toccabile della mappa.
--   Sono facoltativi: un gruppo che non è un viaggio li lascia vuoti;
-- * le **cose da sapere** sono righe (hotel, volo, wi-fi) che nascono e
--   muoiono una alla volta, quindi una tabella con una riga ciascuna.
--
-- Chi può scrivere: tutti i membri, come per il colore del gruppo e le
-- categorie. Un gruppo di amici non ha un capo, e far dipendere le info da
-- chi ha creato il gruppo sarebbe solo un intralcio.

alter table public.groups add column description text check (char_length(description) <= 300);
alter table public.groups add column starts_on date;
alter table public.groups add column ends_on date;
-- La meta è un posto già salvato nella mappa del gruppo, non un nome
-- scritto a mano: così è toccabile e non può diventare un doppione.
-- `set null` e non `cascade`: cancellare il posto non deve portarsi via
-- le altre info del gruppo.
alter table public.groups add column place_pin_id uuid references public.pins(id) on delete set null;
-- Chi ha aggiornato la descrizione, e quando: niente cronologia, ma
-- neanche modifiche anonime.
alter table public.groups add column info_updated_by uuid references auth.users(id) on delete set null;
alter table public.groups add column info_updated_at timestamptz;

alter table public.groups add constraint groups_date_ordinate
  check (starts_on is null or ends_on is null or ends_on >= starts_on);

create table public.group_facts (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references public.groups(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 40),
  value text not null check (char_length(btrim(value)) between 1 and 200),
  -- L'ordine lo decidono le persone, non la data: si riordinano le righe
  -- senza doverle riscrivere.
  position integer not null default 0,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index group_facts_group_id_idx on public.group_facts (group_id);

-- Necessaria perché gli eventi DELETE realtime filtrati per group_id (non
-- chiave primaria) vengano consegnati — vedi 20260828120000_replica_identity_full.sql.
alter table public.group_facts replica identity full;

alter table public.group_facts enable row level security;

create policy "group_facts: lettura membri"
  on public.group_facts for select
  to authenticated
  using (public.is_group_member(group_facts.group_id, auth.uid()));

create policy "group_facts: scrittura membri per sé"
  on public.group_facts for insert
  to authenticated
  with check (created_by = auth.uid() and public.is_group_member(group_facts.group_id, auth.uid()));

-- Come per link e posti: una riga è del gruppo, non di chi l'ha scritta,
-- quindi qualsiasi membro può correggerla o toglierla.
create policy "group_facts: modifica membri"
  on public.group_facts for update
  to authenticated
  using (public.is_group_member(group_facts.group_id, auth.uid()))
  with check (public.is_group_member(group_facts.group_id, auth.uid()));

create policy "group_facts: cancella membri"
  on public.group_facts for delete
  to authenticated
  using (public.is_group_member(group_facts.group_id, auth.uid()));

-- ── Aggiornare le info ──────────────────────────────────────────────
-- `groups` non ha una regola di modifica, e non gliene si dà una generica:
-- permetterebbe di cambiare anche il nome o chi l'ha creato. Come per il
-- colore, si apre una porta sola, con i suoi controlli.
--
-- Si passano sempre tutti e quattro i valori: `null` significa "vuoto",
-- ed è così che si toglie una data o la meta.
create or replace function public.aggiorna_info_gruppo(
  p_group_id text,
  p_description text,
  p_starts_on date,
  p_ends_on date,
  p_place_pin_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_descrizione text;
begin
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception 'Gruppo non trovato.';
  end if;

  v_descrizione := nullif(btrim(coalesce(p_description, '')), '');
  if char_length(coalesce(v_descrizione, '')) > 300 then
    raise exception 'La descrizione è troppo lunga.';
  end if;
  if p_starts_on is not null and p_ends_on is not null and p_ends_on < p_starts_on then
    raise exception 'La data di fine viene prima di quella di inizio.';
  end if;
  -- La meta dev'essere un posto di questo gruppo: altrimenti si
  -- mostrerebbe ai membri un posto che non possono nemmeno vedere.
  if p_place_pin_id is not null
     and not exists (select 1 from public.pins where id = p_place_pin_id and group_id = p_group_id) then
    raise exception 'Questo posto non è di questo gruppo.';
  end if;

  update public.groups
  set description = v_descrizione,
      starts_on = p_starts_on,
      ends_on = p_ends_on,
      place_pin_id = p_place_pin_id,
      info_updated_by = auth.uid(),
      info_updated_at = now()
  where id = p_group_id;
end;
$$;

revoke all on function public.aggiorna_info_gruppo(text, text, date, date, uuid) from public;
grant execute on function public.aggiorna_info_gruppo(text, text, date, date, uuid) to authenticated;

-- I gruppi non erano in tempo reale: finora cambiava solo il colore, e chi
-- lo cambiava lo vedeva subito. Ora che le info si scrivono in due, gli
-- aggiornamenti devono arrivare anche agli altri senza riaprire l'app.
alter publication supabase_realtime add table public.groups;
alter publication supabase_realtime add table public.group_facts;
