# Come si pubblicano questi documenti

Google chiede che l'informativa sulla privacy sia leggibile **da un browser
qualsiasi, senza installare l'app e senza fare l'accesso**: l'indirizzo va
messo nella scheda del negozio, e chi sta valutando se installare deve poterla
aprire prima. Per le condizioni d'uso non è obbligatorio ma è la stessa storia.

Tre passi, una volta sola.

## 1. Riempire i buchi

In `privacy.md` e `termini.md` ci sono dei `[...]` da sostituire:

- **nome e cognome** di chi offre il servizio (il titolare del trattamento);
- **indirizzo**;
- **email di contatto**, che è l'indirizzo a cui arriveranno le richieste di
  cancellazione da parte di chi non ha più l'app;
- **regione del progetto Supabase** (si legge nella dashboard, sotto
  *Project Settings → General*; per esempio «Europa — Francoforte»).

Poi va tolto il riquadro «⚠️ Da completare prima di pubblicare» in cima: serve
solo finché i buchi ci sono.

Senza il nome e un contatto raggiungibile l'informativa non è valida: il
titolare del trattamento deve essere identificabile.

## 2. Metterli in rete

La strada più corta è **GitHub Pages**, che pubblica direttamente da questo
repository:

1. `git push`
2. Su GitHub: *Settings → Pages*
3. *Source*: «Deploy from a branch» — *Branch*: `main`, cartella `/ (root)`
4. Salva e aspetta un minuto

Gli indirizzi diventano:

```
https://mirkogiuliano-art.github.io/insieme-app/legal/privacy.html
https://mirkogiuliano-art.github.io/insieme-app/legal/termini.html
```

Sì, `.html` anche se i file sono `.md`: GitHub li converte da solo. È per questo
che in cima a ciascuno ci sono le tre righe fra `---`, senza le quali il file
verrebbe servito come testo grezzo invece che come pagina.

**Se il repository è privato**, GitHub Pages non funziona senza un piano a
pagamento: o lo si rende pubblico, oppure si usa un qualsiasi altro spazio web
(Netlify, Vercel, il proprio sito). L'unica cosa che conta è che i due indirizzi
siano raggiungibili da chiunque e restino validi nel tempo.

## 3. Accenderli nell'app

Incollare i due indirizzi in `src/lib/legal.ts`. Finché quei valori sono vuoti
l'app non mostra collegamenti che non portano da nessuna parte: le voci nelle
impostazioni restano nascoste e la riga di accettazione alla registrazione resta
testo semplice. Riempendoli si accendono tutte insieme.

Lo stesso indirizzo dell'informativa va poi messo nella scheda di Google Play,
nel campo dedicato.
