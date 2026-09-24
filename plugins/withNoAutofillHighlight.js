const { withAndroidStyles, AndroidConfig } = require('expo/config-plugins');

/**
 * Toglie il giallo che Android mette sui campi riempiti dalla compilazione
 * automatica (Google, gestori di password).
 *
 * È il tema dell'app a deciderlo, con l'attributo `autofilledHighlight`:
 * impostato a trasparente, email e password inserite da sole hanno lo
 * stesso aspetto di quelle scritte a mano. La compilazione automatica
 * continua a funzionare, sparisce solo l'evidenziazione.
 *
 * Serve un plugin perché la cartella `android/` non è nel repository: la
 * genera la build, e ogni modifica fatta a mano lì andrebbe persa.
 */
module.exports = function withNoAutofillHighlight(config) {
  return withAndroidStyles(config, (config) => {
    config.modResults = AndroidConfig.Styles.assignStylesValue(config.modResults, {
      add: true,
      parent: AndroidConfig.Styles.getAppThemeGroup(),
      name: 'android:autofilledHighlight',
      value: '@android:color/transparent',
    });
    return config;
  });
};
