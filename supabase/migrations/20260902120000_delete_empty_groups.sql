-- Insieme — un gruppo senza più membri viene eliminato.
--
-- Finora uscire da un gruppo cancellava solo la propria iscrizione. Se a
-- uscire era l'ultimo membro, il gruppo restava nel database insieme a
-- messaggi, link, posti, categorie e file: invisibile a chiunque (la
-- lettura è ristretta ai membri) e non più eliminabile da nessuno, perché
-- su `groups` non esiste una policy di cancellazione.
--
-- L'uscita passa ora da una funzione che, rimasto il gruppo vuoto, lo
-- elimina. Tutte e nove le tabelle che puntano a `groups` hanno
-- `on delete cascade`, quindi la pulizia è completa senza altro lavoro.
--
-- Di proposito NON viene aggiunta una policy di cancellazione su `groups`:
-- l'app non ha ruoli, e un membro qualsiasi non deve poter distruggere il
-- gruppo con dentro il materiale di tutti. L'unica eliminazione possibile
-- resta quella automatica del gruppo ormai vuoto.

create function public.leave_group(p_group_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer;
begin
  if auth.uid() is null then
    raise exception 'Devi essere autenticato.';
  end if;

  delete from public.group_members
  where group_id = p_group_id and user_id = auth.uid();

  select count(*) into v_remaining
  from public.group_members
  where group_id = p_group_id;

  if v_remaining = 0 then
    delete from public.groups where id = p_group_id;
    return true;   -- il gruppo è stato eliminato
  end if;

  return false;    -- restano altri membri
end;
$$;

grant execute on function public.leave_group(text) to authenticated;

-- Numero di membri, per poter avvisare chi sta per uscire che è rimasto
-- solo e che quindi il gruppo sparirà. Serve una funzione perché il
-- conteggio va fatto prima di uscire, quando si è ancora membri, ma è
-- comodo averlo in un unico posto.
create function public.count_group_members(p_group_id text)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select case
    when public.is_group_member(p_group_id, auth.uid())
      then (select count(*)::integer from public.group_members where group_id = p_group_id)
    else 0
  end;
$$;

grant execute on function public.count_group_members(text) to authenticated;

-- Tolta l'uscita diretta: se restasse, si potrebbe cancellare la propria
-- iscrizione scavalcando la funzione e lasciando di nuovo un gruppo orfano.
drop policy if exists "group_members: esci solo per sé" on public.group_members;
