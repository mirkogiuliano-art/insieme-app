// npx deno test supabase/functions/_shared/
import assert from 'node:assert';
import { tutteLeRighe } from './righe.ts';

const finto = (n: number) => (da: number, a: number) =>
  Promise.resolve({ data: Array.from({ length: n }, (_, i) => i).slice(da, a + 1), error: null });

Deno.test('legge anche oltre le 1000 righe di una pagina', async () => {
  assert.equal((await tutteLeRighe(finto(2500))).length, 2500);
  assert.equal((await tutteLeRighe(finto(1000))).length, 1000);
  assert.equal((await tutteLeRighe(finto(0))).length, 0);
});

Deno.test('una pagina fallita ferma tutto invece di sembrare vuota', async () => {
  await assert.rejects(tutteLeRighe(() => Promise.resolve({ data: null, error: new Error('rete') })));
});
