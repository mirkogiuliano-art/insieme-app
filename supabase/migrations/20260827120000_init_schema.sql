-- Insieme — schema iniziale condiviso (Fase 0 del piano multi-utente).
-- Sostituisce lo schema abbozzato in src/lib/README-supabase.md: qui le
-- colonne di attribuzione (author/added_by) sono user_id uuid invece di
-- testo libero, per permettere alle RLS di verificare che un utente scriva
-- solo a proprio nome (con testo libero chiunque potrebbe firmare un
-- messaggio col nome di un altro membro).

-- ── profiles ─────────────────────────────────────────────────────────
-- Nome visualizzato per ogni utente. Separata da auth.users perché quella
-- tabella non è interrogabile dagli altri client via PostgREST/RLS.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

-- Crea automaticamente la riga profilo alla registrazione.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── groups ───────────────────────────────────────────────────────────
-- id = codice invito leggibile a 6 caratteri, generato client-side da
-- genGroupCode() (src/lib/utils.ts).
create table public.groups (
  id text primary key,
  name text not null,
  color text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id text not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- ── messages, link_categories, links, pins ──────────────────────────
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);
create index messages_group_id_idx on public.messages (group_id);

create table public.link_categories (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references public.groups(id) on delete cascade,
  name text not null,
  color text not null,
  created_at timestamptz not null default now()
);
create index link_categories_group_id_idx on public.link_categories (group_id);

create table public.links (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references public.groups(id) on delete cascade,
  url text not null,
  title text not null,
  platform text,
  label text,
  thumb text,
  category_id uuid references public.link_categories(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index links_group_id_idx on public.links (group_id);

create table public.pins (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references public.groups(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  name text not null,
  category text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index pins_group_id_idx on public.pins (group_id);

-- ── create_group: inserimento gruppo + prima membership + categoria
--    "Generale" di default, tutto nella stessa transazione (Fase 0/Fase 3
--    del piano — evita la race condition del seeding lazy lato client). ──
create function public.create_group(p_code text, p_name text, p_color text)
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

  return g;
end;
$$;

grant execute on function public.create_group(text, text, text) to authenticated;

-- Helper SECURITY DEFINER: la policy SELECT di group_members deve
-- controllare "sei membro di questo gruppo?" interrogando group_members
-- stessa — fatto con una subquery diretta nella policy, Postgres rivaluta
-- la stessa RLS anche per la subquery interna e va in ricorsione infinita.
-- Questa funzione bypassa la RLS solo per questo controllo interno.
create function public.is_group_member(p_group_id text, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_user_id
  );
$$;

grant execute on function public.is_group_member(text, uuid) to authenticated;

-- ── Row Level Security ──────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.messages enable row level security;
alter table public.link_categories enable row level security;
alter table public.links enable row level security;
alter table public.pins enable row level security;

-- profiles: chiunque autenticato può leggere i profili (serve per
-- risolvere i nomi nel roster di un gruppo); si aggiorna solo il proprio.
create policy "profiles: lettura autenticati"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles: aggiorna solo il proprio"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- groups: lettura permissiva (il codice a 6 caratteri è già l'unico
-- controllo d'accesso del prodotto, condiviso in chiaro). Creazione solo
-- autoattribuita.
create policy "groups: lettura autenticati"
  on public.groups for select
  to authenticated
  using (true);

create policy "groups: crea solo per sé"
  on public.groups for insert
  to authenticated
  with check (created_by = auth.uid());

-- group_members: il roster è visibile solo a chi è già membro dello
-- stesso gruppo; ci si può aggiungere/rimuovere solo da sé stessi.
create policy "group_members: roster solo membri"
  on public.group_members for select
  to authenticated
  using (public.is_group_member(group_id, auth.uid()));

create policy "group_members: entra solo per sé"
  on public.group_members for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "group_members: esci solo per sé"
  on public.group_members for delete
  to authenticated
  using (user_id = auth.uid());

-- messages: solo membri leggono/scrivono; in scrittura anche
-- autoattribuzione obbligatoria (fix anti-spoofing).
create policy "messages: lettura membri"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.group_members m
      where m.group_id = messages.group_id and m.user_id = auth.uid()
    )
  );

create policy "messages: scrittura membri per sé"
  on public.messages for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.group_members m
      where m.group_id = messages.group_id and m.user_id = auth.uid()
    )
  );

-- link_categories: solo membri leggono/creano (nessuna UI di
-- modifica/cancellazione oggi).
create policy "link_categories: lettura membri"
  on public.link_categories for select
  to authenticated
  using (
    exists (
      select 1 from public.group_members m
      where m.group_id = link_categories.group_id and m.user_id = auth.uid()
    )
  );

create policy "link_categories: scrittura membri"
  on public.link_categories for insert
  to authenticated
  with check (
    exists (
      select 1 from public.group_members m
      where m.group_id = link_categories.group_id and m.user_id = auth.uid()
    )
  );

-- links: lettura/scrittura membri (con autoattribuzione), cancellazione
-- aperta a qualsiasi membro — comportamento invariato rispetto a oggi,
-- dove chiunque nel gruppo può cancellare qualsiasi link.
create policy "links: lettura membri"
  on public.links for select
  to authenticated
  using (
    exists (
      select 1 from public.group_members m
      where m.group_id = links.group_id and m.user_id = auth.uid()
    )
  );

create policy "links: scrittura membri per sé"
  on public.links for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.group_members m
      where m.group_id = links.group_id and m.user_id = auth.uid()
    )
  );

create policy "links: cancellazione membri"
  on public.links for delete
  to authenticated
  using (
    exists (
      select 1 from public.group_members m
      where m.group_id = links.group_id and m.user_id = auth.uid()
    )
  );

-- pins: stesso schema di links.
create policy "pins: lettura membri"
  on public.pins for select
  to authenticated
  using (
    exists (
      select 1 from public.group_members m
      where m.group_id = pins.group_id and m.user_id = auth.uid()
    )
  );

create policy "pins: scrittura membri per sé"
  on public.pins for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.group_members m
      where m.group_id = pins.group_id and m.user_id = auth.uid()
    )
  );

create policy "pins: cancellazione membri"
  on public.pins for delete
  to authenticated
  using (
    exists (
      select 1 from public.group_members m
      where m.group_id = pins.group_id and m.user_id = auth.uid()
    )
  );

-- ── Realtime ─────────────────────────────────────────────────────────
-- Necessario perché le subscription postgres_changes ricevano eventi
-- (altrimenti falliscono in silenzio, senza errore).
alter publication supabase_realtime add table
  public.messages,
  public.links,
  public.pins,
  public.link_categories,
  public.group_members;
