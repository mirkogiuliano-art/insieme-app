import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, SectionList } from 'react-native';
import * as Location from 'expo-location';
import { useTheme, RADIUS } from '@/theme/theme';
import { FilterChip } from '@/components/FilterChip';
import { BottomSheet } from '@/components/BottomSheet';
import { CategorySheet } from '@/components/CategorySheet';
import { PlaceSheet } from '@/components/PlaceSheet';
import { PlaceActionsSheet } from '@/components/PlaceActionsSheet';
import { AddPlaceSheet, type PlaceCandidate } from '@/components/AddPlaceSheet';
import { PlaceRow } from '@/components/PlaceRow';
import { LoadError } from '@/components/LoadError';
import {
  MapIcon,
  SearchIcon,
  CloseIcon,
  PlusIcon,
  SortIcon,
  CheckIcon,
} from '@/components/Icon';
import {
  googleMapsPlaceUrl,
  mapsUrlForPlace,
  colorForUser,
  distanceMeters,
  distanceLabel,
  withTimeout,
  WRITE_TIMEOUT,
} from '@/lib/utils';
import { linkPinToGooglePlace, openPinInMaps } from '@/lib/api/places';
import { useAuth } from '@/lib/authStore';
import { useToast } from '@/components/Toast';
import { storage } from '@/lib/storage';
import { sendMessage } from '@/lib/api/messages';
import { avvisaDelMessaggio } from '@/lib/api/push';
import { listPins, createPin, deletePin, movePin, subscribeToPins, type RawPin } from '@/lib/api/pins';
import { listLinks, subscribeToLinks, type RawLink } from '@/lib/api/links';
import {
  listPlaceLinks,
  createPlaceLink,
  deletePlaceLink,
  subscribeToPlaceLinks,
  type RawPlaceLink,
} from '@/lib/api/placeLinks';
import {
  listCategories,
  renameCategory,
  recolorCategory,
  deleteCategory,
  subscribeToCategories,
  type RawPlaceCategory,
} from '@/lib/api/placeCategories';

/**
 * Versione WEB della sezione mappa.
 *
 * `react-native-maps` è una libreria nativa: non esiste su web e importarla
 * nel browser fa crashare la schermata. Metro sceglie automaticamente questo
 * file quando la piattaforma è web, e `MapTab.tsx` su iOS/Android.
 *
 * Qui c'è solo l'elenco dei posti — con la stessa barra, le stesse righe,
 * lo stesso menu e la stessa aggiunta per nome della versione per telefono.
 * Manca soltanto la mappa da guardare e da toccare.
 */
interface MapTabProps {
  groupId: string;
  roster: Record<string, string>;
  /** Posto su cui centrare la mappa arrivando dalla sezione Link. */
  focusPinId?: string | null;
  onFocusHandled?: () => void;
}

const FALLBACK_CATEGORY: RawPlaceCategory = { id: '', name: 'Altro', color: '#75828C' };


/** In che ordine si vedono i posti nell'elenco. "Più vicini" compare solo
 * quando si conosce la propria posizione. Preferenza di chi guarda. */
type PlacesSort = 'recent' | 'near' | 'name' | 'person';
const SORT_KEY = 'placesSort';
const SORT_LABELS: Record<PlacesSort, string> = {
  recent: 'Più recenti',
  near: 'Più vicini',
  name: 'Nome (A–Z)',
  person: 'Chi l’ha aggiunto',
};

type Point = { lat: number; lng: number };

