// npx deno test supabase/functions/resolve-place/
import assert from 'node:assert';
import { boxAround } from './pick.ts';

Deno.test('a Roma il riquadro è di circa 400 m per parte', () => {
  const { low, high } = boxAround(41.89, 12.49);
  assert.ok(Math.abs((high.latitude - low.latitude) * 111320 - 800) < 1);
  // Alla latitudine di Roma un grado di longitudine è più corto: più gradi.
  assert.ok(high.longitude - low.longitude > high.latitude - low.latitude);
  assert.ok(low.longitude < 12.49 && 12.49 < high.longitude);
});

Deno.test('a cavallo del meridiano 180 l’ovest resta maggiore dell’est', () => {
  const { low, high } = boxAround(-17, 179.999);
  assert.ok(low.longitude > 179 && high.longitude < -179);
});

Deno.test('al polo prende tutte le longitudini', () => {
  const { low, high } = boxAround(90, 0);
  assert.deepEqual([low.longitude, high.longitude, high.latitude], [-180, 180, 90]);
});
