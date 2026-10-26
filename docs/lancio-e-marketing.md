# Lancio e marketing di Insieme

Piano di lavoro per portare Insieme sul Play Store e farlo conoscere, con
budget zero e una persona sola. Scritto il 27 ottobre 2026, prima di avere
utenti: tutti i numeri qui sono obiettivi o cose da misurare, mai dati.

Le parole del marketing che compaiono qui, in breve:

- **Arrivare**: qualcuno che non conosce Insieme ne sente parlare e lo installa.
- **Provare**: chi l'ha installato vive la prima volta in cui serve davvero.
- **Restare**: torna a usarlo.
- **Passaparola**: porta dentro altre persone.

## In breve

**Il motore è l'invito.** Insieme serve solo se nel gruppo ci sono gli
altri: ogni persona che crea un gruppo ne porta dentro tre, cinque, sei.
Il marketing quindi non deve convincere «tutti»: deve convincere **chi
organizza**, la persona che nel gruppo di amici apre la chat del viaggio e
salva i posti. Gli altri arrivano con il suo link.

**Tre scommesse:**

1. **Far funzionare l'invito prima di tutto.** Oggi il link è
   `insieme://invite/…`: WhatsApp e Telegram non lo rendono cliccabile, e a
   chi non ha l'app non succede niente. Senza un link `https` che porti al
   Play Store, ogni gruppo nuovo si ferma a una persona.
2. **Una promessa sola.** Il messaggio di tutto il lancio è quello dello
   slogan: *i posti da vedere e le cose da fare, salvati insieme*. Il caso
   da mostrare ovunque è il più concreto: vedi un posto su Instagram, lo
   condividi a Insieme, finisce nei Salvati del gruppo e poi sulla mappa.
3. **Pochi canali, fatti con costanza.** Scheda del Play Store curata in
   italiano e in inglese, due post a settimana su Instagram e TikTok, e le
   community dove chi viaggia in gruppo chiede consigli. Niente pubblicità
   a pagamento.

**Tempi.** Dal giorno in cui decidi di partire, il lancio pubblico è
possibile dopo **circa cinque o sei settimane**. È il minimo: una o due per
sbloccare, due di test chiuso obbligatorio, fino a una per la revisione di
Google.

**Cosa conta come successo nei primi tre mesi:** gruppi veri che usano
Insieme per una cosa vera, e una buona parte di loro che porta dentro
almeno tre persone. Il numero di download conta meno.

## 1. Da dove partiamo

**Il prodotto è pronto per farsi provare:**
- chat completa;
- Salvati con categorie, preferiti e collegamento ai posti;
- mappa con «Portami lì»;
- info del gruppo;
- condivisione dalle altre app di Android.

Due lingue alla pari, privacy chiara, dati in UE.

**Materiali già fatti:**
- il video verticale per i social (`video/out/promo.mp4`);
- il video per il Play Store (`video/out/playstore.mp4`);
- logo e icone;
- informativa e condizioni in italiano e in inglese.

**Cosa blocca il lancio, in ordine:**

