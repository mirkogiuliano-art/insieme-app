import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/theme/theme';
import { LinkIcon, MoreIcon } from '@/components/Icon';
import { PlaceTile } from '@/components/MapPin';
import type { RawPin } from '@/lib/api/pins';

/**
 * Un posto nell'elenco: la stessa riga dei link (vedi LinkRow), col
 * riquadro colorato della categoria al posto della miniatura. Toccarla
 * apre la scheda del posto; le azioni stanno nel menu ⋯, che si apre
 * anche tenendo premuto.
 */
export function PlaceRow({
  pin,
  categoryName,
  categoryColor,
  addedBy,
  linkCount,
  distance,
  onPress,
  onOpenMenu,
}: {
  pin: RawPin;
  categoryName: string;
  categoryColor: string;
  addedBy: string;
  linkCount: number;
  /** "1,2 km", quando si conosce la propria posizione. */
  distance?: string | null;
  onPress: () => void;
  onOpenMenu: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} onLongPress={onOpenMenu} style={styles.row}>
      <PlaceTile color={categoryColor} categoryName={categoryName} size={52} />
      <View style={styles.body}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
          {pin.name}
        </Text>
        <View style={styles.meta}>
          <Text style={[styles.who, { color: colors.textDim }]} numberOfLines={1}>
            {addedBy}
          </Text>
          {linkCount > 0 ? (
            <View style={[styles.links, { backgroundColor: colors.surface2 }]}>
              <LinkIcon size={10} color={colors.textDim} strokeWidth={2.2} />
              <Text style={[styles.linksText, { color: colors.textDim }]}>
                {linkCount === 1 ? '1 link' : `${linkCount} link`}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      {distance ? <Text style={[styles.distance, { color: colors.textDim }]}>{distance}</Text> : null}
      <Pressable
        onPress={(e) => {
          e.stopPropagation?.();
          onOpenMenu();
        }}
        hitSlop={10}
        style={styles.more}
      >
        <View style={{ transform: [{ rotate: '90deg' }] }}>
          <MoreIcon size={16} color={colors.textFaint} />
        </View>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  body: { flex: 1, gap: 4 },
  name: { fontSize: 14.5, fontWeight: '700', lineHeight: 19 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  who: { fontSize: 11.5, fontWeight: '700', flexShrink: 1 },
  links: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  linksText: { fontSize: 10.5, fontWeight: '700' },
  distance: { fontSize: 11.5, fontWeight: '700' },
  more: { paddingHorizontal: 4, paddingVertical: 6 },
});
