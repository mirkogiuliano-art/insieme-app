-- Insieme — inviti a persona: chi è già in un gruppo con te si invita
-- dall'app, e sceglie lui se entrare (src/components/AddPeopleSheet.tsx).
--
-- Accanto al link, non al suo posto: il link resta per chi non è ancora su
-- Insieme. Qui l'invitato è una persona precisa, che trova l'invito in cima
-- alla home e risponde con un tocco. Non si viene messi in un gruppo senza
-- saperlo: i membri vedono nome e ultimo accesso, anche quelli che non si
-- conoscono.
--
-- Le regole stanno qui e non nell'app:
-- - invita solo chi è nel gruppo;
-- - si invita solo chi è già in un gruppo con te: non si cerca per nome o
--   email fra tutti, e non c'è modo di scoprire chi usa Insieme;
-- - chi hai bloccato non compare e non si invita. Chi ha bloccato te
--   invece l'invito non lo vede mai, e neanche l'avviso: a te risulta
--   mandato, come il blocco in chat, che a chi è bloccato non dice niente;
-- - un invito per persona e per gruppo.
--
-- Prima di entrare l'invitato vede nome e colore del gruppo, chi l'ha
-- invitato e i nomi dei membri: niente chat, link o posti.

create table public.inviti_persona (
  group_id text not null references public.groups(id) on delete cascade,
  invitato_id uuid not null references auth.users(id) on delete cascade,
  da_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, invitato_id)
);

-- Gli inviti ricevuti si cercano per invitato; quelli di un gruppo usano
-- già la chiave.
create index inviti_persona_invitato on public.inviti_persona (invitato_id);

alter table public.inviti_persona enable row level security;

-- I membri vedono chi è stato invitato nel loro gruppo e non ha ancora
-- risposto. Gli inviti ricevuti passano invece da miei_inviti(), che
-- toglie quelli di chi hai bloccato. Si scrive solo dalle funzioni qui
-- sotto: nessuna regola di scrittura.
create policy "inviti_persona: i membri del gruppo"
  on public.inviti_persona for select
  to authenticated
  using (public.is_group_member(group_id, auth.uid()));

-- Vedi 20260924090000_permessi_api.sql: i permessi nella migrazione che
-- crea la tabella. Solo lettura, la scrittura passa dalle funzioni.
revoke all on public.inviti_persona from anon;
grant select on public.inviti_persona to authenticated;
grant select, insert, update, delete on public.inviti_persona to service_role;

-- ── Chi conosci ─────────────────────────────────────────────────────
-- Le persone dei tuoi altri gruppi che non sono in questo, con i gruppi
-- in cui siete insieme. Gira con i permessi di chi chiama: legge solo
-- quello che le regole gli lasciano già leggere.
create function public.persone_che_conosco(p_group_id text)
returns table (id uuid, nome text, gruppi text[], invitata boolean)
language sql
stable
security invoker
set search_path = public
as $$
  select altri.user_id,
         coalesce(p.display_name, ''),
         array_agg(distinct g.name order by g.name),
         exists (
           select 1 from public.inviti_persona i
           where i.group_id = p_group_id and i.invitato_id = altri.user_id
         )
  from public.group_members miei
  join public.group_members altri on altri.group_id = miei.group_id and altri.user_id <> miei.user_id
  join public.groups g on g.id = altri.group_id
  left join public.profiles p on p.id = altri.user_id
  where miei.user_id = auth.uid()
    and miei.group_id <> p_group_id
    and public.is_group_member(p_group_id, auth.uid())
    and not public.is_group_member(p_group_id, altri.user_id)
    and not exists (
      select 1 from public.blocked_users b
      where b.blocker_id = auth.uid() and b.blocked_id = altri.user_id
    )
  group by altri.user_id, p.display_name
  order by 2;
$$;

-- ── Invita ──────────────────────────────────────────────────────────
create function public.invita_persona(p_group_id text, p_utente uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception 'Non fai parte di questo gruppo.';
  end if;
  -- Già dentro (magari col link): non c'è niente da fare.
  if public.is_group_member(p_group_id, p_utente) then
    return;
  end if;
  if not public.shares_group_with(auth.uid(), p_utente) then
    raise exception 'Puoi invitare solo chi è già in un gruppo con te.';
  end if;
  if exists (select 1 from public.blocked_users where blocker_id = auth.uid() and blocked_id = p_utente) then
    raise exception 'Hai bloccato questa persona.';
  end if;
  insert into public.inviti_persona (group_id, invitato_id, da_id)
  values (p_group_id, p_utente, auth.uid())
  on conflict do nothing;
end;
$$;

-- ── Gli inviti ricevuti ─────────────────────────────────────────────
-- Con i permessi del database: chi è invitato non è ancora nel gruppo, e
-- le regole non gli lascerebbero leggere né il nome né i membri.
create function public.miei_inviti()
returns table (group_id text, nome text, colore text, da text, membri text[])
language sql
stable
security definer
set search_path = public
as $$
  select i.group_id,
         g.name,
         coalesce(g.color, ''),
         coalesce(pda.display_name, ''),
         -- Chi invita per primo, poi gli altri in ordine d'arrivo.
         (select array_agg(coalesce(pm.display_name, '') order by m.user_id = i.da_id desc, m.joined_at)
            from public.group_members m
            left join public.profiles pm on pm.id = m.user_id
           where m.group_id = i.group_id)
  from public.inviti_persona i
  join public.groups g on g.id = i.group_id
  left join public.profiles pda on pda.id = i.da_id
  where i.invitato_id = auth.uid()
    and not public.is_group_member(i.group_id, auth.uid())
    and not exists (
      select 1 from public.blocked_users b
      where b.blocker_id = auth.uid() and b.blocked_id = i.da_id
    )
  order by i.created_at desc;
$$;

-- ── Rispondi ────────────────────────────────────────────────────────
-- Entra (e restituisce il gruppo, come redeem_invite) o rifiuta. In tutti
-- e due i casi l'invito sparisce, anche dalla lista di chi l'ha mandato.
create function public.rispondi_invito(p_group_id text, p_entra boolean)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.groups;
begin
  delete from public.inviti_persona
  where group_id = p_group_id and invitato_id = auth.uid();
  if not found then
    raise exception 'Questo invito non c''è più.';
  end if;
  if not p_entra then
    return null;
  end if;
  if not public.is_group_member(p_group_id, auth.uid()) then
    insert into public.group_members (group_id, user_id) values (p_group_id, auth.uid());
  end if;
  select * into g from public.groups where id = p_group_id;
  return g;
end;
$$;

revoke all on function public.persone_che_conosco(text) from public, anon;
revoke all on function public.invita_persona(text, uuid) from public, anon;
revoke all on function public.miei_inviti() from public, anon;
revoke all on function public.rispondi_invito(text, boolean) from public, anon;
grant execute on function public.persone_che_conosco(text) to authenticated;
grant execute on function public.invita_persona(text, uuid) to authenticated;
grant execute on function public.miei_inviti() to authenticated;
grant execute on function public.rispondi_invito(text, boolean) to authenticated;
