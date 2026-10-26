-- Insieme — gruppi pubblici: come la pagina di un viaggiatore. Chiunque su
-- Insieme vede info, salvati e posti; la chat, le «Cose da sapere» e i
-- membri restano dentro. Lo decide solo chi ha creato il gruppo, e serve
-- un nome utente unico, con cui gli altri lo trovano.
--
-- Cosa cambia per chi non è nel gruppo, solo se il gruppo è pubblico:
-- - legge il gruppo (nome, colore, descrizione, date, meta), i salvati con
--   le loro categorie, i posti con le loro categorie e i collegamenti fra
--   posti e salvati. Mai messaggi, reazioni, sondaggi, «Cose da sapere»,
--   membri, inviti;
-- - non scrive niente: le regole di scrittura restano dei soli membri;
-- - chi ha creato il gruppo e i suoi altri gruppi pubblici si vedono dalle
--   funzioni qui sotto, che danno solo nome, nome utente e quanti sono gli
--   altri membri.
--
-- Il gruppo torna privato da solo se chi l'ha creato ne esce o elimina
-- l'account: senza di lui nessuno potrebbe più deciderlo.
--
-- Chi ha bloccato chi: due persone che si sono bloccate non si trovano e
-- non vedono l'una i gruppi pubblici dell'altra, come su Instagram.

-- ── Le colonne ──────────────────────────────────────────────────────
alter table public.groups add column pubblico boolean not null default false;

-- Da 3 a 24 caratteri fra minuscole, cifre, punto e trattino basso, senza
-- punto all'inizio o alla fine (le stesse regole di src/lib/nomeUtente.ts).
alter table public.profiles add column nome_utente text unique
  constraint profiles_nome_utente_formato check (nome_utente ~ '^[a-z0-9._]{3,24}$' and nome_utente !~ '^\.' and nome_utente !~ '\.$');

-- ── Il gruppo è pubblico, per chi guarda? ───────────────────────────
-- Due persone che si sono bloccate, in una direzione o nell'altra.
create function public.si_sono_bloccati(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocked_users
    where (blocker_id = p_a and blocked_id = p_b) or (blocker_id = p_b and blocked_id = p_a)
  );
$$;

-- Pubblico, con chi l'ha creato ancora lì, e fra chi guarda e chi l'ha
-- creato nessun blocco. Con i permessi del database, come is_group_member:
-- usata dentro le regole di lettura, non deve passare a sua volta dalle
-- regole dei gruppi.
create function public.gruppo_pubblico(p_group_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.groups
    where id = p_group_id and pubblico and created_by is not null
      and not public.si_sono_bloccati(auth.uid(), created_by)
  );
$$;

-- ── Lettura per chi non è nel gruppo ────────────────────────────────
-- Si aggiungono alle regole dei membri, che restano come sono.
create policy "groups: pubblici in lettura" on public.groups for select to authenticated
  using (public.gruppo_pubblico(id));
create policy "links: pubblici in lettura" on public.links for select to authenticated
  using (public.gruppo_pubblico(group_id));
create policy "link_categories: pubblici in lettura" on public.link_categories for select to authenticated
  using (public.gruppo_pubblico(group_id));
create policy "pins: pubblici in lettura" on public.pins for select to authenticated
  using (public.gruppo_pubblico(group_id));
create policy "place_categories: pubblici in lettura" on public.place_categories for select to authenticated
  using (public.gruppo_pubblico(group_id));
create policy "place_links: pubblici in lettura" on public.place_links for select to authenticated
  using (public.gruppo_pubblico(group_id));

-- ── Renderlo pubblico o privato ─────────────────────────────────────
-- I gruppi si modificano solo da funzioni (nessuna regola di scrittura
-- diretta): questa è l'unica strada per la visibilità.
create function public.rendi_pubblico(p_group_id text, p_pubblico boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_autore uuid;
begin
  select created_by into v_autore from public.groups where id = p_group_id;
  if v_autore is null or v_autore <> auth.uid() or not public.is_group_member(p_group_id, auth.uid()) then
    raise exception 'Solo chi ha creato il gruppo può cambiarne la visibilità.';
  end if;
  if p_pubblico and not exists (select 1 from public.profiles where id = auth.uid() and nome_utente is not null) then
    raise exception 'Prima scegli il tuo nome utente.';
  end if;
  update public.groups set pubblico = p_pubblico where id = p_group_id;
end;
$$;

-- Chi l'ha creato esce (o elimina l'account): il gruppo torna privato.
create function public.privato_se_esce_chi_lo_ha_creato()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.groups set pubblico = false
  where id = old.group_id and created_by = old.user_id and pubblico;
  return old;
end;
$$;

create trigger privato_se_esce_chi_lo_ha_creato
  after delete on public.group_members
  for each row execute function public.privato_se_esce_chi_lo_ha_creato();

-- ── Trovare gruppi e persone ────────────────────────────────────────
-- Almeno due lettere; si cerca per pezzo di nome, senza caratteri jolly.
-- Solo gruppi pubblici e solo persone con almeno un gruppo pubblico: chi
-- usa Insieme in privato non si trova.
create function public.cerca_gruppi_pubblici(p_testo text)
returns table (id text, nome text, colore text, autore_id uuid, autore_nome text, autore_nome_utente text, altri int, link int, posti int, starts_on date, ends_on date)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.name, coalesce(g.color, ''), g.created_by, coalesce(p.display_name, ''), p.nome_utente,
         (select count(*)::int from public.group_members m where m.group_id = g.id and m.user_id <> g.created_by),
         (select count(*)::int from public.links l where l.group_id = g.id),
         (select count(*)::int from public.pins x where x.group_id = g.id),
         g.starts_on, g.ends_on
  from public.groups g
  join public.profiles p on p.id = g.created_by
  where public.gruppo_pubblico(g.id)
    and p.nome_utente is not null
    and char_length(btrim(p_testo)) >= 2
    and strpos(lower(g.name), lower(btrim(p_testo))) > 0
  order by g.name
  limit 20;
