import React from 'react';
import { Tabs } from 'expo-router';
import { Home, Users, Calendar } from 'lucide-react-native';

import WorkspaceGuard from '../../src/features/coordination/WorkspaceGuard';

export default function DoctorLayout() {
  return (
    <WorkspaceGuard role="DOCTOR">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#EA580C',
          tabBarInactiveTintColor: '#64748B',
          tabBarStyle: {
            height: 64,
            paddingBottom: 8,
            paddingTop: 6,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Dashboard',
            tabBarIcon: ({ color, size }) => (
              <Home color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="patients"
          options={{
            title: 'My Patients',
            tabBarIcon: ({ color, size }) => (
              <Users color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="appointments"
          options={{
            title: 'Appointments',
            tabBarIcon: ({ color, size }) => (
              <Calendar color={color} size={size} />
            ),
          }}
        />
      </Tabs>
    </WorkspaceGuard>
  );
}