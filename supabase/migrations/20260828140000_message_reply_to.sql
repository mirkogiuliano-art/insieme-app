-- Insieme — risposte con citazione (Fase 2 del piano "chat avanzata").
--
-- Nessuna colonna denormalizzata per l'anteprima citata: il client la
-- risolve cercando l'id tra i messaggi già caricati (gli ultimi 150, non
-- c'è paginazione all'indietro) — evita di duplicare autore/testo qui.
alter table public.messages add column reply_to_id uuid references public.messages(id) on delete set null;
