import React, { useEffect, useState, useCallback } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { coordinationApi, WorkspaceRole } from '../src/api/coordination';
import { logoutMobileSession, setSelectedMobileRole } from '../src/api/client';

type RouteTarget = '/(tabs)' | '/(caregiver)';

function routeForRole(role: WorkspaceRole): RouteTarget {
  if (role === 'CAREGIVER') return '/(caregiver)';
  return '/(tabs)';
}

export default function SessionRouter() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchContext = useCallback(async () => {
    setError('');
    setLoading(true);

    try {
      const ctx = await coordinationApi.getContext();
      const roles = (ctx.availableRoles ?? []) as WorkspaceRole[];
      const mobileRoles = roles.filter((role) => role === 'PATIENT' || role === 'CAREGIVER');

      if (mobileRoles.length === 0) {
        router.replace('/(auth)/auth');
        return;
      }

      const nextRole = mobileRoles.includes('CAREGIVER') && ctx.defaultRole === 'CAREGIVER' ? 'CAREGIVER' : 'PATIENT';
      router.replace(routeForRole(nextRole));
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not load your account.';
      if (
        message.includes('expired') ||
        message.includes('invalid') ||
        message.includes('401') ||
        message.includes('Authentication')
      ) {
        try {
          await logoutMobileSession();
        } catch {
          // best-effort
        }
        router.replace('/(auth)/auth');
        return;
      }
      setError(message);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchContext();
  }, [fetchContext]);

  async function handleLogout() {
    try {
      await logoutMobileSession();
    } catch {
      setError('Signed out on this device, but server-side session revocation could not be confirmed.');
      setLoading(false);
      return;
    }
    router.replace('/(auth)/auth');
  }

  if (loading && !error) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#EA580C" />
        <Text style={styles.loadingText}>Loading your secure workspace…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Unable to load workspace</Text>
        <Text style={styles.errorBody}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => void fetchContext()}>
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.logoutLink} onPress={() => void handleLogout()}>
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    marginTop: 12,
    textAlign: 'center',
    color: '#475569',
    fontSize: 14,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  errorBody: {
    textAlign: 'center',
    color: '#64748B',
    fontSize: 14,
    marginBottom: 20,
  },
  retryButton: {
    paddingVertical: 12,
    paddingHorizontal: 28,
    backgroundColor: '#EA580C',
    borderRadius: 12,
    marginBottom: 16,
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  logoutLink: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  logoutText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 13,
    textAlign: 'center',
  },
});