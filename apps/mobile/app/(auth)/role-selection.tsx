import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { User, Heart } from 'lucide-react-native';
import { AppButton } from '../../components/ui/AppButton';
import { setSelectedMobileRole } from '../../src/api/client';
import { theme } from '../../src/theme';

interface RoleOption {
  id: 'PATIENT' | 'CAREGIVER';
  title: string;
  subtitle: string;
  badge: string;
  icon: typeof User;
}

const ROLES: RoleOption[] = [
  {
    id: 'PATIENT',
    title: 'Patient',
    subtitle: 'Track your daily blood glucose, view HbA1c trends, and keep clinical reports organized in your personal care space.',
    badge: 'Recommended',
    icon: User,
  },
  {
    id: 'CAREGIVER',
    title: 'Caregiver',
    subtitle: 'Support a family member or dependent with medication tracking, reminders, and care coordination.',
    badge: 'Family Care',
    icon: Heart,
  },
];

export default function RoleSelectionScreen() {
  const insets = useSafeAreaInsets();
  const [selectedRole, setSelectedRole] = useState<'PATIENT' | 'CAREGIVER'>('PATIENT');

  const handleContinue = async () => {
    await setSelectedMobileRole(selectedRole);
    router.push({
      pathname: '/(auth)/auth',
      params: { role: selectedRole },
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom > 0 ? insets.bottom + 90 : 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.superTitle}>ACCOUNT CUSTOMIZATION</Text>
        <Text style={styles.title}>How will you use AarogyaDamu?</Text>
        <Text style={styles.subtitle}>
          Choose your primary account role to personalize your dashboard, permissions, and daily features.
        </Text>

        <View style={styles.cardsContainer}>
          {ROLES.map((role) => {
            const isSelected = selectedRole === role.id;
            const IconComponent = role.icon;
            return (
              <TouchableOpacity
                key={role.id}
                activeOpacity={0.85}
                onPress={() => setSelectedRole(role.id)}
                style={[styles.card, isSelected && styles.cardSelected]}
                accessible={true}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${role.title}. ${role.subtitle}`}
              >
                <View style={styles.cardTopRow}>
                  <View style={[styles.iconBox, isSelected && styles.iconBoxSelected]}>
                    <IconComponent
                      color={isSelected ? theme.colors.primary : theme.colors.textSecondary}
                      size={22}
                    />
                  </View>

                  <View style={[styles.badge, isSelected && styles.badgeSelected]}>
                    <Text style={[styles.badgeText, isSelected && styles.badgeTextSelected]}>
                      {role.badge}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardBody}>
                  <Text style={[styles.cardTitle, isSelected && styles.cardTitleSelected]}>
                    {role.title}
                  </Text>
                  <Text style={styles.cardDesc}>{role.subtitle}</Text>
                </View>

                <View style={styles.cardFooter}>
                  <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                    {isSelected && <View style={styles.radioDot} />}
                  </View>
                  <Text style={[styles.radioLabel, isSelected && styles.radioLabelSelected]}>
                    {isSelected ? 'Selected' : 'Tap to select'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : theme.spacing.lg },
        ]}
      >
        <AppButton
          title={`Continue as ${ROLES.find((r) => r.id === selectedRole)?.title}`}
          size="lg"
          onPress={handleContinue}
          accessibilityLabel={`Continue as ${selectedRole}`}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  scrollContent: {
    padding: theme.spacing.xl,
  },
  superTitle: {
    fontSize: theme.typography.sizes.caption,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.primary,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: theme.typography.weights.black,
    color: theme.colors.text,
    letterSpacing: -0.4,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    fontSize: theme.typography.sizes.body,
    color: theme.colors.textMuted,
    lineHeight: theme.typography.lineHeights.body,
    marginBottom: theme.spacing.xl,
  },
  cardsContainer: {
    gap: theme.spacing.md,
  },
  card: {
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  cardSelected: {
    backgroundColor: theme.colors.primarySurface,
    borderColor: theme.colors.primary,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  iconBoxSelected: {
    backgroundColor: theme.colors.primaryBorder,
    borderColor: theme.colors.primary,
  },
  badge: {
    backgroundColor: theme.colors.cardMuted,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.xs,
  },
  badgeSelected: {
    backgroundColor: theme.colors.primaryBorder,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.textMuted,
  },
  badgeTextSelected: {
    color: theme.colors.primary,
  },
  cardBody: {
    marginBottom: theme.spacing.md,
  },
  cardTitle: {
    fontSize: theme.typography.sizes.bodyLg,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.text,
    marginBottom: 4,
  },
  cardTitleSelected: {
    color: theme.colors.primary,
  },
  cardDesc: {
    fontSize: theme.typography.sizes.bodySm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeights.bodySm,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    paddingTop: theme.spacing.sm,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    borderColor: theme.colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.primary,
  },
  radioLabel: {
    fontSize: theme.typography.sizes.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textMuted,
  },
  radioLabelSelected: {
    color: theme.colors.primary,
    fontWeight: theme.typography.weights.extrabold,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    backgroundColor: theme.colors.white,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    ...theme.shadows.card,
  },
});