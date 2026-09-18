# Il marchio di Insieme

Il segno è **il mucchio**: tre cartoncini buttati uno sull'altro, storti. Non è un
simbolo astratto di «insieme», è quello che succede quando si sta insieme — link,
foto, biglietti e posti che si accumulano tutti nello stesso posto invece di stare
sparsi in cinque applicazioni.

`logo.svg` è l'originale da cui viene tutto il resto. Gli stessi tre rettangoli, con
le stesse rotazioni e gli stessi spostamenti, sono ripetuti in
`src/components/Logo.tsx`, che è la versione usata *dentro* l'app (schermata di
accesso): se si cambia il disegno vanno cambiati entrambi, e vanno rigenerati i PNG.

## Il solco, e perché i cartoncini sono sfalsati così

Fra un cartoncino e l'altro corre un **solco** largo 3,4 unità (su 100): senza, i tre
si toccano e il mucchio si legge come una macchia a tre colori invece che come tre
oggetti appoggiati.

Il solco però si mangia proprio la parte che si vede di quelli dietro, che sono già
fettine sottili. Per questo i due cartoncini di dietro sono **sfalsati di metà in più**
rispetto al disegno originale: il cartoncino davanti resta fermo e gli altri due
scivolano nella direzione in cui già stanno, tanto che ogni fettina diventa più larga
del solco che la separa. Sotto quella misura il solco toglie più di quanto dia, sopra
il mucchio si apre a ventaglio e non è più una pila.

Le due cose vanno insieme: **chi cambia lo spessore del solco deve rivedere lo
scarto**, altrimenti si torna al problema di partenza.

## Due modi di ottenere lo stesso solco

Sui file a colori il solco è il **contorno del colore del fondo**, dipinto su ogni
cartoncino: quello davanti copre un filo di quello dietro. Funziona perché anche le
piastrelle a fondo trasparente stanno comunque sopra lo stesso blu, dichiarato in
`app.json` — **cambiando quei colori vanno rigenerati i PNG**, o i solchi resteranno
del blu vecchio.

Sull'icona delle notifiche non si può dipingere niente: è bianca su trasparente, e il
solco dev'essere un buco vero. Quella si genera da `logo-notifica.html`, che disegna
il marchio su una tela bucando con `destination-out`. È lo stesso disegno, ottenuto
nell'unico modo che su fondo trasparente funziona.

## I quattro file

| File | Misura | Fondo | A cosa serve |
| --- | --- | --- | --- |
| `icon.png` | 1024 | pieno `#0E141B` | icona iOS e ripiego generale. Senza trasparenza: iOS non la ammette, e ritaglia lui gli angoli. |
| `adaptive-icon.png` | 1024 | trasparente | il livello davanti dell'icona Android. Il colore dietro lo mette `app.json`. Il marchio occupa il 56% della tela, quindi resta dentro il 66% centrale che Android non ritaglia con nessuna delle sue maschere. |
| `favicon.png` | 64 | pieno `#0E141B` | la versione web. |
| `splash.png` | 1024 | trasparente | la schermata di avvio, che la mostra centrata (`resizeMode: contain`) sul colore dichiarato in `app.json`. |
| `notification-icon.png` | 96 | trasparente | la sagoma bianca che Android mette nella barra di stato. Generata da `logo-notifica.html`, non dall'SVG. |

## Rigenerarli

I PNG sono stati ottenuti disegnando `logo.svg` dentro una pagina della misura voluta
e fotografandola con Chrome senza interfaccia:

```
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=old --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --default-background-color=00000000 \    # solo per i due a fondo trasparente
  --window-size=1024,1024 --screenshot=icona.png file://<pagina>.html
```

Le percentuali di riempimento (62% per l'icona, 56% per quella adattiva, 66% per la
favicon, 40% per lo splash) non sono arbitrarie: sono quelle che lasciano il margine
giusto in ciascun contesto.

## I colori

Sono le tinte del tema scuro (`src/theme/theme.tsx`), non una tavolozza a parte:
verde `#4FB3A5` dietro, corallo `#E4707A` in mezzo, ambra `#E9A23B` davanti, su fondo
`#0E141B`. L'icona resta così parente dell'app: cambiando i colori del tema, questi
vanno cambiati insieme, altrimenti l'icona sembra di un'altra applicazione.
