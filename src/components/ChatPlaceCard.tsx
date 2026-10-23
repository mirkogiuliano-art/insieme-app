import React from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { Pressable } from '@/components/Tocco';
import { useTheme } from '@/theme/theme';
import { SendIcon } from '@/components/Icon';
import { PlaceTile } from '@/components/MapPin';
import { openPinInMaps } from '@/lib/api/places';
import { testoLeggibile } from '@/lib/utils';
import type { RawPin } from '@/lib/api/pins';
import { useT } from '@/i18n';

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
  const t = useT();
  const tint = category?.color ?? colors.textFaint;
  const go = () => (pin ? void openPinInMaps(pin) : void Linking.openURL(url));
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <Pressable accessibilityRole="button" onPress={go} onLongPress={onMenu} style={styles.top}>
        <PlaceTile color={tint} categoryName={category?.name ?? ''} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.cat, { color: testoLeggibile(tint, colors.surface) }]} numberOfLines={1}>
            {category?.name ?? t.postoInChat.posizione}
          </Text>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
            {name}
          </Text>
        </View>
      </Pressable>
      {/* Ambra è il colore dei propri messaggi e dell'azione principale:
          qui, in ogni posto mandato in chat, gridava quanto un messaggio. */}
      <Pressable accessibilityRole="button" onPress={go} onLongPress={onMenu} style={[styles.btn, { backgroundColor: colors.surface2 }]}>
        <SendIcon size={14} color={colors.teal} />
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 12.5 }}>{t.postoInChat.portamiLi}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 240, borderRadius: 18, padding: 11 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cat: { fontSize: 10, fontWeight: '800' },
  name: { fontSize: 14, fontWeight: '800', lineHeight: 18, marginTop: 1 },
  btn: { marginTop: 10, height: 36, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});
