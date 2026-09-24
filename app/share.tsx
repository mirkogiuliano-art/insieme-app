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
import { useTheme, RADIUS, FONT_ROUNDED } from '@/theme/theme';
import { FilterChip } from '@/components/FilterChip';
import { getLinkPreview } from '@/lib/api/linkPreviews';
import { useAuth } from '@/lib/authStore';
import { useAppStore, groupColor } from '@/lib/appStore';
import { useToast } from '@/components/Toast';
import { CloseIcon, LinkIcon, PlayIcon, ChatIcon, CheckIcon } from '@/components/Icon';
import { platformInfo, normalizeUrl, parseGoogleMapsUrl, inkOn, withTimeout, WRITE_TIMEOUT, UPLOAD_TIMEOUT } from '@/lib/utils';
import { listCategories, type RawLinkCategory } from '@/lib/api/linkCategories';
import { listCategories as listPlaceCategories, type RawPlaceCategory } from '@/lib/api/placeCategories';
import { createLink } from '@/lib/api/links';
import { createPin } from '@/lib/api/pins';
import { createPlaceLink } from '@/lib/api/placeLinks';
import { sendMessage } from '@/lib/api/messages';
import { uploadGroupMedia, type AttachmentKind } from '@/lib/api/mediaUpload';
import { ScreenGlow } from '@/components/ScreenGlow';
import { LinkFallbackThumb } from '@/components/LinkCard';

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
  /** Titolo e immagine veri della pagina condivisa, per l'anteprima. */
  const [page, setPage] = useState<{ title: string | null; image: string | null } | null>(null);

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
    if (!sharedUrl) return;
    let alive = true;
    getLinkPreview(normalizeUrl(sharedUrl)).then((p) => {
      if (alive && p) setPage({ title: p.title, image: p.imageUrl });
    });
    return () => {
      alive = false;
    };
  }, [sharedUrl]);

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
  const thumb = file && isImage ? file.path : page?.image ?? (sharedUrl ? platformInfo(normalizeUrl(sharedUrl)).thumb : null);
  const chosenCategory = categories.find((c) => c.id === categoryId);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <ScreenGlow />
      <Header onClose={close} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" automaticOffset>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* Quello che è arrivato, con la faccia che avrà nella pagina Link. */}
        <View style={[styles.preview, { backgroundColor: colors.surface }]}>
          {thumb ? (
            <Image source={{ uri: thumb }} style={styles.previewThumb} resizeMode="cover" />
          ) : (
            <View style={[styles.previewThumb, styles.previewFallback, { backgroundColor: colors.surface2 }]}>
              {file ? (
                <PlayIcon size={22} color={colors.textDim} />
              ) : (
                // La faccia che il link avrà nella pagina Link.
                <LinkFallbackThumb source={{ url: normalizeUrl(sharedUrl ?? ''), label: mapsPlace ? 'Google Maps' : undefined }} iconSize={26} />
              )}
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[styles.previewTitle, { color: colors.text }]} numberOfLines={2}>
              {file ? file.fileName || 'File condiviso' : page?.title || mapsPlace?.name || sharedUrl || sharedText}
            </Text>
            <Text style={[styles.previewSub, { color: colors.textFaint }]} numberOfLines={1}>
              {file
                ? isImage
                  ? 'Foto'
                  : 'Video'
                : mapsPlace
                  ? 'Google Maps'
                  : sharedUrl
                    ? platformInfo(normalizeUrl(sharedUrl)).label
                    : 'Testo'}
            </Text>
          </View>
        </View>

        <Text style={[styles.label, { color: colors.textFaint }]}>IN QUALE GRUPPO</Text>
        {/* I gruppi come piccole schede del loro colore, come nella home. */}
        <View style={styles.groups}>
          {myGroups.map((g) => {
            const sel = groupId === g.id;
            const c = groupColor(g);
            return (
              <Pressable
                key={g.id}
                onPress={() => setGroupId(g.id)}
                style={[styles.groupPick, { backgroundColor: c, opacity: sel ? 1 : 0.5, borderColor: sel ? colors.text : 'transparent' }]}
              >
                <Text style={[styles.groupPickText, { color: inkOn(c) }]} numberOfLines={1}>
                  {g.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, { color: colors.textFaint }]}>DOVE</Text>
        <View style={[styles.seg, { backgroundColor: colors.surface }]}>
          {(['links', 'chat'] as const).map((k) => (
            <Pressable key={k} onPress={() => setSection(k)} style={[styles.segBtn, section === k && { backgroundColor: colors.amber }]}>
              {k === 'links' ? (
                <LinkIcon size={15} color={section === k ? colors.inkOnAmber : colors.textDim} />
              ) : (
                <ChatIcon size={15} color={section === k ? colors.inkOnAmber : colors.textDim} />
              )}
              <Text style={[styles.segText, { color: section === k ? colors.inkOnAmber : colors.textDim }]}>
                {k === 'links' ? 'Link e video' : 'Chat'}
              </Text>
            </Pressable>
          ))}
        </View>

        {section === 'links' ? (
          <>
            <Text style={[styles.label, { color: colors.textFaint }]}>CATEGORIA</Text>
            <View style={styles.chipRow}>
              {categories.map((c) => (
                <FilterChip key={c.id} label={c.name} dotColor={c.color} active={categoryId === c.id} onPress={() => setCategoryId(c.id)} />
              ))}
            </View>
          </>
        ) : null}

        <Text style={[styles.label, { color: colors.textFaint }]}>
          {section === 'chat' ? (file ? 'DIDASCALIA (FACOLTATIVA)' : 'MESSAGGIO') : 'TITOLO (FACOLTATIVO)'}
        </Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, color: colors.text }]}
          placeholder={section === 'chat' ? 'Aggiungi due righe…' : 'Come vuoi chiamarlo'}
          placeholderTextColor={colors.textFaint}
          value={title}
          onChangeText={setTitle}
          maxLength={80}
        />

        {mapsPlace && section === 'links' ? (
          <Pressable onPress={() => setAlsoSavePlace((v) => !v)} style={[styles.placeToggle, { backgroundColor: colors.surface }]}>
            <View
              style={[
                styles.check,
                { borderColor: alsoSavePlace ? colors.teal : colors.border, backgroundColor: alsoSavePlace ? colors.teal : 'transparent' },
              ]}
            >
              {alsoSavePlace ? <CheckIcon size={12} color={colors.bg} /> : null}
            </View>
            <Text style={{ flex: 1, fontSize: 13, color: colors.text, lineHeight: 18, fontWeight: '600' }}>
              Mettilo anche sulla mappa
              <Text style={{ color: colors.textDim, fontWeight: '400' }}>
                {placeCategories[0] ? `, in «${placeCategories[0].name}»` : ''}, già collegato a questo link.
              </Text>
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.bg }]}>
        <Pressable
          onPress={save}
          disabled={saving || !groupId}
          style={[styles.saveBtn, { backgroundColor: colors.amber, opacity: saving || !groupId ? 0.5 : 1 }]}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.inkOnAmber} />
          ) : (
            <Text style={{ color: colors.inkOnAmber, fontWeight: '800', fontSize: 15 }}>
              {section === 'chat' ? 'Manda nella chat' : chosenCategory ? `Salva in «${chosenCategory.name}»` : 'Salva'}
            </Text>
          )}
        </Pressable>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Header({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      <Text style={[styles.headerTitle, { color: colors.text }]}>Salva in Insieme</Text>
      <Pressable onPress={onClose} hitSlop={10} style={[styles.closeBtn, { backgroundColor: colors.surface }]}>
        <CloseIcon size={15} color={colors.textDim} />
      </Pressable>
    </View>
  );
}

