import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as aesjs from 'aes-js';

/**
 * Adattatore di storage per la sessione Supabase su Expo ("LargeSecureStore",
 * pattern documentato da Supabase). SecureStore da solo non basta: ha un
 * limite di ~2KB per valore e la sessione (access+refresh token, utente)
 * supera facilmente quella soglia. Qui la chiave AES (piccola, dimensione
 * fissa) vive in SecureStore, mentre il blob di sessione cifrato — senza
 * limiti di size — vive in AsyncStorage.
 *
 * `expo-secure-store` esiste solo su iOS/Android: il browser non ha un
 * equivalente di Keychain/Keystore, quindi su web va bypassato del tutto
 * (chiamarlo comunque fa crashare l'app, non c'è un fallback silenzioso).
 */
class LargeSecureStore {
  private async encrypt(key: string, value: string): Promise<string> {
    const encryptionKey = crypto.getRandomValues(new Uint8Array(256 / 8));
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  private async decrypt(key: string, value: string): Promise<string | null> {
    const encryptionKeyHex = await SecureStore.getItemAsync(key);
    if (!encryptionKeyHex) return null;
    const cipher = new aesjs.ModeOfOperation.ctr(
      aesjs.utils.hex.toBytes(encryptionKeyHex),
      new aesjs.Counter(1),
    );
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return AsyncStorage.getItem(key);
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    return this.decrypt(key, encrypted);
  }

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(key, value);
      return;
    }
    const encrypted = await this.encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    if (Platform.OS === 'web') return;
    await SecureStore.deleteItemAsync(key);
  }
}

export const largeSecureStore = new LargeSecureStore();
