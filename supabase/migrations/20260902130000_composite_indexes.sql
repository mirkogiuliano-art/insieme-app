-- Insieme — indici allineati alle query che l'app fa davvero.
--
-- Ogni elenco filtra per gruppo E ordina per data:
--   messages:      group_id = ? order by created_at desc limit 150
--   links / pins:  group_id = ? order by created_at desc
--   place_links:   group_id = ? order by created_at desc
--   categorie:     group_id = ? order by created_at asc
--
-- Gli indici però coprivano il solo `group_id`: il database trovava le
-- righe in fretta ma doveva poi riordinarle a ogni lettura. Con poche
-- centinaia di righe non si nota, con qualche migliaio sì — e il costo
-- cresce proprio dove fa più male, cioè nella chat.
--
-- Un indice su (group_id, created_at) serve entrambe le cose: le righe
-- escono già nell'ordine giusto. Serve anche tutte le query che filtravano
-- il solo gruppo, perché `group_id` è la prima colonna: gli indici a
-- colonna singola diventano quindi ridondanti e vengono rimossi, così non
-- si paga il loro aggiornamento a ogni scrittura.

create index messages_group_created_idx on public.messages (group_id, created_at desc);
drop index if exists public.messages_group_id_idx;

create index links_group_created_idx on public.links (group_id, created_at desc);
drop index if exists public.links_group_id_idx;

create index pins_group_created_idx on public.pins (group_id, created_at desc);
drop index if exists public.pins_group_id_idx;

create index place_links_group_created_idx on public.place_links (group_id, created_at desc);
drop index if exists public.place_links_group_id_idx;

create index link_categories_group_created_idx on public.link_categories (group_id, created_at);
drop index if exists public.link_categories_group_id_idx;

create index place_categories_group_created_idx on public.place_categories (group_id, created_at);
drop index if exists public.place_categories_group_id_idx;

-- Le reazioni non si ordinano: si leggono tutte quelle del gruppo e si
-- raggruppano lato client. L'indice per gruppo va benissimo così com'è,
-- e quello per messaggio serve alla cancellazione a cascata dei messaggi.

-- `group_invites` ha già un vincolo di unicità su group_id, e un vincolo
-- di unicità in Postgres crea il proprio indice: questo era una copia.
drop index if exists public.group_invites_group_id_idx;
