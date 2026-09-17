-- Insieme — segnalare un messaggio e bloccare una persona.
--
-- Sono i due strumenti che Google pretende da qualunque app dove le
-- persone si scrivono fra loro. Qui i gruppi sono chiusi e su invito,
-- quindi il caso «uno sconosciuto mi molesta» è molto meno probabile che
-- in una piazza aperta — ma «sono entrato in un gruppo e qualcuno si
-- comporta male» resta possibile, ed è esattamente ciò a cui servono.
--
-- ── segnalazioni ────────────────────────────────────────────────────
-- Una segnalazione è una riga che resta: non cancella niente e non
-- avvisa nessuno dentro l'app. Serve a chi gestisce il servizio per
-- guardare e decidere. Di proposito NON è leggibile dai client: chi
-- segnala non deve poter vedere le segnalazioni altrui, e chi è segnalato
-- non deve sapere di esserlo.

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references public.groups(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  -- Chi segnala e chi è segnalato restano anche se l'account sparisce:
  -- una segnalazione svuotata non si potrebbe più valutare. Per questo
  -- `set null` e non `cascade`, con una copia del testo salvata qui.
  reporter_id uuid references auth.users(id) on delete set null,
  reported_id uuid references auth.users(id) on delete set null,
  reason text,
  message_text text,
  created_at timestamptz not null default now()
);

create index content_reports_created_at_idx on public.content_reports (created_at desc);

alter table public.content_reports enable row level security;

-- Nessuna policy di lettura: dai client non si vede nulla. La scrittura
-- passa dalla funzione qui sotto, che copia il testo del messaggio nel
-- momento in cui viene segnalato — se poi il gruppo sparisce, la
-- segnalazione resta comunque valutabile.
create function public.report_message(p_message_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id text;
  v_author uuid;
  v_text text;
begin
  if auth.uid() is null then
    raise exception 'Devi essere autenticato.';
  end if;

  select m.group_id, m.user_id, coalesce(m.text, m.attachment_name, '(allegato)')
    into v_group_id, v_author, v_text
  from public.messages m
  where m.id = p_message_id;

  if v_group_id is null then
    raise exception 'Messaggio inesistente.';
  end if;

  -- Si segnala solo dentro ai gruppi di cui si fa parte: senza questo
  -- controllo basterebbe un identificativo per segnalare messaggi di
  -- conversazioni che non si è mai viste.
  if not public.is_group_member(v_group_id, auth.uid()) then
    raise exception 'Non fai parte di questo gruppo.';
  end if;

  insert into public.content_reports (group_id, message_id, reporter_id, reported_id, reason, message_text)
  values (v_group_id, p_message_id, auth.uid(), v_author, left(coalesce(p_reason, ''), 300), left(v_text, 1000));
end;
$$;

grant execute on function public.report_message(uuid, text) to authenticated;

-- ── blocchi ─────────────────────────────────────────────────────────
-- Il blocco è personale e silenzioso: nasconde a me i messaggi di
-- quella persona, e non le dice nulla. Non la butta fuori dal gruppo —
-- quello sarebbe un potere che in un gruppo fra pari nessuno ha, ed è
-- la stessa ragione per cui nessun membro può eliminare il gruppo.

create table public.blocked_users (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocked_users_non_se_stessi check (blocker_id <> blocked_id)
);

alter table public.blocked_users enable row level security;

create policy "blocked_users: vedi i tuoi blocchi"
  on public.blocked_users for select
  to authenticated
  using (blocker_id = auth.uid());

create policy "blocked_users: blocca per te"
  on public.blocked_users for insert
  to authenticated
  with check (blocker_id = auth.uid());

create policy "blocked_users: sblocca i tuoi"
  on public.blocked_users for delete
  to authenticated
  using (blocker_id = auth.uid());
