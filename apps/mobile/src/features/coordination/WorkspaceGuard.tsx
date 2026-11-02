import React, { useEffect, useState, useCallback } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';

import {
  coordinationApi,
  WorkspaceRole,
} from '../../api/coordination';
import { clearMobileToken } from '../../api/client';

type MobileRole = Extract<WorkspaceRole, 'PATIENT' | 'CAREGIVER'>;

interface Props {
  role: WorkspaceRole;
  children: React.ReactNode;
}

function routeForRole(role: MobileRole): '/(tabs)' | '/(caregiver)' {
  if (role === 'CAREGIVER') return '/(caregiver)';
  return '/(tabs)';
}

export default function WorkspaceGuard({ role, children }: Props) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  const verifyWorkspace = useCallback(async () => {
    setError('');

    try {
      const context = await coordinationApi.getContext();

      const mobileRoles = (context.availableRoles.filter((availableRole) =>
        availableRole === 'PATIENT' || availableRole === 'CAREGIVER'
      ) as MobileRole[]);
      const permitted = mobileRoles.includes(role as MobileRole);

      if (!permitted) {
        const fallbackRole: MobileRole = mobileRoles.includes('CAREGIVER') ? 'CAREGIVER' : 'PATIENT';
        router.replace(routeForRole(fallbackRole));
        return;
      }

      setReady(true);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Unable to verify your account.';

      // If the token is expired or invalid, go back to auth
      if (
        message.includes('expired') ||
        message.includes('invalid') ||
        message.includes('401') ||
        message.includes('Authentication')
      ) {
        try {
          await clearMobileToken();
        } catch {
          // best-effort
        }
        router.replace('/(auth)/welcome');
        return;
      }

      setError(message);
    }
  }, [role]);

  useEffect(() => {
    let mounted = true;

    // Wrap to respect `mounted` flag
    (async () => {
      await verifyWorkspace();
    })();

    return () => {
      mounted = false;
    };
  }, [verifyWorkspace]);

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          backgroundColor: '#FFFFFF',
        }}
      >
        {error ? (
          <>
            <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8, color: '#0F172A' }}>
              Unable to open your workspace
            </Text>
            <Text style={{ textAlign: 'center', color: '#64748B', marginBottom: 20 }}>
              {error}
            </Text>
            <TouchableOpacity
              onPress={() => void verifyWorkspace()}
              style={{
                paddingVertical: 12,
                paddingHorizontal: 28,
                backgroundColor: '#EA580C',
                borderRadius: 12,
                marginBottom: 12,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>
                Try again
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color="#EA580C" />
            <Text style={{ marginTop: 12, color: '#64748B' }}>
              Preparing your workspace…
            </Text>
          </>
        )}
      </View>
    );
  }

  return <>{children}</>;
}