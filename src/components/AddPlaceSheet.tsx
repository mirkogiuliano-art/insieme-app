import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import * as Location from 'expo-location';
import { BottomSheet } from '@/components/BottomSheet';
import { PlaceTile } from '@/components/MapPin';
import { useTheme, RADIUS } from '@/theme/theme';
import { SearchIcon, LocateIcon, MapIcon, BackIcon, CloseIcon, ChainIcon } from '@/components/Icon';
import { normalizeUrl, parseGoogleMapsUrl, distanceMeters, distanceLabel } from '@/lib/utils';
import { searchPlaces, type FoundPlace } from '@/lib/api/places';
import type { RawPlaceCategory } from '@/lib/api/placeCategories';

/** Un posto pronto per essere salvato, da qualunque strada arrivi. */
export interface PlaceCandidate {
  lat: number;
  lng: number;
  name?: string;
  /** Identificativo Google: c'è quando il posto viene dalla ricerca o dal
   * tocco sull'icona di un luogo, e fa aprire a "Portami lì" la scheda vera. */
  placeId?: string | null;
  address?: string;
  /** Il link di Maps incollato, tenuto com'è: apre già la scheda giusta. */
  mapsUrl?: string | null;
}

interface AddPlaceSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Se c'è, il foglio si apre direttamente sulla conferma (tocco sulla mappa). */
  initial: PlaceCandidate | null;
  categories: RawPlaceCategory[];
  /** Dove si trova chi cerca: i risultati vicini vengono prima. */
  near: { lat: number; lng: number } | null;
  /** Assente dove non c'è una mappa da toccare (web). */
  onPickOnMap?: () => void;
  getMyPosition: () => Promise<{ lat: number; lng: number } | null>;
  onSave: (candidate: PlaceCandidate, name: string, categoryId: string) => Promise<boolean>;
}

type Step = 'search' | 'form';
type SearchState = { status: 'idle' } | { status: 'loading' } | { status: 'done'; results: FoundPlace[] } | { status: 'error' };

/**
 * Le strade per aggiungere un posto, tutte in un foglio: cercarlo per nome,
 * la propria posizione, il tocco sulla mappa (come prima), un link di Maps.
 * Qualunque strada si prenda, si finisce sulla stessa conferma: nome e
 * categoria.
 */
