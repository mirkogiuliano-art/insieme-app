import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  SectionList,
} from 'react-native';
import MapView, { Marker, type MapPressEvent, type PoiClickEvent, type Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useTheme, RADIUS } from '@/theme/theme';
import { FilterChip } from '@/components/FilterChip';
import { BottomSheet } from '@/components/BottomSheet';
import { CategorySheet } from '@/components/CategorySheet';
import { PlaceSheet } from '@/components/PlaceSheet';
import { MapPin } from '@/components/MapPin';
import { LoadError } from '@/components/LoadError';
import { MapIcon, ChevronIcon, LinkIcon, LocateIcon } from '@/components/Icon';
import { dateLabel, googleMapsPlaceUrl, withTimeout, WRITE_TIMEOUT } from '@/lib/utils';
import { linkPinToGooglePlace, openPinInMaps } from '@/lib/api/places';
import { useAuth } from '@/lib/authStore';
import { useToast } from '@/components/Toast';
import { listPins, createPin, deletePin, subscribeToPins, type RawPin } from '@/lib/api/pins';
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

interface MapTabProps {
  groupId: string;
  roster: Record<string, string>;
  /** Posto su cui centrare la mappa arrivando dalla sezione Link. */
  focusPinId?: string | null;
  onFocusHandled?: () => void;
}

const FALLBACK_CATEGORY: RawPlaceCategory = { id: '', name: 'Altro', color: '#75828C' };

const ITALY_REGION: Region = {
  latitude: 43.5,
  longitude: 12.5,
  latitudeDelta: 8,
  longitudeDelta: 8,
};

