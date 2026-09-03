import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme, RADIUS } from '@/theme/theme';
import { useAuth } from '@/lib/authStore';
import { useAppStore } from '@/lib/appStore';
import { UsersIcon } from '@/components/Icon';
import { redeemInvite } from '@/lib/api/invites';
import { withTimeout, WRITE_TIMEOUT } from '@/lib/utils';

/**
 * Schermata di atterraggio di un link d'invito — l'unico modo per entrare
 * in un gruppo da quando il codice non è più una credenziale (vedi
 * supabase/migrations/20260902100000_invite_only.sql).
 *
 * Se si arriva senza essere autenticati il token viene messo da parte e
 * ripreso dopo l'accesso: altrimenti chi riceve un invito ed è alla prima
 * apertura dell'app perderebbe il link facendo la registrazione.
 */
export default function InviteScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const inviteToken = String(token ?? '');
  const { session, ready: authReady, profile, setPendingInviteToken } = useAuth();
  const { addGroup } = useAppStore();

  const [error, setError] = useState<string | null>(null);
  // Il riscatto non deve partire due volte: l'effetto si riesegue a ogni
  // cambio di sessione, e un doppio invio creerebbe due giri inutili.
  const redeeming = useRef(false);

  useEffect(() => {
    if (!authReady || !inviteToken) return;

    if (!session) {
      setPendingInviteToken(inviteToken);
      router.replace('/');
      return;
    }
    // Serve prima il nome: senza, negli elenchi dei membri comparirebbe un
    // partecipante senza nome.
    if (!profile?.displayName) {
      setPendingInviteToken(inviteToken);
      router.replace('/');
      return;
    }
    if (redeeming.current) return;
    redeeming.current = true;

    withTimeout(redeemInvite(inviteToken), WRITE_TIMEOUT)
      .then((group) => {
        addGroup(group);
        setPendingInviteToken(null);
        router.replace(`/group/${group.id}`);
      })
      .catch((err) => {
        setPendingInviteToken(null);
        setError((err as { message?: string })?.message || 'Invito non valido o revocato.');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, session, profile?.displayName, inviteToken]);

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={styles.center}>
          <UsersIcon size={38} color={colors.textFaint} />
          <Text style={[styles.title, { color: colors.text }]}>Invito non valido</Text>
          <Text style={[styles.sub, { color: colors.textDim }]}>
            {error} Chiedi a chi ti ha invitato di condividere di nuovo il link.
          </Text>
          <Pressable onPress={() => router.replace('/')} style={[styles.btn, { backgroundColor: colors.amber }]}>
            <Text style={{ color: colors.inkOnAmber, fontWeight: '700' }}>Torna ai tuoi gruppi</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.center}>
        <ActivityIndicator color={colors.amber} />
        <Text style={[styles.sub, { color: colors.textDim }]}>Sto aprendo l&apos;invito…</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 34 },
  title: { fontSize: 18, fontWeight: '700' },
  sub: { fontSize: 13.5, textAlign: 'center', lineHeight: 19, maxWidth: 300 },
  btn: { paddingHorizontal: 22, paddingVertical: 13, borderRadius: RADIUS.sm, marginTop: 6 },
});
