# Accesso con Google

Il codice è pronto ([src/lib/api/googleAuth.ts](../src/lib/api/googleAuth.ts)):
sul telefono usa il selettore di account del sistema, sul web la pagina di
Google. Perché funzioni servono tre cose che stanno fuori dal codice —
Google Cloud, Supabase, EAS — in quest'ordine.

Finché `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` è vuota il tasto non compare,
quindi fino all'ultimo passo l'app si comporta come prima.

## 1. Google Cloud

Nel progetto che ha già la chiave di Google Maps.

**Schermata di consenso** (APIs & Services → OAuth consent screen):
tipo *External*, nome «Insieme», email di assistenza, logo. Gli ambiti
bastano quelli di base: `email`, `profile`, `openid`. Finché l'app è *in
test*, possono entrare solo gli indirizzi aggiunti fra i *test users*:
metti i tuoi.

**Tre credenziali** (APIs & Services → Credentials → Create credentials →
OAuth client ID):

| Tipo | Cosa chiede | A cosa serve |
| --- | --- | --- |
| **Web application** | *Authorized redirect URI*: `https://lveqqinhgexvzyulbpzu.supabase.co/auth/v1/callback` | È l'id che Supabase conosce. Il selettore nativo lo usa per farsi dare un token che Supabase accetti. Dà anche un **segreto**, che va solo su Supabase. |
| **Android** | *Package name*: `com.insieme.app` · *SHA-1*: vedi sotto | Dice a Google che l'app firmata con quella chiave può chiedere l'accesso. |
| **iOS** | *Bundle ID*: `com.insieme.app` | Serve solo quando si costruisce per iPhone. |

### L'impronta SHA-1

È la cosa che si sbaglia. Google accetta l'accesso solo dall'app firmata
con una chiave che conosce, e **ogni chiave ha la sua impronta**:

- **Build di EAS** (sviluppo, anteprima, produzione — EAS usa la stessa
  chiave per tutte):
  `53:1E:41:2F:2E:26:A1:99:FF:68:06:FB:2A:EB:A5:62:B8:D8:CE:CA`
  — letta dall'APK di anteprima del 21 settembre.
- **Play Store**: quando pubblichi, Google rifirma l'app con una chiave
  sua. La sua impronta si trova in Play Console → *App integrity* → *App
  signing key certificate*, e va aggiunta come **seconda credenziale
  Android**, con lo stesso nome di pacchetto.

Se ne manca una, l'accesso fallisce con `DEVELOPER_ERROR` (codice 10) e
nessuna spiegazione. In sviluppo l'app lo scrive nel registro di Metro
come `[accesso Google] 10 …`.

## 2. Supabase

Authentication → Sign In / Providers → **Google**:

- *Enable*: acceso.
- *Client ID*: l'id **Web**.
- *Client Secret*: il segreto della credenziale Web.
- *Authorized Client IDs*: l'id **Android** e l'id **iOS**, separati da
  una virgola, dopo quello Web.
- *Skip nonce check*: acceso. Il selettore di Android non manda un
  *nonce*, e senza questa spunta Supabase rifiuta il token.

Authentication → URL Configuration → *Redirect URLs*: aggiungi
`http://localhost:8081` (il web in sviluppo) e, se un giorno l'app sta su
un dominio, anche quello.

## 3. L'app

**`.env`** (per il server di sviluppo e il web):

```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<id Web>.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<id iOS>.apps.googleusercontent.com
```

**EAS** (per le build del telefono — EAS non legge `.env`, ha le sue
variabili per ambiente):

```
eas env:create --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value <id Web> --environment production --environment preview --environment development --visibility plaintext
eas env:create --name EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID --value <id iOS> --environment production --environment preview --environment development --visibility plaintext
```

**`app.json`**, fra i plugin, solo quando c'è l'id iOS:

```json
["@react-native-google-signin/google-signin", { "iosUrlScheme": "com.googleusercontent.apps.<la parte prima di .apps.googleusercontent.com dell'id iOS>" }]
```

Non va aggiunto «nudo», senza opzioni: in quel caso il plugin presume
Firebase e aggiunge ad Android il plugin Gradle dei servizi Google, che
senza un file `google-services.json` fa fallire la build.

## 4. Una build nuova

La libreria è codice nativo: su Expo Go non c'è, e sul telefono serve una
build fatta dopo averla installata.

## Cosa succede la prima volta

Chi entra con Google e non ha mai usato Insieme si ritrova davanti
«Come ti chiami?» col nome di battesimo già scritto, preso da Google: lo
può tenere o cambiare. Chi aveva già un account con la stessa email entra
nel suo account di prima — Supabase unisce i due accessi perché Google
garantisce che l'email è sua — **a patto che quell'email fosse stata
confermata**: su un account mai confermato Supabase non unisce niente,
perché chiunque avrebbe potuto registrarlo con l'indirizzo di un altro.