export function AddPlaceSheet({
  visible,
  onClose,
  initial,
  categories,
  near,
  onPickOnMap,
  getMyPosition,
  onSave,
}: AddPlaceSheetProps) {
  const { colors } = useTheme();
  const [step, setStep] = useState<Step>('search');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchState>({ status: 'idle' });
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const [pasteError, setPasteError] = useState('');
  const [locating, setLocating] = useState(false);

  const [candidate, setCandidate] = useState<PlaceCandidate | null>(null);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState(false);
  /** Da dove si è arrivati alla conferma: dalla ricerca si può tornare
   * indietro, dal tocco sulla mappa no — non c'è un "indietro". */
  const [fromSearch, setFromSearch] = useState(false);

  const openForm = (c: PlaceCandidate, viaSearch: boolean) => {
    setCandidate(c);
    setName(c.name ?? '');
    setAddress(c.address ?? '');
    setNameError(false);
    setFromSearch(viaSearch);
    setStep('form');
    // Senza indirizzo (un punto toccato, la propria posizione) lo si chiede
    // al telefono: aiuta a riconoscere il posto e propone un nome.
    if (!c.address && Platform.OS !== 'web') {
      Location.reverseGeocodeAsync({ latitude: c.lat, longitude: c.lng })
        .then((results) => {
          const r = results[0];
          if (!r) return;
          if (!c.name) {
            const suggested = r.name || r.street || '';
            if (suggested) setName((prev) => prev || suggested);
          }
          setAddress([r.street, r.streetNumber, r.city].filter(Boolean).join(', '));
        })
        .catch(() => {});
    }
  };

  useEffect(() => {
    if (!visible) return;
    setCategoryId((prev) => (prev && categories.some((c) => c.id === prev) ? prev : (categories[0]?.id ?? '')));
    setQuery('');
    setSearch({ status: 'idle' });
    setPasting(false);
    setPasted('');
    setPasteError('');
    if (initial) openForm(initial, false);
    else setStep('search');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initial]);

  // Ricerca mentre si scrive, con una piccola attesa: una richiesta a
  // lettera costerebbe senza servire a niente.
  const ultima = useRef(0);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSearch({ status: 'idle' });
      return;
    }
    const mio = ++ultima.current;
    setSearch({ status: 'loading' });
    const timer = setTimeout(async () => {
      const results = await searchPlaces(q, near);
      // Arrivata tardi rispetto a una ricerca più recente: si butta.
      if (mio !== ultima.current) return;
      setSearch(results ? { status: 'done', results } : { status: 'error' });
    }, 450);
    return () => clearTimeout(timer);
    // `near` non riparte la ricerca: serve solo a ordinarla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const pickMyPosition = async () => {
    if (locating) return;
    setLocating(true);
    try {
      const pos = await getMyPosition();
      if (pos) openForm({ lat: pos.lat, lng: pos.lng }, true);
    } finally {
      setLocating(false);
    }
  };

  const applyPasted = () => {
    const url = normalizeUrl(pasted);
    const info = parseGoogleMapsUrl(url);
    if (!info) {
      setPasteError(
        /goo\.gl/.test(url)
          ? 'I link brevi di Maps (maps.app.goo.gl) non dicono dove si trova il posto. Cercalo per nome qui sopra: è più veloce.'
          : 'Da questo link non riesco a leggere la posizione. Prova a cercare il posto per nome.',
      );
      return;
    }
    openForm({ lat: info.lat, lng: info.lng, name: info.name ?? undefined, mapsUrl: url }, true);
  };

  const save = async () => {
    if (!candidate || saving) return;
    if (!name.trim()) {
      setNameError(true);
      return;
    }
    setSaving(true);
    try {
      if (await onSave(candidate, name.trim(), categoryId || categories[0]?.id || '')) onClose();
    } finally {
      setSaving(false);
    }
  };

  // ── Conferma ────────────────────────────────────────────────────

  if (step === 'form' && candidate) {
    const cat = categories.find((c) => c.id === categoryId);
    return (
      <BottomSheet visible={visible} onClose={onClose}>
        <View style={styles.titleRow}>
          {fromSearch ? (
            <Pressable onPress={() => setStep('search')} hitSlop={10}>
              <BackIcon size={20} color={colors.textDim} />
            </Pressable>
          ) : null}
          <Text style={[styles.title, { color: colors.text }]}>Nuovo posto</Text>
        </View>
        <Text style={[styles.where, { color: colors.textDim }]} numberOfLines={2}>
          {address || `${candidate.lat.toFixed(4)}, ${candidate.lng.toFixed(4)}`}
        </Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface2, borderWidth: nameError ? 1.5 : 0, borderColor: colors.danger, color: colors.text }]}
          placeholder="Nome del posto"
          placeholderTextColor={colors.textFaint}
          value={name}
          onChangeText={(t) => {
            setName(t);
            if (t.trim()) setNameError(false);
          }}
          maxLength={60}
        />
        {nameError ? <Text style={[styles.error, { color: colors.danger }]}>Dai un nome al posto prima di salvare.</Text> : null}
        <Text style={[styles.label, { color: colors.textFaint }]}>CATEGORIA</Text>
        <View style={styles.cats}>
          {categories.map((c) => {
            const on = categoryId === c.id;
            return (
              <Pressable
                key={c.id}
                onPress={() => setCategoryId(c.id)}
                style={[styles.cat, { backgroundColor: on ? c.color + '2E' : colors.surface2, borderColor: on ? c.color : 'transparent' }]}
              >
                <PlaceTile color={c.color} categoryName={c.name} size={20} />
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: on ? colors.text : colors.textDim }}>{c.name}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          onPress={save}
          disabled={saving}
          style={[styles.save, { backgroundColor: colors.amber, opacity: saving ? 0.6 : 1 }]}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.inkOnAmber} />
          ) : (
            <Text style={{ color: colors.inkOnAmber, fontWeight: '800', fontSize: 14 }}>
              Salva{cat ? ` in «${cat.name}»` : ' posto'}
            </Text>
          )}
        </Pressable>
      </BottomSheet>
    );
  }

  // ── Ricerca ─────────────────────────────────────────────────────

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={[styles.title, { color: colors.text, marginBottom: 12 }]}>Aggiungi un posto</Text>
      <View style={[styles.searchBox, { backgroundColor: colors.surface2 }]}>
        <SearchIcon size={16} color={colors.textFaint} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Cerca per nome: un museo, un ristorante, un indirizzo…"
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

      {search.status === 'loading' ? (
        <View style={styles.searchNote}>
          <ActivityIndicator size="small" color={colors.textDim} />
        </View>
      ) : search.status === 'error' ? (
        <Text style={[styles.searchNoteText, { color: colors.textDim }]}>La ricerca non è riuscita. Controlla la connessione e riprova.</Text>
      ) : search.status === 'done' && search.results.length === 0 ? (
        <Text style={[styles.searchNoteText, { color: colors.textDim }]}>Nessun posto trovato con questo nome.</Text>
      ) : search.status === 'done' ? (
        <View style={[styles.results, { backgroundColor: colors.surface2 }]}>
          {search.results.map((r, i) => (
            <Pressable
              key={r.placeId}
              onPress={() => openForm({ lat: r.lat, lng: r.lng, name: r.name, placeId: r.placeId, address: r.address }, true)}
              style={[styles.result, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
            >
              <MapIcon size={16} color={colors.teal} strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.resultName, { color: colors.text }]} numberOfLines={1}>
                  {r.name}
                </Text>
                <Text style={[styles.resultAddr, { color: colors.textFaint }]} numberOfLines={1}>
                  {r.address}
                </Text>
              </View>
              {near ? (
                <Text style={[styles.resultDist, { color: colors.textDim }]}>{distanceLabel(distanceMeters(near, r))}</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      <Text style={[styles.label, { color: colors.textFaint }]}>OPPURE</Text>
      <View style={styles.ways}>
        <Pressable onPress={pickMyPosition} disabled={locating} style={[styles.way, { backgroundColor: colors.surface2, opacity: locating ? 0.6 : 1 }]}>
          {locating ? <ActivityIndicator size="small" color={colors.textDim} /> : <LocateIcon size={20} color={colors.textDim} />}
          <Text style={[styles.wayText, { color: colors.textDim }]}>Dove sono</Text>
        </Pressable>
        {onPickOnMap ? (
          <Pressable onPress={onPickOnMap} style={[styles.way, { backgroundColor: colors.surface2 }]}>
            <MapIcon size={20} color={colors.textDim} />
            <Text style={[styles.wayText, { color: colors.textDim }]}>Tocca la mappa</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => setPasting((v) => !v)}
          style={[styles.way, { backgroundColor: pasting ? colors.amber + '26' : colors.surface2 }]}
        >
          <ChainIcon size={20} color={colors.textDim} />
          <Text style={[styles.wayText, { color: colors.textDim }]}>Link di Maps</Text>
        </Pressable>
      </View>

      {pasting ? (
        <View style={{ marginTop: 10 }}>
          <View style={styles.pasteRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0, backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text }]}
              placeholder="Incolla il link del posto da Google Maps"
              placeholderTextColor={colors.textFaint}
              value={pasted}
              onChangeText={(t) => {
                setPasted(t);
                setPasteError('');
              }}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={applyPasted}
            />
            <Pressable
              onPress={applyPasted}
              disabled={!pasted.trim()}
              style={[styles.pasteBtn, { backgroundColor: colors.amber, opacity: pasted.trim() ? 1 : 0.45 }]}
            >
              <Text style={{ color: colors.inkOnAmber, fontWeight: '800', fontSize: 13 }}>Usa</Text>
            </Pressable>
          </View>
          {pasteError ? <Text style={[styles.error, { color: colors.textDim, marginTop: 6 }]}>{pasteError}</Text> : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  where: { fontSize: 12.5, marginTop: 4, marginBottom: 12, lineHeight: 17 },
  input: { borderRadius: RADIUS.sm, paddingHorizontal: 13, paddingVertical: 13, fontSize: 14, marginBottom: 8 },
  error: { fontSize: 12, marginTop: -4, marginBottom: 6, lineHeight: 17 },
  label: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, marginTop: 14, marginBottom: 8 },
  cats: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  cat: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1.5, borderRadius: 999, paddingLeft: 6, paddingRight: 12, paddingVertical: 5 },
  save: { marginTop: 18, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: RADIUS.sm, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  searchNote: { paddingVertical: 14, alignItems: 'center' },
  searchNoteText: { fontSize: 12.5, marginTop: 10, lineHeight: 17 },
  results: { borderRadius: RADIUS.md, marginTop: 8, overflow: 'hidden' },
  result: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 10 },
  resultName: { fontSize: 14, fontWeight: '700' },
  resultAddr: { fontSize: 11.5, marginTop: 1 },
  resultDist: { fontSize: 11.5, fontWeight: '700' },
  ways: { flexDirection: 'row', gap: 8 },
  way: { flex: 1, height: 64, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', gap: 5 },
  wayText: { fontSize: 11.5, fontWeight: '700' },
  pasteRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  pasteBtn: { height: 44, paddingHorizontal: 16, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
});
