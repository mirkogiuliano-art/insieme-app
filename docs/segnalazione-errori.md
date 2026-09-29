# Segnalazione degli errori

L'app manda i propri errori a **Sentry**, così li vedi anche quando
capitano sul telefono di qualcun altro. Il codice è pronto
([src/lib/sentry.ts](../src/lib/sentry.ts)); finché manca il DSN è spento
e l'app si comporta come prima.

## Cosa arriva

- gli errori che l'app ha raccolto e mostrato all'utente con un messaggio
  (67 punti: invio di messaggi, caricamenti, sondaggi, link, posti, gruppi,
  inviti, accesso con Google, eliminazione dell'account…), ciascuno con la
  chiave del messaggio (`chat.erroreInvio`) come etichetta `azione`;
- i caricamenti falliti (`caricamento.messaggi`, `caricamento.gruppi`…) —
  è da qui che arriverebbe un «permission denied» di Supabase;
- le schermate che si rompono (`rottura.schermata`), fermate dalla rete in
  `app/_layout.tsx`;
- gli errori non raccolti da nessuno e i crash nativi, che Sentry prende
  da sé.

Ogni errore porta versione dell'app, sistema, lingua, id dell'utente e gli
ultimi passi (schermate, chiamate di rete senza i parametri dopo il `?`).
**Non** porta email, nomi, testi dei messaggi né indirizzo IP.

Gli errori che dicono solo «non c'era la rete» vengono scartati: li ha
chiunque in metropolitana, e seppellirebbero quelli veri.

È acceso solo nelle build vere: col server di sviluppo l'errore si vede
già sullo schermo.

## 1. L'account

1. Registrati su [sentry.io](https://sentry.io) scegliendo la regione dati
   **EU** (Frankfurt). Si sceglie alla creazione dell'organizzazione e non
   si cambia dopo.
2. Crea un progetto di tipo **React Native**, per esempio `insieme-app`.
3. Dalla pagina del progetto copia il **DSN** — un indirizzo come
   `https://…@o….ingest.de.sentry.io/…`. Non è un segreto: finisce dentro
   l'app.

## 2. Il DSN nell'app

In `.env`:

```
EXPO_PUBLIC_SENTRY_DSN=<il DSN>
```

E su EAS, perché le build non leggono `.env`:

```
eas env:create --name EXPO_PUBLIC_SENTRY_DSN --value <il DSN> --environment production --environment preview --environment development --visibility plaintext
```

Da qui la build successiva manda gli errori. Leggerli però è un'altra
cosa: senza le source map, un errore di una build vera dice
`a.b is not a function` in un file compresso.

## 3. Le source map

Servono tre cose insieme, **nella stessa volta**:

**Un token** — Sentry → Settings → Auth Tokens → *Create New Token*, con
i permessi `project:releases` e `org:read`. Questo **è** un segreto: va
solo su EAS, mai in un file.

```
eas env:create --name SENTRY_AUTH_TOKEN --value <il token> --environment production --environment preview --visibility secret
```

**Il plugin in `app.json`**, fra gli altri:

```json
["@sentry/react-native/expo", {
  "url": "https://de.sentry.io/",
  "organization": "<slug dell'organizzazione>",
  "project": "insieme-app"
}]
```

**`metro.config.js`** nella cartella principale:

```js
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
module.exports = getSentryExpoConfig(__dirname);
```

Il motivo per cui vanno insieme: il plugin aggiunge alla build Android un
passaggio che carica le source map con `sentry-cli`, e **se il token manca
la build fallisce**.

**Stato:** fatto. Token su EAS (produzione e anteprima), plugin con
organizzazione `mirko-giuliano` e progetto `insieme-app`, `metro.config.js`
presente.

### Build locali

Una build con `--local` non ha il token (sta su EAS) e, dietro il proxy
aziendale, non raggiungerebbe comunque Sentry. Per farla, nello stesso
terminale:

```
export SENTRY_DISABLE_AUTO_UPLOAD=true
```

Gli errori partono lo stesso; mancano solo le source map di quella build.

## 4. La prova

Una volta fatta la build con il DSN, un errore finto si provoca
facilmente: una schermata che lancia un errore mostra «Qualcosa si è
rotto», e in Sentry compare un evento con `azione: rottura.schermata`.

## Privacy

Sentry è un servizio esterno che riceve dati tecnici legati a un utente
(l'id, non il nome). Va nominato nell'informativa pubblicata
(`src/lib/legal.ts` → `PRIVACY_URL`): chi è, cosa riceve, dove sta (UE),
e perché — capire e correggere i malfunzionamenti.
