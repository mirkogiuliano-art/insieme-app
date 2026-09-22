import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useTheme } from '@/theme/theme';
import { PlayIcon, PauseIcon } from '@/components/Icon';
import { formatSeconds } from '@/lib/utils';

function waveformHeights(seed: string, count = 24): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const heights: number[] = [];
  for (let i = 0; i < count; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    heights.push(0.3 + ((h >>> 8) % 100) / 100 * 0.7);
  }
  return heights;
}

export function VoiceBubble({ uri, durationSeconds, own }: { uri: string; durationSeconds: number | null | undefined; own: boolean }) {
  const { colors } = useTheme();
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const toggle = () => (status.playing ? player.pause() : player.play());
  const label = formatSeconds(status.playing || status.currentTime > 0 ? status.currentTime : (durationSeconds ?? status.duration ?? 0));
  const heights = useMemo(() => waveformHeights(uri), [uri]);
  const progress = status.duration > 0 ? status.currentTime / status.duration : 0;
  const playedColor = own ? colors.inkOnAmber : colors.teal;
  const unplayedColor = own ? 'rgba(0,0,0,0.3)' : colors.surface2;
  return (
    <Pressable onPress={toggle} style={styles.voiceRow}>
      {/* Il pulsante pieno, come il play sulle schede video dei link. */}
      <View style={[styles.voicePlayBtn, { backgroundColor: own ? colors.inkOnAmber : colors.teal }]}>
        {status.playing ? (
          <PauseIcon size={16} color={own ? colors.amber : colors.bg} />
        ) : (
          <PlayIcon size={16} color={own ? colors.amber : colors.bg} />
        )}
      </View>
      <View style={styles.waveform}>
        {heights.map((h, i) => (
          <View
            key={i}
            style={[
              styles.waveformBar,
              { height: 4 + h * 18, backgroundColor: i / heights.length <= progress ? playedColor : unplayedColor },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.time, { color: own ? colors.inkOnAmber : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 200, paddingVertical: 2 },
  voicePlayBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 2, flex: 1 },
  waveformBar: { width: 3, borderRadius: 1.5 },
  time: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
