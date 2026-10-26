import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from '@/components/Tocco';
import { useTheme } from '@/theme/theme';
import { useT } from '@/i18n';
import { EditIcon } from '@/components/Icon';

interface FilterChipProps {
  label: string;
  dotColor?: string;
  /** Al posto del pallino colorato, per i filtri che non sono una categoria
   * (i preferiti). Le due cose sono alternative: non ha senso averle insieme. */
  icon?: React.ReactNode;
  active?: boolean;
  /** Quanti elementi ci sono sotto il filtro, scritto dopo il nome. */
  count?: number;
  /** Solo l'icona: il nome resta per chi usa un lettore di schermo. */
  soloIcona?: boolean;
  dashed?: boolean;
  onPress: () => void;
  onEdit?: () => void;
}

export function FilterChip({ label, dotColor, icon, active, count, soloIcona, dashed, onPress, onEdit }: FilterChipProps) {
  const { colors } = useTheme();
  const t = useT();
  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.surface2 : colors.surface,
          borderColor: active ? colors.amber : colors.border,
          borderStyle: dashed ? 'dashed' : 'solid',
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={soloIcona ? label : undefined}
        accessibilityState={{ selected: !!active }}
        onPress={onPress}
        style={[styles.main, soloIcona && styles.soloIcona]}
        hitSlop={onEdit ? undefined : 6}
      >
        {icon ?? (dotColor ? <View style={[styles.dot, { backgroundColor: dotColor }]} /> : null)}
        {soloIcona ? null : (
          <Text
            style={{
              fontSize: 12,
              fontWeight: '500',
              color: active ? colors.text : dashed ? colors.amber : colors.textDim,
            }}
          >
            {label}
          </Text>
        )}
        {count !== undefined ? (
          <Text style={[styles.count, { color: active ? colors.amberText : colors.textFaint }]}>{count}</Text>
        ) : null}
      </Pressable>
      {onEdit ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t.accessibilita.modificaCategoria(label)} onPress={onEdit} hitSlop={8} style={styles.editBtn}>
          <EditIcon size={11} color={colors.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 7,
  },
  main: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 12,
    paddingRight: 9,
    paddingVertical: 6,
  },
  soloIcona: { paddingLeft: 10, paddingRight: 10 },
  count: { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  editBtn: { paddingRight: 10, paddingLeft: 2, paddingVertical: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
