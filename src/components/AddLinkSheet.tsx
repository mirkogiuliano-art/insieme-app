import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { BottomSheet } from '@/components/BottomSheet';
import { useTheme, RADIUS } from '@/theme/theme';
import { LinkIcon, ImageIcon, PlayIcon, FileIcon } from '@/components/Icon';
import { normalizeUrl } from '@/lib/utils';
import { getLinkPreview } from '@/lib/api/linkPreviews';
import type { RawLinkCategory } from '@/lib/api/linkCategories';

interface AddLinkSheetProps {
  visible: boolean;
  onClose: () => void;
  categories: RawLinkCategory[];
  /** Indirizzi già salvati nel gruppo: un link copiato che c'è già non
   * viene riproposto. */
  savedUrls: Set<string>;
  uploading: boolean;
  /** Restituisce `true` se il salvataggio è riuscito: solo allora il foglio
   * si svuota e si chiude. */
  onSaveUrl: (url: string, title: string, categoryId: string) => Promise<boolean>;
  onPickMedia: (kind: 'images' | 'videos', title: string, categoryId: string) => Promise<boolean>;
  onPickDocument: (title: string, categoryId: string) => Promise<boolean>;
}

/** Solo indirizzi web veri: gli appunti possono contenere qualunque cosa,
 * e proporre di salvare una frase copiata da un messaggio sarebbe strano. */
function asWebUrl(text: string): string | null {
  const t = text.trim();
  if (!/^https?:\/\/\S+$/i.test(t)) return null;
  try {
    new URL(t);
    return t;
  } catch {
    return null;
  }
}

/**
 * Tutto ciò che serve per aggiungere qualcosa al gruppo, in un foglio che si
 * apre solo quando serve — invece del modulo fisso che occupava un quarto
 * della pagina anche quando si stava solo guardando.
 */