$$;

create function public.cerca_persone(p_testo text)
returns table (id uuid, nome text, nome_utente text, gruppi int)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, coalesce(p.display_name, ''), p.nome_utente, count(g.id)::int
  from public.profiles p
  join public.groups g on g.created_by = p.id and public.gruppo_pubblico(g.id)
  where p.nome_utente is not null
    and char_length(ltrim(btrim(p_testo), '@')) >= 2
    and (strpos(lower(coalesce(p.display_name, '')), lower(btrim(p_testo))) > 0
         or strpos(p.nome_utente, lower(ltrim(btrim(p_testo), '@'))) > 0)
  group by p.id
  order by 2
  limit 20;
$$;

-- La pagina di una persona: lei e i suoi gruppi pubblici.
create function public.profilo_pubblico(p_utente uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when p.nome_utente is null or public.si_sono_bloccati(auth.uid(), p.id) then null else jsonb_build_object(
    'persona', jsonb_build_object('id', p.id, 'nome', coalesce(p.display_name, ''), 'nome_utente', p.nome_utente),
    'gruppi', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'nome', g.name, 'colore', coalesce(g.color, ''),
        'altri', (select count(*) from public.group_members m where m.group_id = g.id and m.user_id <> g.created_by),
        'link', (select count(*) from public.links l where l.group_id = g.id),
        'posti', (select count(*) from public.pins x where x.group_id = g.id),
        'starts_on', g.starts_on, 'ends_on', g.ends_on
      ) order by g.starts_on desc nulls last, g.name)
      from public.groups g
      where g.created_by = p.id and public.gruppo_pubblico(g.id)
    ), '[]'::jsonb)
  ) end
  from public.profiles p
  where p.id = p_utente;
$$;

-- L'intestazione di un gruppo pubblico (o di un proprio gruppo): salvati
-- e posti li leggono le sezioni, con le regole qui sopra.
create function public.pagina_gruppo(p_group_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'gruppo', jsonb_build_object(
      'id', g.id, 'name', g.name, 'color', g.color, 'created_by', g.created_by, 'created_at', g.created_at,
      'description', g.description, 'starts_on', g.starts_on, 'ends_on', g.ends_on,
      'meta_nome', coalesce(g.meta_nome, (select x.name from public.pins x where x.id = g.place_pin_id)),
      'meta_lat', g.meta_lat, 'meta_lng', g.meta_lng, 'meta_maps_url', g.meta_maps_url, 'pubblico', g.pubblico
    ),
    'autore', jsonb_build_object('id', p.id, 'nome', coalesce(p.display_name, ''), 'nome_utente', p.nome_utente),
    'altri', (select count(*) from public.group_members m where m.group_id = g.id and m.user_id <> g.created_by)
  )
  from public.groups g
  join public.profiles p on p.id = g.created_by
  where g.id = p_group_id
    and (public.is_group_member(g.id, auth.uid()) or public.gruppo_pubblico(g.id));
$$;

create function public.nome_utente_libero(p_nome text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from public.profiles where nome_utente = lower(p_nome));
$$;

-- ── Segnalare un gruppo pubblico ────────────────────────────────────
-- Come report_message, ma per un gruppo che si vede da fuori.
create function public.segnala_gruppo(p_group_id text, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.groups;
begin
  if auth.uid() is null then
    raise exception 'Devi essere autenticato.';
  end if;
  select * into g from public.groups where id = p_group_id;
  if g.id is null or not (public.gruppo_pubblico(g.id) or public.is_group_member(g.id, auth.uid())) then
    raise exception 'Gruppo non trovato.';
  end if;
  insert into public.content_reports (group_id, message_id, reporter_id, reported_id, reason, message_text)
  values (g.id, null, auth.uid(), g.created_by, left(coalesce(p_motivo, ''), 300), left('Gruppo pubblico: ' || g.name, 1000));
end;
$$;

-- ── Permessi ────────────────────────────────────────────────────────
revoke all on function public.gruppo_pubblico(text) from public, anon;
revoke all on function public.si_sono_bloccati(uuid, uuid) from public, anon;
revoke all on function public.rendi_pubblico(text, boolean) from public, anon;
revoke all on function public.privato_se_esce_chi_lo_ha_creato() from public, anon, authenticated;
revoke all on function public.cerca_gruppi_pubblici(text) from public, anon;
revoke all on function public.cerca_persone(text) from public, anon;
revoke all on function public.profilo_pubblico(uuid) from public, anon;
revoke all on function public.pagina_gruppo(text) from public, anon;
revoke all on function public.nome_utente_libero(text) from public, anon;
revoke all on function public.segnala_gruppo(text, text) from public, anon;
grant execute on function public.gruppo_pubblico(text) to authenticated;
grant execute on function public.si_sono_bloccati(uuid, uuid) to authenticated;
grant execute on function public.rendi_pubblico(text, boolean) to authenticated;
grant execute on function public.cerca_gruppi_pubblici(text) to authenticated;
grant execute on function public.cerca_persone(text) to authenticated;
grant execute on function public.profilo_pubblico(uuid) to authenticated;
grant execute on function public.pagina_gruppo(text) to authenticated;
grant execute on function public.nome_utente_libero(text) to authenticated;
grant execute on function public.segnala_gruppo(text, text) to authenticated;
