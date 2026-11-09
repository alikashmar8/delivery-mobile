import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useColorScheme } from 'react-native';
import { SessionProvider } from '@/driver/session';

export default function RootLayout() {
  const scheme = useColorScheme();
  return <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
    <SessionProvider><Stack>
      <Stack.Screen name="index" options={{ title: 'Driver deliveries' }} />
      <Stack.Screen name="driver/[id]" options={{ title: 'Delivery' }} />
    </Stack></SessionProvider>
  </ThemeProvider>;
}
