-- Insieme — la meta del gruppo può essere un posto che non sta nella mappa.
--
-- Finora la meta era per forza uno dei posti salvati nella mappa del gruppo
-- (place_pin_id). Ora si può anche cercare per nome, in Info, e sceglierla
-- senza salvarla nella mappa: chi organizza un viaggio a Lisbona non vuole
-- per forza un segnaposto «Lisbona» in mezzo ai ristoranti.
--
-- La meta è quindi una delle due cose, mai entrambe:
-- * un posto della mappa (place_pin_id), come prima;
-- * un posto trovato cercando: nome, posizione e link della sua scheda su
--   Google Maps, scritti sulla riga del gruppo.
--
-- Il link si accetta solo se è di Google Maps: l'app lo apre al tocco, e
-- non deve poter diventare un indirizzo qualsiasi.

alter table public.groups add column meta_nome text check (char_length(meta_nome) between 1 and 200);
alter table public.groups add column meta_lat double precision check (meta_lat between -90 and 90);
alter table public.groups add column meta_lng double precision check (meta_lng between -180 and 180);
alter table public.groups add column meta_maps_url text
  check (meta_maps_url like 'https://www.google.com/maps/%' and char_length(meta_maps_url) <= 1000);

-- La funzione cambia firma: quella vecchia si toglie, e la nuova ha i campi
-- della meta in fondo, facoltativi. L'app già installata, che passa i
-- cinque valori di prima, continua a funzionare.
drop function public.aggiorna_info_gruppo(text, text, date, date, uuid);

create function public.aggiorna_info_gruppo(
  p_group_id text,
  p_description text,
  p_starts_on date,
  p_ends_on date,
  p_place_pin_id uuid,
  p_meta_nome text default null,
  p_meta_lat double precision default null,
  p_meta_lng double precision default null,
  p_meta_maps_url text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_descrizione text;
  v_meta_nome text;
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
  -- La meta della mappa dev'essere un posto di questo gruppo: altrimenti si
  -- mostrerebbe ai membri un posto che non possono nemmeno vedere.
  if p_place_pin_id is not null
     and not exists (select 1 from public.pins where id = p_place_pin_id and group_id = p_group_id) then
    raise exception 'Questo posto non è di questo gruppo.';
  end if;

  -- Una meta fuori dalla mappa ha bisogno di tutto: nome, posizione e link.
  -- Con un posto della mappa scelto, quella fuori dalla mappa si toglie.
  v_meta_nome := nullif(btrim(coalesce(p_meta_nome, '')), '');
  if p_place_pin_id is not null then
    v_meta_nome := null;
  elsif v_meta_nome is not null and (p_meta_lat is null or p_meta_lng is null or p_meta_maps_url is null) then
    raise exception 'Alla meta manca la posizione.';
  end if;

  update public.groups
  set description = v_descrizione,
      starts_on = p_starts_on,
      ends_on = p_ends_on,
      place_pin_id = p_place_pin_id,
      meta_nome = v_meta_nome,
      meta_lat = case when v_meta_nome is null then null else p_meta_lat end,
      meta_lng = case when v_meta_nome is null then null else p_meta_lng end,
      meta_maps_url = case when v_meta_nome is null then null else p_meta_maps_url end,
      info_updated_by = auth.uid(),
      info_updated_at = now()
  where id = p_group_id;
end;
$$;

revoke all on function public.aggiorna_info_gruppo(text, text, date, date, uuid, text, double precision, double precision, text) from public, anon;
grant execute on function public.aggiorna_info_gruppo(text, text, date, date, uuid, text, double precision, double precision, text) to authenticated;
