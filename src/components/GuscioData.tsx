import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Pressable } from '@/components/Tocco';
import { useTheme, RADIUS } from '@/theme/theme';
import { CalendarIcon, CloseIcon } from '@/components/Icon';
import { useT } from '@/i18n';
import { dataCorta } from '@/lib/groupInfo';

export interface CampoDataProps {
  /** 'AAAA-MM-GG', o `null` finché non si sceglie. */
  valore: string | null;
  onCambia: (iso: string | null) => void;
  /** Cosa si legge nel campo vuoto: «Dal», «Al». */
  segnaposto: string;
  /** Il nome per TalkBack: «Data di inizio». */
  etichetta: string;
  /** Il primo giorno che si può scegliere: la fine non viene prima
   * dell'inizio. */
  minimo?: string | null;
}

/** Come appare il campo data, uguale sul telefono e sul web (vedi
 * CampoData): cambia solo che cosa apre il tocco. La × toglie la data,
 * che resta facoltativa. */
export function GuscioData({
  valore,
  onCambia,
  segnaposto,
  etichetta,
  onApri,
  children,
}: CampoDataProps & { onApri?: () => void; children?: React.ReactNode }) {
  const { colors } = useTheme();
  const t = useT();
  return (
    <View style={[styles.campo, { backgroundColor: colors.surface2 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={valore ? `${etichetta}: ${dataCorta(valore)}` : etichetta}
        onPress={onApri}
        style={styles.apri}
      >
        <CalendarIcon size={16} color={valore ? colors.textDim : colors.textFaint} />
        <Text style={[styles.testo, { color: valore ? colors.text : colors.textFaint }]} numberOfLines={1}>
          {valore ? dataCorta(valore) : segnaposto}
        </Text>
      </Pressable>
      {children}
      {valore ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t.accessibilita.togliData} onPress={() => onCambia(null)} style={styles.togli}>
          <CloseIcon size={12} color={colors.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  campo: { flex: 1, minWidth: 0, height: 48, borderRadius: RADIUS.sm, flexDirection: 'row', alignItems: 'center' },
  apri: { flex: 1, minWidth: 0, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14 },
  testo: { flex: 1, fontSize: 14.5 },
  togli: { alignSelf: 'stretch', paddingHorizontal: 13, justifyContent: 'center' },
});
