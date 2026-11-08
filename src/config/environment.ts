const DEVELOPMENT_API_URL = 'http://localhost:3000';

function normalizeApiUrl(value: string): string {
  const candidate = value.trim();

  if (!candidate) {
    throw new Error('EXPO_PUBLIC_API_URL must not be empty');
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('EXPO_PUBLIC_API_URL must be a valid absolute URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('EXPO_PUBLIC_API_URL must use http or https');
  }

  if (url.username || url.password) {
    throw new Error('EXPO_PUBLIC_API_URL must not contain credentials');
  }

  if (url.search || url.hash) {
    throw new Error('EXPO_PUBLIC_API_URL must not contain a query or fragment');
  }

  const path = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL;

if (!configuredApiUrl && !__DEV__) {
  throw new Error('EXPO_PUBLIC_API_URL is required in release builds');
}

export const clientConfig = Object.freeze({
  apiBaseUrl: normalizeApiUrl(configuredApiUrl ?? DEVELOPMENT_API_URL),
});
