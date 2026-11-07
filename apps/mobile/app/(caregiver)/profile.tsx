import React, { useState, useCallback } from 'react';
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  User,
  Shield,
  ShieldCheck,
  Users,
  LogOut,
  RefreshCw,
  Clock,
  CheckCircle2,
  Lock,
  FileText,
  AlertTriangle,
  Info,
} from 'lucide-react-native';
import { theme } from '../../src/theme';
import { clearMobileToken, logoutMobileSession } from '../../src/api/client';
import { caregiverApi, CaregiverPatient } from '../../src/api/caregiver';

export default function CaregiverProfileScreen() {
  const [patients, setPatients] = useState<CaregiverPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setError('');
    try {
      const res = await caregiverApi.getPatients();
      setPatients(res.patients || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load linked patient consents');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    setError('');
    try {
      await caregiverApi.clearActivePatientId();
      await logoutMobileSession();
      router.replace('/(auth)/welcome');
    } catch {
      try {
        await clearMobileToken();
        await caregiverApi.clearActivePatientId();
        router.replace('/(auth)/welcome');
      } catch {
        setError('Signed out locally, but the saved session could not be cleared.');
        setLoggingOut(false);
      }
    }
  };

  const formatPermissionName = (perm: string) => {
    switch (perm) {
      case 'VIEW_HEALTH_SUMMARY':
      case 'VIEW_OBSERVATIONS':
        return 'View Health Summary';
      case 'VIEW_MEDICATIONS':
        return 'View Prescribed Meds';
      case 'VIEW_MEDICATION_ADHERENCE':
        return 'View Adherence Log';
      case 'VIEW_TASKS':
        return 'View Care Tasks';
      case 'COMPLETE_TASKS_ON_BEHALF':
        return 'Complete Tasks On Behalf';
      case 'VIEW_APPOINTMENTS':
      case 'VIEW_CONSULTATIONS':
        return 'View Appointments';
      case 'VIEW_REPORTS':
      case 'VIEW_DOCUMENTS':
        return 'View Medical Reports';
      case 'VIEW_HEALTH_TIMELINE':
      case 'VIEW_CARE_PLAN':
        return 'View Health Timeline';
      default:
        return perm;
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading caregiver profile...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
    >
      {/* Caregiver Identity Card */}
      <View style={styles.profileCard}>
        <View style={styles.avatarLarge}>
          <User size={36} color="#FFFFFF" />
        </View>
        <Text style={styles.profileName}>Caregiver Portal</Text>
        <View style={styles.roleBadge}>
          <ShieldCheck size={14} color="#0284C7" />
          <Text style={styles.roleBadgeText}>Authorized Healthcare Delegate</Text>
        </View>
        <Text style={styles.profileNotice}>
          Dedicated mobile workspace for supporting assigned diabetic patients with doctor-supervised care plans.
        </Text>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <AlertTriangle size={18} color="#DC2626" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Linked Dependents Section */}
      <View style={styles.sectionHeader}>
        <Users size={18} color={theme.colors.primary} />
        <Text style={styles.sectionTitle}>Authorized Dependents ({patients.length})</Text>
      </View>

      {patients.length === 0 ? (
        <View style={styles.emptyCard}>
          <Info size={28} color="#94A3B8" />
          <Text style={styles.emptyTitle}>No Linked Dependents</Text>
          <Text style={styles.emptySubtitle}>
            When a patient invites you from their Profile screen, their authorized profile and permissions will be
            listed here.
          </Text>
        </View>
      ) : (
        patients.map((p) => {
          const lastAccess = p.lastAccessedAt
            ? new Date(p.lastAccessedAt).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'Never';

          return (
            <View key={p.consentId} style={styles.patientCard}>
              <View style={styles.patientCardHeader}>
                <View style={styles.patientMeta}>
                  <Text style={styles.patientName}>{p.name}</Text>
                  <Text style={styles.patientRel}>
                    {p.relationship} • {p.diabetesType}
                  </Text>
                </View>
                <View style={styles.activePill}>
                  <Text style={styles.activePillText}>Active Consent</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.permissionsContainer}>
                <Text style={styles.permissionsHeading}>Granted Delegated Permissions:</Text>
                <View style={styles.permissionBadges}>
                  {p.permissions.map((perm) => (
                    <View key={perm} style={styles.permBadge}>
                      <CheckCircle2 size={12} color="#059669" />
                      <Text style={styles.permBadgeText}>{formatPermissionName(perm)}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.lastAccessRow}>
                <Clock size={12} color="#94A3B8" />
                <Text style={styles.lastAccessText}>Last accessed on your behalf: {lastAccess}</Text>
              </View>
            </View>
          );
        })
      )}

      {/* Clinical Governance Card */}
      <View style={styles.governanceCard}>
        <View style={styles.governanceHeader}>
          <Shield size={18} color="#0F766E" />
          <Text style={styles.governanceTitle}>Caregiver Governance Boundaries</Text>
        </View>
        <Text style={styles.governanceText}>
          • <Text style={styles.boldText}>Patient Controlled:</Text> Patients can adjust permissions or revoke
          delegated access at any time from their profile.
        </Text>
        <Text style={styles.governanceText}>
          • <Text style={styles.boldText}>Clinical Authority:</Text> Prescriptions, dosages, and medical instructions
          are strictly controlled by licensed doctors.
        </Text>
        <Text style={styles.governanceText}>
          • <Text style={styles.boldText}>Audit Attribution:</Text> Any task completed or note logged by a caregiver
          is permanently marked with your identity.
        </Text>
      </View>

      {/* Account Actions */}
      <View style={styles.actionSection}>
        <TouchableOpacity
          style={styles.switchButton}
          onPress={() => router.replace('/session-router')}
          activeOpacity={0.7}
        >
          <Text style={styles.switchButtonText}>Switch Workspace Role</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          disabled={loggingOut}
          activeOpacity={0.7}
        >
          {loggingOut ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <View style={styles.logoutRow}>
              <LogOut size={18} color="#FFFFFF" />
              <Text style={styles.logoutButtonText}>Sign Out of Caregiver Session</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 20,
    paddingTop: 48,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
  },
  avatarLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 6,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#CCFBF1',
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F766E',
  },
  profileNotice: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: 16,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  patientCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  patientCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  patientMeta: {
    flex: 1,
  },
  patientName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  patientRel: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  activePill: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  activePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  permissionsContainer: {
    gap: 8,
  },
  permissionsHeading: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  permissionBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  permBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  permBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#166534',
  },
  lastAccessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
  },
  lastAccessText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  governanceCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 8,
    marginBottom: 20,
    gap: 8,
    ...theme.shadows.card,
  },
  governanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  governanceTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  governanceText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
  boldText: {
    fontWeight: '700',
  },
  actionSection: {
    gap: 10,
  },
  switchButton: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
  },
  switchButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  logoutButton: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#EF4444',
    alignItems: 'center',
  },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoutButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
