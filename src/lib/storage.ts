import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persistenza locale sul dispositivo per le preferenze dell'utente (es.
 * tema chiaro/scuro). I dati condivisi tra i membri di un gruppo (gruppi,
 * chat, link, posti) vivono su Supabase — vedi i moduli in `src/lib/api/`
 * e `src/lib/supabase.ts`, non questo file.
 */
export const storage = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (raw == null) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  async set<T>(key: string, value: T): Promise<boolean> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
};
