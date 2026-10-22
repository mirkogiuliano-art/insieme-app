import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Pressable } from '@/components/Tocco';
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
import { BrokenLinkIcon, CloudOffIcon } from '@/components/Icon';
import { redeemInvite } from '@/lib/api/invites';
import { withTimeout, WRITE_TIMEOUT } from '@/lib/utils';
import { ScreenGlow } from '@/components/ScreenGlow';
import { useT } from '@/i18n';
import { eProblemaDiRete } from '@/lib/errori';

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
  const t = useT();
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const inviteToken = String(token ?? '');
  const { session, ready: authReady, profile, setPendingInviteToken } = useAuth();
  const { addGroup } = useAppStore();

  /** Perché l'invito non è andato. Senza rete l'invito resta valido e si
   * riprova; «non vale più» solo quando lo dice il server. */
  const [error, setError] = useState<'rete' | 'scaduto' | null>(null);
  /** Ogni «Riprova» rifà il riscatto. */
  const [tentativo, setTentativo] = useState(0);
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
        // Con la rete debole l'invito non si butta: prima ogni errore
        // diventava «non vale più», e la causa detta era falsa.
        if (eProblemaDiRete(err)) {
          redeeming.current = false;
          setError('rete');
          return;
        }
        setPendingInviteToken(null);
        setError('scaduto');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, session, profile?.displayName, inviteToken, tentativo]);

  if (joined) {
    const tint = groupColor(joined.group);
    const ink = inkOn(tint);
    const size = cardWidth > 0 ? fitFontSize(joined.group.name, cardWidth, 24, 60) : 34;
    const { others } = joined;
    const who =
      others.length === 0
        ? t.invito.soloTu
        : others.length === 1
          ? t.invito.tiAspetta(others[0])
          : others.length === 2
            ? t.invito.tiAspettanoDue(others[0], others[1])
            : t.invito.tiAspettanoTanti(others[0], others[1], others.length - 2);
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
        <ScreenGlow />
        <View style={styles.center}>
          <View style={styles.column}>
            <Text style={[styles.title, { color: colors.text }]}>{t.invito.dentro}</Text>
            <Text style={[styles.sub, { color: colors.textDim }]}>{t.invito.benvenuto}</Text>
            {/* La scheda del gruppo com'è nella home. */}
            <View style={[styles.card, { backgroundColor: tint }]}>
              <View style={styles.cardBlob} />
              <View style={{ flex: 1 }} onLayout={(e) => setCardWidth(e.nativeEvent.layout.width)}>
                <Text maxFontSizeMultiplier={1} style={{ fontFamily: FONT_ROUNDED, fontSize: size, lineHeight: Math.round(size * 1.2), color: ink }} numberOfLines={1}>
                  {joined.group.name}
                </Text>
              </View>
            </View>
            <Text style={[styles.sub, { color: colors.textDim }]}>{who}</Text>
            <Pressable accessibilityRole="button"
              onPress={() => router.replace(`/group/${joined.group.id}`)}
              style={[styles.btn, { backgroundColor: colors.amber }]}
            >
              <Text style={[styles.btnText, { color: colors.inkOnAmber }]}>{t.invito.apriGruppo}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (error === 'rete') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
        <ScreenGlow />
        <View style={styles.center}>
          <View style={styles.column}>
            <View style={[styles.bigIcon, { backgroundColor: colors.surface }]}>
              <CloudOffIcon size={32} color={colors.textDim} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>{t.invito.reteTitolo}</Text>
            <Text style={[styles.sub, { color: colors.textDim }]}>{t.invito.reteTesto}</Text>
            <Pressable accessibilityRole="button"
              onPress={() => {
                setError(null);
                setTentativo((n) => n + 1);
              }}
              style={[styles.btn, { backgroundColor: colors.amber }]}
            >
              <Text style={[styles.btnText, { color: colors.inkOnAmber }]}>{t.comune.riprova}</Text>
            </Pressable>
            {/* Tornando ai gruppi l'invito si lascia: tenendolo da parte,
                la home riporterebbe subito qui. */}
            <Pressable accessibilityRole="button"
              onPress={() => {
                setPendingInviteToken(null);
                router.replace('/');
              }}
            >
              <Text style={[styles.link, { color: colors.textDim }]}>{t.invito.tornaAiGruppi}</Text>
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
            <Text style={[styles.title, { color: colors.text }]}>{t.invito.scadutoTitolo}</Text>
            <Text style={[styles.sub, { color: colors.textDim }]}>
              {t.invito.scadutoTesto}
            </Text>
            <Pressable accessibilityRole="button"
              onPress={() => router.replace({ pathname: '/', params: { nuovo: 'invito' } })}
              style={[styles.btn, { backgroundColor: colors.surface }]}
            >
              <Text style={[styles.btnText, { color: colors.text }]}>{t.invito.incollaAltro}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.replace('/')}>
              <Text style={[styles.link, { color: colors.textDim }]}>{t.invito.tornaAiGruppi}</Text>
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
        <ActivityIndicator color={colors.amberText} />
        <Text style={[styles.sub, { color: colors.textDim }]}>{t.invito.apertura}</Text>
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
