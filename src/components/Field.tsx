import React from 'react';
import { View, TextInput, StyleSheet, Platform, type TextInputProps } from 'react-native';
import { useTheme, RADIUS } from '@/theme/theme';

/** Vedi PasswordInput: sul web il contorno di messa a fuoco del browser
 * finirebbe dentro la cornice. */
const focusOutlineOff =
  Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextInputProps['style']) : null;

/**
 * Campo di testo con l'icona dentro, a sinistra: la stessa forma del
 * campo password, così accesso, registrazione e nuova password hanno
 * campi tutti uguali.
 */
export function Field({ icon, style, ...props }: TextInputProps & { icon?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface }, style]}>
      {icon}
      <TextInput
        {...props}
        style={[styles.field, { color: colors.text }, focusOutlineOff]}
        placeholderTextColor={props.placeholderTextColor ?? colors.textFaint}
      />
    </View>
  );
}

export const FIELD_HEIGHT = 50;

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    height: FIELD_HEIGHT,
    borderRadius: RADIUS.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  field: { flex: 1, fontSize: 15, paddingVertical: 0, height: '100%' },
});
