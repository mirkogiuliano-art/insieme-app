import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  SectionList,
  Image,
  Linking,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme, RADIUS } from '@/theme/theme';
import { PlusIcon, LinkIcon, TrashIcon, AttachIcon, PlayIcon, MapIcon } from '@/components/Icon';
import { FilterChip } from '@/components/FilterChip';
import { BottomSheet } from '@/components/BottomSheet';
import { CategorySheet } from '@/components/CategorySheet';
import { LinkCard } from '@/components/LinkCard';
import { LoadError } from '@/components/LoadError';
import { PlacePickerSheet } from '@/components/PlacePickerSheet';
import { dateLabel, platformInfo, normalizeUrl, parseGoogleMapsUrl, withTimeout, WRITE_TIMEOUT, UPLOAD_TIMEOUT, type MapsPlaceInfo } from '@/lib/utils';
import { useAuth } from '@/lib/authStore';
import { useToast } from '@/components/Toast';
import {
  listCategories,
  createCategory,
  renameCategory,
  deleteCategory,
  subscribeToCategories,
  type RawLinkCategory,
} from '@/lib/api/linkCategories';
import { listLinks, createLink, deleteLink, subscribeToLinks, type RawLink } from '@/lib/api/links';
import { listPins, createPin, subscribeToPins, type RawPin } from '@/lib/api/pins';
import {
  listCategories as listPlaceCategories,
  subscribeToCategories as subscribeToPlaceCategories,
  type RawPlaceCategory,
} from '@/lib/api/placeCategories';
import {
  listPlaceLinks,
  createPlaceLink,
  deletePlaceLink,
  subscribeToPlaceLinks,
  type RawPlaceLink,
} from '@/lib/api/placeLinks';
import { uploadGroupMedia, sweepGroupMedia } from '@/lib/api/mediaUpload';
import { getLinkPreview } from '@/lib/api/linkPreviews';
import { CATEGORY_PALETTE } from '@/types';

interface LinksTabProps {
  groupId: string;
  roster: Record<string, string>;
  /** Passa alla sezione Mappa centrata su quel posto. */
  onShowPlaceOnMap?: (pinId: string) => void;
}

const FALLBACK_PLACE_CATEGORY = { name: 'Altro', color: '#75828C' };

