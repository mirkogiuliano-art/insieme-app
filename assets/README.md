# Il marchio di Insieme

Il segno è **il mucchio**: tre cartoncini buttati uno sull'altro, storti. Non è un
simbolo astratto di «insieme», è quello che succede quando si sta insieme — link,
foto, biglietti e posti che si accumulano tutti nello stesso posto invece di stare
sparsi in cinque applicazioni.

`logo.svg` è l'originale da cui viene tutto il resto. Gli stessi tre rettangoli, con
le stesse rotazioni e gli stessi spostamenti, sono ripetuti in
`src/components/Logo.tsx`, che è la versione usata *dentro* l'app (schermata di
accesso): se si cambia il disegno vanno cambiati entrambi, e vanno rigenerati i PNG.

## I quattro file

| File | Misura | Fondo | A cosa serve |
| --- | --- | --- | --- |
| `icon.png` | 1024 | pieno `#0E141B` | icona iOS e ripiego generale. Senza trasparenza: iOS non la ammette, e ritaglia lui gli angoli. |
| `adaptive-icon.png` | 1024 | trasparente | il livello davanti dell'icona Android. Il colore dietro lo mette `app.json`. Il marchio occupa il 56% della tela, quindi resta dentro il 66% centrale che Android non ritaglia con nessuna delle sue maschere. |
| `favicon.png` | 64 | pieno `#0E141B` | la versione web. |
| `splash.png` | 1024 | trasparente | la schermata di avvio, che la mostra centrata (`resizeMode: contain`) sul colore dichiarato in `app.json`. |

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
