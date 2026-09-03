-- Insieme — messaggi vocali (Fase 4 del piano "chat avanzata").
--
-- Riusano bucket, colonne e RLS già creati per gli allegati foto/video
-- (20260831090000_chat_attachments.sql) — attachment_type prende anche il
-- valore 'audio', nessun nuovo permesso di storage necessario. L'unica
-- aggiunta è la durata, per mostrarla nel fumetto senza dover scaricare il
-- file.
alter table public.messages add column attachment_duration_seconds integer;
