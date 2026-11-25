import React from 'react';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, CheckSquare, Pill, Activity, User } from 'lucide-react-native';
import WorkspaceGuard from '../../src/features/coordination/WorkspaceGuard';
import { theme } from '../../src/theme';

export default function CaregiverLayout() {
  const insets = useSafeAreaInsets();
  const bottomPadding =
    insets.bottom > 0
      ? insets.bottom
      : Platform.OS === 'android'
        ? 10
        : 8;

  const tabHeight = 58 + bottomPadding;

  return (
    <WorkspaceGuard role="CAREGIVER">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.textMuted,
          sceneStyle: { paddingTop: insets.top },
          tabBarStyle: {
            height: tabHeight,
            paddingBottom: bottomPadding,
            paddingTop: 6,
            backgroundColor: theme.colors.white,
            borderTopColor: theme.colors.borderGhost,
            borderTopWidth: 1,
            elevation: 6,
            shadowColor: '#004D4D',
            shadowOffset: { width: 0, height: -3 },
            shadowOpacity: 0.06,
            shadowRadius: 10,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '700',
            letterSpacing: 0.2,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => (
              <Home color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="tasks"
          options={{
            title: 'Care Tasks',
            tabBarIcon: ({ color, size }) => (
              <CheckSquare color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="medications"
          options={{
            title: 'Medicines',
            tabBarIcon: ({ color, size }) => (
              <Pill color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="health"
          options={{
            title: 'Health',
            tabBarIcon: ({ color, size }) => (
              <Activity color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size }) => (
              <User color={color} size={size} />
            ),
          }}
        />
        {/* Secondary routes retained without cluttering the bottom tab bar */}
        <Tabs.Screen
          name="dependents"
          options={{
            href: null,
            title: 'Dependents Roster',
          }}
        />
        <Tabs.Screen
          name="appointments"
          options={{
            href: null,
            title: 'Appointments',
          }}
        />
      </Tabs>
    </WorkspaceGuard>
  );
}
