// Metro con le aggiunte di Sentry: a ogni pacchetto JavaScript assegna un
// identificativo, lo stesso che finisce nelle source map caricate durante
// la build. È quello che permette a Sentry di trasformare la riga di un
// file compresso nella riga vera del sorgente (vedi docs/segnalazione-errori.md).
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

// video/ è il progetto Remotion del video promozionale, con le sue
// dipendenze: Metro non deve scandirlo. Il percorso relativo serve a
// @expo/metro-file-map per saltare la cartella intera, l'assoluto ai file.
const radice = __dirname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
config.resolver.blockList = [].concat(config.resolver.blockList ?? [], new RegExp(`^(?:${radice}/)?video(?:/.*)?$`));

module.exports = config;
