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
  Users,
  Calendar,
  AlertTriangle,
  Activity,
  CheckCircle2,
  ChevronRight,
  ShieldCheck,
  Stethoscope,
  Clock,
  ArrowRight,
} from 'lucide-react-native';
import { theme } from '../../src/theme';
import { coordinationApi, LinkedPatient } from '../../src/api/coordination';

export default function DoctorDashboard() {
  const [patients, setPatients] = useState<LinkedPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setError('');
    try {
      const res = await coordinationApi.getDoctorPatients();
      setPatients(res.patients || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load clinical records.');
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

  // Derive clinical metrics
  const totalPatients = patients.length;
  let urgentAlerts = 0;
  let inRangeCount = 0;
  let totalObservations = 0;

  patients.forEach((p) => {
    (p.observations || []).forEach((obs) => {
      totalObservations++;
      if (obs.numericValue < 70 || obs.numericValue > 250) {
        urgentAlerts++;
      } else if (obs.numericValue >= 70 && obs.numericValue <= 180) {
        inRangeCount++;
      }
    });
  });

  const inTargetPercent = totalObservations > 0 ? Math.round((inRangeCount / totalObservations) * 100) : 85;

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
      {/* Clinician Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.badgeRow}>
            <View style={styles.specialtyBadge}>
              <Stethoscope size={12} color={theme.colors.primary} />
              <Text style={styles.specialtyText}>CLINICAL WORKSPACE</Text>
            </View>
            <View style={styles.verifiedBadge}>
              <CheckCircle2 size={12} color={theme.colors.success} />
              <Text style={styles.verifiedText}>ABDM Verified</Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/session-router')}
            style={styles.switchButton}
          >
            <Text style={styles.switchButtonText}>Switch Role</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.title}>Doctor Dashboard</Text>
        <Text style={styles.subtitle}>
          Endocrinology & Diabetes Continuity Care Overview
        </Text>
      </View>

      {/* Clinical Metrics Grid */}
      <View style={styles.metricsGrid}>
        <View style={[styles.metricCard, { borderLeftColor: theme.colors.primary }]}>
          <View style={styles.metricIconWrap}>
            <Users size={18} color={theme.colors.primary} />
          </View>
          <Text style={styles.metricNumber}>{totalPatients}</Text>
          <Text style={styles.metricLabel}>Assigned Patients</Text>
        </View>

        <View style={[styles.metricCard, { borderLeftColor: theme.colors.success }]}>
          <View style={styles.metricIconWrap}>
            <Activity size={18} color={theme.colors.success} />
          </View>
          <Text style={styles.metricNumber}>{inTargetPercent}%</Text>
          <Text style={styles.metricLabel}>In Target Zone</Text>
        </View>

        <View style={[styles.metricCard, { borderLeftColor: urgentAlerts > 0 ? theme.colors.error : theme.colors.accent }]}>
          <View style={styles.metricIconWrap}>
            <AlertTriangle size={18} color={urgentAlerts > 0 ? theme.colors.error : theme.colors.accent} />
          </View>
          <Text style={[styles.metricNumber, urgentAlerts > 0 && { color: theme.colors.error }]}>
            {urgentAlerts}
          </Text>
          <Text style={styles.metricLabel}>Glycemic Alerts</Text>
        </View>

        <View style={[styles.metricCard, { borderLeftColor: theme.colors.primaryDark }]}>
          <View style={styles.metricIconWrap}>
            <Calendar size={18} color={theme.colors.primaryDark} />
          </View>
          <Text style={styles.metricNumber}>Active</Text>
          <Text style={styles.metricLabel}>Follow-up Visits</Text>
        </View>
      </View>

      {/* Workspace Quick Actions */}
      <Text style={styles.sectionHeading}>Clinical Actions</Text>
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          onPress={() => router.push('/(doctor)/patients')}
          style={styles.actionCard}
          activeOpacity={0.8}
        >
          <View style={styles.actionLeft}>
            <View style={[styles.actionIconBox, { backgroundColor: theme.colors.primarySurface }]}>
              <Users size={22} color={theme.colors.primary} />
            </View>
            <View style={styles.actionTextWrap}>
              <Text style={styles.actionTitle}>My Patients Roster</Text>
              <Text style={styles.actionDesc}>
                Review patient glucose logs, charts, and glycemic targets.
              </Text>
            </View>
          </View>
          <ChevronRight size={20} color={theme.colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/(doctor)/appointments')}
          style={styles.actionCard}
          activeOpacity={0.8}
        >
          <View style={styles.actionLeft}>
            <View style={[styles.actionIconBox, { backgroundColor: theme.colors.accentLight }]}>
              <Calendar size={22} color={theme.colors.accent} />
            </View>
            <View style={styles.actionTextWrap}>
              <Text style={styles.actionTitle}>Appointment Requests</Text>
              <Text style={styles.actionDesc}>
                Confirm, reschedule, or review incoming visit requests.
              </Text>
            </View>
          </View>
          <ChevronRight size={20} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Assigned Patients Preview */}
      <View style={styles.patientHeaderRow}>
        <Text style={styles.sectionHeading}>Assigned Patient Roster</Text>
        <TouchableOpacity onPress={() => router.push('/(doctor)/patients')}>
          <Text style={styles.viewAllText}>View All ({patients.length}) →</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginVertical: 20 }} />
      ) : error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : patients.length === 0 ? (
        <View style={styles.emptyBox}>
          <Users size={32} color={theme.colors.textPlaceholder} />
          <Text style={styles.emptyTitle}>No active patients assigned</Text>
          <Text style={styles.emptySubtitle}>
            Patients will appear here once an appointment is confirmed or clinical assignment is active.
          </Text>
        </View>
      ) : (
        patients.slice(0, 3).map((patient) => {
          const latestObs = (patient.observations || [])[0];
          const isHigh = latestObs && (latestObs.numericValue > 180);
          const isLow = latestObs && (latestObs.numericValue < 70);

          return (
            <TouchableOpacity
              key={patient.patientId}
              onPress={() => router.push('/(doctor)/patients')}
              style={styles.patientCard}
              activeOpacity={0.8}
            >
              <View style={styles.patientCardHeader}>
                <View style={styles.patientAvatar}>
                  <Text style={styles.patientAvatarText}>
                    {patient.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.patientName}>{patient.name}</Text>
                  <Text style={styles.patientCondition}>
                    {patient.diabetesType?.replace(/_/g, ' ') || 'Type 2 Diabetes'}
                  </Text>
                </View>
                <ChevronRight size={18} color={theme.colors.textMuted} />
              </View>

              {latestObs && (
                <View style={styles.obsSnippet}>
                  <View style={styles.obsSnippetLeft}>
                    <Clock size={12} color={theme.colors.textMuted} />
                    <Text style={styles.obsSnippetTime}>
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
              )}
            </TouchableOpacity>
          );
        })
      )}

      {/* NEO Scribe Notice */}
      <View style={styles.scribeNotice}>
        <View style={styles.scribeNoticeHeader}>
          <ShieldCheck size={16} color={theme.colors.primary} />
          <Text style={styles.scribeNoticeTitle}>NEO Ambient Scribe Desk</Text>
        </View>
        <Text style={styles.scribeNoticeText}>
          In-clinic AI audio transcription and prescription formulation is available on the Doctor Web Workstation. Use your browser on tablet or desktop for consultation recording.
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
  specialtyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.primarySurface,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
  },
  specialtyText: {
    fontSize: 10,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.primary,
    letterSpacing: 0.5,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.successBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
  },
  verifiedText: {
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.success,
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
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: theme.spacing.xl,
  },
  metricCard: {
    width: '48%',
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderLeftWidth: 4,
    padding: theme.spacing.md,
    ...theme.shadows.card,
  },
  metricIconWrap: {
    marginBottom: 4,
  },
  metricNumber: {
    fontSize: 22,
    fontWeight: theme.typography.weights.black,
    color: theme.colors.text,
  },
  metricLabel: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontWeight: theme.typography.weights.medium,
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
  patientHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primary,
  },
  patientCard: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.card,
  },
  patientCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  patientAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.colors.primarySurface,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  patientAvatarText: {
    fontSize: 13,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primary,
  },
  patientName: {
    fontSize: theme.typography.sizes.body,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
  },
  patientCondition: {
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
  obsSnippetTime: {
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
  scribeNotice: {
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.primarySurface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
    padding: theme.spacing.md,
  },
  scribeNoticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  scribeNoticeTitle: {
    fontSize: 12,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primaryDark,
  },
  scribeNoticeText: {
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