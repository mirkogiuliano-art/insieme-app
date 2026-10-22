# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

## Users

Qualsiasi gruppo di persone che si conoscono e hanno progetti in comune:
amici, coppie, famiglie, colleghi. Il viaggio organizzato insieme è il caso
più forte, non l'unico: lo stesso spazio serve per la lista dei posti dove
andare, una serata da decidere, un progetto che dura mesi.

Sono gruppi piccoli e chiusi: si entra solo con un invito di chi c'è già.

## Product Purpose

Insieme è lo spazio condiviso di un gruppo. Tiene in un posto solo la
conversazione, i link e i video salvati, i posti sulla mappa e quello che
serve sapere a tutti, che altrimenti finiscono sparsi fra chat, liste di
mappe e messaggi persi.

Funziona quando chi fa parte del gruppo trova quello che è stato detto,
salvato o deciso senza doverlo cercare altrove.

## Positioning

Tutto in un posto, e le cose si tengono a vicenda. Un video si collega al
posto della mappa di cui parla, un posto si manda in chat, un link salvato
si rimanda in chat, la meta del gruppo è un posto toccabile della mappa.
Chi usa WhatsApp, le liste di Google Maps e i link sparsi ha gli stessi
contenuti in app che non si parlano fra loro.

## Operating Context

- Si usa sul telefono, in verticale.
- Si usa prima e durante: a casa si raccolgono idee, video e posti; fuori,
  in movimento, servono la mappa, «Portami lì» e la chat.
- I contenuti arrivano spesso da altre app con la condivisione di sistema
  di Android: link, testo, foto, video e PDF, verso la chat o fra i link.
- I messaggi arrivano anche come notifiche.
- L'app parla italiano o inglese, seguendo la lingua del telefono (in
  qualunque altra lingua usa l'inglese). Chi la usa può cambiare lingua.

## Capabilities and Constraints

- **Gruppi:** solo su invito, con un link revocabile e rigenerabile. Non
  esistono ruoli: ogni membro può aggiungere, correggere e togliere tutto
  (info, categorie, posti, link). Un gruppo si elimina quando ne esce
  l'ultima persona.
- **Account:** email e password, oppure Google. Il nome si sceglie al primo
  avvio. L'account si cancella dall'app, subito.
- **Chat:** testo, risposte, reazioni, foto, video, messaggi vocali,
  documenti, posti, sondaggi, ricerca, archivio di quanto è stato mandato,
  conferme di lettura.
- **Link e video:** categorie modificabili, preferiti, anteprime, vista a
  elenco o a griglia, ordinamento, collegamento ai posti.
- **Mappa:** posti con categorie, ricerca per nome, link di Google Maps,
  vista a elenco, «Portami lì».
- **Info del gruppo:** descrizione, date con conto alla rovescia, meta,
  «cose da sapere», membri, invito. Date e meta sono facoltative: un gruppo
  che non è un viaggio le lascia vuote.
- **Sicurezza fra persone:** segnalare un messaggio, bloccare qualcuno.
- **Stack:** Expo e React Native, expo-router, Supabase con i dati
  nell'Unione Europea (Irlanda), Sentry per gli errori, build con EAS.
- **Chi lo fa:** una sola persona.
- **Servizio:** gratuito, senza pubblicità. Età minima 16 anni.
- **iPhone:** arriva dopo Android, con lo stesso aspetto dell'app e non con
  quello nativo di iOS. Quando non è ancora deciso.
- **Prenotazioni** (biglietti, tavoli, treni): sono state costruite e poi
  tolte nell'ottobre 2026, per scelta. Non fanno parte del prodotto.

## Brand Commitments

- Il nome è **Insieme**. Logo e icone sono in `assets/` (`logo.svg`,
  `icon.png`, `adaptive-icon.png`, `notification-icon.png`, `splash.png`).
- Lo slogan in uso è «Tutto quello che vuoi vivere, in un posto solo.».
- La voce è un italiano piano e diretto, a frasi intere, dalla parte di chi
  usa l'app. Gli errori dicono cosa è successo e cosa fare. Anche i
  documenti legali sono scritti per essere letti.

## Evidence on Hand

- L'app non è ancora pubblicata. Non ci sono utenti reali, recensioni,
  testimonianze né numeri d'uso: non vanno inventati.
- Informativa sulla privacy e condizioni d'uso, in italiano e in inglese,
  stanno in `legal/`. Mancano ancora i dati del titolare.

## Product Principles

1. **Un posto solo.** Ogni cosa nuova si collega a quelle che ci sono già
   (chat, link, posti), invece di diventare un'altra isola.
2. **Il gruppo è di tutti.** Nessun capo e nessun ruolo: chiunque ne faccia
   parte può aggiungere, correggere e togliere.
3. **Privato per come è fatto.** Si entra solo su invito. Niente pubblicità,
   niente profilazione, niente elenchi pubblici.
4. **Il viaggio è il caso più forte, non l'unico.** Quello che serve solo a
   chi viaggia resta facoltativo, e un gruppo qualunque non deve sentirsi
   fuori posto.
5. **Parla chiaro.** Italiano piano, due lingue alla pari, nessun gergo
   tecnico rivolto a chi usa l'app.
