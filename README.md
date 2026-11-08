# Delivery Platform mobile

Expo SDK 57 application foundation for the Delivery Platform. The current Home/Explore screens are starter content, not implemented customer or driver workflows.

## Local setup

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Copy `.env.example` to `.env.local` and set `EXPO_PUBLIC_API_URL` to an API URL reachable from the target device. `EXPO_PUBLIC_*` values are bundled into the app and must never contain secrets.

3. Start Expo:

   ```bash
   npm start
   ```

The app uses Expo Router for navigation. API calls go through `src/api`; authenticated requests obtain the access token from `expo-secure-store`. Access and refresh tokens are stored as separate device-only entries and are never placed in public environment variables or general-purpose async storage.

`src/api/openapi.d.ts` is generated from the backend OpenAPI document. Use
`requestContract(path, method, options)` for typed request bodies and successful responses,
and `isApiErrorResponse` to narrow the standard error envelope. The typed client does not
change SecureStore behavior or move credentials into general-purpose storage.

Run the local quality checks with:

```bash
npm run typecheck
npm run lint
EXPO_PUBLIC_API_URL=http://localhost:3000 npm run build:web
npx expo-doctor
```

Refresh the checked API declaration from the backend with
`cd ../delivery-backend && npm run contracts:generate`.

## Mobile packaging boundary

F05 keeps one Expo project and one shared authentication/API/session foundation. Customer and driver capabilities use the same `User` identity. This does not decide or simulate the future release packaging: U02 must explicitly choose one capability-routed binary or two binaries before the codebase is split. Until then, do not duplicate authentication pipelines or treat the starter routes as product workflows.

## Native acceptance

SecureStore calls must be checked on the supported Android and iOS devices before pilot acceptance. A web export, simulator, or mocked module does not prove native keychain/Keystore behavior.

## Expo resources

- [Expo SDK 57 documentation](https://docs.expo.dev/versions/v57.0.0/)
- [Expo Router](https://docs.expo.dev/router/introduction/)
- [Expo SecureStore](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/)
