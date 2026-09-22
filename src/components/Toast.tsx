import React, { createContext, useContext, useCallback, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { CheckIcon, CloseIcon } from '@/components/Icon';

interface ToastContextValue {
  show: (msg: string) => void;
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} });

type Tone = 'ok' | 'error' | 'hint';

/** Il tono si legge dal messaggio stesso: le chiamate restano `show('…')`
 * dappertutto, e i testi dell'app seguono già poche formule fisse. */
function toneOf(msg: string): Tone {
  if (/non (sono )?riuscit|non sembra/i.test(msg)) return 'error';
  if (/^(serve|tocca|è già)/i.test(msg)) return 'hint';
  return 'ok';
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const [msg, setMsg] = useState('');
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (m: string) => {
      setMsg(m);
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start();
      }, 2600);
    },
    [opacity],
  );

  const tone = toneOf(msg);
  const tint = tone === 'error' ? colors.danger : tone === 'ok' ? colors.teal : colors.amber;
  const translateY = opacity.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <Animated.View pointerEvents="none" style={[styles.wrap, { opacity, transform: [{ translateY }] }]}>
        <View style={[styles.toast, { backgroundColor: colors.surface2 }]}>
          <View style={[styles.icon, { backgroundColor: tint }]}>
            {tone === 'error' ? (
              <CloseIcon size={11} color="#fff" strokeWidth={3} />
            ) : tone === 'ok' ? (
              <CheckIcon size={11} color="#fff" strokeWidth={3} />
            ) : (
              <Text style={[styles.hintMark, { color: colors.inkOnAmber }]}>!</Text>
            )}
          </View>
          <Text style={[styles.text, { color: colors.text }]}>{msg}</Text>
        </View>
      </Animated.View>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 96,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 8,
    paddingRight: 16,
    paddingVertical: 8,
    borderRadius: 999,
    maxWidth: '88%',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  icon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  hintMark: { color: '#fff', fontSize: 13, fontWeight: '900', lineHeight: 15 },
  text: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
});
