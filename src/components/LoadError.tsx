import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme, RADIUS } from '@/theme/theme';

interface LoadErrorProps {
  /** Cosa non si è riuscito a caricare, in due parole: "i messaggi",
   * "i link", "i posti". Finisce dentro la frase mostrata. */
  what: string;
  onRetry: () => void;
}

/**
 * Avviso mostrato quando una lettura dal database fallisce.
 *
 * Serve a non far passare un guasto per "non c'è niente": prima di questo
 * componente un errore di rete, un permesso negato o una colonna mancante
 * finivano tutti in un elenco vuoto, indistinguibile dal caso normale — e
 * chi guardava lo schermo pensava di aver perso i propri dati.
 */
export function LoadError({ what, onRetry }: LoadErrorProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.danger }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.text }]}>Non sono riuscito a caricare {what}</Text>
        <Text style={[styles.sub, { color: colors.textDim }]}>
          Probabilmente è la connessione. I dati non sono andati persi.
        </Text>
      </View>
      <Pressable onPress={onRetry} style={[styles.btn, { backgroundColor: colors.amber }]}>
        <Text style={{ color: colors.inkOnAmber, fontWeight: '700', fontSize: 12.5 }}>Riprova</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 13,
    paddingVertical: 11,
    margin: 16,
  },
  title: { fontSize: 13.5, fontWeight: '700' },
  sub: { fontSize: 11.5, marginTop: 2, lineHeight: 16 },
  btn: { paddingHorizontal: 15, paddingVertical: 9, borderRadius: RADIUS.sm },
});
