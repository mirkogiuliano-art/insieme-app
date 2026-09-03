import React, { createContext, useContext, useCallback, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/theme';

interface ToastContextValue {
  show: (msg: string) => void;
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} });

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

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <Animated.View pointerEvents="none" style={[styles.wrap, { opacity }]}>
        <View style={[styles.toast, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
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
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    maxWidth: '88%',
  },
  text: { fontSize: 12.5 },
});
