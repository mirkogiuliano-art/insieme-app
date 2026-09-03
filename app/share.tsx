import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { router } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { useTheme, RADIUS } from '@/theme/theme';
import { useAuth } from '@/lib/authStore';
import { useAppStore, groupColor } from '@/lib/appStore';
import { useToast } from '@/components/Toast';
import { CloseIcon, LinkIcon, PlayIcon, ChatIcon, CheckIcon, MapIcon } from '@/components/Icon';
import { platformInfo, normalizeUrl, parseGoogleMapsUrl, withTimeout, WRITE_TIMEOUT, UPLOAD_TIMEOUT } from '@/lib/utils';
import { listCategories, type RawLinkCategory } from '@/lib/api/linkCategories';
import { listCategories as listPlaceCategories, type RawPlaceCategory } from '@/lib/api/placeCategories';
import { createLink } from '@/lib/api/links';
import { createPin } from '@/lib/api/pins';
import { createPlaceLink } from '@/lib/api/placeLinks';
import { sendMessage } from '@/lib/api/messages';
import { uploadGroupMedia, type AttachmentKind } from '@/lib/api/mediaUpload';

type Section = 'links' | 'chat';

/**
 * Schermata di smistamento di ciò che arriva dalla condivisione di sistema
 * ("Condividi → Insieme" da un'altra app). Il contenuto viene letto da
 * expo-share-intent; qui si sceglie solo dove salvarlo.
 *
 * Il modulo nativo esiste solo su Android/iOS: sul web questa schermata non
 * viene mai raggiunta perché il provider è disattivato in app/_layout.tsx.
 */
