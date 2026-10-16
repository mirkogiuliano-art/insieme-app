-- Insieme — chi ha creato un gruppo può cancellare il proprio account.
--
-- `groups.created_by` puntava all'account senza dire cosa fare quando
-- l'account sparisce. Il risultato: chi aveva creato un gruppo in cui
-- restano altre persone non riusciva a cancellarsi. La cancellazione
-- (supabase/functions/delete-account) si fermava con un errore del
-- database, e l'informativa promette che si fa dall'app, subito.
--
-- Se ne accorgeva solo chi aveva creato un gruppo condiviso: i gruppi
-- rimasti senza nessuno vengono eliminati prima dell'account, e con loro
-- il legame.
--
-- `set null` e non `cascade`: il gruppo è di chi ci resta, e non deve
-- sparire perché se ne va chi l'ha aperto. Il campo è già facoltativo, e
-- non lo usa nessuna regola di accesso: serve solo a sapere da dove è
-- nato il gruppo, finché quella persona c'è.

alter table public.groups drop constraint groups_created_by_fkey;
alter table public.groups
  add constraint groups_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;
