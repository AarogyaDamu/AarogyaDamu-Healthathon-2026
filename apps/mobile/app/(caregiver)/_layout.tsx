import React from 'react';
import { Tabs } from 'expo-router';
import { Home, CheckSquare, Pill, Activity, User } from 'lucide-react-native';
import WorkspaceGuard from '../../src/features/coordination/WorkspaceGuard';
import { theme } from '../../src/theme';

export default function CaregiverLayout() {
  return (
    <WorkspaceGuard role="CAREGIVER">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: '#64748B',
          tabBarStyle: {
            height: 64,
            paddingBottom: 8,
            paddingTop: 6,
            backgroundColor: '#FFFFFF',
            borderTopColor: '#E2E8F0',
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
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
