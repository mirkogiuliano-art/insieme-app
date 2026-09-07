-- Insieme — preferiti sui link, condivisi con tutto il gruppo.
--
-- Una sola stellina per link, non una per persona: chi la mette o la
-- toglie lo fa per tutti i membri, coerentemente col resto dell'app, dove
-- categorie e link sono già modificabili da chiunque nel gruppo senza
-- ruoli. Per questo basta una colonna booleana su `links`, non una tabella
-- a parte come per le reazioni ai messaggi (quelle sì personali).
alter table public.links add column is_favorite boolean not null default false;

-- Le liste dei preferiti filtrano per gruppo e per questo booleano: un
-- indice parziale (solo le righe vere) costa pochissimo da mantenere,
-- visto che i preferiti sono sempre una piccola minoranza dei link.
create index links_group_favorite_idx on public.links (group_id) where is_favorite;

-- La scrittura passa già dalla policy esistente "links: scrittura membri
-- per sé" per l'inserimento, ma quella riguarda solo l'INSERT. Serve una
-- policy di UPDATE perché il pulsante togglerà solo `is_favorite`, non
-- l'intera riga: qualsiasi membro può farlo, come già per l'eliminazione.
create policy "links: aggiorna preferiti membri"
  on public.links for update
  to authenticated
  using (
    exists (
      select 1 from public.group_members m
      where m.group_id = links.group_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.group_members m
      where m.group_id = links.group_id and m.user_id = auth.uid()
    )
  );
