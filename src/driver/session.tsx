import {
  Fragment,
  createContext,
  use,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { apiClient, ApiError, type ApiSchemas } from '@/api';
import {
  clearAuthTokens,
  readAuthTokens,
  storeAuthTokens,
  type AuthTokens,
} from '@/auth/token-storage';
import { errorMessage } from './ui';

type Session = {
  user: ApiSchemas['UserSummaryResponseDto'] | null;
  loading: boolean;
  error: string | null;
  restore: () => Promise<void>;
  login: (tokens: AuthTokens) => Promise<void>;
  logout: () => Promise<void>;
};
const Context = createContext<Session | null>(null);
export function useSession() {
  const session = use(Context);
  if (!session) throw new Error('Session provider is missing');
  return session;
}
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Session['user']>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const restore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tokens = await readAuthTokens();
      if (!tokens) {
        setUser(null);
        return;
      }
      try {
        setUser(await apiClient.requestContract('/users/me', 'get'));
      } catch (failure) {
        if (!(failure instanceof ApiError) || failure.status !== 401)
          throw failure;
        try {
          const rotated = await apiClient.requestContract(
            '/auth/refresh',
            'post',
            {
              auth: 'none',
              json: { refreshToken: tokens.refreshToken },
            },
          );
          await storeAuthTokens(rotated);
          setUser(await apiClient.requestContract('/users/me', 'get'));
        } catch (refreshError) {
          if (refreshError instanceof ApiError && refreshError.status === 401) {
            await clearAuthTokens();
            setUser(null);
          }
          throw refreshError;
        }
      }
    } catch (failure) {
      setUser(null);
      setError(errorMessage(failure));
    } finally {
      setLoading(false);
    }
  }, []);
  // Initial server/storage synchronization needs a loading state before the asynchronous read.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void restore();
  }, [restore]);
  async function login(tokens: AuthTokens) {
    await storeAuthTokens(tokens);
    await restore();
  }
  async function logout() {
    setLoading(true);
    try {
      const tokens = await readAuthTokens();
      if (tokens)
        await apiClient.requestContract('/auth/logout', 'post', {
          auth: 'none',
          json: { refreshToken: tokens.refreshToken },
        });
      await clearAuthTokens();
      setUser(null);
      setError(null);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setLoading(false);
    }
  }
  return (
    <Context value={{ user, loading, error, restore, login, logout }}>
      <Fragment key={user?.id ?? 'signed-out'}>{children}</Fragment>
    </Context>
  );
}
