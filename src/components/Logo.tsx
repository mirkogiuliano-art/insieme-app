import React from 'react';
import Svg, { Rect, G } from 'react-native-svg';
import { useTheme } from '@/theme/theme';

/**
 * Il marchio di Insieme: tre cartoncini buttati uno sull'altro.
 *
 * Non è un simbolo astratto di «insieme», è quello che succede quando si
 * sta insieme — link, foto, biglietti e posti che si accumulano tutti
 * nello stesso mucchio invece di stare sparsi in cinque applicazioni.
 *
 * Ogni cartoncino è **spostato oltre che ruotato**: ruotandoli soltanto
 * attorno a uno stesso centro tornavano a impilarsi ordinati e la pila
 * sembrava un rettangolo unico con i bordi colorati. Il disordine è la
 * cosa da tenere: è tutto il segno.
 *
 * Le stesse misure stanno in `assets/logo.svg`, da cui sono generati i
 * file dell'icona dell'app: cambiando il disegno qui va cambiato anche
 * lì e vanno rifatti i PNG (le istruzioni sono in assets/README.md).
 */
export function Logo({
  size = 56,
  colors: override,
  ground,
}: {
  size?: number;
  colors?: [string, string, string];
  /** Il colore dietro al marchio, che è anche quello del vuoto fra i
   * cartoncini. Va passato se il marchio non sta sul fondo dell'app,
   * altrimenti i solchi si vedrebbero del colore sbagliato. */
  ground?: string;
}) {
  const { colors } = useTheme();
  // Dietro, in mezzo, davanti.
  const [dietro, mezzo, davanti] = override ?? [colors.teal, colors.coral, colors.amber];
  const vuoto = ground ?? colors.bg;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* Lo spostamento del gruppo serve a centrare il mucchio a occhio:
          i tre cartoncini non sono simmetrici, e lasciati dove cadono
          pesavano in basso a destra dentro il riquadro.
          Il contorno del colore del fondo apre un solco fra un cartoncino
          e l'altro: a quel punto il mucchio si legge come tre oggetti
          appoggiati invece che come una macchia a tre colori. */}
      <G transform="translate(-2 1)" stroke={vuoto} strokeWidth={3.4} strokeLinejoin="round">
        <Rect x="22" y="30" width="58" height="42" rx="9" fill={dietro} transform="translate(1 -7) rotate(-17 40 44)" />
        <Rect x="22" y="30" width="58" height="42" rx="9" fill={mezzo} transform="translate(7 2) rotate(11 60 56)" />
        <Rect x="22" y="30" width="58" height="42" rx="9" fill={davanti} transform="translate(-2 14) rotate(-4 50 50)" />
      </G>
    </Svg>
  );
}
