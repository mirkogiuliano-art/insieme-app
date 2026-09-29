// Metro con le aggiunte di Sentry: a ogni pacchetto JavaScript assegna un
// identificativo, lo stesso che finisce nelle source map caricate durante
// la build. È quello che permette a Sentry di trasformare la riga di un
// file compresso nella riga vera del sorgente (vedi docs/segnalazione-errori.md).
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
