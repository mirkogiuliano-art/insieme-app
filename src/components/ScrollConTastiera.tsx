import React, { useCallback, useRef } from 'react';
import { ScrollView, TextInput, type ScrollViewProps, type HostInstance } from 'react-native';
import { useKeyboardHandler } from 'react-native-keyboard-controller';
import { scheduleOnRN } from 'react-native-worklets';

/** Quanto spazio lasciare fra il campo e il bordo della parte visibile. */
const MARGINE = 20;

/**
 * Una ScrollView che tiene in vista il campo in cui si sta scrivendo.
 *
 * ── Il problema ─────────────────────────────────────────────────────
 * Con Android in modalità edge-to-edge (obbligatoria dalla 15) la tastiera
 * non restringe più la finestra: si posa sopra al contenuto. Ogni
 * schermata e ogni foglio con un campo stanno dentro un
 * `KeyboardAvoidingView`, che li alza di quanto è alta la tastiera — e per
 * un campo solo in una pagina corta basta. Ma quando il contenuto è più
 * alto dello spazio rimasto sopra la tastiera, la parte che scorre si
 * accorcia e il campo toccato può restare fuori, sotto il bordo: coperto
 * lo stesso, solo che a coprirlo è il taglio della lista invece della
 * tastiera.
 *
 * ── La soluzione, e perché non è KeyboardAwareScrollView ────────────
 * La libreria ha un componente che fa scorrere fino al campo, ma fa i
 * conti in coordinate dello schermo, con la posizione misurata nel
 * momento del tocco. Dentro un foglio che nello stesso istante si sta
 * alzando, quella posizione è già vecchia e il campo finisce troppo in
 * alto: la tastiera verrebbe contata due volte.
 *
 * Qui invece il conto è **relativo alla lista**: dove sta il campo dentro
 * il contenuto, qual è la parte visibile adesso. Chi abbia alzato la lista
 * e di quanto non entra nel calcolo, quindi va bene sia in una schermata
 * sia in un foglio.
 *
 * ── Quando si controlla ─────────────────────────────────────────────
 * - a tastiera aperta del tutto;
 * - passando a un altro campo con la tastiera già aperta — la libreria
 *   lo segnala con lo stesso evento di fine movimento;
 * - quando la lista cambia altezza con la tastiera aperta: l'alzata del
 *   foglio può finire un attimo dopo la tastiera.
 */
export function ScrollConTastiera({ onScroll, onLayout, children, ...props }: ScrollViewProps) {
  const ref = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const altezza = useRef(0);
  const tastieraAperta = useRef(false);

  const mostraCampo = useCallback(() => {
    const campo = TextInput.State.currentlyFocusedInput();
    // `getInnerViewRef` esiste (ScrollView.js di React Native) ma i tipi
    // "classici" dichiarano solo `getInnerViewNode`, che restituisce un
    // numero — e con la nuova architettura `measureLayout` vuole il
    // riferimento, non il numero.
    const contenuto = (ref.current as unknown as { getInnerViewRef?: () => HostInstance | null } | null)?.getInnerViewRef?.();
    if (!campo || !contenuto || altezza.current === 0) return;
    // Se il campo non sta dentro questa lista la misura fallisce, e non
    // si fa niente: ci pensa la lista a cui appartiene.
    campo.measureLayout(
      contenuto,
      (_x, y, _w, h) => {
        const visibileDa = scrollY.current;
        const visibileA = visibileDa + altezza.current;
        // Un campo più alto della parte visibile (una descrizione lunga):
        // se ne mostra l'inizio, dove di solito si sta scrivendo.
        if (h + 2 * MARGINE > altezza.current) {
          ref.current?.scrollTo({ y: Math.max(0, y - MARGINE), animated: true });
        } else if (y + h + MARGINE > visibileA) {
          ref.current?.scrollTo({ y: y + h + MARGINE - altezza.current, animated: true });
        } else if (y - MARGINE < visibileDa) {
          ref.current?.scrollTo({ y: Math.max(0, y - MARGINE), animated: true });
        }
      },
      () => {},
    );
  }, []);

  const tastieraFerma = useCallback(
    (aperta: boolean) => {
      tastieraAperta.current = aperta;
      if (aperta) mostraCampo();
    },
    [mostraCampo],
  );

  useKeyboardHandler(
    {
      onEnd: (e) => {
        'worklet';
        scheduleOnRN(tastieraFerma, e.height > 0);
      },
    },
    [tastieraFerma],
  );

  return (
    <ScrollView
      ref={ref}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16}
      {...props}
      onScroll={(e) => {
        scrollY.current = e.nativeEvent.contentOffset.y;
        onScroll?.(e);
      }}
      onLayout={(e) => {
        altezza.current = e.nativeEvent.layout.height;
        onLayout?.(e);
        if (tastieraAperta.current) mostraCampo();
      }}
    >
      {children}
    </ScrollView>
  );
}