| # | Blocco | Perché blocca | Lavoro |
| --- | --- | --- | --- |
| 1 | Dati del titolare nell'informativa (nome ed email di contatto; l'indirizzo non serve) | Senza, l'informativa non è valida e Google la chiede nella scheda | Mezz'ora |
| 2 | Un dominio proprio | Serve al link d'invito, all'informativa e alla pagina per cancellare l'account. Oggi le pagine legali stanno su github.io | Acquisto e configurazione; il piano è già scritto |
| 3 | Link d'invito `https` cliccabile, con una pagina per chi non ha l'app | È il motore della crescita (vedi sopra) | Una o due giornate |
| 4 | Link web per chiedere la cancellazione dell'account | Google lo richiede a tutte le app con registrazione, oltre alla cancellazione dall'app che c'è già | Basta la sezione «Cancellare l'account» dell'informativa, una volta inserita l'email del titolare |
| 5 | Scheda del Play Store in italiano e inglese | Vedi §4 | Due o tre giornate |
| 6 | Un account di prova per chi fa la revisione | Insieme chiede di accedere: Google vuole credenziali per entrare | Mezz'ora |
| 7 | Modulo sulla sicurezza dei dati nella Play Console (che dati raccoglie l'app, con chi li condivide) | Obbligatorio per pubblicare | Mezza giornata, partendo da `legal/privacy.md` |

**Chi ha l'iPhone resta fuori.** Un'app di gruppo solo per Android esclude
chiunque nel gruppo abbia un iPhone, e in quasi ogni gruppo di amici c'è
qualcuno con l'iPhone. È il rischio più grande del lancio: vedi le
decisioni aperte (§9).

**Gruppi pubblici.** Sono in lavorazione e `PRODUCT.md` dice ancora
«niente elenchi pubblici». Prima del lancio va deciso se fanno parte
della prima versione (§9).

## 2. La scelta di fondo

**Per chi.** Per chi organizza, nel gruppo. È la persona che salva i reel
dei posti, apre la nota con le idee, manda la posizione del ristorante. Ha
fra i 20 e i 40 anni, usa già WhatsApp, le liste di Google Maps e i
salvati di Instagram, e il suo problema è che quelle cose non si parlano.
Gli altri del gruppo non devono essere convinti: devono solo poter entrare
con un tocco.

**Il problema, quanto pesa e quanto spesso.** È un fastidio medio, non un
dolore, e arriva a ondate: forte prima e durante un viaggio, più leggero
nelle settimane normali. Ne seguono due cose:

- il marketing deve farsi trovare **nel momento in cui il viaggio si
  organizza**, non in un momento qualsiasi;
- i gruppi che non sono viaggi (le cene, la casa, un progetto) sono quelli
  che tengono Insieme vivo fra un viaggio e l'altro, e vanno mostrati.

**La promessa.** *I posti da vedere e le cose da fare, salvati insieme.*
Tutto il resto (chat, sondaggi, date, «cose da sapere») si mostra come
conseguenza, non come elenco di funzioni.

**Contro chi.** Non contro un'app in particolare, ma contro il disordine:
la chat che scorre, la lista di Maps di uno solo, i salvati di Instagram
che nessuno ritrova. Nei materiali per il Play Store si nominano le altre
app solo per dire da dove si condivide, mai per confrontarsi.

**Come si parla** (da `PRODUCT.md`):
- italiano piano e diretto, a frasi intere;
- niente gergo;
- niente numeri inventati: niente «migliaia di utenti», niente recensioni
  finte;
- l'inglese vale quanto l'italiano: ogni testo nasce nelle due lingue.

**Cosa non dire:**
- «Solo su invito»: i gruppi pubblici escono con il lancio.
- «Per iPhone», finché non c'è.
- Qualunque promessa sulla privacy che non sia già scritta nell'informativa.

## 3. Il calendario

Senza una data, le settimane partono da quando decidi di cominciare.

| Settimane | Fase | Cosa | Fatto quando |
| --- | --- | --- | --- |
| 1–2 | **Sbloccare** | Blocchi 1–7 del §1; nome dei profili social; prima versione della scheda | Una build di produzione caricata nel test chiuso, scheda completa |
| 3–4 | **Test chiuso** | Almeno 12 tester per 14 giorni di fila (puntane a 18–20: se scendono sotto 12, il conteggio riparte da zero). Meglio 3–4 gruppi veri da 4–6 persone con Android, che usano Insieme per una cosa vera: un viaggio, una cena, un weekend. Un modulo breve per le impressioni a metà e alla fine | 14 giorni pieni, impressioni raccolte, errori corretti |
| 5 | **Richiesta di produzione** | Rispondere alle domande di Google sul test (chi, quanti, cosa è cambiato). La revisione può prendere fino a una settimana | Accesso alla produzione concesso |
| 6–7 | **Lancio silenzioso** | Pubblicare in italiano e inglese senza annunci. Far passare i tester alla versione pubblica e chiedere a loro le prime recensioni. Guardare dove le persone si fermano (§6) | La prima settimana di numeri |
| 8 | **Lancio** | L'annuncio: post sui social, le community (§4), Product Hunt per il pubblico inglese se ti va di dedicargli una giornata | Annuncio fatto, tutte le risposte date entro 24 ore |
| 9–12 | **Costanza** | Due post a settimana, una community a settimana, un piccolo «lancio» al mese per ogni novità | Il ritmo regge |

**Dopo il primo trimestre** ogni novità grande è un'occasione per ripartire:
l'arrivo su iPhone, i gruppi pubblici, il sito. Conviene annunciarle una
alla volta, a distanza, invece che tutte insieme.

## 4. Arrivare

Il budget è zero, quindi ogni canale costa solo tempo. Questi sono i canali,
in ordine di resa per il tempo che chiedono.

**1. L'invito (blocco 3 del §1).** Il link `https` apre l'app se c'è.
Altrimenti porta a una pagina che dice in due righe cos'è Insieme, chi ti
ha invitato e in che gruppo, con il pulsante del Play Store. Dopo
l'installazione l'invito deve ritrovarsi da solo, senza costringere la
persona a tornare sul messaggio. Va scritto bene anche il testo che parte
con il link («Ti ho aggiunto a *Sardegna d'estate* su Insieme: …»): è il
messaggio pubblicitario che verrà letto più volte di tutti.

**2. La scheda del Play Store** (skill `aso`), in italiano e inglese:
- **Titolo** (30 caratteri) con la parola che si cerca, per esempio un
  titolo sul viaggio di gruppo. Da scegliere con la skill.
- **Descrizione breve** (80 caratteri): la promessa.
- **Descrizione lunga**: il caso Instagram → Salvati → mappa, poi le
  altre funzioni.
- **Schermate**: da 4 a 8, con una frase sopra ciascuna, dalle scene del
  video.
- **Grafica in evidenza** 1024×500.
- **Video**: è già fatto, va caricato su YouTube come pubblico o non in
  elenco, senza pubblicità.
- **Categoria**: da decidere fra Viaggi e Comunicazione.

**3. Instagram e TikTok** (skill `social`). Chi salva i posti da Instagram
sta su Instagram: è il posto giusto per mostrare il gesto. Un profilo, gli
stessi video su tutti e due, due a settimana. Serie da alternare:
- **«Lo salvo da qui»**: lo schermo del telefono mentre un posto passa da
  un reel ai Salvati del gruppo. Quindici secondi.
- **«Come abbiamo organizzato…»**: un vero gruppo del test, con il suo
  permesso. Il weekend, la cena, il viaggio.
- **«Lo faccio da solo»**: il diario di chi costruisce l'app. Funziona bene
  per chi è curioso delle app piccole e indipendenti.

**4. Le community** (skill `community-marketing`). Si parla prima di
presentarsi, e si rispettano le regole sull'autopromozione di ogni posto:
- subreddit di app Android e di progetti personali (r/androidapps,
  r/SideProject), per l'inglese;
- gruppi Facebook e forum italiani di viaggi di gruppo, dove qualcuno
  chiede ogni giorno «come vi organizzate?»;
- AlternativeTo, con una scheda gratuita accanto alle app di
  organizzazione di viaggi.

**5. Attenzione presa in prestito.** Newsletter e podcast italiani di
viaggio o di tecnologia, a cui proporre la storia di chi fa un'app da solo,
gratis, senza pubblicità e con i dati in Europa. Una proposta personale al
mese, scritta a mano.

**Cosa non fare ora:**
- **Pubblicità a pagamento**: il budget è zero.
- **Influencer pagati**: stesso motivo. Quelli piccoli che amano l'app
  restano un'opzione gratuita.
- **Un blog**: troppo lento per una persona sola, finché non ci sono pagine
  web dei gruppi pubblici da far trovare su Google.
- **Hacker News**: forse dopo, con l'arrivo del web o di iPhone.

## 5. Provare, restare, passaparola

**Provare.** Un gruppo «parte davvero» quando nei primi 7 giorni ha almeno
3 persone e almeno 5 cose salvate (link o posti). È la definizione da
misurare (§6). Quello che lo aiuta:
- dopo la creazione del gruppo, l'invito come primo passo, non nascosto;
- spiegare il gesto della condivisione la prima volta che i Salvati sono
  vuoti («Da Instagram o da un sito, tocca Condividi e scegli Insieme»);
- niente dati d'esempio finti nel gruppo.

**Restare.** I viaggi finiscono, e un gruppo di viaggio dopo il ritorno si
spegne: è normale, non è un abbandono. A tenere vive le persone fra un
viaggio e l'altro sono il prossimo viaggio e i gruppi che non sono viaggi.
Le leve:
- le notifiche, che ci sono già e vanno tenute sobrie;
- il conto alla rovescia e le «cose da sapere» quando c'è una data;
- mostrare nei materiali i gruppi di tutti i giorni (le cene, la casa).

**Passaparola** (skill `referrals`):
- **Dentro i gruppi.** Chi è entrato con un invito e poi crea un gruppo
  suo è il segnale più forte che Insieme si sta diffondendo.
- **Le recensioni.** Chiederle al momento giusto, con la richiesta di
  recensione dentro l'app di Google, dopo un momento riuscito: un gruppo
  arrivato a 10 cose salvate, non al primo avvio. Va aggiunta all'app.
- **Nessun premio** per chi invita: l'invito serve già a chi lo manda.

## 6. Come misurare, senza tracciare nessuno

Insieme non ha strumenti di analisi e non deve averli: «niente
profilazione» è una promessa. Basta contare, una volta a settimana, quello
che c'è già nel database (Supabase), più le statistiche della Play Console.

| Cosa | Dove | Perché |
| --- | --- | --- |
| **Gruppi vivi nella settimana** (almeno 2 persone che hanno fatto qualcosa) | Supabase | È il numero che conta di più: dice se Insieme serve |
| Gruppi creati e gruppi partiti davvero entro 7 giorni (§5) | Supabase | Dice se la prima volta funziona |
| Persone entrate con un invito, in media per gruppo | Supabase | Dice se il motore gira |
| Chi entra con un invito e poi crea un gruppo suo | Supabase | Dice se il passaparola si allarga |
| Visite alla scheda → installazioni | Play Console | Dice se la scheda convince |
| Utenti senza crash | Play Console, Sentry | Dice se l'app regge |

Per le prime quattro settimane dopo il lancio si misura e basta, senza
obiettivi: sono la base. Gli obiettivi si fissano dopo, guardando i numeri
veri.

## 7. Strumenti e skill

| Cosa | Con cosa |
| --- | --- |
| Scheda del Play Store in due lingue | skill `aso` |
| Post, calendario, video brevi | skill `social`; i video con Remotion in `video/` |
| Community e prime persone | skill `community-marketing` |
| Inviti e recensioni | skill `referrals` |
| Il giorno del lancio e i lanci successivi | skill `launch` |
| Rivedere questo piano fra tre mesi | skill `marketing-plan` |
| Rilascio tecnico (build, controlli) | EAS, skill `engineering:deploy-checklist` |
| Numeri | Supabase (conteggi), Play Console, Sentry |

**Tempo.** Realisticamente da 4 a 6 ore a settimana dopo il lancio:
- due post;
- un giro nelle community;
- risposte alle recensioni;
- i numeri del lunedì.

**Costi.** Costi che ci sono comunque, anche a budget zero:
- il dominio, poche decine di euro l'anno;
- l'iscrizione a Google Play, già pagata se l'account è aperto;
- i piani gratuiti di Supabase ed EAS. Coprono l'inizio, ma i loro limiti
  vanno controllati prima che i gruppi crescano.

## 8. Pronti al lancio? Il controllo

Prima di passare dal test chiuso alla produzione:

- [ ] **Semplice.** Si può dire in una frase cosa fa (lo slogan) e il
      video lo mostra in 30 secondi.
- [ ] **Piace.** I tester del test chiuso lo hanno usato per una cosa vera
      e non vorrebbero tornare a prima. Va chiesto a loro, non supposto.
- [ ] **Completo.** Il percorso intero funziona senza buchi: invito →
      installazione → ingresso nel gruppo → condivisione di un posto →
      mappa.
- [ ] Nessuna funzione nuova aggiunta durante il test chiuso, solo
      correzioni.

## 9. Decisioni aperte

| Decisione | Perché conta | Quando |
| --- | --- | --- |
| **I dati del titolare** | Blocca l'informativa e quindi la scheda | Subito |
| **Il nome del dominio** | Blocca invito, informativa e pagina di cancellazione | Subito |
| **Chi ha l'iPhone** | Senza una strada per loro, molti gruppi non partono. Possibilità: una versione web per entrare nei gruppi (va verificato quanto dell'app gira già nel browser), oppure una data per iPhone da dire nella pagina dell'invito | Prima del test chiuso |
| ~~I gruppi pubblici nel lancio, o dopo~~ | **Deciso il 28/10: escono con il lancio.** `PRODUCT.md` aggiornato | — |
| **Il nome dei profili social** | «Insieme» è una parola comune: serve un nome libero e uguale su Instagram e TikTok | Settimana 1 |
| **Una lista d'attesa sul sito, sì o no** | Un canale tuo per annunciare il lancio. Se sì, va citata nell'informativa | Settimana 1 |
| **Chi paga se cresce** | Oggi è gratuito e senza pubblicità; i costi del servizio crescono con i gruppi. Non va deciso ora, ma va guardato | Dopo 3 mesi |

## Fonti

- [Play Console Help — requisiti di test per i nuovi account personali](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en-GB)
- [Play Console Help — requisiti per la cancellazione dell'account](https://support.google.com/googleplay/android-developer/answer/13327111)
- [Android Developers Blog — cancellazione dell'account dal web (aprile 2023)](https://android-developers.googleblog.com/2023/04/giving-people-more-control-over-their-data.html?hl=en)
- [Choicely — la regola dei 12 tester](https://www.choicely.com/blog/google-play-12-tester-rule)
- [ExtendsClass — il test chiuso nel 2026](https://extendsclass.com/blog/google-plays-closed-testing-requirement-what-developers-need-to-know-in-2026)
