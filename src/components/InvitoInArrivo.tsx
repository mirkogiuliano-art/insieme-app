import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Pressable } from '@/components/Tocco';
import { useTheme, FONT_ROUNDED } from '@/theme/theme';
import { initials, colorForUser } from '@/lib/utils';
import { groupColor } from '@/lib/appStore';
import type { Group } from '@/types';
import type { InvitoRicevuto } from '@/lib/api/invitiPersona';
import { useT } from '@/i18n';

/**
 * Un invito in un gruppo, in cima alla home, sopra i gruppi. Si vede chi
 * invita, il gruppo e chi c'è già: quanto basta per decidere senza
 * entrare. Il colore del gruppo c'è solo come pastiglia: la scheda piena
 * del suo colore arriva quando il gruppo è tuo.
 */
export function InvitoInArrivo({
  invito,
  busy,
  onRisposta,
  style,
}: {
  invito: InvitoRicevuto;
  busy: boolean;
  onRisposta: (entra: boolean) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const t = useT();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }, style]}>
      <View style={styles.daChi}>
        <View style={[styles.avatar, { backgroundColor: colorForUser(invito.da) }]}>
          <Text maxFontSizeMultiplier={1} style={styles.avatarText}>{initials(invito.da)}</Text>
        </View>
        <Text style={[styles.tiInvita, { color: colors.textDim }]} numberOfLines={1}>{t.invitoRicevuto.tiInvita(invito.da)}</Text>
      </View>
      <View style={styles.nomeRiga}>
        <View style={[styles.tinta, { backgroundColor: groupColor({ id: invito.gruppo.id, color: invito.gruppo.colore } as Group), borderColor: colors.border }]} />
        <Text style={[styles.nome, { color: colors.text }]} numberOfLines={2}>{invito.gruppo.nome}</Text>
      </View>
      <Text style={[styles.chi, { color: colors.textFaint }]} numberOfLines={1}>{t.invitoRicevuto.conChi(invito.membri)}</Text>
      <View style={styles.azioni}>
        <Pressable accessibilityRole="button" onPress={() => onRisposta(false)} disabled={busy} style={[styles.btn, { backgroundColor: colors.surface2 }]}>
          <Text style={{ color: colors.textDim, fontWeight: '600' }}>{t.invitoRicevuto.noGrazie}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => onRisposta(true)} disabled={busy} style={[styles.btn, { backgroundColor: colors.amber, opacity: busy ? 0.6 : 1 }]}>
          <Text style={{ color: colors.inkOnAmber, fontWeight: '800' }}>{t.invitoRicevuto.entra}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 24, padding: 18, gap: 6 },
  daChi: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  avatar: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 10, fontWeight: '800', color: '#1B2530' },
  tiInvita: { flex: 1, fontSize: 13.5, fontWeight: '600' },
  nomeRiga: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  tinta: { width: 14, height: 14, borderRadius: 5, borderWidth: 1 },
  nome: { flex: 1, fontFamily: FONT_ROUNDED, fontSize: 26, lineHeight: 31 },
  chi: { fontSize: 12.5 },
  azioni: { flexDirection: 'row', gap: 10, marginTop: 10 },
  btn: { flex: 1, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
