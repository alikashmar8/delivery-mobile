import * as SecureStore from 'expo-secure-store';
import { File, Paths } from 'expo-file-system';
import type { PendingStorage } from './pending-operation';

const options = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: 'delivery-platform.driver',
} satisfies SecureStore.SecureStoreOptions;
const key = (ownerId: string) => `delivery-platform.driver.pending.${ownerId}`;
export const pendingStorage: PendingStorage = {
  read: (ownerId) => SecureStore.getItemAsync(key(ownerId), options),
  write: (ownerId, value) => SecureStore.setItemAsync(key(ownerId), value, options),
  remove: (ownerId) => SecureStore.deleteItemAsync(key(ownerId), options),
};

export function savedPhoto(uploadId: string, type: string): File {
  return new File(Paths.document, `delivery-proof-${uploadId}.${type === 'image/png' ? 'png' : 'jpg'}`);
}

export function retainPhoto(uploadId: string, file: File): File {
  const saved = savedPhoto(uploadId, file.type);
  if (!saved.exists) file.copy(saved);
  return saved;
}

export function removePhoto(uri: string): void {
  // Only delete this app's retained proof files, never arbitrary camera/library paths.
  if (!uri.startsWith(`${Paths.document.uri}delivery-proof-`)) return;
  const file = new File(uri);
  if (file.exists) file.delete();
}
