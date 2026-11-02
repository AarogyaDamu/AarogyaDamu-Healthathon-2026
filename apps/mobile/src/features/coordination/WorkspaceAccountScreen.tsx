import React, { useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';

import { clearMobileToken, logoutMobileSession } from '../../api/client';

export default function WorkspaceAccountScreen({
  role,
}: {
  role: 'DOCTOR' | 'CAREGIVER';
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function logout() {
    setLoading(true);
    setError('');

    try {
      await logoutMobileSession();
      router.replace('/(auth)/welcome');
    } catch {
      setError('Logout failed. Please try again.');
      try {
        await clearMobileToken();
      } catch {
        setError('Signed out locally, but the saved session could not be cleared.');
      }
      setLoading(false);
    }
  }

  return (
    <View
      style={{
        flex: 1,
        padding: 24,
        justifyContent: 'center',
        backgroundColor: '#F8FAFC',
      }}
    >
      <Text style={{ fontSize: 26, fontWeight: '800', color: '#0F172A' }}>
        Account
      </Text>
      <Text style={{ color: '#64748B', marginTop: 8 }}>
        Current workspace: {role}
      </Text>

      {error ? (
        <Text style={{ color: '#B91C1C', marginTop: 14 }}>{error}</Text>
      ) : null}

      <TouchableOpacity
        onPress={() => router.replace('/session-router')}
        style={{
          marginTop: 24,
          padding: 15,
          borderRadius: 12,
          backgroundColor: '#0F172A',
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>
          Switch Workspace
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={logout}
        disabled={loading}
        style={{
          marginTop: 12,
          padding: 15,
          borderRadius: 12,
          backgroundColor: '#EA580C',
          alignItems: 'center',
        }}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Log out</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}