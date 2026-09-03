-- Insieme — reazioni ai messaggi (Fase 1 del piano "chat avanzata").
--
-- group_id è denormalizzato sulla riga (come già in links/pins) invece di
-- risalire a messages con un JOIN — semplifica sia le RLS sia il filtro
-- `group_id=eq.${groupId}` delle subscription realtime.
create table public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  group_id text not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);
create index message_reactions_group_id_idx on public.message_reactions (group_id);
create index message_reactions_message_id_idx on public.message_reactions (message_id);

-- Necessaria perché gli eventi DELETE realtime filtrati per group_id (non
-- chiave primaria) vengano consegnati — vedi 20260828120000_replica_identity_full.sql.
alter table public.message_reactions replica identity full;

alter table public.message_reactions enable row level security;

create policy "message_reactions: lettura membri"
  on public.message_reactions for select
  to authenticated
  using (
    exists (
      select 1 from public.group_members m
      where m.group_id = message_reactions.group_id and m.user_id = auth.uid()
    )
  );

create policy "message_reactions: scrittura membri per sé"
  on public.message_reactions for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.group_members m
      where m.group_id = message_reactions.group_id and m.user_id = auth.uid()
    )
  );

-- Si può togliere solo la propria reazione (a differenza di link/pin, dove
-- qualsiasi membro può cancellare: qui la reazione è personale, non un
-- contenuto condiviso).
create policy "message_reactions: cancella solo la propria"
  on public.message_reactions for delete
  to authenticated
  using (user_id = auth.uid());

alter publication supabase_realtime add table public.message_reactions;
