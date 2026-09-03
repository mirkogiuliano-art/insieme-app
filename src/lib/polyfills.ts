// Deve essere importato per primo, prima di qualunque modulo che importi
// @supabase/supabase-js: il client Supabase richiede crypto.getRandomValues
// e un polyfill di URL che React Native non fornisce nativamente.
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
