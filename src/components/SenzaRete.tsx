import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Pressable } from '@/components/Tocco';
import { useTheme, RADIUS } from '@/theme/theme';
import { CloudOffIcon } from '@/components/Icon';
import { timeLabel, dateLabel } from '@/lib/utils';
import { useT } from '@/i18n';

/**
 * Al posto dell'avviso d'errore, quando c'è una copia da mostrare (vedi
 * copiaLocale): i dati restano a schermo, e questa riga dice che sono quelli
 * dell'ultima volta, e di quando. L'app riprova da sola; «Riprova» è per chi
 * non vuole aspettare.
 */
export function SenzaRete({ dal, onRetry, style }: { dal: number; onRetry: () => void; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const t = useT();
  const oggi = new Date(dal).toDateString() === new Date().toDateString();
  const quando = oggi ? t.senzaRete.aggiornatoAlle(timeLabel(dal)) : t.senzaRete.aggiornatoIl(dateLabel(dal), timeLabel(dal));
  return (
    <View accessibilityLiveRegion="polite" style={[styles.riga, { backgroundColor: colors.surface }, style]}>
      <CloudOffIcon size={18} color={colors.textDim} />
      {/* Due righe, come l'avviso d'errore: cosa succede, e da quando sono
          i dati a schermo. Su una riga sola l'ora finiva a capo da sola. */}
      <View style={styles.testi}>
        <Text style={[styles.titolo, { color: colors.text }]}>{t.senzaRete.titolo}</Text>
        <Text style={[styles.quando, { color: colors.textDim }]} numberOfLines={1}>
          {quando}
        </Text>
      </View>
      <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={10}>
        <Text style={[styles.riprova, { color: colors.amberText }]}>{t.comune.riprova}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  riga: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 2,
    marginBottom: 8,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
  },
  testi: { flex: 1 },
  titolo: { fontSize: 13, fontWeight: '800' },
  quando: { fontSize: 12, marginTop: 1 },
  riprova: { fontSize: 12.5, fontWeight: '800' },
});
