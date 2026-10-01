import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';
// Conservative UTF-16 chunk size stays under native byte limits even for Unicode.
const chunkSize = 400;
interface Manifest { generation: string; count: number }
let operations: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const result = operations.then(work);
  operations = result.catch(() => undefined);
  return result;
}
async function manifest(key: string): Promise<Manifest | null> {
  const raw = await SecureStore.getItemAsync(`${key}.manifest`);
  if (!raw) return null;
  const value: unknown = JSON.parse(raw);
  if (typeof value !== 'object' || value === null || !('generation' in value) || !('count' in value) ||
      typeof value.generation !== 'string' || !/^[\da-f-]{36}$/i.test(value.generation) ||
      typeof value.count !== 'number' || !Number.isInteger(value.count) || value.count < 1 || value.count > 10000) throw new Error('Invalid secure session manifest');
  return { generation: value.generation, count: value.count };
}
async function deleteChunks(key: string, previous: Manifest | null) {
  if (!previous) return;
  for (let i = 0; i < previous.count; i++) await SecureStore.deleteItemAsync(`${key}.${previous.generation}.${i}`);
}
async function removeLegacy(key: string) {
  const count = Number(await SecureStore.getItemAsync(`${key}.count`) ?? 0);
  await SecureStore.deleteItemAsync(`${key}.count`);
  if (Number.isInteger(count) && count >= 0 && count <= 10000)
    for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
}
export const secureSessionStorage = {
  getItem(key: string): Promise<string | null> {
    return serial(async () => {
      const current = await manifest(key);
      if (!current) {
        // Read the previous adapter's format during an in-place upgrade.
        const count = Number(await SecureStore.getItemAsync(`${key}.count`) ?? 0);
        if (!Number.isInteger(count) || count < 1 || count > 10000) return null;
        const chunks = await Promise.all(Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)));
        return chunks.some(chunk => chunk === null) ? null : chunks.join('');
      }
      const chunks = await Promise.all(Array.from({ length: current.count }, (_, i) => SecureStore.getItemAsync(`${key}.${current.generation}.${i}`)));
      return chunks.some(chunk => chunk === null) ? null : chunks.join('');
    });
  },
  setItem(key: string, value: string): Promise<void> {
    return serial(async () => {
      const previous = await manifest(key);
      const characters = Array.from(value);
      const chunks = Array.from({ length: Math.max(1, Math.ceil(characters.length / chunkSize)) }, (_, index) => characters.slice(index * chunkSize, (index + 1) * chunkSize).join(''));
      const current = { generation: randomUUID(), count: chunks.length };
      if (current.count > 10000) throw new Error('Session is too large');
      // Write a new generation first; one manifest write commits it. A failed
      // refresh preserves the old session instead of deleting it before writing.
      try {
        for (let i = 0; i < current.count; i++) await SecureStore.setItemAsync(`${key}.${current.generation}.${i}`, chunks[i]);
        await SecureStore.setItemAsync(`${key}.manifest`, JSON.stringify(current));
      } catch (error) {
        await deleteChunks(key, current).catch(() => undefined);
        throw error;
      }
      await deleteChunks(key, previous).catch(() => undefined);
      await removeLegacy(key).catch(() => undefined);
    });
  },
  removeItem(key: string): Promise<void> {
    return serial(async () => {
      const previous = await manifest(key);
      // Remove the readable pointer first. Remaining chunks are not sessions.
      await SecureStore.deleteItemAsync(`${key}.manifest`);
      await removeLegacy(key);
      await deleteChunks(key, previous);
    });
  },
};
