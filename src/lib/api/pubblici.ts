import { supabase } from '@/lib/supabase';
import type { Group } from '@/types';

/**
 * Gruppi pubblici — vedi supabase/migrations/20261026090000_gruppi_pubblici.sql.
 *
 * Un gruppo pubblico si vede da fuori come lo vedono i membri, senza la
 * chat: l'intestazione arriva da qui (pagina_gruppo), salvati e posti li
 * leggono le sezioni con le loro funzioni di sempre, che le regole del
 * database lasciano leggere. Ricerca e profili danno solo nome, nome
 * utente e quanti sono gli altri membri, mai chi sono.
 */

/** La scheda di un gruppo pubblico, nei risultati e sul profilo. */
export interface GruppoPubblico {
  id: string;
  nome: string;
  colore: string;
  autore: { id: string; nome: string; nomeUtente: string };
  /** Gli altri membri: solo quanti sono, i nomi non si vedono da fuori. */
  altri: number;
  link: number;
  posti: number;
  startsOn: string | null;
  endsOn: string | null;
}

/** Una persona con almeno un gruppo pubblico: le altre non si trovano. */
export interface PersonaPubblica {
  id: string;
  nome: string;
  nomeUtente: string;
  gruppi: number;
}

/** L'intestazione di un gruppo pubblico per chi non ne fa parte. */
export interface PaginaGruppo {
  gruppo: Group;
  autore: { id: string; nome: string; nomeUtente: string };
  altri: number;
  /** Il nome della meta, anche quando è un posto della mappa. */
  metaNome: string | null;
}

interface RigaGruppo {
  id: string;
  nome: string;
  colore: string;
  autore_id: string;
  autore_nome: string;
  autore_nome_utente: string;
  altri: number;
  link: number;
  posti: number;
  starts_on: string | null;
  ends_on: string | null;
}

const scheda = (r: RigaGruppo): GruppoPubblico => ({
  id: r.id,
  nome: r.nome,
  colore: r.colore,
  autore: { id: r.autore_id, nome: r.autore_nome, nomeUtente: r.autore_nome_utente },
  altri: r.altri,
  link: r.link,
  posti: r.posti,
  startsOn: r.starts_on,
  endsOn: r.ends_on,
});

export async function cerca(testo: string): Promise<{ gruppi: GruppoPubblico[]; persone: PersonaPubblica[] }> {
  const q = testo.trim();
  if (q.replace(/^@/, '').length < 2) return { gruppi: [], persone: [] };
  const [gruppi, persone] = await Promise.all([
    supabase.rpc('cerca_gruppi_pubblici', { p_testo: q }),
    supabase.rpc('cerca_persone', { p_testo: q }),
  ]);
  if (gruppi.error) throw gruppi.error;
  if (persone.error) throw persone.error;
  return {
    gruppi: ((gruppi.data ?? []) as RigaGruppo[]).map(scheda),
    persone: ((persone.data ?? []) as { id: string; nome: string; nome_utente: string; gruppi: number }[]).map((p) => ({
      id: p.id,
      nome: p.nome,
      nomeUtente: p.nome_utente,
      gruppi: p.gruppi,
    })),
  };
}

export async function profiloPubblico(id: string): Promise<{ persona: PersonaPubblica; gruppi: GruppoPubblico[] } | null> {
  const { data, error } = await supabase.rpc('profilo_pubblico', { p_utente: id });
  if (error) throw error;
  if (!data) return null;
  const d = data as {
    persona: { id: string; nome: string; nome_utente: string };
    gruppi: Omit<RigaGruppo, 'autore_id' | 'autore_nome' | 'autore_nome_utente'>[];
  };
  const autore = { id: d.persona.id, nome: d.persona.nome, nomeUtente: d.persona.nome_utente };
  return {
    persona: { ...autore, gruppi: d.gruppi.length },
    gruppi: d.gruppi.map((g) => scheda({ ...g, autore_id: autore.id, autore_nome: autore.nome, autore_nome_utente: autore.nomeUtente })),
  };
}

export async function paginaGruppo(id: string): Promise<PaginaGruppo | null> {
  const { data, error } = await supabase.rpc('pagina_gruppo', { p_group_id: id });
  if (error) throw error;
  if (!data) return null;
  const d = data as {
    gruppo: {
      id: string;
      name: string;
      color: string | null;
      created_by: string;
      created_at: string;
      description: string | null;
      starts_on: string | null;
      ends_on: string | null;
      meta_nome: string | null;
      meta_lat: number | null;
      meta_lng: number | null;
      meta_maps_url: string | null;
      pubblico: boolean;
    };
    autore: { id: string; nome: string; nome_utente: string | null };
    altri: number;
  };
  const g = d.gruppo;
  return {
    gruppo: {
      id: g.id,
      name: g.name,
      color: g.color ?? '',
      createdBy: g.created_by,
      createdAt: new Date(g.created_at).getTime(),
      description: g.description,
      startsOn: g.starts_on,
      endsOn: g.ends_on,
      metaLibera:
        g.meta_nome && g.meta_lat != null && g.meta_lng != null && g.meta_maps_url
          ? { nome: g.meta_nome, lat: g.meta_lat, lng: g.meta_lng, mapsUrl: g.meta_maps_url }
          : null,
      pubblico: g.pubblico,
    },
    autore: { id: d.autore.id, nome: d.autore.nome, nomeUtente: d.autore.nome_utente ?? '' },
    altri: d.altri,
    metaNome: g.meta_nome,
  };
}

export async function nomeUtenteLibero(nome: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('nome_utente_libero', { p_nome: nome });
  if (error) throw error;
  return data === true;
}

/** Il proprio nome utente. Le regole (formato, unico) le controlla il
 * database: qui arriva già nella forma giusta (nomeUtente.ts). */
export async function scegliNomeUtente(nome: string): Promise<void> {
  const { data: sessione } = await supabase.auth.getSession();
  const io = sessione.session?.user.id;
  if (!io) throw new Error('not authenticated');
  const { error } = await supabase.from('profiles').update({ nome_utente: nome }).eq('id', io);
  if (error) throw error;
}

/** Rende pubblico o privato un gruppo: solo chi l'ha creato. Diventando
 * pubblico, gli altri membri ricevono un avviso. */
export async function rendiPubblico(groupId: string, pubblico: boolean): Promise<void> {
  const { error } = await supabase.rpc('rendi_pubblico', { p_group_id: groupId, p_pubblico: pubblico });
  if (error) throw error;
  if (pubblico) supabase.functions.invoke('notify-pubblico', { body: { groupId } }).catch(() => {});
}

export async function segnalaGruppo(groupId: string): Promise<void> {
  const { error } = await supabase.rpc('segnala_gruppo', { p_group_id: groupId, p_motivo: 'pagina pubblica' });
  if (error) throw error;
}
