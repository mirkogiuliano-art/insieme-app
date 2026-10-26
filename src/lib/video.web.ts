/** Sul web non c'è il compressore nativo: il video parte così com'è. */
export async function comprimiVideo(): Promise<{ blob: Blob; contentType: string } | null> {
  return null;
}
