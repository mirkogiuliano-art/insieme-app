import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { groupColor } from '@/lib/appStore';
import { listRoster } from '@/lib/api/groupMembers';
import { fitFontSize } from '@/lib/fitText';
import { inkOn } from '@/lib/utils';
import type { Group } from '@/types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme, FONT_ROUNDED } from '@/theme/theme';
import { useAuth } from '@/lib/authStore';
import { useAppStore } from '@/lib/appStore';
import { BrokenLinkIcon } from '@/components/Icon';
import { redeemInvite } from '@/lib/api/invites';
import { withTimeout, WRITE_TIMEOUT } from '@/lib/utils';
import { ScreenGlow } from '@/components/ScreenGlow';

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
  /** Il gruppo appena raggiunto, e chi c'è già: si mostra un attimo di
   * benvenuto invece di saltare dritti dentro senza dire niente. */
  const [joined, setJoined] = useState<{ group: Group; others: string[] } | null>(null);
  const [cardWidth, setCardWidth] = useState(0);
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
      .then(async (group) => {
        addGroup(group);
        setPendingInviteToken(null);
        const roster = await listRoster(group.id).catch(() => ({}) as Record<string, string>);
        const others = Object.entries(roster)
          .filter(([id]) => id !== session.user.id)
          .map(([, name]) => name);
        setJoined({ group, others });
      })
      .catch((err) => {
        setPendingInviteToken(null);
        setError((err as { message?: string })?.message || 'Invito non valido o revocato.');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, session, profile?.displayName, inviteToken]);

  if (joined) {
    const tint = groupColor(joined.group);
    const ink = inkOn(tint);
    const size = cardWidth > 0 ? fitFontSize(joined.group.name, cardWidth, 24, 60) : 34;
    const { others } = joined;
    const who =
      others.length === 0
        ? 'Per ora ci sei solo tu: invita qualcuno da Info gruppo.'
        : others.length === 1
          ? `${others[0]} ti aspetta.`
          : others.length === 2
            ? `${others[0]} e ${others[1]} ti aspettano.`
            : `${others[0]}, ${others[1]} e altri ${others.length - 2} ti aspettano.`;
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
        <ScreenGlow />
        <View style={styles.center}>
          <View style={styles.column}>
            <Text style={[styles.title, { color: colors.text }]}>Sei dentro!</Text>
            <Text style={[styles.sub, { color: colors.textDim }]}>Benvenuto nel gruppo</Text>
            {/* La scheda del gruppo com'è nella home. */}
            <View style={[styles.card, { backgroundColor: tint }]}>
              <View style={styles.cardBlob} />
              <View style={{ flex: 1 }} onLayout={(e) => setCardWidth(e.nativeEvent.layout.width)}>
                <Text style={{ fontFamily: FONT_ROUNDED, fontSize: size, lineHeight: Math.round(size * 1.2), color: ink }} numberOfLines={1}>
                  {joined.group.name}
                </Text>
              </View>
            </View>
            <Text style={[styles.sub, { color: colors.textDim }]}>{who}</Text>
            <Pressable
              onPress={() => router.replace(`/group/${joined.group.id}`)}
              style={[styles.btn, { backgroundColor: colors.amber }]}
            >
              <Text style={[styles.btnText, { color: colors.inkOnAmber }]}>Apri il gruppo</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
        <ScreenGlow />
        <View style={styles.center}>
          <View style={styles.column}>
            <View style={[styles.bigIcon, { backgroundColor: colors.surface }]}>
              <BrokenLinkIcon size={32} color={colors.danger} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Questo invito non vale più</Text>
            <Text style={[styles.sub, { color: colors.textDim }]}>
              Chi te l’ha mandato l’ha disattivato, o ne ha creato uno nuovo. Chiedigli di rimandartelo: lo trova in Info
              gruppo.
            </Text>
            <Pressable
              onPress={() => router.replace({ pathname: '/', params: { nuovo: 'invito' } })}
              style={[styles.btn, { backgroundColor: colors.surface }]}
            >
              <Text style={[styles.btnText, { color: colors.text }]}>Incolla un altro invito</Text>
            </Pressable>
            <Pressable onPress={() => router.replace('/')}>
              <Text style={[styles.link, { color: colors.textDim }]}>Torna ai tuoi gruppi</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScreenGlow />
      <View style={styles.center}>
        <ActivityIndicator color={colors.amber} />
        <Text style={[styles.sub, { color: colors.textDim }]}>Sto aprendo l&apos;invito…</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  column: { width: '100%', maxWidth: 360, alignItems: 'center', gap: 12 },
  bigIcon: { width: 76, height: 76, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  title: { fontSize: 25, fontWeight: '800', letterSpacing: -0.5, textAlign: 'center' },
  sub: { fontSize: 13.5, textAlign: 'center', lineHeight: 20, maxWidth: 320 },
  card: { width: '100%', height: 132, borderRadius: 24, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, marginVertical: 8 },
  cardBlob: { position: 'absolute', right: -34, top: -42, width: 124, height: 124, borderRadius: 62, backgroundColor: 'rgba(0,0,0,0.09)' },
  btn: { width: '100%', height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  btnText: { fontWeight: '800', fontSize: 15 },
  link: { fontSize: 13, fontWeight: '700', marginTop: 2 },
});
