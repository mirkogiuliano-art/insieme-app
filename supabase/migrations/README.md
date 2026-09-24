# Le migrazioni

Ogni file qui dentro è un passo del database, applicato una volta sola e in
ordine di nome. I file già applicati non si riscrivono: si aggiunge un file
nuovo.

## Una tabella nuova ha bisogno dei permessi

Fino a ottobre 2026 Supabase concedeva da sé l'accesso alle nuove tabelle di
`public` ai ruoli dell'API. Dal **30 ottobre 2026** non lo fa più: una tabella
creata senza `GRANT` esiste nel database ma l'app non la vede, e ogni chiamata
torna `permission denied`.

Quindi **la migrazione che crea una tabella le dà anche i permessi**, subito
sotto, insieme alle regole RLS:

```sql
create table public.nuova_cosa ( ... );

alter table public.nuova_cosa enable row level security;
create policy "nuova_cosa: lettura membri" on public.nuova_cosa for select
  to authenticated using (public.is_group_member(nuova_cosa.group_id, auth.uid()));

grant select, insert, update, delete on public.nuova_cosa to authenticated;
grant select, insert, update, delete on public.nuova_cosa to service_role;
```

Le tabelle nate prima di questa regola sono sistemate in
`20260924090000_permessi_api.sql`, che le elenca tutte.

**Ad `anon` non si concede niente.** In Insieme non c'è niente di pubblico:
ogni riga appartiene a un gruppo, e in un gruppo si entra solo con un invito.
Chi non ha fatto l'accesso non deve poter chiedere nulla al database.

## Permesso e regola sono due cose diverse

Il `GRANT` apre la porta della tabella; le **regole RLS** decidono quali righe
passano, una per una. Servono tutte e due: senza RLS un `GRANT` a
`authenticated` lascerebbe leggere a chiunque abbia un account i gruppi di
tutti gli altri.

## Come si applicano

Le migrazioni di questo progetto sono state eseguite sul database remoto una
alla volta. Su un progetto nuovo (o dopo un `supabase db reset`) vengono
rieseguite tutte in ordine: per questo devono bastare a se stesse, permessi
compresi.
