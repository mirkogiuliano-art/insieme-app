import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { Pressable } from '@/components/Tocco';
import { useTheme } from '@/theme/theme';
import { useBarraAnimata } from '@/lib/tabBarSpace';
import { DECELERA } from '@/lib/movimento';
import { useT } from '@/i18n';

/*
 * La barra delle sezioni di un gruppo e le sezioni sopra di lei. Le usano
 * la schermata del gruppo (Chat, Link, Mappa) e la pagina di un gruppo
 * pubblico (Link e Mappa): fuori dal gruppo si vede lo stesso gruppo, senza
 * la chat.
 */

export interface VoceSezione<K extends string> {
  chiave: K;
  label: string;
  icona: (colore: string) => React.ReactNode;
}

/**
 * La barra galleggia davvero sopra il contenuto: le liste e la mappa le
 * passano sotto fino al bordo dello schermo, e lei resta leggibile perché è
 * quasi opaca e staccata da un'ombra. Quanto spazio lasciarle libero in
 * fondo, le sezioni lo leggono da TabBarSpaceContext. È sempre presente:
 * con la tastiera si dissolve seguendone il movimento, invece di sparire di
 * colpo (vedi useBarraAnimata), e mentre è nascosta non si tocca.
 *
 * Tutte le sezioni portano il nome scritto: con la sola icona due su tre si
 * riconoscevano a memoria, e quella dei link sembrava un video.
 */
export function BarraSezioni<K extends string>({ voci, attiva, onCambia }: { voci: VoceSezione<K>[]; attiva: K; onCambia: (k: K) => void }) {
  const { colors, theme } = useTheme();
  const t = useT();
  const keyboardOpen = useKeyboardState((s) => s.isVisible);
  const barraAnimata = useBarraAnimata();
  // La pastiglia della sezione aperta scorre fino a quella nuova invece di
  // saltarci: si vede da dove si arriva e dove si va.
  const indice = Math.max(0, voci.findIndex((v) => v.chiave === attiva));
  const posizione = useSharedValue(indice);
  const larghezza = useSharedValue(0);
  useEffect(() => {
    posizione.value = withTiming(indice, { duration: 260, easing: DECELERA });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indice]);
  const pastiglia = useAnimatedStyle(() => ({
    width: larghezza.value,
    transform: [{ translateX: posizione.value * (larghezza.value + 4) }],
  }));

  return (
    <View pointerEvents="box-none" style={styles.zona}>
      <Animated.View
        accessibilityRole="tablist"
        accessibilityLabel={t.accessibilita.sezioni}
        pointerEvents={keyboardOpen ? 'none' : 'auto'}
        style={[styles.barra, { backgroundColor: theme === 'light' ? 'rgba(255,255,255,0.9)' : 'rgba(33,44,56,0.9)' }, barraAnimata]}
        onLayout={(e) => {
          // Sezioni larghe uguali: la barra meno i 6 punti di bordo per lato
          // e i 4 fra una sezione e l'altra.
          larghezza.value = (e.nativeEvent.layout.width - 12 - 4 * (voci.length - 1)) / voci.length;
        }}
      >
        <Animated.View pointerEvents="none" style={[styles.pastiglia, { backgroundColor: colors.amber }, pastiglia]} />
        {voci.map((v) => {
          const on = v.chiave === attiva;
          const colore = on ? colors.inkOnAmber : colors.textFaint;
          return (
            <Pressable
              key={v.chiave}
              accessibilityRole="tab"
              accessibilityLabel={v.label}
              accessibilityState={{ selected: on }}
              hitSlop={3}
              onPress={() => onCambia(v.chiave)}
              style={styles.tasto}
            >
              {v.icona(colore)}
              <Text style={[styles.label, { color: colore }]} numberOfLines={1}>
                {v.label}
              </Text>
            </Pressable>
          );
        })}
      </Animated.View>
    </View>
  );
}

/**
 * Una sezione del gruppo. Si monta la prima volta che si apre e poi resta,
 * nascosta quando se ne apre un'altra: rimontarla a ogni cambio rifaceva
 * disegno, letture e iscrizioni al tempo reale, e il cambio si sentiva.
 * Tornando compare in dissolvenza, tranne quella aperta col gruppo, che
 * arriva già con la schermata. Con `resta={false}` si smonta uscendo.
 */
export function Sezione({ attiva, resta = true, children }: { attiva: boolean; resta?: boolean; children: React.ReactNode }) {
  const [aperta, setAperta] = useState(attiva);
  const opacita = useSharedValue(attiva ? 1 : 0);
  const prima = useRef(true);
  useEffect(() => {
    const iniziale = prima.current;
    prima.current = false;
    if (!attiva) {
      // Già trasparente quando torna: niente lampo prima della dissolvenza.
      opacita.value = 0;
      return;
    }
    setAperta(true);
    if (iniziale) return;
    opacita.value = withTiming(1, { duration: 200 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attiva]);
  const dissolvenza = useAnimatedStyle(() => ({ opacity: opacita.value }));
  if (!attiva && !(resta && aperta)) return null;
  return <Animated.View style={[styles.sezione, dissolvenza, !attiva && styles.nascosta]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  sezione: { flex: 1 },
  nascosta: { display: 'none' },
  // La barra resta della misura di un telefono anche sugli schermi
  // larghi, al centro: allungata su 1200 punti le tre sezioni finivano
  // lontanissime fra loro.
  zona: { position: 'absolute', left: 14, right: 14, bottom: 12, alignItems: 'center' },
  barra: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    gap: 4,
    padding: 6,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  // Il fondo della sezione aperta, uno solo per tutta la barra: scorre
  // sotto i tasti. Tasti e fondo sono pillole intere.
  pastiglia: { position: 'absolute', top: 6, bottom: 6, left: 6, borderRadius: 999 },
  tasto: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
    borderRadius: 999,
  },
  label: { fontSize: 13, fontWeight: '700' },
});
