import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  SectionList,
} from 'react-native';
import { Pressable } from '@/components/Tocco';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useTabBarSpace } from '@/lib/tabBarSpace';
import { useTheme, RADIUS } from '@/theme/theme';
import { PlusIcon, LinkIcon, StarIcon, SearchIcon, CloseIcon, GridIcon, ListIcon, SortIcon, CheckIcon } from '@/components/Icon';
import { FilterChip } from '@/components/FilterChip';
import { BottomSheet } from '@/components/BottomSheet';
import { CategorySheet } from '@/components/CategorySheet';
import { AddLinkSheet } from '@/components/AddLinkSheet';
import { LinkActionsSheet } from '@/components/LinkActionsSheet';
import { LinkRow, LinkTile, type LinkedPlace } from '@/components/LinkCard';
import { LoadError } from '@/components/LoadError';
import { InCaricamento } from '@/components/InCaricamento';
import { PlacePickerSheet } from '@/components/PlacePickerSheet';
import {
  platformInfo,
  normalizeUrl,
  parseGoogleMapsUrl,
  fileLabelFor,
  withTimeout,
  WRITE_TIMEOUT,
  UPLOAD_TIMEOUT,
  type MapsPlaceInfo,
} from '@/lib/utils';
import { useAuth } from '@/lib/authStore';
import { useToast } from '@/components/Toast';
import {
  listCategories,
  createCategory,
  renameCategory,
  recolorCategory,
  deleteCategory,
  subscribeToCategories,
  type RawLinkCategory,
} from '@/lib/api/linkCategories';
import {
  listLinks,
  createLink,
  deleteLink,
  setFavorite,
  setLinkCategory,
  subscribeToLinks,
  type RawLink,
} from '@/lib/api/links';
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
import { uploadGroupMedia, uploadGroupFile, sweepGroupMedia } from '@/lib/api/mediaUpload';
import { storage } from '@/lib/storage';
import { getLinkPreview } from '@/lib/api/linkPreviews';
import { sendMessage } from '@/lib/api/messages';
import { avvisaDelMessaggio } from '@/lib/api/push';
import { colorForUser } from '@/lib/utils';
import { CATEGORY_PALETTE } from '@/types';
import { useT, dizionario } from '@/i18n';
import { segnalaErrore } from '@/lib/sentry';
import { messaggioErrore, eProblemaDiRete } from '@/lib/errori';
import { leggiCopia, salvaCopia, useRiprovaDaSola } from '@/lib/copiaLocale';
import type { CopiaLink } from '@/lib/precarica';
import { SenzaRete } from '@/components/SenzaRete';

interface LinksTabProps {
  groupId: string;
  roster: Record<string, string>;
  /** Passa alla sezione Mappa centrata su quel posto. */
  onShowPlaceOnMap?: (pinId: string) => void;
}

/** La categoria di un posto che non ne ha più una: il nome segue la
 * lingua, quindi si calcola al momento e non una volta sola. */
const categoriaSenzaNome = () => ({ name: dizionario().segnaposto.altro, color: '#75828C' });

/** Come si guardano i link: righe con miniatura, o riquadri a due colonne.
 * È una preferenza di chi guarda, non del gruppo: sta sul telefono. */
type LinksView = 'list' | 'grid';
const VIEW_KEY = 'linksView';

/** In che ordine si vedono i link. Anche questa è una preferenza di chi
 * guarda, salvata sul telefono. */
type LinksSort = 'recent' | 'oldest' | 'title' | 'person';
const SORT_KEY = 'linksSort';
const SORT_ORDER: LinksSort[] = ['recent', 'oldest', 'title', 'person'];

/** Spezza un elenco in coppie, per la griglia a due colonne. */
function pairs<T>(list: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += 2) out.push(list.slice(i, i + 2));
  return out;
}

