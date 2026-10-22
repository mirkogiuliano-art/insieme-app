-- Insieme — ognuno può eliminare i propri messaggi.
--
-- Prima un messaggio mandato per sbaglio (una foto nel gruppo sbagliato)
-- restava per sempre. Ora chi l'ha scritto lo può togliere, per tutti.
--
-- Cosa succede al resto:
-- - le reazioni se ne vanno con lui (message_reactions, on delete cascade);
-- - le risposte restano, e al posto della citazione mostrano «Messaggio non
--   disponibile» (reply_to_id, on delete set null);
-- - una segnalazione già fatta resta, con il testo che il messaggio aveva
--   (content_reports.message_text): eliminarlo non cancella le prove;
-- - i file allegati li toglie la spazzata di storage-cleanup, che l'app
--   chiama dopo l'eliminazione.
-- I messaggi dei sondaggi non si eliminano dall'app: il sondaggio si chiude.

create policy "messages: cancella solo i propri"
  on public.messages
  for delete
  to authenticated
  using (user_id = auth.uid());
