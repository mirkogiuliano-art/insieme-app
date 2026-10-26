// Tutte le righe di una lettura, a pagine. PostgREST ne restituisce al
// massimo 1000 per richiesta e oltre tace: senza pagine, in un gruppo grande
// i file citati dopo la millesima riga sembrerebbero non usati da nessuno.
// La lettura deve avere un ordine stabile (`.order(...)`), o le pagine si
// sovrappongono.

const PAGINA = 1000;

export async function tutteLeRighe<T>(
  pagina: (da: number, a: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const righe: T[] = [];
  for (let da = 0; ; da += PAGINA) {
    const { data, error } = await pagina(da, da + PAGINA - 1);
    if (error) throw error;
    righe.push(...(data ?? []));
    if (!data || data.length < PAGINA) return righe;
  }
}