export function AddLinkSheet({
  visible,
  onClose,
  categories,
  savedUrls,
  uploading,
  onSaveUrl,
  onPickMedia,
  onPickDocument,
}: AddLinkSheetProps) {
  const { colors } = useTheme();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [saving, setSaving] = useState(false);
  /** Il link negli appunti, se ce n'è uno nuovo, con il titolo della sua
   * pagina quando si riesce a leggerlo. */
  const [copied, setCopied] = useState<{ url: string; title: string | null } | null>(null);

  useEffect(() => {
    if (!visible) return;
    setCategoryId((prev) => (prev && categories.some((c) => c.id === prev) ? prev : (categories[0]?.id ?? '')));
    setCopied(null);
    // Sul web leggere gli appunti fa comparire una richiesta di permesso del
    // browser ogni volta: lì il suggerimento non vale il fastidio.
    if (Platform.OS === 'web') return;
    let alive = true;
    Clipboard.getStringAsync()
      .then(async (text) => {
        const found = asWebUrl(text ?? '');
        if (!found || savedUrls.has(normalizeUrl(found))) return;
        if (alive) setCopied({ url: found, title: null });
        const p = await getLinkPreview(normalizeUrl(found));
        if (alive && p?.title) setCopied({ url: found, title: p.title });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // `savedUrls` cambia a ogni link nuovo: basta leggerlo all'apertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const finish = () => {
    setUrl('');
    setTitle('');
    setCopied(null);
    onClose();
  };

  const saveUrl = async (value: string) => {
    if (!value.trim() || !categoryId || saving) return;
    setSaving(true);
    try {
      if (await onSaveUrl(value, title, categoryId)) finish();
    } finally {
      setSaving(false);
    }
  };

  const pick = async (fn: () => Promise<boolean>) => {
    if (uploading) return;
    if (await fn()) finish();
  };

  const busy = saving || uploading;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={[styles.title, { color: colors.text }]}>Aggiungi al gruppo</Text>

      {copied ? (
        <Pressable
          onPress={() => saveUrl(copied.url)}
          disabled={busy}
          style={[styles.copied, { borderColor: colors.amber, backgroundColor: colors.amber + '14' }]}
        >
          <View style={[styles.copiedIcon, { backgroundColor: colors.surface2 }]}>
            <LinkIcon size={18} color={colors.amber} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.copiedLabel, { color: colors.amber }]}>HAI COPIATO UN LINK · TOCCA PER SALVARLO</Text>
            <Text style={[styles.copiedTitle, { color: colors.text }]} numberOfLines={2}>
              {copied.title ?? copied.url}
            </Text>
          </View>
        </Pressable>
      ) : null}

      <TextInput
        style={[styles.input, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text }]}
        placeholder={copied ? '…oppure incolla un altro indirizzo' : 'Incolla un indirizzo (YouTube, Instagram, un sito…)'}
        placeholderTextColor={colors.textFaint}
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="done"
        onSubmitEditing={() => saveUrl(url)}
      />
      <TextInput
        style={[styles.input, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text }]}
        placeholder="Titolo (facoltativo)"
        placeholderTextColor={colors.textFaint}
        value={title}
        onChangeText={setTitle}
        maxLength={80}
      />

      <Text style={[styles.label, { color: colors.textFaint }]}>CATEGORIA</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
        {categories.map((c) => {
          const on = categoryId === c.id;
          return (
            <Pressable
              key={c.id}
              onPress={() => setCategoryId(c.id)}
              style={[styles.cat, { backgroundColor: on ? c.color + '2E' : colors.surface2, borderColor: on ? c.color : 'transparent' }]}
            >
              <View style={[styles.dot, { backgroundColor: c.color }]} />
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: on ? colors.text : colors.textDim }}>{c.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={[styles.label, { color: colors.textFaint }]}>OPPURE DAL TELEFONO</Text>
      <View style={styles.files}>
        {[
          { key: 'img', label: 'Foto', icon: <ImageIcon size={20} color={colors.textDim} />, fn: () => onPickMedia('images', title, categoryId) },
          { key: 'vid', label: 'Video', icon: <PlayIcon size={18} color={colors.textDim} />, fn: () => onPickMedia('videos', title, categoryId) },
          { key: 'doc', label: 'Documento', icon: <FileIcon size={20} color={colors.textDim} />, fn: () => onPickDocument(title, categoryId) },
        ].map((b) => (
          <Pressable
            key={b.key}
            onPress={() => pick(b.fn)}
            disabled={busy}
            style={[styles.fileBtn, { backgroundColor: colors.surface2, opacity: busy ? 0.5 : 1 }]}
          >
            {b.icon}
            <Text style={[styles.fileLabel, { color: colors.textDim }]}>{b.label}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={() => saveUrl(url)}
        disabled={!url.trim() || busy}
        style={[styles.save, { backgroundColor: colors.amber, opacity: !url.trim() || busy ? 0.45 : 1 }]}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.inkOnAmber} />
        ) : (
          <Text style={{ color: colors.inkOnAmber, fontWeight: '800', fontSize: 14 }}>Salva nel gruppo</Text>
        )}
      </Pressable>
      {uploading ? (
        <Text style={[styles.uploading, { color: colors.textDim }]}>Sto caricando il file…</Text>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, marginBottom: 12 },
  copied: { flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: RADIUS.md, padding: 11, marginBottom: 12 },
  copiedIcon: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  copiedLabel: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.6 },
  copiedTitle: { fontSize: 13.5, fontWeight: '700', lineHeight: 18, marginTop: 2 },
  input: { borderRadius: RADIUS.sm, paddingHorizontal: 13, paddingVertical: 13, fontSize: 14, marginBottom: 8 },
  label: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, marginTop: 8, marginBottom: 7 },
  cat: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7, marginRight: 7 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  files: { flexDirection: 'row', gap: 8 },
  fileBtn: { flex: 1, height: 64, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', gap: 5 },
  fileLabel: { fontSize: 12, fontWeight: '700' },
  save: { marginTop: 16, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  uploading: { textAlign: 'center', fontSize: 12, marginTop: 8 },
});