export function MapTab({ groupId, roster, focusPinId, onFocusHandled }: MapTabProps) {
  const { colors } = useTheme();
  const { session } = useAuth();
  const toast = useToast();
  const [pins, setPins] = useState<RawPin[]>([]);
  const [categories, setCategories] = useState<RawPlaceCategory[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<PlacesSort>('recent');
  const [sortOpen, setSortOpen] = useState(false);

  const [locationGranted, setLocationGranted] = useState(false);
  const [locating, setLocating] = useState(false);
  /** Dove si trova chi guarda: serve alle distanze e a "Più vicini". */
  const [myPos, setMyPos] = useState<Point | null>(null);

  const [links, setLinks] = useState<RawLink[]>([]);
  const [placeLinks, setPlaceLinks] = useState<RawPlaceLink[]>([]);
  const [openPin, setOpenPin] = useState<RawPin | null>(null);
  /** La scheda del posto aperta direttamente sulla scelta dei link. */
  const [openPinPicking, setOpenPinPicking] = useState(false);
  /** Il posto di cui è aperto il menu delle azioni. */
  const [actionsFor, setActionsFor] = useState<RawPin | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  /** Il punto da cui parte l'aggiunta: pieno quando si è toccata la mappa,
   * vuoto quando si è premuto "Aggiungi" (e allora si comincia cercando). */
  const [addFrom, setAddFrom] = useState<PlaceCandidate | null>(null);

  const [manageCat, setManageCat] = useState<RawPlaceCategory | null>(null);

  const catFor = (id: string | null) => categories.find((c) => c.id === id) ?? FALLBACK_CATEGORY;
  const authorOf = (p: RawPin) => roster[p.userId] ?? 'Utente';
  const distanceOf = (p: RawPin) => (myPos ? distanceLabel(distanceMeters(myPos, p)) : null);

  /** Un solo caricamento per tutta la schermata: se una qualsiasi delle
   * letture fallisce si mostra l'avviso invece di elenchi vuoti. Link e
   * collegamenti servono alla scheda del posto e al suo selettore. */
  const loadAll = useCallback(async () => {
    try {
      const [cats, pinList, linkList, pl] = await withTimeout(Promise.all([
        listCategories(groupId),
        listPins(groupId),
        listLinks(groupId),
        listPlaceLinks(groupId),
      ]));
      setCategories(cats);
      setPins(pinList);
      setLinks(linkList);
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
    const unsubPins = subscribeToPins(groupId, {
      onInsert: (pin) => setPins((prev) => (prev.some((p) => p.id === pin.id) ? prev : [pin, ...prev])),
      onUpdate: (pin) => setPins((prev) => prev.map((p) => (p.id === pin.id ? pin : p))),
      onDelete: (id) => {
        setPins((prev) => prev.filter((p) => p.id !== id));
        setOpenPin((prev) => (prev?.id === id ? null : prev));
      },
    });
    const unsubLinks = subscribeToLinks(groupId, {
      onInsert: (link) => setLinks((prev) => (prev.some((l) => l.id === link.id) ? prev : [link, ...prev])),
      onUpdate: (link) => setLinks((prev) => prev.map((l) => (l.id === link.id ? link : l))),
      onDelete: (id) => setLinks((prev) => prev.filter((l) => l.id !== id)),
    });
    const unsubPlaceLinks = subscribeToPlaceLinks(groupId, {
      onInsert: (pl) => setPlaceLinks((prev) => (prev.some((x) => x.id === pl.id) ? prev : [pl, ...prev])),
      onDelete: (id) => setPlaceLinks((prev) => prev.filter((x) => x.id !== id)),
    });
    return () => {
      unsubCategories();
      unsubPins();
      unsubLinks();
      unsubPlaceLinks();
    };
  }, [groupId]);

  useEffect(() => {
    storage.get<PlacesSort>(SORT_KEY).then((v) => {
      if (v && v in SORT_LABELS) setSort(v);
    });
  }, []);

  /** La propria posizione, chiedendo il permesso se era stato negato:
   * capita di negarlo per sbaglio e non avere più modo di tornare indietro
   * dentro l'app. */
  const getMyPosition = async (): Promise<Point | null> => {
    try {
      let granted = locationGranted;
      if (!granted) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        granted = status === 'granted';
        setLocationGranted(granted);
      }
      if (!granted) {
        toast.show('Serve il permesso di posizione per sapere dove sei.');
        return null;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setMyPos(here);
      return here;
    } catch {
      toast.show('Non sono riuscito a leggere la tua posizione.');
      return null;
    }
  };

  const openAdd = (from: PlaceCandidate | null) => {
    setAddFrom(from);
    setAddOpen(true);
  };

  const savePlace = async (c: PlaceCandidate, name: string, categoryId: string): Promise<boolean> => {
    if (!session || !categoryId) return false;
    try {
      const creato = await withTimeout(createPin(groupId, session.user.id, {
        lat: c.lat,
        lng: c.lng,
        name,
        categoryId,
        mapsUrl: c.mapsUrl ?? (c.placeId ? googleMapsPlaceUrl(name, c.placeId) : null),
      }), WRITE_TIMEOUT);
      toast.show('Posto salvato');
      // Senza la scheda Google (un punto qualsiasi, la propria posizione) la
      // si cerca subito, in sottofondo, così "Portami lì" poi è immediato.
      if (!creato.mapsUrl) void linkPinToGooglePlace(creato.id);
      return true;
    } catch {
      toast.show('Non sono riuscito a salvare il posto, riprova.');
      return false;
    }
  };

  const removePin = async (id: string) => {
    setOpenPin(null);
    try {
      await deletePin(id);
    } catch {
      toast.show('Non sono riuscito a eliminare il posto.');
    }
  };

  const movePlace = async (pin: RawPin, categoryId: string) => {
    try {
      await withTimeout(movePin(pin.id, categoryId), WRITE_TIMEOUT);
      toast.show(`Spostato in "${catFor(categoryId).name}"`);
    } catch {
      toast.show('Non sono riuscito a spostare il posto.');
    }
  };

  /** Manda il posto nella chat del gruppo: nome e indirizzo di Maps, con
   * la riga scritta da chi lo manda sopra. */
  const sendPlaceToChat = async (pin: RawPin, note: string): Promise<boolean> => {
    if (!session) return false;
    const text = [note.trim(), `📍 ${pin.name}`, mapsUrlForPlace(pin)].filter(Boolean).join('\n');
    try {
      const sent = await withTimeout(sendMessage(groupId, session.user.id, text), WRITE_TIMEOUT);
      avvisaDelMessaggio(sent.id);
      toast.show('Mandato in chat');
      return true;
    } catch {
      toast.show('Non sono riuscito a mandarlo in chat, riprova.');
      return false;
    }
  };

  const linkIdsForPin = (pinId: string) => placeLinks.filter((pl) => pl.pinId === pinId).map((pl) => pl.linkId);

  const attachLink = async (pinId: string, linkId: string) => {
    if (!session) return;
    try {
      await withTimeout(createPlaceLink(groupId, session.user.id, pinId, linkId), WRITE_TIMEOUT);
    } catch {
      toast.show('Non sono riuscito a collegare il link.');
    }
  };

  const detachLink = async (pinId: string, linkId: string) => {
    const pl = placeLinks.find((x) => x.pinId === pinId && x.linkId === linkId);
    if (!pl) return;
    try {
      await deletePlaceLink(pl.id);
    } catch {
      toast.show('Non sono riuscito a scollegare il link.');
    }
  };

  const saveRename = async (name: string, color: string) => {
    if (!manageCat) return;
    try {
      if (name !== manageCat.name) await renameCategory(manageCat.id, name);
      if (color && color !== manageCat.color) await recolorCategory(manageCat.id, color);
      setManageCat(null);
    } catch {
      toast.show('Non sono riuscito a salvare la categoria.');
    }
  };

  const runDeleteCategory = async () => {
    if (!manageCat) return;
    try {
      await deleteCategory(manageCat.id);
      if (filter === manageCat.id) setFilter('all');
      setManageCat(null);
    } catch (err) {
      toast.show((err as { message?: string })?.message || 'Non sono riuscito a eliminare la categoria.');
    }
  };

  const chooseSort = (next: PlacesSort) => {
    setSort(next);
    storage.set(SORT_KEY, next);
    setSortOpen(false);
  };

  // ── Cosa si vede ────────────────────────────────────────────────

  const term = query.trim().toLowerCase();
  const filteredPins = pins
    .filter((p) => filter === 'all' || p.categoryId === filter)
    .filter((p) => !term || p.name.toLowerCase().includes(term) || authorOf(p).toLowerCase().includes(term));

  // "Più vicini" senza posizione non ha senso: si ripiega sui più recenti.
  const effectiveSort: PlacesSort = sort === 'near' && !myPos ? 'recent' : sort;
  const sorted = [...filteredPins].sort((a, b) => {
    switch (effectiveSort) {
      case 'near':
        return distanceMeters(myPos!, a) - distanceMeters(myPos!, b);
      case 'name':
        return a.name.localeCompare(b.name, 'it', { sensitivity: 'base' });
      case 'person':
        return authorOf(a).localeCompare(authorOf(b), 'it', { sensitivity: 'base' }) || b.ts - a.ts;
      default:
        return b.ts - a.ts;
    }
  });

  // Come nei link: con "Tutti" l'elenco si divide in sezioni (categorie, o
  // persone se si ordina per chi l'ha aggiunto); dentro un filtro o durante
  // una ricerca è un elenco unico.
  const grouped = filter === 'all' && !term;
  type Section = { key: string; heading: { name: string; color: string } | null; data: RawPin[] };
  const people = Array.from(new Set(sorted.map(authorOf)));
  const sections: Section[] = !grouped
    ? [{ key: 'tutti', heading: null, data: sorted }]
    : effectiveSort === 'person'
      ? people.map((name) => ({ key: 'p:' + name, heading: { name, color: colorForUser(name) }, data: sorted.filter((p) => authorOf(p) === name) }))
      : effectiveSort === 'near'
        ? [{ key: 'vicini', heading: null, data: sorted }]
        : categories
            .map((c) => ({ key: c.id, heading: { name: c.name, color: c.color }, data: sorted.filter((p) => p.categoryId === c.id) }))
            .filter((s) => s.data.length > 0);

  // Arrivo dalla targhetta di un link nella sezione Link: centra il posto e
  // ne apre la scheda. I posti possono non essere ancora caricati quando la
  // tab si monta, perciò l'effetto riscatta anche al variare di `pins`.
  useEffect(() => {
    if (!focusPinId) return;
    const target = pins.find((p) => p.id === focusPinId);
    if (!target) return;
    setOpenPin(target);
    onFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPinId, pins]);

  const sortOptions = (Object.keys(SORT_LABELS) as PlacesSort[]).filter((k) => k !== 'near' || myPos);

  return (
    <View style={{ flex: 1 }}>
      {/* La stessa riga della pagina Link: ricerca, il modo di guardare
          (qui mappa o elenco), e Aggiungi. */}
      <View style={styles.topBar}>
        <View style={[styles.search, { backgroundColor: colors.surface }]}>
          <SearchIcon size={15} color={colors.textFaint} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder={pins.length > 0 ? `Cerca fra ${pins.length} posti` : 'Cerca'}
            placeholderTextColor={colors.textFaint}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <CloseIcon size={13} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={() => openAdd(null)} style={[styles.addBtn, { backgroundColor: colors.amber }]}>
          <PlusIcon size={13} color={colors.inkOnAmber} />
          <Text style={{ color: colors.inkOnAmber, fontWeight: '800', fontSize: 13 }}>Aggiungi</Text>
        </Pressable>
      </View>

      <View style={styles.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
          <FilterChip
            label={SORT_LABELS[effectiveSort]}
            icon={<SortIcon size={12} color={colors.textDim} />}
            onPress={() => setSortOpen(true)}
          />
          <View style={[styles.chipDivider, { backgroundColor: colors.border }]} />
          <FilterChip label="Tutti" active={filter === 'all'} onPress={() => setFilter('all')} />
          {categories.map((c) => (
            <FilterChip
              key={c.id}
              label={c.name}
              dotColor={c.color}
              active={filter === c.id}
              onPress={() => setFilter(c.id)}
              onEdit={() => setManageCat(c)}
            />
          ))}
        </ScrollView>
      </View>

      {loadError ? <LoadError what="i posti" onRetry={loadAll} /> : null}

      {sorted.length === 0 ? (
        <View style={styles.empty}>
          {/* Con l’avviso d’errore sopra, «non c’è niente» sarebbe falso. */}
          {loadError ? null : (
            <>
              {term ? (
                <>
                  <SearchIcon size={34} color={colors.textFaint} strokeWidth={1.6} />
                  <Text style={[styles.emptyText, { color: colors.textFaint }]}>Nessun posto corrisponde a «{query.trim()}».</Text>
                </>
              ) : (
                <>
                  <MapIcon size={38} color={colors.textFaint} strokeWidth={1.6} />
                  <Text style={[styles.emptyText, { color: colors.textFaint }]}>
                    Nessun posto salvato qui. Tocca «Aggiungi» per cercarne uno per nome.
                  </Text>
                </>
              )}
            </>
          )}
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          ItemSeparatorComponent={() => <View style={[styles.rowSep, { backgroundColor: colors.border }]} />}
          renderSectionHeader={({ section }) =>
            section.heading ? (
              <View style={styles.sectionHeader}>
                <View style={[styles.dot, { backgroundColor: section.heading.color }]} />
                <Text style={[styles.sectionTitle, { color: colors.textDim }]}>{section.heading.name.toUpperCase()}</Text>
                <Text style={[styles.sectionCount, { color: colors.textFaint }]}>{section.data.length}</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const cat = catFor(item.categoryId);
            return (
              <PlaceRow
                pin={item}
                categoryName={cat.name}
                categoryColor={cat.color}
                addedBy={authorOf(item)}
                linkCount={linkIdsForPin(item.id).length}
                distance={distanceOf(item)}
                onPress={() => {
                  setOpenPinPicking(false);
                  setOpenPin(item);
                }}
                onOpenMenu={() => setActionsFor(item)}
              />
            );
          }}
        />
      )}

      <PlaceSheet
        pin={openPin}
        categoryName={openPin ? catFor(openPin.categoryId).name : ''}
        categoryColor={openPin ? catFor(openPin.categoryId).color : colors.textFaint}
        authorName={openPin ? authorOf(openPin) : ''}
        allLinks={links}
        linkedLinkIds={openPin ? linkIdsForPin(openPin.id) : []}
        onAttach={(linkId) => openPin && attachLink(openPin.id, linkId)}
        onDetach={(linkId) => openPin && detachLink(openPin.id, linkId)}
        onDelete={() => openPin && removePin(openPin.id)}
        startPicking={openPinPicking}
        distance={openPin ? distanceOf(openPin) : null}
        onClose={() => setOpenPin(null)}
      />

      <PlaceActionsSheet
        pin={actionsFor}
        categories={categories}
        categoryFor={(p) => catFor(p.categoryId)}
        addedBy={actionsFor ? authorOf(actionsFor) : ''}
        onClose={() => setActionsFor(null)}
        onNavigate={(p) => void openPinInMaps(p)}
        onLinkLinks={(p) => {
          setOpenPinPicking(true);
          setOpenPin(p);
        }}
        onMove={movePlace}
        onDelete={(p) => removePin(p.id)}
        onSendToChat={sendPlaceToChat}
      />

      <AddPlaceSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        initial={addFrom}
        categories={categories}
        near={myPos}
        getMyPosition={getMyPosition}
        onSave={savePlace}
      />

      <BottomSheet visible={sortOpen} onClose={() => setSortOpen(false)}>
        <Text style={[styles.sheetTitle, { color: colors.text }]}>Ordina per</Text>
        {sortOptions.map((k, i) => (
          <Pressable
            key={k}
            onPress={() => chooseSort(k)}
            style={[styles.sortRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
          >
            <Text style={[styles.sortLabel, { color: colors.text, fontWeight: effectiveSort === k ? '800' : '600' }]}>{SORT_LABELS[k]}</Text>
            {effectiveSort === k ? <CheckIcon size={17} color={colors.amber} /> : null}
          </Pressable>
        ))}
      </BottomSheet>

      <CategorySheet
        category={manageCat}
        itemCount={manageCat ? pins.filter((x) => x.categoryId === manageCat.id).length : 0}
        itemLabel="posti"
        fallbackName={categories.find((x) => x.id !== manageCat?.id)?.name ?? ''}
        canDelete={!!manageCat && categories.length > 1}
        onSave={saveRename}
        onDelete={runDeleteCategory}
        onClose={() => setManageCat(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  search: { flex: 1, height: 40, borderRadius: RADIUS.sm, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 13.5, paddingVertical: 0 },
  viewBtn: { width: 40, height: 40, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  addBtn: { height: 40, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, borderRadius: 999 },
  filters: { paddingBottom: 8 },
  chipDivider: { width: 1, alignSelf: 'stretch', marginVertical: 6, marginRight: 8 },
  listContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 20 },
  rowSep: { height: 1, marginLeft: 64 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 30 },
  emptyText: { fontSize: 13, textAlign: 'center', maxWidth: 260, lineHeight: 18 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 14, marginBottom: 6 },
  sectionTitle: { flex: 1, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.6 },
  sectionCount: { fontSize: 11.5, fontWeight: '700' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  sheetTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  sortRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  sortLabel: { flex: 1, fontSize: 15 },
});
