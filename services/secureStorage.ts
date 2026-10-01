import * as SecureStore from 'expo-secure-store';
// Chunk sessions to avoid SecureStore per-value size limits.
const chunkSize = 1800;
export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = await SecureStore.getItemAsync(`${key}.count`);
    if (!count) return null;
    const chunks = await Promise.all(Array.from({ length: Number(count) }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)));
    return chunks.some((chunk) => chunk === null) ? null : chunks.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    await secureSessionStorage.removeItem(key);
    const chunks = Array.from({ length: Math.ceil(value.length / chunkSize) }, (_, i) => value.slice(i * chunkSize, (i + 1) * chunkSize));
    for (let i = 0; i < chunks.length; i++) await SecureStore.setItemAsync(`${key}.${i}`, chunks[i]);
    await SecureStore.setItemAsync(`${key}.count`, String(chunks.length));
  },
  async removeItem(key: string): Promise<void> {
    const count = Number(await SecureStore.getItemAsync(`${key}.count`) ?? 0);
    await SecureStore.deleteItemAsync(`${key}.count`);
    for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
  },
};