export function MapTab({ groupId, roster, focusPinId, onFocusHandled }: MapTabProps) {
  const { colors } = useTheme();
  const { session } = useAuth();
  const toast = useToast();
  const mapRef = useRef<MapView>(null);

  const [mode, setMode] = useState<'map' | 'list'>('map');
  const [pins, setPins] = useState<RawPin[]>([]);
  const [categories, setCategories] = useState<RawPlaceCategory[]>([]);
  const [filter, setFilter] = useState<string>('all');

  const [locationGranted, setLocationGranted] = useState(false);
  const [locating, setLocating] = useState(false);

  const [links, setLinks] = useState<RawLink[]>([]);
  const [placeLinks, setPlaceLinks] = useState<RawPlaceLink[]>([]);
  const [openPin, setOpenPin] = useState<RawPin | null>(null);
  /** Il posto toccato sulla mappa, mostrato nella scheda in basso. È una
   * cosa diversa da `openPin`, che è il foglio completo: questa è
   * l'occhiata veloce da cui si decide se aprirlo davvero. */
  const [anteprima, setAnteprima] = useState<RawPin | null>(null);
  /** Quando è stato toccato un pin l'ultima volta.
   *
   * Su Android il tocco su un marcatore fa scattare **anche** l'`onPress`
   * della mappa sotto, e quindi il foglio "aggiungi posto" si apriva sopra
   * all'anteprima. Non basta guardare lo stato `anteprima` dentro
   * `onMapPress`: i due eventi arrivano nello stesso giro e lo stato non è
   * ancora aggiornato. Serve un riferimento, che cambia subito. */
  const toccoPin = useRef(0);
  const [loadError, setLoadError] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  // `placeId` è l'identificativo Google del punto di interesse toccato: è
  // ciò che permette poi di riaprire la scheda del locale invece di uno
  // spillo sulle coordinate. È null se si è toccato un punto qualsiasi.
  const [pending, setPending] = useState<{ lat: number; lng: number; placeId: string | null } | null>(null);
  const [pinName, setPinName] = useState('');
  const [pinCat, setPinCat] = useState<string>('');
  const [address, setAddress] = useState('');
  const [geoLoading, setGeoLoading] = useState(false);
  const [nameError, setNameError] = useState(false);

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
        setAnteprima((prev) => (prev?.id === id ? null : prev));
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
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      // Senza questo il puntino azzurro non compare: il permesso da solo non
      // basta, va acceso `showsUserLocation` sulla mappa.
      setLocationGranted(true);
      try {
        const pos = await Location.getCurrentPositionAsync({});
        mapRef.current?.animateToRegion({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        });
      } catch {
        // ignora
      }
    })();
  }, []);

  /** Riporta l'inquadratura sulla propria posizione. Se il permesso era
   * stato negato all'avvio lo richiede di nuovo: capita di negarlo per
   * sbaglio e non avere più modo di tornare indietro dentro l'app. */
  const centerOnMe = async () => {
    if (locating) return;
    setLocating(true);
    try {
      let granted = locationGranted;
      if (!granted) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        granted = status === 'granted';
        setLocationGranted(granted);
      }
      if (!granted) {
        toast.show('Serve il permesso di posizione per trovarti sulla mappa.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      setMode('map');
      mapRef.current?.animateToRegion({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    } catch {
      toast.show('Non sono riuscito a leggere la tua posizione.');
    } finally {
      setLocating(false);
    }
  };

  const openAddSheet = async (
    latitude: number,
    longitude: number,
    presetName?: string,
    placeId?: string,
  ) => {
    setPending({ lat: latitude, lng: longitude, placeId: placeId ?? null });
    setPinName(presetName ?? '');
    setPinCat(categories[0]?.id ?? '');
    setAddress('');
    setNameError(false);
    setSheetOpen(true);
    setGeoLoading(true);
    // Reverse geocoding nativo (senza chiavi esterne) tramite expo-location.
    try {
      const results = await Location.reverseGeocodeAsync({ latitude, longitude });
      const r = results[0];
      if (r) {
        if (!presetName) {
          const suggested = r.name || r.street || '';
          if (suggested) setPinName(suggested);
        }
        const parts = [r.street, r.streetNumber, r.city].filter(Boolean);
        setAddress(parts.join(', '));
      }
    } catch {
      // ignora
    } finally {
      setGeoLoading(false);
    }
  };

  const onMapPress = (e: MapPressEvent) => {
    // Tocco su un pin: l'evento della mappa arriva subito dopo quello del
    // marcatore, e senza questo controllo aprirebbe il foglio del posto
    // nuovo sopra all'anteprima appena aperta.
    if (Date.now() - toccoPin.current < 500) return;
    // Con un'anteprima aperta, toccare altrove la chiude e basta: è il
    // gesto che tutti si aspettano, e senza questo si finirebbe per
    // aprire il foglio di un posto nuovo ogni volta che si vuole
    // semplicemente togliere di mezzo la scheda.
    if (anteprima) {
      setAnteprima(null);
      return;
    }
    const { latitude, longitude } = e.nativeEvent.coordinate;
    openAddSheet(latitude, longitude);
  };

  // Su Google Maps i punti di interesse (ristoranti, negozi, ecc.) intercettano
  // il tocco e non fanno scattare onPress: serve gestirli con onPoiClick.
  const onPoiClick = (e: PoiClickEvent) => {
    // Stessa storia di `onMapPress`: un nostro pin appoggiato sopra a un
    // punto di interesse di Google farebbe scattare anche questo.
    if (Date.now() - toccoPin.current < 500) return;
    const { latitude, longitude } = e.nativeEvent.coordinate;
    openAddSheet(latitude, longitude, e.nativeEvent.name, e.nativeEvent.placeId);
  };

  const savePin = async () => {
    if (!pinName.trim()) {
      setNameError(true);
      return;
    }
    const catId = pinCat || categories[0]?.id;
    if (!pending || !session || !catId) return;
    try {
      const creato = await withTimeout(createPin(groupId, session.user.id, {
        lat: pending.lat,
        lng: pending.lng,
        name: pinName.trim(),
        categoryId: catId,
        mapsUrl: pending.placeId ? googleMapsPlaceUrl(pinName.trim(), pending.placeId) : null,
      }), WRITE_TIMEOUT);
      setSheetOpen(false);
      toast.show('Posto salvato');
      // Toccato un punto qualsiasi e scritto il nome: la scheda del luogo
      // la si cerca subito, in sottofondo, così "Portami lì" poi è
      // immediato. Se non va a buon fine ci riprova il pulsante stesso.
      if (!creato.mapsUrl) void linkPinToGooglePlace(creato.id);
    } catch {
      toast.show('Non sono riuscito a salvare il posto, riprova.');
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


  const filteredPins = filter === 'all' ? pins : pins.filter((p) => p.categoryId === filter);

  // Un segnaposto disegnato da noi viene riconvertito in immagine a ogni
  // fotogramma finché `tracksViewChanges` resta acceso, e con parecchi
  // posti la mappa comincia a scattare. Lo si tiene acceso il tempo di
  // disegnarli — spegnendolo subito uscirebbero vuoti — e poi si spegne.
  // Si riaccende quando l'insieme cambia: un posto nuovo, o un filtro
  // diverso, vanno pur disegnati.
  const [tracciaPin, setTracciaPin] = useState(true);
  useEffect(() => {
    setTracciaPin(true);
    const attesa = setTimeout(() => setTracciaPin(false), 900);
    return () => clearTimeout(attesa);
  }, [filteredPins.length, filter]);
  const sortedForList = [...filteredPins].sort((a, b) => b.ts - a.ts);
  const sectionsForList = categories
    .map((c) => ({
      category: c,
      title: c.name,
      data: sortedForList.filter((p) => p.categoryId === c.id),
    }))
    .filter((s) => s.data.length > 0);

  const focusPin = (p: RawPin) => {
    setMode('map');
    setTimeout(() => {
      mapRef.current?.animateToRegion({
        latitude: p.lat,
        longitude: p.lng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      });
    }, 80);
  };

  // Arrivo dalla targhetta di un link nella sezione Link: centra il posto e
  // ne apre la scheda. I posti possono non essere ancora caricati quando la
  // tab si monta, perciò l'effetto riscatta anche al variare di `pins`.
  useEffect(() => {
    if (!focusPinId) return;
    const target = pins.find((p) => p.id === focusPinId);
    if (!target) return;
    focusPin(target);
    setOpenPin(target);
    onFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPinId, pins]);

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.toggle, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Pressable
          onPress={() => setMode('map')}
          style={[styles.segBtn, mode === 'map' && { backgroundColor: colors.amber }]}
        >
          <Text style={{ fontSize: 12, fontWeight: mode === 'map' ? '700' : '500', color: mode === 'map' ? colors.inkOnAmber : colors.textDim }}>
            Mappa
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setMode('list');
            setAnteprima(null);
          }}
          style={[styles.segBtn, mode === 'list' && { backgroundColor: colors.amber }]}
        >
          <Text style={{ fontSize: 12, fontWeight: mode === 'list' ? '700' : '500', color: mode === 'list' ? colors.inkOnAmber : colors.textDim }}>
            Lista
          </Text>
        </Pressable>
      </View>

      {loadError ? <LoadError what="i posti" onRetry={loadAll} /> : null}

      <View style={[styles.filters, { borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <FilterChip label="Tutti" dotColor={colors.textFaint} active={filter === 'all'} onPress={() => setFilter('all')} />
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

      {mode === 'map' ? (
        <View style={{ flex: 1 }}>
          <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            initialRegion={ITALY_REGION}
            onPress={onMapPress}
            onPoiClick={onPoiClick}
            showsUserLocation={locationGranted}
            // Il pulsante di sistema esiste solo su Android e finirebbe
            // sotto al suggerimento in alto: ne usiamo uno nostro, uguale
            // sulle due piattaforme.
            showsMyLocationButton={false}
          >
            {filteredPins.map((p) => (
              // Niente `title` né `description`: darglieli farebbe
              // ricomparire la targhetta bianca di Google sopra al pin,
              // che è proprio quello che l'anteprima sostituisce.
              <Marker
                key={p.id}
                coordinate={{ latitude: p.lat, longitude: p.lng }}
                onPress={(e) => {
                  // `stopPropagation` da sola non basta su Android (l'evento
                  // della mappa parte lo stesso): il segnale vero è
                  // `toccoPin`, letto da `onMapPress`.
                  e.stopPropagation();
                  toccoPin.current = Date.now();
                  setAnteprima(p);
                }}
                tracksViewChanges={tracciaPin || anteprima?.id === p.id}
              >
                <MapPin
                  color={catFor(p.categoryId).color}
                  categoryName={catFor(p.categoryId).name}
                  selected={anteprima?.id === p.id}
                />
              </Marker>
            ))}
          </MapView>
          <View style={[styles.hint, { backgroundColor: colors.surface, borderColor: colors.border }]} pointerEvents="none">
            <Text style={{ fontSize: 11.5, color: colors.textDim }}>Tocca la mappa per aggiungere un posto</Text>
          </View>
          <Pressable
            onPress={centerOnMe}
            style={[styles.locateBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: locating ? 0.6 : 1 }]}
          >
            <LocateIcon size={20} color={locationGranted ? colors.amber : colors.textDim} />
          </Pressable>

          {/* L'anteprima si appoggia sopra la mappa invece di coprirla:
              sotto si continua a trascinare e a ingrandire, e toccando un
              altro pin cambia contenuto senza chiudersi. Per questo non è
              un BottomSheet ma una scheda appoggiata qui. */}
          {anteprima ? (
            <View style={[styles.anteprima, { backgroundColor: colors.surface }]}>
              <View style={styles.anteprimaCat}>
                <View style={[styles.anteprimaPunto, { backgroundColor: catFor(anteprima.categoryId).color }]} />
                <Text style={[styles.anteprimaCatNome, { color: catFor(anteprima.categoryId).color }]} numberOfLines={1}>
                  {catFor(anteprima.categoryId).name.toUpperCase()}
                </Text>
              </View>
              <Text style={[styles.anteprimaNome, { color: colors.text }]} numberOfLines={2}>
                {anteprima.name}
              </Text>
              <Text style={[styles.anteprimaMeta, { color: colors.textFaint }]} numberOfLines={1}>
                Aggiunto da {roster[anteprima.userId] ?? 'Utente'} · {dateLabel(anteprima.ts)}
              </Text>
              {linkIdsForPin(anteprima.id).length > 0 ? (
                <View style={[styles.anteprimaLink, { backgroundColor: colors.surface2 }]}>
                  <LinkIcon size={13} color={colors.textDim} strokeWidth={2} />
                  <Text style={{ fontSize: 11.5, fontWeight: '600', color: colors.textDim }}>
                    {linkIdsForPin(anteprima.id).length === 1
                      ? '1 link collegato'
                      : `${linkIdsForPin(anteprima.id).length} link collegati`}
                  </Text>
                </View>
              ) : null}
              <View style={styles.anteprimaAzioni}>
                <Pressable
                  onPress={() => {
                    const posto = anteprima;
                    setAnteprima(null);
                    setOpenPin(posto);
                  }}
                  style={[styles.anteprimaBtn, { backgroundColor: colors.surface2 }]}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>Apri</Text>
                </Pressable>
                <Pressable
                  onPress={() => void openPinInMaps(anteprima)}
                  style={[styles.anteprimaBtn, { backgroundColor: colors.amber }]}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.inkOnAmber }}>Portami lì</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      ) : sortedForList.length === 0 ? (
        <View style={styles.empty}>
          <MapIcon size={38} color={colors.textFaint} strokeWidth={1.6} />
          <Text style={[styles.emptyText, { color: colors.textFaint }]}>
            Nessun posto salvato qui. Tocca la mappa per aggiungerne uno.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sectionsForList}
          keyExtractor={(p) => p.id}
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
          renderItem={({ item }) => {
            const cat = catFor(item.categoryId);
            const linkCount = linkIdsForPin(item.id).length;
            return (
              <Pressable onPress={() => setOpenPin(item)} style={[styles.placeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.placeDot, { backgroundColor: cat.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '600', color: colors.text }}>{item.name}</Text>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: cat.color, marginTop: 2 }}>{cat.name}</Text>
                  <Text style={{ fontSize: 10.5, color: colors.textFaint, marginTop: 3 }}>
                    {roster[item.userId] ?? 'Utente'} · {dateLabel(item.ts)}
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
        onDelete={() => openPin && removePin(openPin.id)}
        onShowOnMap={() => {
          const target = openPin;
          setOpenPin(null);
          if (target) focusPin(target);
        }}
        onClose={() => setOpenPin(null)}
      />

      <BottomSheet visible={sheetOpen} onClose={() => setSheetOpen(false)}>
        <Text style={[styles.sheetTitle, { color: colors.text }]}>Nuovo posto</Text>
        <Text style={{ fontSize: 11, color: colors.textFaint, marginBottom: 4 }}>
          {pending ? `${pending.lat.toFixed(4)}, ${pending.lng.toFixed(4)}` : ''}
          {geoLoading ? '  · ricerca indirizzo…' : ''}
        </Text>
        {address ? <Text style={{ fontSize: 12.5, color: colors.textDim, marginBottom: 8 }}>{address}</Text> : null}
        <TextInput
          style={[styles.mInput, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text }]}
          placeholder="Nome del posto"
          placeholderTextColor={colors.textFaint}
          value={pinName}
          onChangeText={(t) => {
            setPinName(t);
            if (t.trim()) setNameError(false);
          }}
          maxLength={60}
        />
        {nameError ? <Text style={{ color: colors.danger, fontSize: 11.5, marginTop: -4, marginBottom: 8 }}>Dai un nome al posto prima di salvare.</Text> : null}
        <View style={styles.catRow}>
          {categories.map((c) => {
            const sel = pinCat === c.id;
            return (
              <Pressable
                key={c.id}
                onPress={() => setPinCat(c.id)}
                style={[styles.catOpt, { borderColor: sel ? c.color : colors.border, backgroundColor: sel ? colors.surface : colors.surface2 }]}
              >
                <View style={[styles.dot, { backgroundColor: c.color }]} />
                <Text style={{ fontSize: 12.5, color: sel ? colors.text : colors.textDim }}>{c.name}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.sheetActions}>
          <Pressable onPress={() => setSheetOpen(false)} style={[styles.btnSecondary, { backgroundColor: colors.surface2 }]}>
            <Text style={{ color: colors.textDim, fontWeight: '600' }}>Annulla</Text>
          </Pressable>
          <Pressable onPress={savePin} style={[styles.btnPrimary, { backgroundColor: colors.amber }]}>
            <Text style={{ color: colors.inkOnAmber, fontWeight: '700' }}>Salva posto</Text>
          </Pressable>
        </View>
      </BottomSheet>

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
  toggle: { flexDirection: 'row', borderWidth: 1, borderRadius: 999, padding: 3, marginHorizontal: 16, marginTop: 12 },
  segBtn: { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 999 },
  filters: { paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1 },
  // La scheda dell'anteprima: appoggiata sopra la mappa, non un foglio
  // che la copre. Le due ombre la staccano dal fondo anche quando sotto
  // ci passa una strada chiara.
  anteprima: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  anteprimaCat: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  anteprimaPunto: { width: 9, height: 9, borderRadius: 5 },
  anteprimaCatNome: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  anteprimaNome: { fontSize: 19, fontWeight: '700', letterSpacing: -0.3, marginTop: 5 },
  anteprimaMeta: { fontSize: 12, marginTop: 2 },
  anteprimaLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 9, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  anteprimaAzioni: { flexDirection: 'row', gap: 8, marginTop: 12 },
  anteprimaBtn: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12 },
  hint: { position: 'absolute', top: 10, alignSelf: 'center', borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  locateBtn: {
    position: 'absolute',
    right: 14,
    bottom: 18,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 30 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 18, marginBottom: 10 },
  emptyText: { fontSize: 13, textAlign: 'center', maxWidth: 240, lineHeight: 18 },
  placeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: RADIUS.md, padding: 12 },
  placeDot: { width: 14, height: 14, borderRadius: 3, transform: [{ rotate: '45deg' }] },
  linkCount: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
  mInput: { borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14.5, marginBottom: 10 },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  catOpt: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  btnSecondary: { flex: 1, paddingVertical: 12, borderRadius: RADIUS.sm, alignItems: 'center' },
  btnPrimary: { flex: 1, paddingVertical: 12, borderRadius: RADIUS.sm, alignItems: 'center' },
});
