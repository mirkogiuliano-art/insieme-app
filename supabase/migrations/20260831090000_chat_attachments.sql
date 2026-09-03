-- Insieme — allegati foto/video in chat (Fase 3 del piano "chat avanzata").
--
-- Bucket pubblico: la lettura è un URL diretto, senza URL firmati da
-- rinnovare — coerente con il resto dell'app (il codice invito a 6
-- caratteri è già l'unica vera barriera, condiviso in chiaro; i link nella
-- tab Link sono già URL esterni pubblici). Solo la scrittura (upload) è
-- vincolata ai membri del gruppo via RLS, con lo stesso helper
-- is_group_member() già usato ovunque. Path degli oggetti:
-- {group_id}/{uuid}.{estensione} — split_part(name,'/',1) estrae il
-- group_id dal path per la policy.
insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', true)
on conflict (id) do nothing;

create policy "chat-media: caricamento membri"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-media'
    and public.is_group_member(split_part(name, '/', 1), auth.uid())
  );

-- messages: il testo diventa facoltativo (un messaggio può essere solo un
-- allegato), più le colonne per l'allegato stesso.
alter table public.messages alter column text drop not null;
alter table public.messages add column attachment_url text;
alter table public.messages add column attachment_type text; -- 'image' | 'video'

alter table public.messages add constraint messages_text_or_attachment
  check (text is not null or attachment_url is not null);
