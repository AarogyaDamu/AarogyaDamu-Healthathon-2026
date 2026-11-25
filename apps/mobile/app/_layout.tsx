import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '../components/ui/ToastProvider';

export default function RootLayout() {
  const content = (
    <SafeAreaProvider>
      <ToastProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="session-router" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(caregiver)" />
        </Stack>
      </ToastProvider>
    </SafeAreaProvider>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webContainer}>
        <View style={styles.webAppFrame}>
          {content}
        </View>
      </View>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  webContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#191c20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  webAppFrame: {
    flex: 1,
    width: '100%',
    maxWidth: 520,
    height: '100%',
    backgroundColor: '#f8f9fc',
    shadowColor: '#004D4D',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
    overflow: 'hidden',
  },
});
