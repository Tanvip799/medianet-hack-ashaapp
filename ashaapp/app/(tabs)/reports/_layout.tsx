// app/(tabs)/patients/_layout.tsx

import { Stack } from 'expo-router';

export default function PatientsStackLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="reportdetails" options={{ headerShown: false, title: 'Reports' }} />
    </Stack>
  );
}