export default function ShareScreen() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const { myGroups, ready: groupsReady } = useAppStore();
  const { shareIntent, hasShareIntent, resetShareIntent } = useShareIntentContext();
  const toast = useToast();

  const [groupId, setGroupId] = useState<string>('');
  const [section, setSection] = useState<Section>('links');
  const [categories, setCategories] = useState<RawLinkCategory[]>([]);
  const [categoryId, setCategoryId] = useState<string>('');
  const [placeCategories, setPlaceCategories] = useState<RawPlaceCategory[]>([]);
  const [alsoSavePlace, setAlsoSavePlace] = useState(true);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const file = shareIntent.files?.[0] ?? null;
  const sharedUrl = shareIntent.webUrl ?? null;
  const sharedText = shareIntent.text ?? null;
  // Un link a un luogo di Google Maps può diventare anche un posto sulla mappa.
  const mapsPlace = useMemo(() => (sharedUrl ? parseGoogleMapsUrl(normalizeUrl(sharedUrl)) : null), [sharedUrl]);

  // Preseleziona il primo gruppo appena la lista è disponibile.
  useEffect(() => {
    if (!groupId && myGroups.length > 0) setGroupId(myGroups[0].id);
  }, [myGroups, groupId]);

  // Le categorie dipendono dal gruppo scelto.
  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    listCategories(groupId).then((cats) => {
      if (cancelled) return;
      setCategories(cats);
      setCategoryId(cats[0]?.id ?? '');
    });
    listPlaceCategories(groupId).then((cats) => {
      if (!cancelled) setPlaceCategories(cats);
    });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  useEffect(() => {
    if (mapsPlace && title.length === 0 && mapsPlace.name) setTitle(mapsPlace.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapsPlace]);

  const close = () => {
    resetShareIntent();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const save = async () => {
    if (!session || !groupId || saving) return;
    setSaving(true);
    try {
      // 1. Se è arrivato un file, va prima caricato nello storage del gruppo.
      let uploadedUrl: string | null = null;
      let kind: AttachmentKind = 'image';
      if (file) {
        kind = file.mimeType?.startsWith('video/') ? 'video' : 'image';
        uploadedUrl = await withTimeout(uploadGroupMedia(groupId, file.path), UPLOAD_TIMEOUT);
      }

      if (section === 'chat') {
        if (uploadedUrl) {
          await withTimeout(
            sendMessage(groupId, session.user.id, title.trim() || null, null, { url: uploadedUrl, type: kind }),
            WRITE_TIMEOUT,
          );
        } else {
          await withTimeout(sendMessage(groupId, session.user.id, sharedText || sharedUrl || ''), WRITE_TIMEOUT);
        }
      } else {
        const catId = categoryId || categories[0]?.id;
        if (!catId) throw new Error('Nessuna categoria disponibile.');

        if (uploadedUrl) {
          await withTimeout(createLink(groupId, session.user.id, {
            url: uploadedUrl,
            title: title.trim() || (kind === 'video' ? 'Video' : 'Foto'),
            platform: kind,
            label: kind === 'video' ? 'Video' : 'Foto',
            thumb: kind === 'image' ? uploadedUrl : null,
            categoryId: catId,
          }), WRITE_TIMEOUT);
        } else {
          const normalized = normalizeUrl(sharedUrl || sharedText || '');
          const info = platformInfo(normalized);
          const created = await withTimeout(createLink(groupId, session.user.id, {
            url: normalized,
            title: title.trim() || mapsPlace?.name || (info.platform === 'web' ? info.host || normalized : info.label),
            platform: info.platform,
            label: mapsPlace ? 'Google Maps' : info.label,
            thumb: info.thumb,
            categoryId: catId,
          }), WRITE_TIMEOUT);

          // 2. Link di Google Maps: se richiesto, nasce anche il posto,
          //    già collegato al link appena salvato.
          if (mapsPlace && alsoSavePlace && placeCategories[0]) {
            const pin = await withTimeout(createPin(groupId, session.user.id, {
              lat: mapsPlace.lat,
              lng: mapsPlace.lng,
              name: mapsPlace.name || title.trim() || 'Posto da Google Maps',
              categoryId: placeCategories[0].id,
              // Il link condiviso apre già la scheda del luogo su Maps.
              mapsUrl: normalized,
            }), WRITE_TIMEOUT);
            await withTimeout(createPlaceLink(groupId, session.user.id, pin.id, created.id), WRITE_TIMEOUT);
          }
        }
      }

      resetShareIntent();
      toast.show('Salvato in Insieme');
      router.replace(`/group/${groupId}`);
    } catch {
      toast.show('Non sono riuscito a salvare, riprova.');
    } finally {
      setSaving(false);
    }
  };

  // ── Stati in cui non c'è niente da salvare ──
  if (!session) {
    return (
      <Message
        title="Accedi per salvare"
        body="Entra nel tuo account Insieme, poi ricondividi il contenuto."
        onClose={close}
      />
    );
  }
  if (!hasShareIntent && !file && !sharedUrl && !sharedText) {
    return <Message title="Niente da salvare" body="Non è arrivato nessun contenuto condiviso." onClose={close} />;
  }
  if (groupsReady && myGroups.length === 0) {
    return (
      <Message
        title="Nessun gruppo"
        body="Crea o entra in un gruppo, poi ricondividi il contenuto."
        onClose={close}
      />
    );
  }

  const isImage = !!file && !file.mimeType?.startsWith('video/');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Salva in Insieme</Text>
        <Pressable onPress={close} hitSlop={10} style={styles.closeBtn}>
          <CloseIcon size={16} color={colors.textDim} />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" automaticOffset>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* Anteprima di quello che è arrivato */}
        <View style={[styles.preview, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {file && isImage ? (
            <Image source={{ uri: file.path }} style={styles.previewThumb} />
          ) : (
            <View style={[styles.previewThumb, styles.previewFallback, { backgroundColor: colors.surface2 }]}>
              {file ? <PlayIcon size={22} color={colors.textDim} /> : <LinkIcon size={22} color={colors.textDim} />}
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }} numberOfLines={2}>
              {file ? file.fileName || 'File condiviso' : sharedUrl || sharedText}
            </Text>
            <Text style={{ fontSize: 10.5, color: colors.textFaint, marginTop: 3 }}>
              {file
                ? file.mimeType || 'file'
                : mapsPlace
                  ? 'Google Maps'
                  : sharedUrl
                    ? platformInfo(normalizeUrl(sharedUrl)).label
                    : 'Testo'}
            </Text>
          </View>
        </View>

        <Text style={[styles.label, { color: colors.textDim }]}>GRUPPO</Text>
        <View style={styles.chipRow}>
          {myGroups.map((g) => {
            const sel = groupId === g.id;
            const c = groupColor(g);
            return (
              <Pressable
                key={g.id}
                onPress={() => setGroupId(g.id)}
                style={[styles.chip, { borderColor: sel ? c : colors.border, backgroundColor: sel ? colors.surface : 'transparent' }]}
              >
                <View style={[styles.dot, { backgroundColor: c }]} />
                <Text style={{ fontSize: 13, color: sel ? colors.text : colors.textDim }}>{g.name}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, { color: colors.textDim }]}>SEZIONE</Text>
        <View style={styles.chipRow}>
          <Pressable
            onPress={() => setSection('links')}
            style={[
              styles.chip,
              { borderColor: section === 'links' ? colors.amber : colors.border, backgroundColor: section === 'links' ? colors.surface : 'transparent' },
            ]}
          >
            <LinkIcon size={14} color={section === 'links' ? colors.amber : colors.textFaint} />
            <Text style={{ fontSize: 13, color: section === 'links' ? colors.text : colors.textDim }}>Link e video</Text>
          </Pressable>
          <Pressable
            onPress={() => setSection('chat')}
            style={[
              styles.chip,
              { borderColor: section === 'chat' ? colors.amber : colors.border, backgroundColor: section === 'chat' ? colors.surface : 'transparent' },
            ]}
          >
            <ChatIcon size={14} color={section === 'chat' ? colors.amber : colors.textFaint} />
            <Text style={{ fontSize: 13, color: section === 'chat' ? colors.text : colors.textDim }}>Chat</Text>
          </Pressable>
        </View>

        {section === 'links' ? (
          <>
            <Text style={[styles.label, { color: colors.textDim }]}>CATEGORIA</Text>
            <View style={styles.chipRow}>
              {categories.map((c) => {
                const sel = categoryId === c.id;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => setCategoryId(c.id)}
                    style={[styles.chip, { borderColor: sel ? c.color : colors.border, backgroundColor: sel ? colors.surface : 'transparent' }]}
                  >
                    <View style={[styles.dot, { backgroundColor: c.color }]} />
                    <Text style={{ fontSize: 13, color: sel ? colors.text : colors.textDim }}>{c.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        <Text style={[styles.label, { color: colors.textDim }]}>
          {section === 'chat' && file ? 'DIDASCALIA (FACOLTATIVA)' : 'TITOLO (FACOLTATIVO)'}
        </Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          placeholder={section === 'chat' && file ? 'Scrivi qualcosa…' : 'Come vuoi chiamarlo'}
          placeholderTextColor={colors.textFaint}
          value={title}
          onChangeText={setTitle}
          maxLength={80}
        />

        {mapsPlace && section === 'links' ? (
          <Pressable
            onPress={() => setAlsoSavePlace((v) => !v)}
            style={[styles.placeToggle, { borderColor: alsoSavePlace ? colors.teal : colors.border, backgroundColor: colors.surface }]}
          >
            <View
              style={[
                styles.check,
                { borderColor: alsoSavePlace ? colors.teal : colors.border, backgroundColor: alsoSavePlace ? colors.teal : 'transparent' },
              ]}
            >
              {alsoSavePlace ? <CheckIcon size={11} color="#fff" /> : null}
            </View>
            <MapIcon size={15} color={colors.teal} strokeWidth={1.9} />
            <Text style={{ flex: 1, fontSize: 12.5, color: colors.textDim, lineHeight: 17 }}>
              Salvalo anche come posto sulla mappa
              {placeCategories[0] ? ` (categoria "${placeCategories[0].name}")` : ''}, già collegato a questo link.
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.bg }]}>
        <Pressable
          onPress={save}
          disabled={saving || !groupId}
          style={[styles.saveBtn, { backgroundColor: colors.amber, opacity: saving || !groupId ? 0.5 : 1 }]}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.inkOnAmber} />
          ) : (
            <Text style={{ color: colors.inkOnAmber, fontWeight: '700', fontSize: 15 }}>Salva</Text>
          )}
        </Pressable>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Message({ title, body, onClose }: { title: string; body: string; onClose: () => void }) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Salva in Insieme</Text>
        <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
          <CloseIcon size={16} color={colors.textDim} />
        </Pressable>
      </View>
      <View style={styles.messageBox}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 6 }}>{title}</Text>
        <Text style={{ fontSize: 13, color: colors.textDim, textAlign: 'center', lineHeight: 19 }}>{body}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1,
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700' },
  closeBtn: { padding: 4 },
  body: { padding: 18, paddingBottom: 30 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: RADIUS.md, padding: 10, marginBottom: 20 },
  previewThumb: { width: 54, height: 54, borderRadius: RADIUS.sm },
  previewFallback: { alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 9 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  input: { borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14.5 },
  placeToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: RADIUS.sm, padding: 13, marginTop: 16 },
  check: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 12, borderTopWidth: 1 },
  saveBtn: { paddingVertical: 15, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  messageBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
});
