import '@/lib/polyfills';
import { AppState, Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { largeSecureStore } from '@/lib/secureStorage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Mancano EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. Copia .env.example in .env e inserisci i valori dal tuo progetto Supabase (Project Settings → API).',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: largeSecureStore,
    autoRefreshToken: true,
    persistSession: true,
    // Sul web l'accesso con Google torna indietro con i gettoni
    // nell'indirizzo, e qui è il client a doverli raccogliere. Su telefono
    // resta spento: là Google non passa dal browser (vedi
    // src/lib/api/googleAuth.ts), e il link della nuova password lo apre a
    // mano la sua schermata.
    detectSessionInUrl: Platform.OS === 'web',
  },
});

// Il refresh automatico del token non gira in modo affidabile mentre l'app
// è in background: va avviato/fermato esplicitamente sui cambi di stato,
// altrimenti capita di ritrovarsi disconnessi dopo un po' di tempo in
// background (bug noto delle app Supabase su mobile senza questo wiring).
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
