import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Bell, Pill, Activity, Calendar, ShieldCheck } from 'lucide-react-native';
import { AppButton } from '../../components/ui/AppButton';
import { useToast } from '../../components/ui/ToastProvider';
import { theme } from '../../src/theme';

export default function PermissionsScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleEnableNotifications = async () => {
    setLoading(true);
    try {
      await new Promise((res) => setTimeout(res, 500));
      showToast('Notifications enabled for medication and sugar checks');
      router.replace('/session-router');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    router.replace('/session-router');
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
        <View style={styles.bellIconContainer}>
          <Bell color={theme.colors.accent} size={36} />
        </View>

        <Text style={styles.title}>Never miss a dose or sugar check</Text>
        <Text style={styles.subtitle}>
          Timely notifications help you stay in target and avoid blood sugar spikes and drops.
        </Text>

        {/* Concrete Benefits List */}
        <View style={styles.benefitsCard}>
          <View style={styles.benefitRow}>
            <View style={styles.benefitIconBox}>
              <Pill color={theme.colors.primary} size={18} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.benefitTitle}>Daily Medication Reminders</Text>
              <Text style={styles.benefitDesc}>Reminders timed with your breakfast and dinner routines.</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.benefitRow}>
            <View style={styles.benefitIconBox}>
              <Activity color={theme.colors.primary} size={18} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.benefitTitle}>Morning Fasting Checks</Text>
              <Text style={styles.benefitDesc}>Gentle prompts to record your baseline before breakfast.</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.benefitRow}>
            <View style={styles.benefitIconBox}>
              <Calendar color={theme.colors.primary} size={18} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.benefitTitle}>Doctor Appointment Alerts</Text>
              <Text style={styles.benefitDesc}>Preparation checklists 24 hours prior to your clinic visit.</Text>
            </View>
          </View>
        </View>

        {/* Privacy Note */}
        <View style={styles.privacyNoteBox}>
          <ShieldCheck color={theme.colors.textMuted} size={16} />
          <Text style={styles.privacyNoteText}>
            You can customize or pause reminder notifications at any time in your Profile settings.
          </Text>
        </View>
      </ScrollView>

      {/* Action Footer */}
      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : theme.spacing.lg },
        ]}
      >
        <AppButton
          title="Enable Care Reminders"
          size="lg"
          loading={loading}
          onPress={handleEnableNotifications}
          accessibilityLabel="Enable Care Reminders"
        />
        <View style={styles.spacer} />
        <AppButton
          title="Not Now (Continue)"
          variant="outline"
          size="lg"
          onPress={handleSkip}
          accessibilityLabel="Continue without enabling notifications now"
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
    alignItems: 'center',
  },
  bellIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.accentLight,
    borderWidth: 2,
    borderColor: theme.colors.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  title: {
    fontSize: 26,
    fontWeight: theme.typography.weights.black,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: theme.typography.sizes.body,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: theme.typography.lineHeights.body,
    maxWidth: 320,
    marginBottom: theme.spacing.xl,
  },
  benefitsCard: {
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    width: '100%',
    marginBottom: theme.spacing.lg,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  benefitIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitTitle: {
    fontSize: theme.typography.sizes.body,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
  },
  benefitDesc: {
    fontSize: theme.typography.sizes.caption,
    color: theme.colors.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.borderLight,
    marginVertical: theme.spacing.md,
  },
  privacyNoteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: theme.spacing.md,
  },
  privacyNoteText: {
    fontSize: theme.typography.sizes.caption,
    color: theme.colors.textMuted,
    lineHeight: 18,
    flex: 1,
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
  spacer: {
    height: 10,
  },
});