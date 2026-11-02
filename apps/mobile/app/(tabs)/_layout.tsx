
import React from 'react';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Home,
  Activity,
  MessageSquare,
  CheckSquare,
  User,
} from 'lucide-react-native';

import { theme } from '../../src/theme';
import WorkspaceGuard from '../../src/features/coordination/WorkspaceGuard';

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  const bottomPadding =
    insets.bottom > 0
      ? insets.bottom
      : Platform.OS === 'android'
        ? 10
        : 8;

  const tabHeight = 58 + bottomPadding;

  return (
    <WorkspaceGuard role="PATIENT">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.textMuted,
          tabBarStyle: {
            backgroundColor: theme.colors.white,
            borderTopColor: theme.colors.border,
            borderTopWidth: 1,
            height: tabHeight,
            paddingBottom: bottomPadding,
            paddingTop: 6,
            elevation: 8,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.05,
            shadowRadius: 6,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: theme.typography.weights.bold,
            marginTop: 2,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarAccessibilityLabel: 'Patient Home Dashboard',
            tabBarIcon: ({ color, size }) => (
              <Home color={color} size={size - 2} />
            ),
          }}
        />

        <Tabs.Screen
          name="health"
          options={{
            title: 'Sugar Checks',
            tabBarAccessibilityLabel: 'Blood Sugar Logs & Lab Trends',
            tabBarIcon: ({ color, size }) => (
              <Activity color={color} size={size - 2} />
            ),
          }}
        />

        <Tabs.Screen
          name="journey"
          options={{
            title: 'My Journey',
            tabBarAccessibilityLabel: 'Diabetes Journey Navigator',
            tabBarIcon: ({ color, size }) => (
              <CheckSquare color={color} size={size - 2} />
            ),
          }}
        />

        <Tabs.Screen
          name="ask-damu"
          options={{
            title: 'Damu',
            tabBarAccessibilityLabel: 'Ask Damu Health Companion',
            tabBarIcon: ({ color, size }) => (
              <MessageSquare color={color} size={size - 2} />
            ),
          }}
        />

        <Tabs.Screen
          name="appointments"
          options={{
            title: 'Care Team',
            tabBarAccessibilityLabel: 'Doctor Appointments and Care Team',
            tabBarIcon: ({ color, size }) => (
              <User color={color} size={size - 2} />
            ),
          }}
        />

        {/* Sub-screens accessible from Home and Profile */}
        <Tabs.Screen
          name="profile"
          options={{
            href: null,
          }}
        />

        <Tabs.Screen
          name="tasks"
          options={{
            href: null,
          }}
        />

        <Tabs.Screen
          name="consultation"
          options={{
            href: null,
          }}
        />
      </Tabs>
    </WorkspaceGuard>
  );
}
