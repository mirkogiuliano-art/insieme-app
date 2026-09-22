import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme, RADIUS } from '@/theme/theme';
import { CloudOffIcon, RetryIcon } from '@/components/Icon';

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
    <View style={[styles.box, { backgroundColor: colors.surface }]}>
      <View style={[styles.icon, { backgroundColor: colors.danger + '1F' }]}>
        <CloudOffIcon size={20} color={colors.danger} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.text }]}>Non sono riuscito a caricare {what}</Text>
        <Text style={[styles.sub, { color: colors.textDim }]}>
          Probabilmente è la connessione. I dati non sono andati persi.
        </Text>
      </View>
      <Pressable onPress={onRetry} style={[styles.btn, { backgroundColor: colors.amber }]}>
        <RetryIcon size={13} color={colors.inkOnAmber} strokeWidth={2.4} />
        <Text style={{ color: colors.inkOnAmber, fontWeight: '800', fontSize: 12.5 }}>Riprova</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: RADIUS.md,
    padding: 12,
    margin: 16,
  },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 13.5, fontWeight: '700' },
  sub: { fontSize: 11.5, marginTop: 2, lineHeight: 16 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 34, borderRadius: 999 },
});
