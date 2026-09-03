-- link_categories non aveva una colonna data: senza, l'ordine di ritorno
-- dalle query non è garantito (es. "Generale", creata insieme al gruppo,
-- potrebbe non comparire per prima nell'elenco). Aggiunta per un ordine
-- stabile lato client (Fase 3 del piano multi-utente).
alter table public.link_categories
  add column created_at timestamptz not null default now();
