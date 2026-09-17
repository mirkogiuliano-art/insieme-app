import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';

/**
 * Notifiche.
 *
 * Il giro è questo: il telefono chiede a Expo un codice, il codice
 * finisce in `push_tokens` (vedi 20260908090000_push_tokens.sql), e chi
 * scrive un messaggio chiede all'Edge Function `notify-message` di
 * avvisare gli altri membri.
 *
 * Tutto quello che c'è qui dentro fallisce in silenzio di proposito. Le
 * notifiche sono un di più: se il permesso viene negato, se il servizio
 * non risponde, se si è sul web o dentro Expo Go, l'app deve continuare a
 * funzionare esattamente come prima. Non si mostra un errore per una cosa
 * che l'utente non ha chiesto in quel momento.
 */

/** Il gruppo che si sta guardando adesso, se ce n'è uno.
 *
 * Serve a non far comparire l'avviso di un messaggio che si sta già
 * leggendo: la chat è aperta, il messaggio è arrivato da solo in tempo
 * reale, e una banda che lo annuncia sopra sarebbe solo rumore. */
let gruppoAperto: string | null = null;

export function setGruppoAperto(groupId: string | null): void {
  gruppoAperto = groupId;
}

/** Come si comportano gli avvisi che arrivano con l'app in primo piano. */
export function configuraNotifiche(): void {
  Notifications.setNotificationHandler({
    handleNotification: async (notifica) => {
      const groupId = (notifica.request.content.data as { groupId?: string } | null)?.groupId;
      const daNascondere = !!groupId && groupId === gruppoAperto;
      return {
        shouldShowBanner: !daNascondere,
        shouldShowList: !daNascondere,
        shouldPlaySound: !daNascondere,
        shouldSetBadge: false,
      };
    },
  });
}

/** Il codice del dispositivo registrato in questa sessione, per poterlo
 * staccare all'uscita. */
let codiceDispositivo: string | null = null;

/**
 * Chiede il permesso, ottiene il codice del dispositivo e lo registra.
 *
 * Su web non esiste niente di tutto questo; su iPhone il servizio di
 * Apple richiede l'account sviluppatore a pagamento, quindi finché non
 * c'è la richiesta fallisce e viene ignorata — il giorno che l'account
 * arriverà, funzionerà senza toccare questo file.
 */
export async function registraDispositivo(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    // Su Android ogni avviso deve appartenere a un canale, altrimenti da
    // Android 8 in poi non viene mostrato affatto.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('messaggi', {
        name: 'Messaggi',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#E9A23B',
      });
    }

    const attuale = await Notifications.getPermissionsAsync();
    let concesso = attuale.granted;
    if (!concesso && attuale.canAskAgain) {
      concesso = (await Notifications.requestPermissionsAsync()).granted;
    }
    if (!concesso) return;

    // L'identificativo del progetto EAS non è deducibile a runtime: senza,
    // Expo non sa a quale applicazione appartiene il codice.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    if (!projectId) return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return;

    codiceDispositivo = token;
    await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
  } catch {
    // Nessun avviso all'utente: vedi la nota in cima.
  }
}

/** Stacca questo telefono dall'account, uscendo. Va chiamata **prima** di
 * `signOut`: dopo, il token dell'utente non c'è più e la cancellazione
 * verrebbe rifiutata, lasciando il dispositivo agganciato a un account
 * che su questo telefono non è più in uso. */
export async function dimenticaDispositivo(): Promise<void> {
  if (!codiceDispositivo) return;
  try {
    await supabase.rpc('forget_push_token', { p_token: codiceDispositivo });
  } catch {
    // ignorato
  }
  codiceDispositivo = null;
}

/** Chiede al server di avvisare gli altri membri. Si lancia e si dimentica:
 * il messaggio è già stato inviato, e un avviso mancato non deve mai far
 * sembrare fallito un invio riuscito. */
export function avvisaDelMessaggio(messageId: string): void {
  supabase.functions.invoke('notify-message', { body: { messageId } }).catch(() => {});
}
