import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="privacy" />
      <Stack.Screen name="auth" />
      <Stack.Screen name="role-selection" />
      <Stack.Screen name="personal-profile" />
      <Stack.Screen name="permissions" />
    </Stack>
  );
}