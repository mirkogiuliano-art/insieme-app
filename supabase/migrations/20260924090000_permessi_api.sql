-- Insieme — i permessi delle tabelle, scritti a mano.
--
-- Fino a oggi Supabase concedeva da sé l'accesso alle nuove tabelle dello
-- schema `public` ai ruoli dell'API (anon, authenticated, service_role).
-- Dal 30 ottobre 2026 smette di farlo: una tabella creata senza GRANT
-- esiste nel database ma l'app non la vede, e ogni chiamata torna
-- "permission denied".
--
-- Le tabelle già create restano come sono — il progetto in uso non cambia.
-- Il problema sono le **migrazioni**: rieseguite su un progetto nuovo, su
-- un ramo di prova o dopo un `supabase db reset`, creerebbero tabelle
-- irraggiungibili. Per questo i permessi si scrivono qui, una volta per
-- tutte le tabelle esistenti, e d'ora in poi vanno messi **nella stessa
-- migrazione che crea la tabella**.
--
-- ── Chi può cosa ────────────────────────────────────────────────────
-- Solo `authenticated` (chi ha fatto l'accesso) e `service_role` (le
-- Edge Function con la chiave di servizio). Ad `anon` non si concede
-- niente: in Insieme non esiste niente di pubblico — ogni riga è di un
-- gruppo, e si entra solo con un invito.
--
-- Il GRANT apre la porta, non decide chi entra: a filtrare riga per riga
-- restano le regole RLS, che ogni tabella ha già. Le due cose lavorano
-- insieme, e senza RLS un GRANT sarebbe una porta spalancata.

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles',
    'groups',
    'group_members',
    'group_invites',
    'group_facts',
    'messages',
    'message_reactions',
    'polls',
    'poll_votes',
    'links',
    'link_categories',
    'link_previews',
    'pins',
    'place_categories',
    'place_links',
    'push_tokens',
    'content_reports',
    'blocked_users'
  ]
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;
