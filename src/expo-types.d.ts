/// <reference types="expo/types" />

// Expo CLI also generates an ignored expo-env.d.ts file. Keeping this stable
// reference in source makes standalone typechecks load Expo's CSS declarations
// before the CLI has generated its local route types.
