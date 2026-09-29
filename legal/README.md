# Come si pubblicano questi documenti

Google chiede che l'informativa sulla privacy sia leggibile **da un browser
qualsiasi, senza installare l'app e senza fare l'accesso**: l'indirizzo va
messo nella scheda del negozio, e chi sta valutando se installare deve poterla
aprire prima. Per le condizioni d'uso non è obbligatorio ma è la stessa storia.

## Due lingue

| Documento | Italiano (l'originale) | Inglese |
| --- | --- | --- |
| Informativa sulla privacy | `privacy.md` | `en/privacy.md` |
| Condizioni d'uso | `termini.md` | `en/terms.md` |

L'app apre la versione nella lingua in cui sta parlando (`src/lib/legal.ts`).
In cima a ogni pagina c'è il collegamento all'altra lingua, e la versione
inglese dice che, se le due differiscono, **vale l'italiano**.

Quando si cambia un documento si cambiano **tutti e due**, nella stessa
volta: una traduzione rimasta indietro è una promessa diversa fatta a chi
legge in un'altra lingua.

## 1. Riempire i buchi

Nei quattro file ci sono dei `[...]` da sostituire:

- **nome e cognome** di chi offre il servizio (il titolare del trattamento);
- **indirizzo** (solo nell'informativa);
- **email di contatto**, che è l'indirizzo a cui arriveranno le richieste di
  cancellazione da parte di chi non ha più l'app.

Poi va tolto il riquadro «⚠️ Da completare» in cima: serve solo finché i
buchi ci sono.

Senza il nome e un contatto raggiungibile l'informativa non è valida: il
titolare del trattamento deve essere identificabile.

## 2. Metterli in rete

Sono pubblicati con **GitHub Pages**, direttamente da questo repository
(*Settings → Pages*, «Deploy from a branch», `main`, cartella `/ (root)`).
Una modifica è in rete un minuto dopo il `git push`.

Gli indirizzi:

```
https://mirkogiuliano-art.github.io/insieme-app/legal/privacy.html
https://mirkogiuliano-art.github.io/insieme-app/legal/termini.html
https://mirkogiuliano-art.github.io/insieme-app/legal/en/privacy.html
https://mirkogiuliano-art.github.io/insieme-app/legal/en/terms.html
```

Sì, `.html` anche se i file sono `.md`: GitHub li converte da solo. È per questo
che in cima a ciascuno ci sono le tre righe fra `---`, senza le quali il file
verrebbe servito come testo grezzo invece che come pagina.

**Un file nuovo va in rete prima della build che lo usa.** Se l'app apre la
versione inglese prima che la pagina esista, chi la tocca trova un errore 404.

## 3. Nell'app e nel negozio

Gli indirizzi stanno in `src/lib/legal.ts`. Un indirizzo lasciato vuoto
nasconde quel documento: le voci nelle impostazioni spariscono e la riga di
accettazione alla registrazione resta testo semplice.

Nella scheda di Google Play, nel campo dell'informativa, va l'indirizzo
**italiano**: è l'originale.
