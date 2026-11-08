import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'delivery-platform.auth.access-token';
const REFRESH_TOKEN_KEY = 'delivery-platform.auth.refresh-token';
const SECURE_STORE_OPTIONS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: 'delivery-platform.auth',
} satisfies SecureStore.SecureStoreOptions;

export interface AuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export class SecureTokenStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecureTokenStorageError';
  }
}

function assertToken(value: string, name: string): void {
  if (!value.trim()) {
    throw new SecureTokenStorageError(`${name} must not be empty`);
  }
}

async function assertSecureStoreAvailable(): Promise<void> {
  if (!(await SecureStore.isAvailableAsync())) {
    throw new SecureTokenStorageError('Secure token storage is unavailable on this platform');
  }
}

export async function storeAuthTokens(tokens: AuthTokens): Promise<void> {
  assertToken(tokens.accessToken, 'accessToken');
  assertToken(tokens.refreshToken, 'refreshToken');
  await assertSecureStoreAvailable();

  try {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken, SECURE_STORE_OPTIONS),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken, SECURE_STORE_OPTIONS),
    ]);
  } catch {
    await clearAuthTokens().catch(() => undefined);
    throw new SecureTokenStorageError('Unable to store the authenticated session securely');
  }
}

export async function readAuthTokens(): Promise<AuthTokens | null> {
  await assertSecureStoreAvailable();
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY, SECURE_STORE_OPTIONS),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY, SECURE_STORE_OPTIONS),
  ]);

  if (accessToken && refreshToken) {
    return Object.freeze({ accessToken, refreshToken });
  }

  if (accessToken || refreshToken) {
    await clearAuthTokens();
  }

  return null;
}

export async function getAccessToken(): Promise<string | null> {
  await assertSecureStoreAvailable();
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY, SECURE_STORE_OPTIONS);
}

export async function clearAuthTokens(): Promise<void> {
  await assertSecureStoreAvailable();
  const results = await Promise.allSettled([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY, SECURE_STORE_OPTIONS),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY, SECURE_STORE_OPTIONS),
  ]);

  if (results.some((result) => result.status === 'rejected')) {
    throw new SecureTokenStorageError('Unable to clear the authenticated session securely');
  }
}
