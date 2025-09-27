import { DefaultTheme, ThemeProvider, Theme } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

// We force a white (light) theme across the whole app per user request.
// If later you want to re-enable system appearance, re-introduce useColorScheme hook logic.

const WhiteTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#FFFFFF',
    card: '#FFFFFF',
    primary: '#0a7ea4',
    text: '#11181C',
    border: '#E2E2E2',
    notification: DefaultTheme.colors.notification,
  },
};

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  return (
    <ThemeProvider value={WhiteTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      {/* Dark status bar content for white background */}
      <StatusBar style="dark" />
    </ThemeProvider>
  );
}
