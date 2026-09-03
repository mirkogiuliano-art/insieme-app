import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, FlatList, Pressable } from 'react-native';
import { useTheme, RADIUS } from '@/theme/theme';
import { FilterChip } from '@/components/FilterChip';
import { CategorySheet } from '@/components/CategorySheet';
import { PlaceSheet } from '@/components/PlaceSheet';
import { LoadError } from '@/components/LoadError';
import { MapIcon, LinkIcon, ChevronIcon } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/authStore';
import { dateLabel, withTimeout, WRITE_TIMEOUT } from '@/lib/utils';
import { listPins, subscribeToPins, type RawPin } from '@/lib/api/pins';
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
 * Qui mostriamo solo la LISTA dei posti salvati (dati condivisi via
 * Supabase, come su mobile), che non dipende da nessuna libreria nativa.
 * Per aggiungere posti sulla mappa usa l'app sul telefono.
 */
interface MapTabProps {
  groupId: string;
  roster: Record<string, string>;
  /** Posto da aprire arrivando dalla targhetta di un link. */
  focusPinId?: string | null;
  onFocusHandled?: () => void;
}

const FALLBACK_CATEGORY: RawPlaceCategory = { id: '', name: 'Altro', color: '#75828C' };

export function MapTab({ groupId, roster, focusPinId, onFocusHandled }: MapTabProps) {
  const { colors } = useTheme();
  const toast = useToast();
  const { session } = useAuth();
  const [pins, setPins] = useState<RawPin[]>([]);
  const [categories, setCategories] = useState<RawPlaceCategory[]>([]);
  const [filter, setFilter] = useState<string>('all');

  const [links, setLinks] = useState<RawLink[]>([]);
  const [placeLinks, setPlaceLinks] = useState<RawPlaceLink[]>([]);
  const [openPin, setOpenPin] = useState<RawPin | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [manageCat, setManageCat] = useState<RawPlaceCategory | null>(null);

  const catFor = (id: string | null) => categories.find((c) => c.id === id) ?? FALLBACK_CATEGORY;

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

  // Arrivo dalla targhetta di un link: qui non c'è una mappa da centrare,
  // si apre direttamente la scheda del posto.
  useEffect(() => {
    if (!focusPinId) return;
    const target = pins.find((p) => p.id === focusPinId);
    if (!target) return;
    setOpenPin(target);
    onFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPinId, pins]);

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

  const openManageCat = (cat: RawPlaceCategory) => {
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


  const filtered = filter === 'all' ? pins : pins.filter((p) => p.categoryId === filter);
  const sorted = [...filtered].sort((a, b) => b.ts - a.ts);

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.notice, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
        <Text style={{ fontSize: 12, color: colors.textDim, lineHeight: 17 }}>
          La mappa interattiva è disponibile nell'app su telefono. Qui sul web puoi consultare
          l'elenco dei posti salvati.
        </Text>
      </View>

      {loadError ? <LoadError what="i posti" onRetry={loadAll} /> : null}

      <View style={[styles.filters, { borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <FilterChip
            label="Tutti"
            dotColor={colors.textFaint}
            active={filter === 'all'}
            onPress={() => setFilter('all')}
          />
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
        </ScrollView>
      </View>

      {sorted.length === 0 ? (
        <View style={styles.empty}>
          <MapIcon size={38} color={colors.textFaint} strokeWidth={1.6} />
          <Text style={[styles.emptyText, { color: colors.textFaint }]}>
            Nessun posto salvato qui. Aggiungine uno dall'app sul telefono, toccando la mappa.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          renderItem={({ item }) => {
            const cat = catFor(item.categoryId);
            const linkCount = linkIdsForPin(item.id).length;
            return (
              <Pressable
                onPress={() => setOpenPin(item)}
                style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={[styles.dot, { backgroundColor: cat.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '600', color: colors.text }}>{item.name}</Text>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: cat.color, marginTop: 2 }}>
                    {cat.name}
                  </Text>
                  <Text style={{ fontSize: 10.5, color: colors.textFaint, marginTop: 3 }}>
                    {roster[item.userId] ?? 'Utente'} · {dateLabel(item.ts)} · {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
                  </Text>
                </View>
                {linkCount > 0 ? (
                  <View style={[styles.linkCount, { borderColor: colors.border, backgroundColor: colors.surface2 }]}>
                    <LinkIcon size={12} color={colors.textDim} strokeWidth={1.8} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textDim }}>{linkCount}</Text>
                  </View>
                ) : null}
                <ChevronIcon size={16} color={colors.textFaint} />
              </Pressable>
            );
          }}
        />
      )}

      <PlaceSheet
        pin={openPin}
        categoryName={openPin ? catFor(openPin.categoryId).name : ''}
        categoryColor={openPin ? catFor(openPin.categoryId).color : colors.textFaint}
        authorName={openPin ? (roster[openPin.userId] ?? 'Utente') : ''}
        allLinks={links}
        linkedLinkIds={openPin ? linkIdsForPin(openPin.id) : []}
        onAttach={(linkId) => openPin && attachLink(openPin.id, linkId)}
        onDetach={(linkId) => openPin && detachLink(openPin.id, linkId)}
        onClose={() => setOpenPin(null)}
      />

      <CategorySheet
        category={manageCat}
        itemCount={manageCat ? pins.filter((x) => x.categoryId === manageCat.id).length : 0}
        itemLabel="posti"
        fallbackName={categories.find((x) => x.id !== manageCat?.id)?.name ?? ''}
        canDelete={!!manageCat && true && categories.length > 1}
        onRename={saveRename}
        onDelete={runDeleteCategory}
        onClose={closeManageCat}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { margin: 16, marginBottom: 0, padding: 12, borderWidth: 1, borderRadius: RADIUS.sm },
  filters: { paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 30 },
  emptyText: { fontSize: 13, textAlign: 'center', maxWidth: 260, lineHeight: 18 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: 12,
  },
  dot: { width: 14, height: 14, borderRadius: 3, transform: [{ rotate: '45deg' }] },
  linkCount: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
});
