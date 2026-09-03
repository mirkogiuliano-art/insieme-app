# Insieme — app React Native (Expo + TypeScript)

Spazio condiviso per gruppi con tre sezioni: **chat**, **link/video** con
categorie e anteprime, e **mappa** con posti categorizzati + vista lista.
Tema chiaro/scuro, onboarding col nome, e gruppi in cui si entra solo
tramite link di invito.

## Avvio rapido

```bash
cd insieme-app
npm install
npx expo start
```

## Chiavi di Google Maps

In `app.json` c'è **una sola** chiave, sotto `android.config.googleMaps`.
Non è una dimenticanza:

- **Su iOS non serve.** L'app non imposta `provider={PROVIDER_GOOGLE}` sul
  `MapView`, quindi `react-native-maps` usa Apple Maps, che non richiede
  nessuna chiave. Una voce `ios.config.googleMapsApiKey` c'era ed è stata
  rimossa perché non veniva usata da niente.
- **Non si può condividere la stessa chiave fra le due piattaforme.** Una
  chiave di Google Maps accetta *un solo* tipo di restrizione applicativa,
  "app Android" oppure "app iOS". Riusare la stessa su entrambe significa
  che su una delle due le mappe restano vuote, con un errore silenzioso e
  difficile da ricondurre alla causa.

Se un domani si vuole Google Maps anche su iOS servono **due cose insieme**:
una seconda chiave, distinta e limitata al bundle `com.insieme.app`, e il
`provider={PROVIDER_GOOGLE}` sul `MapView`. Da tenere presente che il tocco
sui punti di interesse per ricavare l'identificativo del luogo (vedi
`onPoiClick` in `src/screens/MapTab.tsx`) è una funzione di Google Maps: su
Apple Maps quell'identificativo non arriva.

La chiave Android va tenuta limitata in Google Cloud Console per nome del
pacchetto **e** impronta SHA-1. Attenzione: le build EAS sono firmate da una
chiave gestita da EAS, non da quella locale — l'impronta da registrare è
quella, e si ottiene con `eas credentials`.
