-- Insieme — categorie modificabili/eliminabili (Link e Mappa).
--
-- Fin qui le categorie della mappa (PLACE_CATEGORIES) erano un elenco
-- fisso, hardcoded lato client e condiviso da tutta l'app — non
-- esistevano nel database. Per renderle modificabili/eliminabili
-- per-gruppo (come già possibile impostare per link_categories, che qui
-- guadagna anche lei UPDATE/DELETE) diventano una vera tabella
-- `place_categories`, seminata con le stesse 5 categorie di oggi per non
-- cambiare nulla finché nessuno le tocca.
--
-- L'eliminazione di una categoria (link o posto) riassegna gli elementi
-- rimasti alla categoria più vecchia del gruppo (fallback), tutto dentro
-- un'unica funzione SECURITY DEFINER — evita sia policy UPDATE più larghe
-- del necessario su links/pins (chiunque potrebbe riscrivere qualunque
-- campo), sia corse tra utenti che eliminano categorie diverse nello
-- stesso momento.

-- ── place_categories ────────────────────────────────────────────────
create table public.place_categories (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references public.groups(id) on delete cascade,
  name text not null,
  color text not null,
  created_at timestamptz not null default now()
);
create index place_categories_group_id_idx on public.place_categories (group_id);

alter table public.place_categories enable row level security;

create policy "place_categories: lettura membri"
  on public.place_categories for select
  to authenticated
  using (
    exists (
      select 1 from public.group_members m
      where m.group_id = place_categories.group_id and m.user_id = auth.uid()
    )
  );

create policy "place_categories: scrittura membri"
  on public.place_categories for insert
  to authenticated
  with check (
    exists (
      select 1 from public.group_members m
      where m.group_id = place_categories.group_id and m.user_id = auth.uid()
    )
  );

-- Rinomina (nome/colore) aperta a qualsiasi membro — stessa ampiezza già
-- usata per la cancellazione di link/pin, non è una novità di modello.
create policy "place_categories: rinomina membri"
  on public.place_categories for update
  to authenticated
  using (
    exists (
      select 1 from public.group_members m
      where m.group_id = place_categories.group_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.group_members m
      where m.group_id = place_categories.group_id and m.user_id = auth.uid()
    )
  );

-- Nessuna policy DELETE: la cancellazione passa solo dalla funzione
-- delete_place_category qui sotto, che riassegna prima gli elementi
-- rimasti (una DELETE diretta lascerebbe le pin orfane invece che
-- spostate sul fallback).

-- Semina le 5 categorie di oggi per ogni gruppo già esistente (i gruppi
-- creati da qui in avanti le ricevono da create_group, sotto).
insert into public.place_categories (group_id, name, color, created_at)
select g.id, v.name, v.color, g.created_at
from public.groups g
cross join (values
  ('da_visitare', 'Da visitare', '#2F9C86'),
  ('ristorante', 'Ristorante', '#D9555C'),
  ('bar', 'Bar', '#8C7CE0'),
  ('evento', 'Evento', '#D9932E'),
  ('altro', 'Altro', '#75828C')
) as v(code, name, color);

-- ── pins: da categoria fissa (testo) a category_id verso la nuova tabella ──
alter table public.pins add column category_id uuid references public.place_categories(id) on delete set null;

update public.pins p
set category_id = pc.id
from public.place_categories pc
join (values
  ('da_visitare', 'Da visitare'),
  ('ristorante', 'Ristorante'),
  ('bar', 'Bar'),
  ('evento', 'Evento'),
  ('altro', 'Altro')
) as v(code, name) on v.name = pc.name
where pc.group_id = p.group_id and p.category = v.code;

alter table public.pins drop column category;

-- ── link_categories: guadagna rinomina + cancellazione con riassegnazione ──
create policy "link_categories: rinomina membri"
  on public.link_categories for update
  to authenticated
  using (
    exists (
      select 1 from public.group_members m
      where m.group_id = link_categories.group_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.group_members m
      where m.group_id = link_categories.group_id and m.user_id = auth.uid()
    )
  );

-- ── create_group: semina anche le 5 categorie mappa di default ─────────
create or replace function public.create_group(p_code text, p_name text, p_color text)
returns public.groups
language plpgsql
security invoker
as $$
declare
  g public.groups;
begin
  insert into public.groups (id, name, color, created_by)
  values (p_code, p_name, p_color, auth.uid())
  returning * into g;

  insert into public.group_members (group_id, user_id)
  values (p_code, auth.uid());

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

-- ── delete_link_category / delete_place_category ────────────────────
-- Riassegnano gli elementi rimasti alla categoria più vecchia del gruppo
-- (il fallback), poi cancellano la categoria — tutto in una transazione.
-- SECURITY DEFINER: bypassa le RLS di links/pins per l'UPDATE interno di
-- reassegnazione, così non serve una policy UPDATE generica su quelle
-- tabelle (che permetterebbe a chiunque di riscrivere qualsiasi campo).
create function public.delete_link_category(p_category_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id text;
  v_fallback_id uuid;
begin
  select group_id into v_group_id from public.link_categories where id = p_category_id;
  if v_group_id is null then
    raise exception 'Categoria non trovata.';
  end if;

  if not public.is_group_member(v_group_id, auth.uid()) then
    raise exception 'Non sei membro di questo gruppo.';
  end if;

  select id into v_fallback_id
  from public.link_categories
  where group_id = v_group_id and id <> p_category_id
  order by created_at asc
  limit 1;

  if v_fallback_id is null then
    raise exception 'Non puoi eliminare l''unica categoria del gruppo.';
  end if;

  update public.links set category_id = v_fallback_id where category_id = p_category_id;
  delete from public.link_categories where id = p_category_id;
end;
$$;

grant execute on function public.delete_link_category(uuid) to authenticated;

create function public.delete_place_category(p_category_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id text;
  v_fallback_id uuid;
begin
  select group_id into v_group_id from public.place_categories where id = p_category_id;
  if v_group_id is null then
    raise exception 'Categoria non trovata.';
  end if;

  if not public.is_group_member(v_group_id, auth.uid()) then
    raise exception 'Non sei membro di questo gruppo.';
  end if;

  select id into v_fallback_id
  from public.place_categories
  where group_id = v_group_id and id <> p_category_id
  order by created_at asc
  limit 1;

  if v_fallback_id is null then
    raise exception 'Non puoi eliminare l''unica categoria del gruppo.';
  end if;

  update public.pins set category_id = v_fallback_id where category_id = p_category_id;
  delete from public.place_categories where id = p_category_id;
end;
$$;

grant execute on function public.delete_place_category(uuid) to authenticated;

-- ── Realtime ─────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.place_categories;