export function LinksTab({ groupId, roster, onShowPlaceOnMap }: LinksTabProps) {
  const { colors } = useTheme();
  const { session } = useAuth();
  const toast = useToast();

  const [categories, setCategories] = useState<RawLinkCategory[]>([]);
  const [items, setItems] = useState<RawLink[]>([]);
  const [filter, setFilter] = useState<string>('all');

  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [selectedCat, setSelectedCat] = useState<string>('');

  const [catModalOpen, setCatModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const [manageCat, setManageCat] = useState<RawLinkCategory | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Collegamenti con i posti della mappa.
  const [pins, setPins] = useState<RawPin[]>([]);
  const [placeCategories, setPlaceCategories] = useState<RawPlaceCategory[]>([]);
  const [placeLinks, setPlaceLinks] = useState<RawPlaceLink[]>([]);
  const [pickerLink, setPickerLink] = useState<RawLink | null>(null);
  // Proposta "salva anche come posto" dopo aver incollato un link di Maps.
  const [mapsPrompt, setMapsPrompt] = useState<{ info: MapsPlaceInfo; linkId: string; url: string } | null>(null);
  const [mapsPromptCat, setMapsPromptCat] = useState<string>('');
  const [savingPlace, setSavingPlace] = useState(false);

  /** Un solo caricamento per tutta la schermata: se una qualsiasi delle
   * letture fallisce si mostra l'avviso invece di elenchi vuoti. */
  const loadAll = useCallback(async () => {
    try {
      const [cats, links, pinList, placeCats, pl] = await withTimeout(Promise.all([
        listCategories(groupId),
        listLinks(groupId),
        listPins(groupId),
        listPlaceCategories(groupId),
        listPlaceLinks(groupId),
      ]));
      setCategories(cats);
      setSelectedCat((prev) => (prev && cats.some((c) => c.id === prev) ? prev : (cats[0]?.id ?? '')));
      setItems(links);
      setPins(pinList);
      setPlaceCategories(placeCats);
      setPlaceLinks(pl);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [groupId]);

  useEffect(() => {
    loadAll();

    const unsubCategories = subscribeToCategories(groupId, {
      onInsert: (cat) => setCategories((prev) => (prev.some((c) => c.id === cat.id) ? prev : [...prev, cat])),
      onUpdate: (cat) => setCategories((prev) => prev.map((c) => (c.id === cat.id ? cat : c))),
      onDelete: (id) => setCategories((prev) => prev.filter((c) => c.id !== id)),
    });
    const unsubLinks = subscribeToLinks(groupId, {
      onInsert: (link) => setItems((prev) => (prev.some((it) => it.id === link.id) ? prev : [link, ...prev])),
      onUpdate: (link) => setItems((prev) => prev.map((it) => (it.id === link.id ? link : it))),
      onDelete: (id) => setItems((prev) => prev.filter((it) => it.id !== id)),
    });

    // Posti e collegamenti: servono per le targhette sulle card e per il
    // selettore "collega a un posto".

    const unsubPins = subscribeToPins(groupId, {
      onInsert: (pin) => setPins((prev) => (prev.some((p) => p.id === pin.id) ? prev : [pin, ...prev])),
      onUpdate: (pin) => setPins((prev) => prev.map((p) => (p.id === pin.id ? pin : p))),
      onDelete: (id) => setPins((prev) => prev.filter((p) => p.id !== id)),
    });
    const unsubPlaceCategories = subscribeToPlaceCategories(groupId, {
      onInsert: (cat) => setPlaceCategories((prev) => (prev.some((c) => c.id === cat.id) ? prev : [...prev, cat])),
      onUpdate: (cat) => setPlaceCategories((prev) => prev.map((c) => (c.id === cat.id ? cat : c))),
      onDelete: (id) => setPlaceCategories((prev) => prev.filter((c) => c.id !== id)),
    });
    const unsubPlaceLinks = subscribeToPlaceLinks(groupId, {
      onInsert: (pl) => setPlaceLinks((prev) => (prev.some((x) => x.id === pl.id) ? prev : [pl, ...prev])),
      onDelete: (id) => setPlaceLinks((prev) => prev.filter((x) => x.id !== id)),
    });

    return () => {
      unsubCategories();
      unsubLinks();
      unsubPins();
      unsubPlaceCategories();
      unsubPlaceLinks();
    };
  }, [groupId]);

  const addLink = async () => {
    if (!url.trim() || !session) return;
    const normalized = normalizeUrl(url);
    let info;
    try {
      // eslint-disable-next-line no-new
      new URL(normalized);
      info = platformInfo(normalized);
    } catch {
      toast.show('Il link non sembra valido.');
      return;
    }
    const catId = selectedCat || categories[0]?.id;
    if (!catId) return;
    // Se è un link di Google Maps con coordinate leggibili, il posto ci dà
    // sia un titolo migliore sia la proposta di salvarlo anche sulla mappa.
    const maps = parseGoogleMapsUrl(normalized);
    try {
      const created = await withTimeout(createLink(groupId, session.user.id, {
        url: normalized,
        title:
          title.trim() ||
          maps?.name ||
          (info.platform === 'web' ? info.host || normalized : info.label),
        platform: info.platform,
        label: maps ? 'Google Maps' : info.label,
        thumb: info.thumb,
        categoryId: catId,
      }), WRITE_TIMEOUT);
      setUrl('');
      setTitle('');
      if (maps) {
        setMapsPromptCat(placeCategories[0]?.id ?? '');
        setMapsPrompt({ info: maps, linkId: created.id, url: normalized });
      }
    } catch {
      toast.show('Non sono riuscito a salvare il link, riprova.');
    }
  };

  const placeCatFor = (pin: RawPin) =>
    placeCategories.find((c) => c.id === pin.categoryId) ?? FALLBACK_PLACE_CATEGORY;

  const pinIdsForLink = (linkId: string) => placeLinks.filter((pl) => pl.linkId === linkId).map((pl) => pl.pinId);

  const togglePlaceLink = async (linkId: string, pinId: string, attached: boolean) => {
    if (!session) return;
    try {
      if (attached) {
        const pl = placeLinks.find((x) => x.pinId === pinId && x.linkId === linkId);
        if (pl) await deletePlaceLink(pl.id);
      } else {
        await withTimeout(createPlaceLink(groupId, session.user.id, pinId, linkId), WRITE_TIMEOUT);
      }
    } catch {
      toast.show('Non sono riuscito ad aggiornare il collegamento.');
    }
  };

  /** Crea il posto estratto dal link di Maps e lo collega subito al link. */
  const savePlaceFromMaps = async () => {
    if (!mapsPrompt || !session || savingPlace) return;
    const catId = mapsPromptCat || placeCategories[0]?.id;
    if (!catId) {
      toast.show('Serve almeno una categoria di posti.');
      return;
    }
    setSavingPlace(true);
    let pinId: string;
    try {
      const pin = await withTimeout(createPin(groupId, session.user.id, {
        lat: mapsPrompt.info.lat,
        lng: mapsPrompt.info.lng,
        name: mapsPrompt.info.name || 'Posto da Google Maps',
        categoryId: catId,
        // Il link incollato apre già la scheda del luogo: lo teniamo com'è.
        mapsUrl: mapsPrompt.url,
      }), WRITE_TIMEOUT);
      pinId = pin.id;
    } catch {
      toast.show('Non sono riuscito a salvare il posto.');
      setSavingPlace(false);
      return;
    }
    // Il posto ormai esiste: se il collegamento fallisce va detto, ma non
    // si torna indietro — il posto resta salvato ed è ricollegabile a mano.
    try {
      await withTimeout(createPlaceLink(groupId, session.user.id, pinId, mapsPrompt.linkId), WRITE_TIMEOUT);
      toast.show('Posto salvato e collegato al link');
    } catch {
      toast.show('Posto salvato, ma il collegamento al link non è riuscito.');
    } finally {
      setMapsPrompt(null);
      setSavingPlace(false);
    }
  };

  const pickFile = async () => {
    if (!session || uploadingFile) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.show('Serve il permesso per accedere ai file.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.7 });
    const asset = result.canceled ? null : result.assets?.[0];
    if (!asset) return;
    const catId = selectedCat || categories[0]?.id;
    if (!catId) return;

    const kind: 'image' | 'video' = asset.type === 'video' ? 'video' : 'image';
    setUploadingFile(true);
    try {
      const uploadedUrl = await withTimeout(uploadGroupMedia(groupId, asset.uri), UPLOAD_TIMEOUT);
      await withTimeout(createLink(groupId, session.user.id, {
        url: uploadedUrl,
        title: title.trim() || (kind === 'video' ? 'Video' : 'Foto'),
        platform: kind,
        label: kind === 'video' ? 'Video' : 'Foto',
        thumb: kind === 'image' ? uploadedUrl : null,
        categoryId: catId,
      }), WRITE_TIMEOUT);
      setTitle('');
    } catch {
      toast.show('Caricamento del file non riuscito, riprova.');
    } finally {
      setUploadingFile(false);
    }
  };

  const removeLink = async (id: string) => {
    try {
      await deleteLink(id);
      // Se il link era una foto o un video caricati, il file resterebbe
      // nel deposito: la spazzata lo toglie di mezzo.
      sweepGroupMedia(groupId);
    } catch {
      toast.show('Non sono riuscito a eliminare il link.');
    }
  };

  const createCat = async () => {
    if (!newCatName.trim()) return;
    try {
      const cat = await createCategory(
        groupId,
        newCatName.trim().slice(0, 24),
        CATEGORY_PALETTE[categories.length % CATEGORY_PALETTE.length],
      );
      setSelectedCat(cat.id);
      setFilter(cat.id);
      setNewCatName('');
      setCatModalOpen(false);
    } catch {
      toast.show('Non sono riuscito a creare la categoria.');
    }
  };

  const openManageCat = (cat: RawLinkCategory) => {
    setManageCat(cat);
  };

  const closeManageCat = () => {
    setManageCat(null);
  };

  const saveRename = async (name: string) => {
    if (!manageCat) return;
    try {
      await renameCategory(manageCat.id, name);
      closeManageCat();
    } catch {
      toast.show('Non sono riuscito a rinominare la categoria.');
    }
  };

  const runDeleteCategory = async () => {
    if (!manageCat) return;
    try {
      await deleteCategory(manageCat.id);
      if (filter === manageCat.id) setFilter('all');
      closeManageCat();
    } catch (err) {
      toast.show((err as { message?: string })?.message || 'Non sono riuscito a eliminare la categoria.');
    }
  };


  const filtered = filter === 'all' ? items : items.filter((it) => it.categoryId === filter);
  const sectionsForList = categories
    .map((c) => ({
      category: c,
      title: c.name,
      data: filtered.filter((it) => it.categoryId === c.id),
    }))
    .filter((s) => s.data.length > 0);

  const renderItem = ({ item }: { item: RawLink }) => {
    const cat = categories.find((c) => c.id === item.categoryId) ?? { name: 'Generale', color: '#75828C' };
    const addedBy = roster[item.userId] ?? 'Utente';
    const linkedPins = pinIdsForLink(item.id)
      .map((pinId) => pins.find((p) => p.id === pinId))
      .filter((p): p is RawPin => !!p);
    return (
      <LinkCard
        item={item}
        catName={cat.name}
        catColor={cat.color}
        addedBy={addedBy}
        onRemove={() => removeLink(item.id)}
        onPickPlace={() => setPickerLink(item)}
      >
        <View style={styles.placeRow}>
          {linkedPins.map((p) => {
            const pc = placeCatFor(p);
            return (
              <Pressable
                key={p.id}
                onPress={() => onShowPlaceOnMap?.(p.id)}
                style={[styles.placeChip, { borderColor: pc.color, backgroundColor: colors.surface2 }]}
              >
                <MapIcon size={11} color={pc.color} strokeWidth={2} />
                <Text style={{ fontSize: 10.5, fontWeight: '600', color: colors.textDim }} numberOfLines={1}>
                  {p.name}
                </Text>
              </Pressable>
            );
          })}
          <Pressable onPress={() => setPickerLink(item)} style={[styles.placeChipAdd, { borderColor: colors.border }]}>
            <PlusIcon size={9} color={colors.textFaint} />
            <Text style={{ fontSize: 10.5, color: colors.textFaint }}>
              {linkedPins.length === 0 ? 'Collega un posto' : 'Posto'}
            </Text>
          </Pressable>
        </View>
      </LinkCard>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.addBox, { borderBottomColor: colors.border }]}>
        <View style={styles.urlRow}>
          <TextInput
            style={[styles.urlInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
            placeholder="Incolla un link (YouTube, Instagram...)"
            placeholderTextColor={colors.textFaint}
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            onPress={pickFile}
            disabled={uploadingFile}
            style={[styles.attachBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: uploadingFile ? 0.5 : 1 }]}
          >
            {uploadingFile ? <ActivityIndicator size="small" color={colors.textDim} /> : <AttachIcon size={17} color={colors.textDim} />}
          </Pressable>
        </View>
        <View style={styles.addRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catPickerScroll}>
            {categories.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => setSelectedCat(c.id)}
                style={[
                  styles.catPick,
                  { borderColor: selectedCat === c.id ? c.color : colors.border, backgroundColor: colors.surface },
                ]}
              >
                <View style={[styles.dot, { backgroundColor: c.color }]} />
                <Text style={{ fontSize: 12, color: selectedCat === c.id ? colors.text : colors.textDim }}>{c.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        <View style={styles.addRow2}>
          <TextInput
            style={[styles.titleInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
            placeholder="Titolo (facoltativo)"
            placeholderTextColor={colors.textFaint}
            value={title}
            onChangeText={setTitle}
            maxLength={80}
          />
          <Pressable
            onPress={addLink}
            disabled={!url.trim()}
            style={[styles.addBtn, { backgroundColor: colors.amber, opacity: url.trim() ? 1 : 0.45 }]}
          >
            <PlusIcon size={14} color={colors.inkOnAmber} />
            <Text style={{ color: colors.inkOnAmber, fontWeight: '700', fontSize: 13 }}>Salva</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.filters, { borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <FilterChip label="Tutte" dotColor={colors.textFaint} active={filter === 'all'} onPress={() => setFilter('all')} />
          {categories.map((c) => (
            <FilterChip
              key={c.id}
              label={c.name}
              dotColor={c.color}
              active={filter === c.id}
              onPress={() => setFilter(c.id)}
              onEdit={() => openManageCat(c)}
            />
          ))}
          <FilterChip label="+ Categoria" dashed onPress={() => setCatModalOpen(true)} />
        </ScrollView>
      </View>

      {loadError ? <LoadError what="i link" onRetry={loadAll} /> : null}

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <LinkIcon size={38} color={colors.textFaint} strokeWidth={1.6} />
          <Text style={[styles.emptyText, { color: colors.textFaint }]}>
            Nessun link qui. Incolla un video o un sito, o allega una foto/video dal telefono con la graffetta.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sectionsForList}
          keyExtractor={(it) => it.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
          stickySectionHeadersEnabled={false}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <View style={[styles.dot, { backgroundColor: section.category.color }]} />
              <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: colors.textDim, letterSpacing: 0.4 }}>
                {section.title.toUpperCase()}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textFaint }}>{section.data.length}</Text>
            </View>
          )}
        />
      )}

      <BottomSheet visible={catModalOpen} onClose={() => setCatModalOpen(false)}>
        <Text style={[styles.sheetTitle, { color: colors.text }]}>Nuova categoria</Text>
        <Text style={[styles.sheetSub, { color: colors.textDim }]}>
          Crea una categoria per organizzare i link e i video salvati.
        </Text>
        <TextInput
          style={[styles.mInput, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text }]}
          placeholder="Es. Ricette, Musica, Da vedere"
          placeholderTextColor={colors.textFaint}
          value={newCatName}
          onChangeText={setNewCatName}
          maxLength={24}
          onSubmitEditing={createCat}
        />
        <View style={styles.sheetActions}>
          <Pressable onPress={() => setCatModalOpen(false)} style={[styles.btnSecondary, { borderColor: colors.border }]}>
            <Text style={{ color: colors.textDim, fontWeight: '600' }}>Annulla</Text>
          </Pressable>
          <Pressable onPress={createCat} style={[styles.btnPrimary, { backgroundColor: colors.amber }]}>
            <Text style={{ color: colors.inkOnAmber, fontWeight: '700' }}>Crea</Text>
          </Pressable>
        </View>
      </BottomSheet>

      <CategorySheet
        category={manageCat}
        itemCount={manageCat ? items.filter((x) => x.categoryId === manageCat.id).length : 0}
        itemLabel="link"
        fallbackName={categories.find((x) => x.id !== manageCat?.id)?.name ?? ''}
        canDelete={!!manageCat && manageCat.name !== 'Generale' && categories.length > 1}
        onRename={saveRename}
        onDelete={runDeleteCategory}
        onClose={closeManageCat}
      />

      <PlacePickerSheet
        visible={!!pickerLink}
        linkTitle={pickerLink?.title ?? ''}
        pins={pins}
        categoryFor={placeCatFor}
        linkedPinIds={pickerLink ? pinIdsForLink(pickerLink.id) : []}
        onToggle={(pinId, attached) => pickerLink && togglePlaceLink(pickerLink.id, pinId, attached)}
        onClose={() => setPickerLink(null)}
      />

      <BottomSheet visible={!!mapsPrompt} onClose={() => setMapsPrompt(null)}>
        {mapsPrompt ? (
          <>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Sembra un posto su Google Maps</Text>
            <Text style={[styles.sheetSub, { color: colors.textDim }]}>
              {mapsPrompt.info.name ? `"${mapsPrompt.info.name}" — ` : ''}
              {mapsPrompt.info.lat.toFixed(4)}, {mapsPrompt.info.lng.toFixed(4)}.
              {'\n'}Vuoi salvarlo anche sulla mappa del gruppo, già collegato a questo link?
            </Text>
            {placeCategories.length > 0 ? (
              <View style={styles.catRow}>
                {placeCategories.map((c) => {
                  const sel = mapsPromptCat === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => setMapsPromptCat(c.id)}
                      style={[
                        styles.catPick,
                        { borderColor: sel ? c.color : colors.border, backgroundColor: colors.surface },
                      ]}
                    >
                      <View style={[styles.dot, { backgroundColor: c.color }]} />
                      <Text style={{ fontSize: 12, color: sel ? colors.text : colors.textDim }}>{c.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            <View style={styles.sheetActions}>
              <Pressable onPress={() => setMapsPrompt(null)} style={[styles.btnSecondary, { borderColor: colors.border }]}>
                <Text style={{ color: colors.textDim, fontWeight: '600' }}>No, grazie</Text>
              </Pressable>
              <Pressable
                onPress={savePlaceFromMaps}
                disabled={savingPlace}
                style={[styles.btnPrimary, { backgroundColor: colors.amber, opacity: savingPlace ? 0.6 : 1 }]}
              >
                <Text style={{ color: colors.inkOnAmber, fontWeight: '700' }}>Sì, salva</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  addBox: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, borderBottomWidth: 1, gap: 8 },
  urlRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  urlInput: { flex: 1, borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: 13, paddingVertical: 10, fontSize: 13.5 },
  attachBtn: { width: 38, height: 38, borderRadius: RADIUS.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  addRow: { flexDirection: 'row' },
  catPickerScroll: { flexGrow: 0 },
  catPick: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7, marginRight: 7 },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  addRow2: { flexDirection: 'row', gap: 8 },
  titleInput: { flex: 1, borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: 13, paddingVertical: 10, fontSize: 13.5 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, borderRadius: RADIUS.sm },
  filters: { paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1 },
  // `minHeight` evita che una card con poco testo faccia rimpicciolire la
  // miniatura, visto che è l'altezza della card a decidere la sua.
  // 132 punti: abbastanza da rendere leggibile un'immagine panoramica
  // senza togliere al titolo la seconda riga. Il riquadro dell'icona ha la
  // stessa larghezza così, nell'elenco, il testo di tutte le card parte
  // alla stessa altezza.
  // L'immagine viene ingrandita oltre il riquadro e ritagliata ai lati dal
  // contenitore: è il compromesso fra vederla intera (bande vuote alte) e
  // riempire il riquadro (immagine tagliata a metà). Le bande si dimezzano
  // e si perde solo un po' di larghezza ai due estremi.
  placeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 },
  placeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, maxWidth: 150 },
  placeChipAdd: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderStyle: 'dashed', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 30 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 18, marginBottom: 10 },
  emptyText: { fontSize: 13, textAlign: 'center', maxWidth: 240, lineHeight: 18 },
  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
  sheetSub: { fontSize: 12.5, marginBottom: 12, lineHeight: 18 },
  mInput: { borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14.5, marginBottom: 10 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btnSecondary: { flex: 1, paddingVertical: 12, borderRadius: RADIUS.sm, borderWidth: 1, alignItems: 'center' },
  btnPrimary: { flex: 1, paddingVertical: 12, borderRadius: RADIUS.sm, alignItems: 'center' },
});
