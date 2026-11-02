import React, { useState, useCallback } from 'react';
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  Heart,
  Users,
  Calendar,
  Clock,
  ShieldCheck,
  ChevronRight,
  Activity,
  AlertCircle,
  FileText,
} from 'lucide-react-native';
import { theme } from '../../src/theme';
import { coordinationApi, LinkedPatient } from '../../src/api/coordination';

export default function CaregiverDashboard() {
  const [dependents, setDependents] = useState<LinkedPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setError('');
    try {
      const res = await coordinationApi.getCaregiverPatients();
      setDependents(res.patients || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load caregiver dependents.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    void loadData();
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.colors.primary}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.badgeRow}>
            <View style={styles.roleBadge}>
              <Heart size={12} color={theme.colors.accent} />
              <Text style={styles.roleBadgeText}>FAMILY CARE COMPANION</Text>
            </View>
            <View style={styles.consentBadge}>
              <ShieldCheck size={12} color={theme.colors.primary} />
              <Text style={styles.consentBadgeText}>Consent Protected</Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/session-router')}
            style={styles.switchButton}
          >
            <Text style={styles.switchButtonText}>Switch Role</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.title}>Caregiver Dashboard</Text>
        <Text style={styles.subtitle}>
          Monitor authorized family members and assist with their diabetes care continuity.
        </Text>
      </View>

      {/* Metrics Row */}
      <View style={styles.metricsRow}>
        <View style={styles.metricCard}>
          <Users size={18} color={theme.colors.primary} />
          <Text style={styles.metricValue}>{dependents.length}</Text>
          <Text style={styles.metricLabel}>Authorized Dependents</Text>
        </View>

        <View style={styles.metricCard}>
          <ShieldCheck size={18} color={theme.colors.success} />
          <Text style={styles.metricValue}>Active</Text>
          <Text style={styles.metricLabel}>Consent Status</Text>
        </View>
      </View>

      {/* Action Navigation Cards */}
      <Text style={styles.sectionHeading}>Care Coordination</Text>
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          onPress={() => router.push('/(caregiver)/dependents')}
          style={styles.actionCard}
          activeOpacity={0.8}
        >
          <View style={styles.actionLeft}>
            <View style={[styles.actionIconBox, { backgroundColor: theme.colors.primarySurface }]}>
              <Users size={22} color={theme.colors.primary} />
            </View>
            <View style={styles.actionTextWrap}>
              <Text style={styles.actionTitle}>My Dependents Roster</Text>
              <Text style={styles.actionDesc}>
                View family members who granted caregiver consent.
              </Text>
            </View>
          </View>
          <ChevronRight size={20} color={theme.colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/(caregiver)/appointments')}
          style={styles.actionCard}
          activeOpacity={0.8}
        >
          <View style={styles.actionLeft}>
            <View style={[styles.actionIconBox, { backgroundColor: theme.colors.accentLight }]}>
              <Calendar size={22} color={theme.colors.accent} />
            </View>
            <View style={styles.actionTextWrap}>
              <Text style={styles.actionTitle}>Coordinate Appointments</Text>
              <Text style={styles.actionDesc}>
                Book or manage doctor visits on behalf of your dependent.
              </Text>
            </View>
          </View>
          <ChevronRight size={20} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Dependents Health Summary Cards */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeading}>Family Health Monitoring</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginVertical: 20 }} />
      ) : error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : dependents.length === 0 ? (
        <View style={styles.emptyBox}>
          <Heart size={32} color={theme.colors.textPlaceholder} />
          <Text style={styles.emptyTitle}>No active caregiver consents</Text>
          <Text style={styles.emptySubtitle}>
            When a family member adds you as an authorized caregiver, their health profile will appear here.
          </Text>
        </View>
      ) : (
        dependents.map((dep) => {
          const latestObs = (dep.observations || [])[0];
          const isHigh = latestObs && (latestObs.numericValue > 180);
          const isLow = latestObs && (latestObs.numericValue < 70);

          return (
            <TouchableOpacity
              key={dep.patientId}
              onPress={() => router.push('/(caregiver)/dependents')}
              style={styles.dependentCard}
              activeOpacity={0.8}
            >
              <View style={styles.dependentHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {dep.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.depName}>{dep.name}</Text>
                  <Text style={styles.depCondition}>
                    {dep.diabetesType?.replace(/_/g, ' ') || 'Type 2 Diabetes Mellitus'}
                  </Text>
                </View>
                <ChevronRight size={18} color={theme.colors.textMuted} />
              </View>

              {/* Latest Sugar Observation Snippet */}
              {latestObs ? (
                <View style={styles.obsSnippet}>
                  <View style={styles.obsSnippetLeft}>
                    <Clock size={12} color={theme.colors.textMuted} />
                    <Text style={styles.obsSnippetText}>
                      Latest reading ({latestObs.context}):
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.obsPill,
                      isLow
                        ? { backgroundColor: theme.colors.errorBg }
                        : isHigh
                        ? { backgroundColor: theme.colors.warningBg }
                        : { backgroundColor: theme.colors.successBg },
                    ]}
                  >
                    <Text
                      style={[
                        styles.obsPillText,
                        isLow
                          ? { color: theme.colors.error }
                          : isHigh
                          ? { color: theme.colors.warning }
                          : { color: theme.colors.success },
                      ]}
                    >
                      {latestObs.numericValue} {latestObs.unit}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.obsSnippet}>
                  <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>
                    No glucose observations logged today.
                  </Text>
                </View>
              )}

              {/* Consent Permissions Pill */}
              <View style={styles.permissionsRow}>
                <Text style={styles.permissionsLabel}>Active Consent Permissions:</Text>
                <Text style={styles.permissionsValue}>
                  {(dep.permissions || []).map((p) => p.replace(/_/g, ' ')).join(', ') || 'All Care Access'}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })
      )}

      {/* Privacy Notice Card */}
      <View style={styles.privacyCard}>
        <View style={styles.privacyCardHeader}>
          <ShieldCheck size={16} color={theme.colors.primary} />
          <Text style={styles.privacyCardTitle}>Patient-Centric Privacy Guard</Text>
        </View>
        <Text style={styles.privacyCardText}>
          Caregiver access is governed by active consent grants issued by the patient under ABDM consent protocols. Permissions can be managed or revoked by the patient at any time.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  content: {
    padding: theme.spacing.lg,
    paddingTop: 45,
    paddingBottom: 40,
  },
  header: {
    marginBottom: theme.spacing.lg,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.accentLight,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.accent,
    letterSpacing: 0.5,
  },
  consentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.primarySurface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
  },
  consentBadgeText: {
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primary,
  },
  switchButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
  },
  switchButtonText: {
    fontSize: 11,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textMuted,
  },
  title: {
    fontSize: theme.typography.sizes.headingLg,
    fontWeight: theme.typography.weights.black,
    color: theme.colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: theme.typography.sizes.caption,
    color: theme.colors.textMuted,
    marginTop: 2,
    lineHeight: 18,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: theme.spacing.xl,
  },
  metricCard: {
    flex: 1,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    ...theme.shadows.card,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: theme.typography.weights.black,
    color: theme.colors.text,
    marginTop: 4,
  },
  metricLabel: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  sectionHeading: {
    fontSize: theme.typography.sizes.bodyLg,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  actionsContainer: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xl,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    ...theme.shadows.card,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    flex: 1,
  },
  actionIconBox: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTextWrap: {
    flex: 1,
  },
  actionTitle: {
    fontSize: theme.typography.sizes.body,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
  },
  actionDesc: {
    fontSize: theme.typography.sizes.caption,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  sectionHeaderRow: {
    marginBottom: theme.spacing.xs,
  },
  dependentCard: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.card,
  },
  dependentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.colors.accentLight,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 13,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.accent,
  },
  depName: {
    fontSize: theme.typography.sizes.body,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
  },
  depCondition: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  obsSnippet: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  obsSnippetLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  obsSnippetText: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  obsPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
  },
  obsPillText: {
    fontSize: 11,
    fontWeight: theme.typography.weights.bold,
  },
  permissionsRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  permissionsLabel: {
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
  },
  permissionsValue: {
    fontSize: 11,
    color: theme.colors.primary,
    fontWeight: theme.typography.weights.semibold,
    marginTop: 2,
  },
  privacyCard: {
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.primarySurface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
    padding: theme.spacing.md,
  },
  privacyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  privacyCardTitle: {
    fontSize: 12,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primaryDark,
  },
  privacyCardText: {
    fontSize: 11,
    color: theme.colors.primaryDark,
    lineHeight: 16,
  },
  emptyBox: {
    alignItems: 'center',
    padding: theme.spacing.xl,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  emptyTitle: {
    fontSize: theme.typography.sizes.body,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  errorBox: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.errorBg,
    borderRadius: theme.radius.sm,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: 12,
  },
});