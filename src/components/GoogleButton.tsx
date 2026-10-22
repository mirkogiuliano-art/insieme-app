import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Pressable } from '@/components/Tocco';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/theme/theme';
import { useT } from '@/i18n';

/**
 * La «G» di Google, nei suoi quattro colori.
 *
 * È l'unico segno dell'app che non prende il colore dal tema: il marchio
 * di qualcun altro si usa com'è o non si usa. Tutto il resto del tasto —
 * fondo, contorno, testo — segue invece le superfici di Insieme.
 */
function GoogleG({ size = 19 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
}

/**
 * «Accedi con Google», sotto il pulsante principale.
 *
 * Il fondo è quello delle superfici dell'app invece del bianco della guida
 * di Google: così il tasto sta nella pagina come ci stanno i campi, e
 * l'ambra resta l'unica cosa accesa — la strada di casa continua a essere
 * la prima che si vede.
 */
export function GoogleButton({ onPress, busy }: { onPress: () => void; busy?: boolean }) {
  const { colors } = useTheme();
  const t = useT();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      style={[
        styles.btn,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: busy ? 0.6 : 1 },
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.textDim} />
      ) : (
        <>
          <GoogleG />
          <Text style={[styles.label, { color: colors.text }]}>{t.accesso.conGoogle}</Text>
        </>
      )}
    </Pressable>
  );
}

/** La riga con «oppure» che stacca le due strade. */
export function Separatore() {
  const { colors } = useTheme();
  const t = useT();
  return (
    <View style={styles.sep}>
      <View style={[styles.riga, { backgroundColor: colors.border }]} />
      <Text style={[styles.oppure, { color: colors.textFaint }]}>{t.accesso.oppure}</Text>
      <View style={[styles.riga, { backgroundColor: colors.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: '100%',
    height: 50,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 11,
  },
  label: { fontSize: 15, fontWeight: '600' },
  sep: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6, marginBottom: 2 },
  riga: { flex: 1, height: 1 },
  oppure: { fontSize: 12 },
});
