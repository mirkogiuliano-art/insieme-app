import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { EditIcon } from '@/components/Icon';

interface FilterChipProps {
  label: string;
  dotColor?: string;
  /** Al posto del pallino colorato, per i filtri che non sono una categoria
   * (i preferiti). Le due cose sono alternative: non ha senso averle insieme. */
  icon?: React.ReactNode;
  active?: boolean;
  dashed?: boolean;
  onPress: () => void;
  onEdit?: () => void;
}

export function FilterChip({ label, dotColor, icon, active, dashed, onPress, onEdit }: FilterChipProps) {
  const { colors } = useTheme();
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
      <Pressable onPress={onPress} style={styles.main} hitSlop={onEdit ? undefined : 6}>
        {icon ?? (dotColor ? <View style={[styles.dot, { backgroundColor: dotColor }]} /> : null)}
        <Text
          style={{
            fontSize: 12,
            fontWeight: '500',
            color: active ? colors.text : dashed ? colors.amber : colors.textDim,
          }}
        >
          {label}
        </Text>
      </Pressable>
      {onEdit ? (
        <Pressable onPress={onEdit} hitSlop={8} style={styles.editBtn}>
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
  editBtn: { paddingRight: 10, paddingLeft: 2, paddingVertical: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
