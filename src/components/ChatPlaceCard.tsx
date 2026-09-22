import React from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { useTheme } from '@/theme/theme';
import { SendIcon } from '@/components/Icon';
import { PlaceTile } from '@/components/MapPin';
import { openPinInMaps } from '@/lib/api/places';
import type { RawPin } from '@/lib/api/pins';

/**
 * Un posto mandato in chat, disegnato come la sua scheda: riquadro della
 * categoria, nome, e "Portami lì". Se il posto è fra quelli salvati nel
 * gruppo ne prende categoria e scheda Google; altrimenti (la posizione di
 * qualcuno, un posto poi eliminato) resta un riquadro neutro che apre il
 * link di Maps.
 */
export function ChatPlaceCard({
  name,
  url,
  pin,
  category,
  onMenu,
}: {
  name: string;
  url: string;
  pin: RawPin | null;
  category: { name: string; color: string } | null;
  /** Tenendo premuto si apre il menu del messaggio. */
  onMenu?: () => void;
}) {
  const { colors } = useTheme();
  const tint = category?.color ?? colors.textFaint;
  const go = () => (pin ? void openPinInMaps(pin) : void Linking.openURL(url));
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <Pressable onPress={go} onLongPress={onMenu} style={styles.top}>
        <PlaceTile color={tint} categoryName={category?.name ?? ''} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.cat, { color: tint }]} numberOfLines={1}>
            {(category?.name ?? 'Posizione').toUpperCase()}
          </Text>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
            {name}
          </Text>
        </View>
      </Pressable>
      <Pressable onPress={go} onLongPress={onMenu} style={[styles.btn, { backgroundColor: colors.amber }]}>
        <SendIcon size={14} color={colors.inkOnAmber} />
        <Text style={{ color: colors.inkOnAmber, fontWeight: '800', fontSize: 12.5 }}>Portami lì</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 240, borderRadius: 18, padding: 11 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cat: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  name: { fontSize: 14, fontWeight: '800', lineHeight: 18, marginTop: 1 },
  btn: { marginTop: 10, height: 36, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});
