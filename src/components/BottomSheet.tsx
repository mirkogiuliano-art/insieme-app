import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Pressable, StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useTheme } from '@/theme/theme';
import { ScrollConTastiera } from '@/components/ScrollConTastiera';
import { DECELERA } from '@/lib/movimento';
import { useT } from '@/i18n';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/** Il foglio sale in 280 ms e scende in 200: si esce più in fretta di come
 * si entra. */
const ENTRATA_MS = 280;
const USCITA_MS = 200;
const ACCELERA = Easing.bezier(0.4, 0, 1, 1);

/**
 * Il foglio che sale dal basso. Il velo scuro si dissolve e il pannello
 * sale; prima la Modal faceva scorrere dal basso anche il velo, come un
 * sipario che sale insieme al foglio.
 *
 * Chiudendo, il foglio scende con il contenuto che aveva: molti fogli,
 * appena chiusi, passano `null` come contenuto, e senza tenere l'ultimo
 * scenderebbe un pannello vuoto. Con «Rimuovi animazioni» attivo nel
 * telefono si apre e si chiude di colpo (lo fa Reanimated da sé).
 */
export function BottomSheet({ visible, onClose, children }: BottomSheetProps) {
  const { colors } = useTheme();
  const t = useT();
  const [montato, setMontato] = useState(visible);
  const ultimoContenuto = useRef(children);
  if (visible) ultimoContenuto.current = children;
  const p = useSharedValue(0);
  const altezza = useSharedValue(600);

  useEffect(() => {
    if (visible) {
      setMontato(true);
      p.value = withTiming(1, { duration: ENTRATA_MS, easing: DECELERA });
    } else {
      p.value = withTiming(0, { duration: USCITA_MS, easing: ACCELERA }, (finito) => {
        if (finito) scheduleOnRN(setMontato, false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const velo = useAnimatedStyle(() => ({ opacity: p.value }));
  const pannello = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - p.value) * altezza.value }] }));

  return (
    <Modal visible={montato} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        {/* Lo sfondo che chiude il foglio sta DIETRO al foglio, non
            intorno al suo contenuto. Avvolgere la lista in un Pressable
            (per fermare il tocco prima dello sfondo) gliene faceva
            contendere il gesto: lo scorrimento partiva una volta su tre.
            Così il tocco sul contenuto non incontra nessun Pressable di
            troppo, e quello fuori dal foglio arriva qui. */}
        <Animated.View style={[styles.backdrop, velo]}>
          <Pressable accessibilityRole="button" accessibilityLabel={t.accessibilita.chiudi} style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        {/* `automaticOffset` fa misurare alla vista la propria posizione
            reale, tenendo conto del fatto che qui siamo dentro una Modal. */}
        <KeyboardAvoidingView behavior="padding" automaticOffset style={styles.wrap} pointerEvents={visible ? 'box-none' : 'none'}>
          <Animated.View
            onLayout={(e) => {
              altezza.value = e.nativeEvent.layout.height + 24;
            }}
            style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }, pannello]}
          >
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            {/* `nestedScrollEnabled`: su Android, dentro una Modal, senza
                questo la lista può restare "ferma" dopo un tocco su una
                riga, finché non se ne fa un altro.
                Il foglio si alza sopra la tastiera; se è più alto dello
                spazio che resta, la lista porta in vista il campo in cui
                si scrive (vedi ScrollConTastiera). */}
            <ScrollConTastiera showsVerticalScrollIndicator={false} nestedScrollEnabled keyboardDismissMode="on-drag">
              {visible ? children : ultimoContenuto.current}
            </ScrollConTastiera>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8,12,17,0.55)',
  },
  wrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  // Su tablet e pieghevoli il pannello non attraversa tutto lo schermo:
  // resta largo al massimo 640 punti, al centro, come vuole Android.
  panel: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    maxHeight: '88%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 99,
    alignSelf: 'center',
    marginBottom: 12,
  },
});
