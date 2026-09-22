import React, { useState } from 'react';
import { View, TextInput, Pressable, StyleSheet, Platform, type TextInputProps } from 'react-native';
import { useTheme, RADIUS } from '@/theme/theme';
import { EyeIcon, EyeOffIcon, LockIcon } from '@/components/Icon';
import { FIELD_HEIGHT } from '@/components/Field';

/** Sul web il browser disegna il proprio contorno di messa a fuoco sul
 * campo interno: essendo il campo dentro una cornice, il contorno finiva
 * *dentro* al bordo invece che attorno, e sembrava un difetto grafico.
 * `outlineStyle` esiste solo in react-native-web e non è nei tipi di
 * React Native, da cui la conversione. */
const focusOutlineOff =
  Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextInputProps['style']) : null;

/** Tutte le proprietà di un normale campo di testo tranne quella che
 * gestiamo noi: se il testo è nascosto o visibile. */
type PasswordInputProps = Omit<TextInputProps, 'secureTextEntry'>;

/**
 * Campo password con l'occhio per mostrare quello che si sta scrivendo.
 *
 * Componente unico invece del solito `TextInput` con `secureTextEntry`,
 * perché di campi password ce ne sono tre (accesso, registrazione con
 * conferma, e reimpostazione) e devono comportarsi allo stesso modo.
 *
 * Nota sul comportamento: il pulsante NON è dentro il campo di testo ma
 * accanto, dentro una cornice che ha l'aspetto del campo. In React Native
 * un `TextInput` non può contenere altri elementi, quindi la struttura è
 * cornice → campo + pulsante, con la cornice a portare bordo e sfondo.
 */
export function PasswordInput({ style, ...props }: PasswordInputProps) {
  const { colors } = useTheme();
  const [visibile, setVisibile] = useState(false);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface }, style]}>
      {/* Il lucchetto, come la busta nel campo email: stessa forma per tutti
          i campi delle schermate di accesso. */}
      <LockIcon size={16} color={colors.textFaint} />
      <TextInput
        {...props}
        style={[styles.field, { color: colors.text }, focusOutlineOff]}
        placeholderTextColor={props.placeholderTextColor ?? colors.textFaint}
        secureTextEntry={!visibile}
        // Con la password in chiaro le tastiere propongono correzioni e
        // maiuscole automatiche, che qui darebbero solo fastidio.
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
      />
      <Pressable
        onPress={() => setVisibile((v) => !v)}
        hitSlop={10}
        style={styles.toggle}
        accessibilityRole="button"
        accessibilityLabel={visibile ? 'Nascondi la password' : 'Mostra la password'}
      >
        {visibile ? <EyeOffIcon color={colors.textDim} /> : <EyeIcon color={colors.textFaint} />}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Stesse misure del campo di testo normale delle schermate di accesso,
  // così password ed email restano allineate.
  wrap: {
    width: '100%',
    height: FIELD_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: RADIUS.sm,
    paddingLeft: 14,
    paddingRight: 6,
  },
  field: { flex: 1, paddingVertical: 0, height: '100%', fontSize: 15 },
  toggle: { paddingHorizontal: 8, paddingVertical: 10 },
});