export function LinksTab({ groupId, roster, onShowPlaceOnMap }: LinksTabProps) {
  const { colors } = useTheme();
  const t = useT();
  const SORT_LABELS: Record<LinksSort, string> = {
    recent: t.link.ordineRecente,
    oldest: t.link.ordineVecchio,
    title: t.link.ordineTitolo,
    person: t.link.ordinePersona,
  };
  const tabBarSpace = useTabBarSpace();
  const { session } = useAuth();
  const toast = useToast();

  const [categories, setCategories] = useState<RawLinkCategory[]>([]);
  const [items, setItems] = useState<RawLink[]>([]);
  const [filter, setFilter] = useState<string>('all');

  const [query, setQuery] = useState('');
  const [view, setView] = useState<LinksView>('list');
  const [addOpen, setAddOpen] = useState(false);
  const [sort, setSort] = useState<LinksSort>('recent');
  const [sortOpen, setSortOpen] = useState(false);
  /** Il link di cui è aperto il menu delle azioni. */
  const [menuFor, setMenuFor] = useState<RawLink | null>(null);
  /** I titoli veri delle pagine, per la ricerca. Un link salvato senza
   * titolo si chiama "YouTube" o col nome del sito: senza questi, cercando
   * "kyoto" non si troverebbe il video su Kyoto. Le anteprime sono in
   * cache — le stesse che mostrano le schede — quindi costano poco. */
  const [pageTitles, setPageTitles] = useState<Record<string, string>>({});

  const [catModalOpen, setCatModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const [manageCat, setManageCat] = useState<RawLinkCategory | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [loadError, setLoadError] = useState(false);
  /** Da quando si vede la copia salvata, se il server non ha risposto. */
  const [offlineDal, setOfflineDal] = useState<number | null>(null);
  /** Finita la prima lettura, dal server o dalla copia. Prima, una
   * sezione senza niente sta ancora leggendo, non è vuota. */
  const [letto, setLetto] = useState(false);

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
  /** Arrivati i dati veri, la copia non deve più sovrascriverli. */
  const daServer = useRef(false);
  const mostraCopia = (c: CopiaLink) => {
    setCategories((p) => (p.length > 0 ? p : c.cats));
    setItems((p) => (p.length > 0 ? p : c.links));
    setPins((p) => (p.length > 0 ? p : c.pinList));
    setPlaceCategories((p) => (p.length > 0 ? p : c.placeCats));
    setPlaceLinks((p) => (p.length > 0 ? p : c.pl));
  };
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
      setItems(links);
      setPins(pinList);
      setPlaceCategories(placeCats);
      setPlaceLinks(pl);
      setLoadError(false);
      daServer.current = true;
      setOfflineDal(null);
      salvaCopia<CopiaLink>(session?.user.id, `link:${groupId}`, { cats, links, pinList, placeCats, pl });
    } catch (err) {
      if (!eProblemaDiRete(err)) segnalaErrore(err, 'caricamento.link');
      const copia = await leggiCopia<CopiaLink>(session?.user.id, `link:${groupId}`);
      if (copia) {
        mostraCopia(copia.dati);
        setOfflineDal(copia.ts);
        setLoadError(false);
      } else {
        setLoadError(true);
      }
    }
    setLetto(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, session?.user.id]);

  useRiprovaDaSola(loadError || offlineDal !== null, loadAll);

  useEffect(() => {
    storage.get<LinksView>(VIEW_KEY).then((v) => {
      if (v === 'list' || v === 'grid') setView(v);
    });
    storage.get<LinksSort>(SORT_KEY).then((v) => {
      if (v && v in SORT_LABELS) setSort(v);
    });
  }, []);

  useEffect(() => {
    let alive = true;
    const web = items.filter((it) => it.platform !== 'image' && it.platform !== 'video' && it.platform !== 'file');
    Promise.all(web.map((it) => getLinkPreview(it.url).then((p) => [it.url, p?.title ?? ''] as const))).then((found) => {
      if (!alive) return;
      setPageTitles(Object.fromEntries(found.filter(([, t]) => t)));
    });
    return () => {
      alive = false;
    };
  }, [items]);

  const chooseSort = (next: LinksSort) => {
    setSort(next);
    storage.set(SORT_KEY, next);
    setSortOpen(false);
  };

  /** Manda un link nella chat del gruppo. Foto, video e documenti caricati
   * arrivano come allegati veri — con anteprima e lettore — e non come un
   * indirizzo del deposito che nessuno saprebbe leggere. */
  const sendToChat = async (link: RawLink, note: string): Promise<boolean> => {
    if (!session) return false;
    const text = note.trim();
    try {
      const attachment =
        link.platform === 'image' || link.platform === 'video'
          ? { url: link.url, type: link.platform }
          : link.platform === 'file'
            ? { url: link.url, type: 'file' as const, name: link.title }
            : null;
      const body = attachment ? text || null : text ? `${text}\n${link.url}` : link.url;
      const sent = await withTimeout(sendMessage(groupId, session.user.id, body, null, attachment), WRITE_TIMEOUT);
      avvisaDelMessaggio(sent.id);
      toast.show(t.link.mandato);
      return true;
    } catch (err) {
      segnalaErrore(err, 'link.erroreChat');
      toast.show(t.link.erroreChat, 'error');
      return false;
    }
  };

  const toggleView = () => {
    const next: LinksView = view === 'list' ? 'grid' : 'list';
    setView(next);
    storage.set(VIEW_KEY, next);
  };

  useEffect(() => {
    daServer.current = false;
    // La copia dell'ultima volta compare subito; i dati veri la
    // sostituiscono appena arrivano. Con la rete lenta o assente si vede
    // comunque qualcosa.
    leggiCopia<CopiaLink>(session?.user.id, `link:${groupId}`).then((copia) => {
      if (copia && !daServer.current) {
        mostraCopia(copia.dati);
        setLetto(true);
      }
    });
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

  /** Salva un indirizzo. Restituisce `true` se è andato a buon fine, così
   * il foglio "Aggiungi" sa se chiudersi o restare aperto col testo. */
  const addLink = async (url: string, title: string, categoryId: string): Promise<boolean> => {
    if (!url.trim() || !session) return false;
    const normalized = normalizeUrl(url);
    let info;
    try {
      // eslint-disable-next-line no-new
      new URL(normalized);
      info = platformInfo(normalized);
    } catch {
      toast.show(t.link.urlNonValido, 'hint');
      return false;
    }
    const catId = categoryId || categories[0]?.id;
    if (!catId) return false;
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
      if (maps) {
        setMapsPromptCat(placeCategories[0]?.id ?? '');
        setMapsPrompt({ info: maps, linkId: created.id, url: normalized });
      }
      return true;
    } catch (err) {
      segnalaErrore(err, 'link.erroreSalva');
      toast.show(t.link.erroreSalva, 'error');
      return false;
    }
  };

  const placeCatFor = (pin: RawPin) =>
    placeCategories.find((c) => c.id === pin.categoryId) ?? categoriaSenzaNome();

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
    } catch (err) {
      segnalaErrore(err, 'link.erroreCollegamento');
      toast.show(t.link.erroreCollegamento, 'error');
    }
  };

  /** Crea il posto estratto dal link di Maps e lo collega subito al link. */
  const savePlaceFromMaps = async () => {
    if (!mapsPrompt || !session || savingPlace) return;
    const catId = mapsPromptCat || placeCategories[0]?.id;
    if (!catId) {
      toast.show(t.link.serveCategoriaPosti, 'hint');
      return;
    }
    setSavingPlace(true);
    let pinId: string;
    try {
      const pin = await withTimeout(createPin(groupId, session.user.id, {
        lat: mapsPrompt.info.lat,
        lng: mapsPrompt.info.lng,
        name: mapsPrompt.info.name || t.link.postoDaMaps,
        categoryId: catId,
        // Il link incollato apre già la scheda del luogo: lo teniamo com'è.
        mapsUrl: mapsPrompt.url,
      }), WRITE_TIMEOUT);
      pinId = pin.id;
    } catch (err) {
      segnalaErrore(err, 'link.errorePosto');
      toast.show(t.link.errorePosto, 'error');
      setSavingPlace(false);
      return;
    }
    // Il posto ormai esiste: se il collegamento fallisce va detto, ma non
    // si torna indietro — il posto resta salvato ed è ricollegabile a mano.
    try {
      await withTimeout(createPlaceLink(groupId, session.user.id, pinId, mapsPrompt.linkId), WRITE_TIMEOUT);
      toast.show(t.link.postoSalvato);
    } catch {
      toast.show(t.link.postoSenzaLink, 'hint');
    } finally {
      setMapsPrompt(null);
      setSavingPlace(false);
    }
  };

  const pickFile = async (mediaType: 'images' | 'videos', title: string, categoryId: string): Promise<boolean> => {
    if (!session || uploadingFile) return false;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.show(t.link.permessoFile, 'hint');
      return false;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: [mediaType], quality: 0.7 });
    const asset = result.canceled ? null : result.assets?.[0];
    if (!asset) return false;
    const catId = categoryId || categories[0]?.id;
    if (!catId) return false;

    const kind: 'image' | 'video' = asset.type === 'video' ? 'video' : 'image';
    setUploadingFile(true);
    try {
      const uploadedUrl = await withTimeout(uploadGroupMedia(groupId, asset.uri), UPLOAD_TIMEOUT);
      await withTimeout(createLink(groupId, session.user.id, {
        url: uploadedUrl,
        title: title.trim() || (kind === 'video' ? t.segnaposto.video : t.segnaposto.foto),
        platform: kind,
        label: kind === 'video' ? t.segnaposto.video : t.segnaposto.foto,
        thumb: kind === 'image' ? uploadedUrl : null,
        categoryId: catId,
      }), WRITE_TIMEOUT);
      return true;
    } catch (err) {
      segnalaErrore(err, 'link.erroreCaricamentoFile');
      toast.show(t.link.erroreCaricamentoFile, 'error');
      return false;
    } finally {
      setUploadingFile(false);
    }
  };

  /** Documenti (PDF, Word, Excel, ...): stesso flusso di `pickFile`, ma dal
   * selettore di file di sistema — che a differenza della galleria foto non
   * richiede un permesso da chiedere prima. Il nome scelto va nel titolo
   * (come "Foto"/"Video" per gli altri allegati, ma qui è l'unica cosa
   * leggibile: non c'è un'anteprima da mostrare al suo posto). */
  const pickDocument = async (title: string, categoryId: string): Promise<boolean> => {
    if (!session || uploadingFile) return false;
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    const asset = result.canceled ? null : result.assets?.[0];
    if (!asset) return false;
    const catId = categoryId || categories[0]?.id;
    if (!catId) return false;

    setUploadingFile(true);
    try {
      const uploadedUrl = await withTimeout(uploadGroupFile(groupId, asset), UPLOAD_TIMEOUT);
      await withTimeout(createLink(groupId, session.user.id, {
        url: uploadedUrl,
        title: title.trim() || asset.name,
        platform: 'file',
        label: fileLabelFor(asset.name),
        thumb: null,
        categoryId: catId,
      }), WRITE_TIMEOUT);
      return true;
    } catch (err) {
      segnalaErrore(err, 'link.erroreCaricamentoDoc');
      toast.show(t.link.erroreCaricamentoDoc, 'error');
      return false;
    } finally {
      setUploadingFile(false);
    }
  };

  /** Preferito condiviso: nessun aggiornamento ottimistico locale, si
   * aspetta l'eco dalla sottoscrizione realtime — stesso schema già usato
   * per le reazioni ai messaggi, che aggiornano lo stato solo da lì. */
  const toggleFavorite = async (link: RawLink) => {
    try {
      await withTimeout(setFavorite(link.id, !link.isFavorite), WRITE_TIMEOUT);
    } catch (err) {
      segnalaErrore(err, 'link.errorePreferito');
      toast.show(t.link.errorePreferito, 'error');
    }
  };

  const moveLink = async (link: RawLink, categoryId: string) => {
    try {
      await withTimeout(setLinkCategory(link.id, categoryId), WRITE_TIMEOUT);
      const cat = categories.find((c) => c.id === categoryId);
      toast.show(cat ? t.link.spostatoIn(cat.name) : t.link.spostato);
    } catch (err) {
      segnalaErrore(err, 'link.erroreSposta');
      toast.show(t.link.erroreSposta, 'error');
    }
  };

  const removeLink = async (id: string) => {
    try {
      await deleteLink(id);
      // Se il link era una foto o un video caricati, il file resterebbe
      // nel deposito: la spazzata lo toglie di mezzo.
      sweepGroupMedia(groupId);
    } catch (err) {
      segnalaErrore(err, 'link.erroreElimina');
      toast.show(t.link.erroreElimina, 'error');
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
      setFilter(cat.id);
      setNewCatName('');
      setCatModalOpen(false);
    } catch (err) {
      segnalaErrore(err, 'link.erroreCreaCategoria');
      toast.show(t.link.erroreCreaCategoria, 'error');
    }
  };

  const openManageCat = (cat: RawLinkCategory) => {
    setManageCat(cat);
  };

  const closeManageCat = () => {
    setManageCat(null);
  };

  const saveRename = async (name: string, color: string) => {
    if (!manageCat) return;
    try {
      if (name !== manageCat.name) await renameCategory(manageCat.id, name);
      if (color && color !== manageCat.color) await recolorCategory(manageCat.id, color);
      closeManageCat();
    } catch (err) {
      segnalaErrore(err, 'link.erroreSalvaCategoria');
      toast.show(t.link.erroreSalvaCategoria, 'error');
    }
  };

  const runDeleteCategory = async () => {
    if (!manageCat) return;
    try {
      await deleteCategory(manageCat.id);
      if (filter === manageCat.id) setFilter('all');
      closeManageCat();
    } catch (err) {
      segnalaErrore(err, 'link.erroreEliminaCategoria');
      toast.show(messaggioErrore(err, t.link.erroreEliminaCategoria), 'error');
    }
  };


  const term = query.trim().toLowerCase();
  const filtered = items
    .filter((it) =>
      filter === 'all' ? true : filter === 'favorites' ? it.isFavorite : it.categoryId === filter,
    )
    // La ricerca guarda il titolo, la piattaforma e il sito: "youtube",
    // "pdf" o "booking" trovano quello che ci si aspetta.
    .filter(
      (it) =>
        !term ||
        it.title.toLowerCase().includes(term) ||
        (pageTitles[it.url] ?? '').toLowerCase().includes(term) ||
        it.label.toLowerCase().includes(term) ||
        it.url.toLowerCase().includes(term),
    );

  const displayTitle = (it: RawLink) => pageTitles[it.url] || it.title;
  const authorOf = (it: RawLink) => roster[it.userId] ?? t.segnaposto.utente;
  filtered.sort((a, b) => {
    switch (sort) {
      case 'oldest':
        return a.ts - b.ts;
      case 'title':
        return displayTitle(a).localeCompare(displayTitle(b), 'it', { sensitivity: 'base' });
      case 'person':
        return authorOf(a).localeCompare(authorOf(b), 'it', { sensitivity: 'base' }) || b.ts - a.ts;
      default:
        return b.ts - a.ts;
    }
  });

  /**
   * La categoria compare una volta sola. Con "Tutti" l'elenco si divide in
   * sezioni col nome della categoria; dentro una categoria, con i preferiti
   * o durante una ricerca, è un elenco unico senza intestazioni — il nome
   * sta già nel filtro scelto.
   */
  const grouped = filter === 'all' && !term;
  type Section = { key: string; heading: { name: string; color: string } | null; items: RawLink[] };
  // Ordinando per persona, le sezioni sono le persone invece delle
  // categorie: "tutto quello che ha salvato Teodora".
  const people = Array.from(new Set(filtered.map(authorOf)));
  const sections: Section[] = !grouped
    ? [{ key: 'tutti', heading: null, items: filtered }]
    : sort === 'person'
      ? people.map((name) => ({
          key: 'p:' + name,
          heading: { name, color: colorForUser(name) },
          items: filtered.filter((it) => authorOf(it) === name),
        }))
      : [
          ...categories.map((c) => ({ key: c.id, heading: { name: c.name, color: c.color }, items: filtered.filter((it) => it.categoryId === c.id) })),
          // I link la cui categoria non c'è più (il database li lascia senza
          // quando una categoria sparisce mentre qualcuno ci salvava un
          // link): senza questa sezione non si vedrebbero da nessuna parte.
          {
            key: 'senza-categoria',
            heading: categoriaSenzaNome(),
            items: filtered.filter((it) => !categories.some((c) => c.id === it.categoryId)),
          },
        ].filter((s) => s.items.length > 0);
  const listSections = sections.map((s) => ({
    key: s.key,
    heading: s.heading,
    count: s.items.length,
    // Nella griglia ogni riga dell'elenco porta due link.
    data: view === 'grid' ? pairs(s.items) : s.items.map((it) => [it]),
  }));

  const savedUrls = useMemo(() => new Set(items.map((it) => it.url)), [items]);

  const placesFor = (linkId: string): LinkedPlace[] =>
    pinIdsForLink(linkId)
      .map((pinId) => pins.find((p) => p.id === pinId))
      .filter((p): p is RawPin => !!p)
      .map((p) => ({ id: p.id, name: p.name, color: placeCatFor(p).color }));

  const cardProps = (item: RawLink) => ({
    item,
    addedBy: roster[item.userId] ?? t.segnaposto.utente,
    places: placesFor(item.id),
    onOpenMenu: () => setMenuFor(item),
    onShowPlace: (pinId: string) => onShowPlaceOnMap?.(pinId),
  });

  const renderRow = ({ item: row }: { item: RawLink[] }) =>
    view === 'grid' ? (
      <View style={styles.gridRow}>
        <LinkTile {...cardProps(row[0])} />
        {row[1] ? <LinkTile {...cardProps(row[1])} /> : <View style={{ flex: 1 }} />}
      </View>
    ) : (
      <LinkRow {...cardProps(row[0])} />
    );

  return (
    <View style={{ flex: 1 }}>
      {/* Il modulo per aggiungere non occupa più la pagina: si apre dal
          pulsante, e qui restano la ricerca e il modo di guardare. */}
      <View style={styles.topBar}>
        <View style={[styles.search, { backgroundColor: colors.surface }]}>
          <SearchIcon size={15} color={colors.textFaint} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder={items.length > 0 ? t.link.cercaFra(items.length) : t.link.cerca}
            placeholderTextColor={colors.textFaint}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t.accessibilita.cancellaRicerca} onPress={() => setQuery('')} hitSlop={8}>
              <CloseIcon size={13} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
        <Pressable accessibilityRole="button"
          onPress={toggleView}
          hitSlop={4}
          style={[styles.viewBtn, { backgroundColor: colors.surface }]}
          accessibilityLabel={view === 'list' ? t.link.griglia : t.link.elenco}
        >
          {view === 'list' ? <GridIcon size={17} color={colors.textDim} /> : <ListIcon size={17} color={colors.textDim} />}
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setAddOpen(true)} style={[styles.addBtn, { backgroundColor: colors.amber }]}>
          <PlusIcon size={13} color={colors.inkOnAmber} />
          <Text style={{ color: colors.inkOnAmber, fontWeight: '800', fontSize: 13 }}>{t.link.aggiungi}</Text>
        </Pressable>
      </View>

      <View style={styles.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
          <FilterChip
            label={SORT_LABELS[sort]}
            icon={<SortIcon size={12} color={colors.textDim} />}
            onPress={() => setSortOpen(true)}
          />
          <View style={[styles.chipDivider, { backgroundColor: colors.border }]} />
          <FilterChip label={t.link.tutti} active={filter === 'all'} onPress={() => setFilter('all')} />
          <FilterChip
            label={t.link.preferiti}
            icon={<StarIcon size={12} color={colors.amberText} filled={filter === 'favorites'} />}
            active={filter === 'favorites'}
            onPress={() => setFilter('favorites')}
          />
          {categories.map((c) => (
            <FilterChip
              key={c.id}
              label={c.name}
              dotColor={c.color}
              active={filter === c.id}
              onPress={() => setFilter(c.id)}
              // La matita solo sulla categoria scelta: su tutte era rumore.
              onEdit={filter === c.id ? () => openManageCat(c) : undefined}
            />
          ))}
          <FilterChip label={t.link.nuovaCategoriaChip} dashed onPress={() => setCatModalOpen(true)} />
        </ScrollView>
      </View>

      {offlineDal ? (
        <SenzaRete dal={offlineDal} onRetry={loadAll} />
      ) : loadError ? (
        <LoadError what={t.erroreCaricamento.link} onRetry={loadAll} />
      ) : null}

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          {/* Con l’avviso d’errore sopra, «non c’è niente» sarebbe falso. */}
          {loadError ? null : !letto ? (
            <InCaricamento />
          ) : (
            <>
              {term ? (
                <>
                  <SearchIcon size={34} color={colors.textFaint} strokeWidth={1.6} />
                  <Text style={[styles.emptyText, { color: colors.textFaint }]}>{t.link.nessunoConTesto(query.trim())}</Text>
                </>
              ) : filter === 'favorites' ? (
                <>
                  <StarIcon size={38} color={colors.textFaint} strokeWidth={1.6} />
                  <Text style={[styles.emptyText, { color: colors.textFaint }]}>
                    {t.link.nessunPreferito}
                  </Text>
                </>
              ) : (
                <>
                  <LinkIcon size={38} color={colors.textFaint} strokeWidth={1.6} />
                  <Text style={[styles.emptyText, { color: colors.textFaint }]}>
                    {t.link.vuoto}
                  </Text>
                </>
              )}
            </>
          )}
        </View>
      ) : (
        <SectionList
          // Cambiando vista cambia la forma delle righe: meglio ricominciare
          // da capo che riciclare righe della forma sbagliata.
          key={view}
          sections={listSections}
          keyExtractor={(row) => row.map((it) => it.id).join('+')}
          renderItem={renderRow}
          // La lista scorre fin sotto la barra delle sezioni, ma l'ultimo
          // link si ferma sopra di lei.
          contentContainerStyle={[styles.listContent, { paddingBottom: 20 + tabBarSpace }]}
          stickySectionHeadersEnabled={false}
          ItemSeparatorComponent={() =>
            view === 'grid' ? <View style={{ height: 16 }} /> : <View style={[styles.rowSep, { backgroundColor: colors.border }]} />
          }
          renderSectionHeader={({ section }) =>
            section.heading ? (
              <View style={styles.sectionHeader}>
                <View style={[styles.dot, { backgroundColor: section.heading.color }]} />
                <Text style={[styles.sectionTitle, { color: colors.textDim }]}>{section.heading.name}</Text>
                <Text style={[styles.sectionCount, { color: colors.textFaint }]}>{section.count}</Text>
              </View>
            ) : null
          }
        />
      )}

      <BottomSheet visible={catModalOpen} onClose={() => setCatModalOpen(false)}>
        <Text style={[styles.sheetTitle, { color: colors.text }]}>{t.link.nuovaCategoria}</Text>
        <Text style={[styles.sheetSub, { color: colors.textDim }]}>
          {t.link.nuovaCategoriaTesto}
        </Text>
        <TextInput
          style={[styles.mInput, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text }]}
          placeholder={t.link.esempioCategoria}
          placeholderTextColor={colors.textFaint}
          value={newCatName}
          onChangeText={setNewCatName}
          maxLength={24}
          onSubmitEditing={createCat}
        />
        <View style={styles.sheetActions}>
          <Pressable accessibilityRole="button" onPress={() => setCatModalOpen(false)} style={[styles.btnSecondary, { backgroundColor: colors.surface2 }]}>
            <Text style={{ color: colors.textDim, fontWeight: '600' }}>{t.comune.annulla}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={createCat} style={[styles.btnPrimary, { backgroundColor: colors.amber }]}>
            <Text style={{ color: colors.inkOnAmber, fontWeight: '700' }}>{t.link.crea}</Text>
          </Pressable>
        </View>
      </BottomSheet>

      <CategorySheet
        category={manageCat}
        itemCount={manageCat ? items.filter((x) => x.categoryId === manageCat.id).length : 0}
        itemLabel={t.categoria.link}
        fallbackName={categories.find((x) => x.id !== manageCat?.id)?.name ?? ''}
        canDelete={!!manageCat && !manageCat.predefinita && categories.length > 1}
        onSave={saveRename}
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
            <Text style={[styles.sheetTitle, { color: colors.text }]}>{t.link.mapsTitolo}</Text>
            <Text style={[styles.sheetSub, { color: colors.textDim }]}>
              {mapsPrompt.info.name ? `"${mapsPrompt.info.name}" — ` : ''}
              {mapsPrompt.info.lat.toFixed(4)}, {mapsPrompt.info.lng.toFixed(4)}.
              {'\n'}
              {t.link.mapsDomanda}
            </Text>
            {placeCategories.length > 0 ? (
              <View style={styles.catRow}>
                {placeCategories.map((c) => {
                  const sel = mapsPromptCat === c.id;
                  return (
                    <Pressable accessibilityRole="button"
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
              <Pressable accessibilityRole="button" onPress={() => setMapsPrompt(null)} style={[styles.btnSecondary, { backgroundColor: colors.surface2 }]}>
                <Text style={{ color: colors.textDim, fontWeight: '600' }}>{t.link.noGrazie}</Text>
              </Pressable>
              <Pressable accessibilityRole="button"
                onPress={savePlaceFromMaps}
                disabled={savingPlace}
                style={[styles.btnPrimary, { backgroundColor: colors.amber, opacity: savingPlace ? 0.6 : 1 }]}
              >
                <Text style={{ color: colors.inkOnAmber, fontWeight: '700' }}>{t.link.siSalva}</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </BottomSheet>

      <AddLinkSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        categories={categories}
        savedUrls={savedUrls}
        uploading={uploadingFile}
        onSaveUrl={addLink}
        onPickMedia={pickFile}
        onPickDocument={pickDocument}
      />

      <LinkActionsSheet
        link={menuFor}
        categories={categories}
        onClose={() => setMenuFor(null)}
        onToggleFavorite={toggleFavorite}
        onPickPlace={(link) => setPickerLink(link)}
        onMove={moveLink}
        onDelete={(link) => removeLink(link.id)}
        onSendToChat={sendToChat}
      />

      <BottomSheet visible={sortOpen} onClose={() => setSortOpen(false)}>
        <Text style={[styles.sheetTitle, { color: colors.text, marginBottom: 8 }]}>{t.link.ordinaPer}</Text>
        {(Object.keys(SORT_LABELS) as LinksSort[]).map((k, i) => (
          <Pressable accessibilityRole="button"
            key={k}
            onPress={() => chooseSort(k)}
            style={[styles.sortRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
          >
            <Text style={[styles.sortLabel, { color: colors.text, fontWeight: sort === k ? '800' : '600' }]}>{SORT_LABELS[k]}</Text>
            {sort === k ? <CheckIcon size={17} color={colors.amberText} /> : null}
          </Pressable>
        ))}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  search: { flex: 1, height: 40, borderRadius: RADIUS.sm, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 13.5, paddingVertical: 0 },
  viewBtn: { width: 40, height: 40, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  addBtn: { height: 40, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, borderRadius: 999 },
  filters: { paddingBottom: 6 },
  chipDivider: { width: 1, alignSelf: 'stretch', marginVertical: 6, marginRight: 8 },
  sortRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  sortLabel: { flex: 1, fontSize: 15 },
  listContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 20 },
  gridRow: { flexDirection: 'row', gap: 12 },
  rowSep: { height: 1, marginLeft: 80 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 14, marginBottom: 8 },
  sectionTitle: { flex: 1, fontSize: 11.5, fontWeight: '800' },
  sectionCount: { fontSize: 11.5, fontWeight: '700' },
  catPick: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7, marginRight: 7 },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 30 },
  emptyText: { fontSize: 13, textAlign: 'center', maxWidth: 260, lineHeight: 18 },
  sheetTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, marginBottom: 2 },
  sheetSub: { fontSize: 12.5, marginBottom: 12, lineHeight: 18 },
  mInput: { borderRadius: RADIUS.sm, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14.5, marginBottom: 10 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btnSecondary: { flex: 1, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { flex: 1, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
