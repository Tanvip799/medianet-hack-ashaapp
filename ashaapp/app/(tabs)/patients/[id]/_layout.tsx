// app/(tabs)/patients/[id]/_layout.tsx

import { Stack, useLocalSearchParams } from 'expo-router';

export default function PatientDetailLayout() {
  // We use the `useLocalSearchParams` hook to get the dynamic `id` from the URL.
  // This allows us to set the title dynamically.
  const { id } = useLocalSearchParams();

  return (
    // This Stack navigator is completely separate from the one in the parent
    // patients/_layout.tsx. It controls the screens within this [id] route.
    <Stack>
      {/* This screen corresponds to the 'index.jsx' file inside this folder.
          It's the main profile page for the patient. */}
      <Stack.Screen
        name="index"
        options={{
          headerShown: false, // Dynamic title using the ID
          headerBackTitle: 'Patients', // Optional: What the back button says
        }}
      />
      
      {/* This screen corresponds to the 'details.tsx' file. */}
      <Stack.Screen
        name="notes"
        options={{
          headerShown: false,
          title: 'Patient Notes',
        }}
      />

      {/* You could add more screens here later, for example:
      <Stack.Screen name="appointments" options={{ title: "Appointments" }} /> 
      */}
    </Stack>
  );
}