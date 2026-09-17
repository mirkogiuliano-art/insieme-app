-- Insieme — dove sono i telefoni a cui mandare gli avvisi.
--
-- Ogni dispositivo che accetta le notifiche riceve da Expo un codice, e
-- quel codice è l'indirizzo a cui si spedisce. Qui si tiene la
-- corrispondenza fra codice e persona: al momento di avvisare, da un
-- gruppo si arriva ai suoi membri e dai membri ai loro telefoni.
--
-- La chiave è il codice del dispositivo, non la coppia utente+codice:
-- uno stesso telefono deve appartenere a **una persona sola**. Se qualcuno
-- esce e ci entra un altro account, la riga vecchia non deve sopravvivere,
-- altrimenti il telefono continuerebbe a ricevere i messaggi di chi non lo
-- usa più — che è una fuga di dati, non un fastidio.
--
-- Proprio per questo la tabella non si scrive direttamente: le regole di
-- riga permettono solo di leggere le proprie, e per registrarsi si passa
-- da register_push_token(), che prima libera il codice da eventuali
-- proprietari precedenti. Con una semplice policy di inserimento non si
-- potrebbe fare: cancellare la riga di un altro utente sarebbe vietato, e
-- l'inserimento fallirebbe in silenzio lasciando il vecchio proprietario
-- collegato al telefono.

create table public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text,
  updated_at timestamptz not null default now()
);

create index push_tokens_user_id_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

-- Sola lettura, e solo delle proprie: serve a un eventuale elenco dei
-- dispositivi collegati. Scritture nessuna: passano dalle due funzioni.
create policy "push_tokens: leggi i tuoi dispositivi"
  on public.push_tokens for select
  to authenticated
  using (user_id = auth.uid());

/** Registra (o riassegna) il telefono di chi chiama. */
create function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Devi essere autenticato.';
  end if;
  if p_token is null or length(p_token) < 10 then
    raise exception 'Codice del dispositivo non valido.';
  end if;

  -- Il telefono cambia proprietario: chi c'era prima smette di ricevere.
  delete from public.push_tokens where token = p_token;

  insert into public.push_tokens (token, user_id, platform)
  values (p_token, auth.uid(), p_platform);
end;
$$;

grant execute on function public.register_push_token(text, text) to authenticated;

/** Stacca il telefono dall'account, all'uscita. */
create function public.forget_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.push_tokens
  where token = p_token and user_id = auth.uid();
end;
$$;

grant execute on function public.forget_push_token(text) to authenticated;
