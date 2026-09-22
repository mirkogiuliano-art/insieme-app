import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { useTheme } from '@/theme/theme';

/** Fin dove arriva la luce, dall'alto dello schermo. */
const HEIGHT = 340;

/**
 * La luce dell'app: un solo bagliore ambra che scende dall'alto, al
 * centro, e si spegne prima di arrivare al contenuto. Sta dietro a ogni
 * schermata, come primo figlio del contenitore che dipinge il fondo:
 * posizionata in assoluto, parte dal bordo vero dello schermo anche dentro
 * una SafeAreaView, perché il riferimento è il riquadro con il padding.
 *
 * È volutamente debole. Le schede sono già piene di colore: uno sfondo che
 * disegnasse qualcosa ci litigherebbe, una luce calda invece dà solo
 * atmosfera. Lo stesso vale per chat e link, dove i fumetti e le schede
 * sono già colorati. Nel chiaro l'ambra del tema è troppo spenta per illuminare
 * una pagina già chiara, quindi si usa un oro più caldo e un filo più forte.
 */
export function ScreenGlow() {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const light = theme === 'light';
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Svg width={width} height={HEIGHT}>
        <Defs>
          {/* Il centro sta sopra lo schermo: se ne vede solo la parte bassa. */}
          <RadialGradient id="screenGlow" gradientUnits="userSpaceOnUse" cx={width / 2} cy={-100} rx={460} ry={300} fx={width / 2} fy={-100}>
            <Stop offset="0" stopColor={light ? '#D6A05A' : '#E9A23B'} stopOpacity={light ? 0.16 : 0.11} />
            <Stop offset="1" stopColor={light ? '#D6A05A' : '#E9A23B'} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={HEIGHT} fill="url(#screenGlow)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, height: HEIGHT },
});
