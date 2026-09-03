-- Insieme — due varchi rimasti aperti dopo il passaggio all'accesso su invito.

-- ── 1. Niente creazione diretta di gruppi ────────────────────────────
--
-- `create_group` è diventata security definer, ma la vecchia regola di
-- inserimento su `groups` era rimasta: un client poteva scavalcarla e
-- creare una riga a mano, ottenendo un gruppo con zero membri e zero
-- categorie — invisibile a tutti (la lettura è ristretta ai membri) e non
-- eliminabile da nessuno. Verificato: l'inserimento riusciva.
--
-- È lo stesso problema degli orfani che abbiamo chiuso sull'uscita, ma dal
-- lato opposto: là si impediva a un gruppo di *diventare* orfano, qui di
-- *nascere* orfano. Togliendo la regola, l'unica strada resta create_group,
-- che crea gruppo, primo membro, invito e categorie in un colpo solo.
drop policy if exists "groups: crea solo per sé" on public.groups;

-- ── 2. I profili non sono più un elenco pubblico ─────────────────────
--
-- La lettura era `using (true)`: chiunque si registrasse poteva elencare i
-- nomi di tutti gli utenti del progetto. Ora che i gruppi sono chiusi era
-- rimasta l'ultima porta aperta.
--
-- Serve una funzione security definer, non una sottointerrogazione diretta:
-- la regola su `profiles` deve leggere `group_members`, che ha una regola
-- propria, e intrecciare le due rischia il tipo di ricorsione già visto in
-- 20260828090000_fix_group_members_recursion.sql.
create function public.shares_group_with(p_a uuid, p_b uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.group_members x
    join public.group_members y on y.group_id = x.group_id
    where x.user_id = p_a and y.user_id = p_b
  );
$$;

grant execute on function public.shares_group_with(uuid, uuid) to authenticated;

drop policy if exists "profiles: lettura autenticati" on public.profiles;

-- Il proprio profilo si legge sempre: serve all'avvio, prima ancora di
-- far parte di un gruppo.
create policy "profiles: sé e chi condivide un gruppo"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.shares_group_with(auth.uid(), id));
