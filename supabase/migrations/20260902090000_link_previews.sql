-- Insieme — cache delle anteprime dei link condivisi in chat.
--
-- I metadati (titolo, descrizione, immagine) stanno nei tag Open Graph
-- dentro l'HTML della pagina. Leggerli dal client non è possibile: dal
-- browser il CORS blocca la lettura di siti terzi, e anche dove funziona
-- (app nativa) significherebbe che ogni membro riscarica la stessa pagina
-- a ogni apertura della chat. Li legge quindi una Edge Function
-- (supabase/functions/link-preview) e li deposita qui.
--
-- La tabella non è legata ai gruppi: l'anteprima di una pagina pubblica non
-- è un contenuto privato, e tenerla globale moltiplica i colpi di cache.
create table public.link_previews (
  url text primary key,
  title text,
  description text,
  image_url text,
  site_name text,
  -- false quando la pagina non è raggiungibile o non espone metadati:
  -- serve a non riprovare a ogni apertura della chat.
  ok boolean not null default true,
  fetched_at timestamptz not null default now(),
  constraint link_previews_url_len check (char_length(url) <= 2048)
);

alter table public.link_previews enable row level security;

-- Lettura libera per chi è autenticato: sono metadati di pagine pubbliche.
create policy "link_previews: lettura autenticati"
  on public.link_previews for select
  to authenticated
  using (true);

-- Nessuna policy di scrittura di proposito: l'unica cosa che scrive qui è
-- la Edge Function, che usa la chiave di servizio e scavalca le RLS. Così
-- un client non può avvelenare la cache con anteprime inventate.
