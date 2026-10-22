import React, { forwardRef } from 'react';
import {
  Pressable as PressableDiSistema,
  StyleSheet,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type View,
  type ViewStyle,
} from 'react-native';

/** Quanto si attenua un elemento mentre il dito è giù. */
const ATTENUATO = 0.72;

/**
 * Il Pressable di tutta l'app, con un segno quando lo si tocca. Prima
 * nessun tasto, riga o scheda rispondeva al dito, e un tocco andato a vuoto
 * non si distingueva da uno arrivato: in movimento, con una mano sola, è
 * proprio lì che si tocca due volte. Mentre il dito è giù l'elemento si
 * attenua un poco; quando si alza torna com'era.
 *
 * L'attenuazione si somma a quella che l'elemento ha già (un tasto spento a
 * metà resta più spento). Uno `style` a funzione, che legge `pressed` da sé,
 * resta com'è.
 */
export const Pressable = forwardRef<View, PressableProps>(function Tocco({ style, ...resto }, ref) {
  const conSegno =
    typeof style === 'function'
      ? style
      : ({ pressed }: PressableStateCallbackType): StyleProp<ViewStyle> => {
          if (!pressed) return style;
          const giaAttenuato = StyleSheet.flatten(style)?.opacity ?? 1;
          return [style, { opacity: Number(giaAttenuato) * ATTENUATO }];
        };
  return <PressableDiSistema ref={ref} style={conSegno} {...resto} />;
});
