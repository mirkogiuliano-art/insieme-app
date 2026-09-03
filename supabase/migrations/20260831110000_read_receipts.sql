-- Insieme — spunte di lettura semplificate (Fase 6 del piano "chat avanzata").
--
-- Un solo timestamp per membro (l'ultima volta che ha aperto la chat),
-- non una riga per ogni coppia messaggio/utente: per sapere se un
-- messaggio è stato letto da almeno un altro membro basta confrontare
-- il suo orario con last_read_at degli altri membri — niente esplosione
-- di righe, niente distinzione inviato/consegnato (vedi piano per il
-- perché quella distinzione è fuori scope in una chat di gruppo via
-- Realtime).
alter table public.group_members add column last_read_at timestamptz;

-- Serviva già per is_group_member() nelle RLS di altre tabelle, ma
-- group_members non aveva ancora una policy UPDATE: finora nessuno poteva
-- modificare la propria riga (solo inserirla/cancellarla).
create policy "group_members: aggiorna solo la propria lettura"
  on public.group_members for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
