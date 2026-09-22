import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { BottomSheet } from '@/components/BottomSheet';
import { useTheme, RADIUS, FONT_ROUNDED } from '@/theme/theme';
import { CheckIcon, ChainIcon, UsersIcon } from '@/components/Icon';
import { inkOn } from '@/lib/utils';
import { fitFontSize } from '@/lib/fitText';
import { inviteTokenFrom } from '@/lib/api/invites';
import { GROUP_PALETTE } from '@/types';

interface NewGroupSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Restituisce un messaggio d'errore, oppure `null` se il gruppo è nato. */
  onCreate: (name: string, color: string) => Promise<string | null>;
  onJoin: (token: string) => void;
  /** Aprire direttamente su una delle due strade (da "Incolla un altro invito"). */
  startOn?: 'create' | 'join';
}

/**
 * "Nuovo" nella home: creare un gruppo, oppure entrare in uno con un invito
 * — le due strade per avere un gruppo in più, in un foglio solo.
 */
export function NewGroupSheet({ visible, onClose, onCreate, onJoin, startOn }: NewGroupSheetProps) {
  const { colors } = useTheme();
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [color, setColor] = useState(GROUP_PALETTE[0]);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [pasted, setPasted] = useState('');
  const [pasteError, setPasteError] = useState('');
  /** Un invito appena copiato: lo si propone senza doverlo incollare. */
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [previewWidth, setPreviewWidth] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setName('');
    setError('');
    setPasted('');
    setPasteError('');
    setCopiedToken(null);
    setColor(GROUP_PALETTE[Math.floor(Math.random() * GROUP_PALETTE.length)]);
    // Sul web leggere gli appunti fa comparire una richiesta di permesso.
    if (Platform.OS === 'web') {
      setTab(startOn ?? 'create');
      return;
    }
    Clipboard.getStringAsync()
      .then((text) => {
        const token = inviteTokenFrom(text ?? '');
        setCopiedToken(token);
        // Chi ha appena copiato un invito vuole entrare, non creare.
        setTab(startOn ?? (token ? 'join' : 'create'));
      })
      .catch(() => setTab(startOn ?? 'create'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const create = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    setError('');
    try {
      const problem = await onCreate(name.trim().slice(0, 40), color);
      if (problem) setError(problem);
    } finally {
      setCreating(false);
    }
  };

  const join = (text: string) => {
    const token = inviteTokenFrom(text);
    if (!token) {
      setPasteError('Non sembra un link d’invito di Insieme. Fattelo rimandare da chi è nel gruppo.');
      return;
    }
    onClose();
    onJoin(token);
  };

  const shownName = name.trim() || 'Nome del gruppo';
  const ink = inkOn(color);
  const fontSize = previewWidth > 0 ? fitFontSize(shownName, previewWidth, 18, 40) : 24;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={[styles.title, { color: colors.text }]}>Nuovo</Text>
      <View style={[styles.seg, { backgroundColor: colors.surface2 }]}>
        {(['create', 'join'] as const).map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[styles.segBtn, tab === k && { backgroundColor: colors.amber }]}>
            <Text style={[styles.segText, { color: tab === k ? colors.inkOnAmber : colors.textDim }]}>
              {k === 'create' ? 'Crea un gruppo' : 'Entra con un invito'}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'create' ? (
        <>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text }]}
            placeholder="Es. Weekend a Lisbona"
            placeholderTextColor={colors.textFaint}
            value={name}
            onChangeText={setName}
            maxLength={40}
            returnKeyType="done"
            onSubmitEditing={create}
          />
          <Text style={[styles.label, { color: colors.textFaint }]}>COLORE</Text>
          <View style={styles.swatches}>
            {GROUP_PALETTE.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                style={[styles.swatch, { backgroundColor: c, borderColor: color === c ? colors.text : 'transparent' }]}
              >
                {color === c ? <CheckIcon size={14} color={inkOn(c)} /> : null}
              </Pressable>
            ))}
          </View>
          {/* La scheda com'è davvero, nome grande compreso. */}
          <View style={[styles.preview, { backgroundColor: color }]}>
            <View style={styles.previewBlob} />
            <View style={{ flex: 1 }} onLayout={(e) => setPreviewWidth(e.nativeEvent.layout.width)}>
              <Text
                style={{ fontFamily: FONT_ROUNDED, fontSize, lineHeight: Math.round(fontSize * 1.2), color: ink, opacity: name.trim() ? 1 : 0.55 }}
                numberOfLines={1}
              >
                {shownName}
              </Text>
            </View>
          </View>
          {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
          <Pressable
            onPress={create}
            disabled={!name.trim() || creating}
            style={[styles.primary, { backgroundColor: colors.amber, opacity: !name.trim() || creating ? 0.5 : 1 }]}
          >
            {creating ? (
              <ActivityIndicator size="small" color={colors.inkOnAmber} />
            ) : (
              <Text style={{ color: colors.inkOnAmber, fontWeight: '800', fontSize: 14 }}>Crea il gruppo</Text>
            )}
          </Pressable>
          <Text style={[styles.note, { color: colors.textFaint }]}>
            Dopo avrai il link d’invito da mandare a chi vuoi far entrare.
          </Text>
        </>
      ) : (
        <>
          {copiedToken ? (
            <Pressable
              onPress={() => {
                onClose();
                onJoin(copiedToken);
              }}
              style={[styles.copied, { borderColor: colors.amber, backgroundColor: colors.amber + '14' }]}
            >
              <View style={[styles.copiedIcon, { backgroundColor: colors.surface2 }]}>
                <UsersIcon size={20} color={colors.amber} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.copiedLabel, { color: colors.amber }]}>HAI COPIATO UN INVITO</Text>
                <Text style={[styles.copiedText, { color: colors.text }]}>Tocca per entrare nel gruppo</Text>
              </View>
            </Pressable>
          ) : null}
          <View style={[styles.pasteBox, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
            <ChainIcon size={15} color={colors.textFaint} />
            <TextInput
              style={[styles.pasteInput, { color: colors.text }]}
              placeholder={copiedToken ? '…oppure incolla un altro link' : 'Incolla il link d’invito'}
              placeholderTextColor={colors.textFaint}
              value={pasted}
              onChangeText={(t) => {
                setPasted(t);
                setPasteError('');
              }}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={() => join(pasted)}
            />
          </View>
          {pasteError ? <Text style={[styles.error, { color: colors.danger }]}>{pasteError}</Text> : null}
          <Pressable
            onPress={() => join(pasted)}
            disabled={!pasted.trim()}
            style={[styles.primary, { backgroundColor: colors.amber, opacity: pasted.trim() ? 1 : 0.5 }]}
          >
            <Text style={{ color: colors.inkOnAmber, fontWeight: '800', fontSize: 14 }}>Entra nel gruppo</Text>
          </Pressable>
          <Text style={[styles.note, { color: colors.textFaint }]}>
            Il link te lo manda chi è già nel gruppo, da Info gruppo.
          </Text>
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, marginBottom: 12 },
  seg: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, marginBottom: 14 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 11 },
  segText: { fontSize: 12.5, fontWeight: '800' },
  input: { borderRadius: RADIUS.sm, paddingHorizontal: 13, paddingVertical: 13, fontSize: 14.5 },
  label: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, marginTop: 14, marginBottom: 8 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  swatch: { width: 36, height: 36, borderRadius: 12, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  preview: { marginTop: 14, height: 84, borderRadius: 20, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15 },
  previewBlob: { position: 'absolute', right: -26, top: -32, width: 92, height: 92, borderRadius: 46, backgroundColor: 'rgba(0,0,0,0.09)' },
  error: { fontSize: 12, marginTop: 8, lineHeight: 17 },
  primary: { marginTop: 14, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: 11.5, textAlign: 'center', marginTop: 8 },
  copied: { flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: RADIUS.md, padding: 11, marginBottom: 10 },
  copiedIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  copiedLabel: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.6 },
  copiedText: { fontSize: 13.5, fontWeight: '700', marginTop: 2 },
  pasteBox: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: RADIUS.sm, paddingHorizontal: 14, height: 50 },
  pasteInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
});
