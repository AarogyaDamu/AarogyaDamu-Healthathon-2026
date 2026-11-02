import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Image,
  Platform,
} from 'react-native';
import type { ImageStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { getMobileOnboardingCompleted } from '../src/api/client';
import { theme } from '../src/theme';

const damuArtwork = require('../assets/damu.png');
const TOKEN_KEY = 'aarogyadamu_mobile_jwt';

const logoImageStyle: ImageStyle = {
  width: 104,
  height: 104,
  borderRadius: 52,
};

export default function IndexScreen() {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    let cancelled = false;
    let routeTimer: ReturnType<typeof setTimeout> | undefined;

    const animation = Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),

      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 7,
        tension: 40,
        useNativeDriver: true,
      }),
    ]);

    animation.start();

    const scheduleRoute = (
      path: '/session-router' | '/(auth)/welcome' | '/(auth)/auth',
    ) => {
      routeTimer = setTimeout(() => {
        if (!cancelled) {
          router.replace(path);
        }
      }, 1200);
    };

    const checkSessionAndRoute = async () => {
      try {
        let token: string | null = null;

        if (Platform.OS === 'web') {
          if (typeof localStorage !== 'undefined') {
            token = localStorage.getItem(TOKEN_KEY);
          }
        } else {
          token = await SecureStore.getItemAsync(TOKEN_KEY);
        }

        const onboardingCompleted = await getMobileOnboardingCompleted();

        if (cancelled) {
          return;
        }

        if (token) {
          scheduleRoute('/session-router');
          return;
        }

        scheduleRoute(onboardingCompleted ? '/(auth)/auth' : '/(auth)/welcome');
      } catch {
        if (!cancelled) {
          scheduleRoute('/(auth)/welcome');
        }
      }
    };

    void checkSessionAndRoute();

    return () => {
      cancelled = true;
      animation.stop();

      if (routeTimer !== undefined) {
        clearTimeout(routeTimer);
      }
    };
  }, [fadeAnim, scaleAnim]);

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <View style={styles.logoBadge}>
          <Image
            source={damuArtwork}
            style={logoImageStyle}
            resizeMode="contain"
            accessible
            accessibilityLabel="AarogyaDamu mascot"
          />
        </View>

        <Text style={styles.title}>AarogyaDamu</Text>

        <Text style={styles.subtitle}>
          Your Complete Diabetes Health Companion
        </Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },

  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },

  logoBadge: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: theme.colors.primarySurface,
    borderWidth: 3,
    borderColor: theme.colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
    ...theme.shadows.card,
  },

  title: {
    fontSize: 28,
    fontWeight: theme.typography.weights.black,
    color: theme.colors.text,
    letterSpacing: -0.5,
    marginBottom: theme.spacing.xs,
  },

  subtitle: {
    fontSize: theme.typography.sizes.body,
    color: theme.colors.textMuted,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: theme.typography.lineHeights.body,
  },
});