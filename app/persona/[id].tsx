import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable } from '@/components/Tocco';
import { useTheme, FONT_ROUNDED } from '@/theme/theme';
import { BackIcon, GlobeIcon } from '@/components/Icon';
import { ScreenGlow } from '@/components/ScreenGlow';
import { InCaricamento } from '@/components/InCaricamento';
import { profiloPubblico, type GruppoPubblico, type PersonaPubblica } from '@/lib/api/pubblici';
import { initials, colorForUser, inkOn } from '@/lib/utils';
import { rangeLabel } from '@/lib/groupInfo';
import { useT } from '@/i18n';

/**
 * La pagina di una persona, per chi la trova cercando: nome, nome utente
 * e i suoi gruppi pubblici. Come un profilo, ma senza niente di suo oltre
 * ai gruppi che ha scelto di mostrare.
 */
export default function PersonaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const t = useT();
  const router = useRouter();
  const [dati, setDati] = useState<{ persona: PersonaPubblica; gruppi: GruppoPubblico[] } | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    profiloPubblico(id)
      .then((d) => alive && setDati(d))
      .catch(() => alive && setDati(null));
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <ScreenGlow />
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.comune.indietro}
          hitSlop={6}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={[styles.iconBtn, { backgroundColor: colors.surface }]}
        >
          <BackIcon size={18} color={colors.textDim} />
        </Pressable>
      </View>
      {dati === undefined ? (
        <View style={styles.centro}>
          <InCaricamento />
        </View>
      ) : dati === null ? (
        <View style={styles.centro}>
          <Text style={[styles.vuoto, { color: colors.textFaint }]}>{t.pubblico.personaSparita}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.lista}>
          <View style={styles.chi}>
            <View style={[styles.avatar, { backgroundColor: colorForUser(dati.persona.nome) }]}>
              <Text maxFontSizeMultiplier={1} style={styles.avatarText}>{initials(dati.persona.nome)}</Text>
            </View>
            <Text style={[styles.nome, { color: colors.text }]}>{dati.persona.nome}</Text>
            <Text style={[styles.utente, { color: colors.textDim }]}>@{dati.persona.nomeUtente}</Text>
          </View>
          <Text style={[styles.etichetta, { color: colors.textDim }]}>{t.pubblico.gruppiPubbliciN(dati.gruppi.length)}</Text>
          {dati.gruppi.map((g) => {
            const ink = inkOn(g.colore);
            const date = rangeLabel(g.startsOn, g.endsOn);
            return (
              <Pressable key={g.id} accessibilityRole="button" onPress={() => router.push(`/pubblico/${g.id}`)} style={[styles.scheda, { backgroundColor: g.colore }]}>
                <View style={styles.blob} />
                <GlobeIcon size={16} color={ink} />
                <Text maxFontSizeMultiplier={1.2} style={[styles.schedaNome, { color: ink }]} numberOfLines={2}>
                  {g.nome}
                </Text>
                <Text style={[styles.schedaSub, { color: ink }]} numberOfLines={1}>
                  {[date, t.pubblico.linkEPosti(g.link, g.posti)].filter(Boolean).join(' · ')}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, flexDirection: 'row' },
  iconBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  vuoto: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  lista: { paddingHorizontal: 24, paddingBottom: 24, gap: 14 },
  chi: { alignItems: 'center', gap: 4, paddingVertical: 10 },
  avatar: { width: 76, height: 76, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  avatarText: { fontSize: 26, fontWeight: '800', color: '#1B2530' },
  nome: { fontFamily: FONT_ROUNDED, fontSize: 28, lineHeight: 34, textAlign: 'center' },
  utente: { fontSize: 14, fontWeight: '700' },
  etichetta: { fontSize: 10.5, fontWeight: '800', marginTop: 8 },
  scheda: { minHeight: 132, borderRadius: 24, padding: 18, gap: 6, justifyContent: 'flex-end', overflow: 'hidden' },
  blob: { position: 'absolute', right: -34, top: -42, width: 124, height: 124, borderRadius: 62, backgroundColor: 'rgba(0,0,0,0.09)' },
  schedaNome: { fontFamily: FONT_ROUNDED, fontSize: 30, lineHeight: 35 },
  schedaSub: { fontSize: 12.5, fontWeight: '700' },
});
