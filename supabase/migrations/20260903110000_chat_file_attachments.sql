-- Insieme — allegare documenti (PDF, Word, Excel...) ai messaggi, non solo
-- foto, video e vocali.
--
-- `attachment_type` è già una colonna testo senza vincolo CHECK (vedi
-- 20260831090000_chat_attachments.sql), quindi il nuovo valore 'file' non
-- richiede nessuna modifica di schema per essere accettato.
--
-- Serve però il nome originale del file: per una foto o un video non conta
-- (si vede l'anteprima), ma per un documento è l'unica cosa leggibile —
-- senza, in chat comparirebbe solo l'indirizzo interno dello storage
-- ({uuid}.pdf), illeggibile. La dimensione è un più: utile per farsi
-- un'idea prima di aprire un file su rete mobile.
alter table public.messages add column attachment_name text;
alter table public.messages add column attachment_size integer;
