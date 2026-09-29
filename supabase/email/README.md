# Le email dell'accesso

Queste due email non le manda l'app: le manda Supabase Auth, con i modelli
che stanno nella configurazione del progetto. Qui ne teniamo una copia,
perché un testo che arriva nella posta delle persone merita di stare nel
repository come il resto.

| File | Dove va | Quando parte |
| --- | --- | --- |
| `conferma.html` | Authentication → Emails → **Confirm signup** | alla registrazione con email e password |
| `recupero.html` | Authentication → Emails → **Reset password** | da «Password dimenticata?» |

L'oggetto di ciascuna è scritto nel commento in cima al file: è anch'esso
un modello, e sceglie la lingua come il corpo.

Chi entra con Google non riceve nessuna delle due: l'indirizzo l'ha già
verificato Google, e una password non c'è.

## In che lingua arrivano

In quella dell'app: italiano se la persona usa l'app in italiano, inglese
in tutti gli altri casi — anche quando la lingua non si conosce.

Supabase non sa niente del telefono: sa quello che l'app gli dice, nei
dati dell'utente (`user_metadata.lang`), e i modelli li leggono come
`.Data`. L'app ce la mette in due momenti:

- **alla registrazione**, dentro la chiamata `signUp` — l'email di
  conferma parte subito dopo e la trova già lì;
- **dopo ogni accesso**, se quella salvata è diversa da quella dell'app
  (`src/lib/authStore.tsx`): così si sistemano da soli gli account nati
  prima, chi entra con Google, e chi cambia lingua nelle impostazioni.

Il link della nuova password parte quando la persona non è dentro, quindi
usa la lingua salvata l'ultima volta che c'era. Di solito coincide.

### La condizione

    {{ if and .Data (eq (printf "%v" .Data.lang) "it") }} … {{ else }} … {{ end }}

Ha questa forma per un motivo preciso: **se un modello fallisce, Supabase
non manda l'email** (nessun ripiego sul modello predefinito). La versione
nuda, `{{ if eq .Data.lang "it" }}`, regge quando `lang` manca ma si rompe
in due casi, provati:

- `Data` nullo → «nil pointer evaluating interface {}.lang»: ci pensa
  `and .Data`, che si ferma prima di guardarci dentro;
- `lang` che non è un testo (un numero, per errore) → «incompatible types
  for comparison»: ci pensa `printf "%v"`, che trasforma qualunque valore
  in testo prima del confronto.

Provata con il motore dei modelli di Go (`html/template`, lo stesso di
Supabase) su lingua italiana, inglese, assente, dati vuoti, nulli o
mancanti, e un valore che non è testo: italiano solo nel primo caso,
inglese in tutti gli altri, nessun errore.

## Le altre email

Supabase ne prevede altre (cambio indirizzo, avviso di password cambiata,
invito, link magico): l'app non le usa, e gli avvisi sono disattivati nella
configurazione. Se un giorno si attivano, vanno scritte anche quelle.

## Da dove partono

Le manda la casella Gmail configurata come SMTP del progetto, con «Insieme»
come mittente. Gmail ha un limite giornaliero basso: se un giorno le
registrazioni diventano tante, serve un servizio di posta vero (Resend,
Postmark) al suo posto.
