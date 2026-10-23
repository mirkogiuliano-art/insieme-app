/**
 * Sul web la mappa non c'è.
 *
 * `react-native-maps` è una libreria nativa: non esiste nel browser, e
 * importarla fa crashare la schermata. Metro sceglie questo file sul web e
 * MappaNativa.tsx sul telefono. Sul web MapTab mostra solo l'elenco dei
 * posti, quindi questi due non si disegnano mai.
 */
export const MapView = () => null;
export const Marker = () => null;
