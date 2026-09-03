-- Insieme — collegamenti tra posti salvati sulla mappa ed elementi della
-- sezione Link.
--
-- Relazione molti-a-molti: un posto può avere più link (il video, la foto
-- del menù, la recensione) e un link può riferirsi a più posti (un video
-- "10 cose da fare a Roma" tocca dieci posti). Una colonna singola su
-- `links` non basterebbe per il secondo caso.
--
-- group_id è denormalizzato sulla riga (come già in links/pins/
-- message_reactions) invece di risalire a pins con un JOIN: semplifica sia
-- le RLS sia il filtro `group_id=eq.${groupId}` delle subscription realtime.
--
-- Le due FK sono `on delete cascade`: se si elimina il posto o il link, il
-- collegamento sparisce da sé — non ha senso senza uno dei due capi.
create table public.place_links (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references public.groups(id) on delete cascade,
  pin_id uuid not null references public.pins(id) on delete cascade,
  link_id uuid not null references public.links(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (pin_id, link_id)
);
create index place_links_group_id_idx on public.place_links (group_id);
create index place_links_pin_id_idx on public.place_links (pin_id);
create index place_links_link_id_idx on public.place_links (link_id);

-- Necessaria perché gli eventi DELETE realtime filtrati per group_id (non
-- chiave primaria) vengano consegnati — vedi 20260828120000_replica_identity_full.sql.
alter table public.place_links replica identity full;

alter table public.place_links enable row level security;

create policy "place_links: lettura membri"
  on public.place_links for select
  to authenticated
  using (
    exists (
      select 1 from public.group_members m
      where m.group_id = place_links.group_id and m.user_id = auth.uid()
    )
  );

create policy "place_links: scrittura membri per sé"
  on public.place_links for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.group_members m
      where m.group_id = place_links.group_id and m.user_id = auth.uid()
    )
  );

-- Cancellazione aperta a qualsiasi membro, come per links e pins: il
-- collegamento è contenuto condiviso del gruppo, non qualcosa di personale
-- come una reazione.
create policy "place_links: cancellazione membri"
  on public.place_links for delete
  to authenticated
  using (
    exists (
      select 1 from public.group_members m
      where m.group_id = place_links.group_id and m.user_id = auth.uid()
    )
  );

alter publication supabase_realtime add table public.place_links;
