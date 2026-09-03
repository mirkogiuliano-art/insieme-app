-- Insieme — fix: gli eventi DELETE realtime filtrati per group_id non
-- arrivavano mai al client.
--
-- Postgres, di default, include nel record "old" di un evento DELETE/UPDATE
-- solo le colonne della chiave primaria (REPLICA IDENTITY DEFAULT). Le
-- subscription di questa app filtrano sempre per group_id
-- (`filter: group_id=eq.${groupId}`), ma group_id non è la chiave primaria
-- di nessuna di queste tabelle — quindi Supabase Realtime non riusciva a
-- valutare il filtro sull'evento DELETE e non lo consegnava mai. L'effetto
-- pratico: cancellare un link/pin/categoria (o lasciare un gruppo) non
-- aggiornava la lista in tempo reale, nemmeno per chi aveva appena cliccato
-- "elimina" — serviva un refresh manuale per far sparire l'elemento.
--
-- REPLICA IDENTITY FULL include tutte le colonne nel record "old", così il
-- filtro su group_id può essere valutato anche per gli eventi DELETE.
alter table public.links replica identity full;
alter table public.pins replica identity full;
alter table public.link_categories replica identity full;
alter table public.place_categories replica identity full;
alter table public.group_members replica identity full;