function Message({ title, body, onClose }: { title: string; body: string; onClose: () => void }) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <ScreenGlow />
      <Header onClose={onClose} />
      <View style={styles.messageBox}>
        <View style={[styles.bigIcon, { backgroundColor: colors.surface }]}>
          <LinkIcon size={30} color={colors.textDim} />
        </View>
        <Text style={{ fontSize: 21, fontWeight: '800', color: colors.text, marginBottom: 6, letterSpacing: -0.3 }}>{title}</Text>
        <Text style={{ fontSize: 13.5, color: colors.textDim, textAlign: 'center', lineHeight: 20 }}>{body}</Text>
        <Pressable onPress={onClose} style={[styles.saveBtn, { backgroundColor: colors.surface, alignSelf: 'stretch', marginTop: 18 }]}>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>Chiudi</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10 },
  headerTitle: { flex: 1, fontSize: 21, fontWeight: '800', letterSpacing: -0.4 },
  closeBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 30 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: RADIUS.md, padding: 10, marginBottom: 8 },
  previewThumb: { width: 60, height: 60, borderRadius: 14 },
  previewFallback: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  previewTitle: { fontSize: 14, fontWeight: '800', lineHeight: 18 },
  previewSub: { fontSize: 11.5, marginTop: 3 },
  label: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, marginTop: 18, marginBottom: 9 },
  groups: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  groupPick: { borderRadius: 14, borderWidth: 2, paddingHorizontal: 13, paddingVertical: 9, maxWidth: '100%' },
  groupPickText: { fontFamily: FONT_ROUNDED, fontSize: 15 },
  seg: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14 },
  segBtn: { flex: 1, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 11 },
  segText: { fontSize: 13, fontWeight: '800' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
  input: { borderRadius: RADIUS.sm, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14.5 },
  placeToggle: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: RADIUS.md, padding: 13, marginTop: 16 },
  check: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12 },
  saveBtn: { height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  messageBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34 },
  bigIcon: { width: 76, height: 76, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
});
