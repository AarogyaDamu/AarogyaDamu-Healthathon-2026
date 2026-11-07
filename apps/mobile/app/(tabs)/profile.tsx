import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Modal,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  User,
  HeartHandshake,
  ShieldCheck,
  Bell,
  Lock,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Users,
  LogOut,
  Stethoscope,
  Trash2,
  Plus,
  X,
  Mail,
  Calendar,
  Phone,
  Globe,
  Clock,
  ShieldAlert,
  Edit2,
  AlertTriangle,
  History,
  Activity,
  FileText,
  CheckSquare,
} from 'lucide-react-native';
import {
  mobileApiFetch,
  clearMobileToken,
  logoutMobileSession,
} from '../../src/api/client';
import {
  caregiverApi,
  CaregiverActionHistoryItem,
} from '../../src/api/caregiver';
import { useToast } from '../../components/ui/ToastProvider';
import { theme } from '../../src/theme';
import { notificationsApi } from '../../src/api/notifications';
import { registerForPushNotifications } from '../../src/api/services/notificationService';

interface UserProfile {
  id?: string;
  email: string;
  fullName: string;
  dateOfBirth?: string;
  diabetesType: string;
  diagnosisYear?: number;
  primaryClinician?: string;
  knownAllergies?: string;
  targetFastingMin: number;
  targetFastingMax: number;
  targetPostMealMax: number;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  preferredLanguage?: string;
  timeZone?: string;
}

interface CaregiverConsentItem {
  id: string;
  patientId: string;
  caregiverEmail: string;
  caregiverName: string;
  relationship: string;
  status: string;
  permissions: string[];
  lastAccessedAt?: string | null;
  acceptedAt?: string | null;
  createdAt: string;
}

interface NotificationPrefs {
  carePlanUpdates: boolean;
  medicationReminders: boolean;
  sugarCheckReminders: boolean;
  appointmentReminders: boolean;
  emergencyAlerts: boolean;
  taskReminders?: boolean;
  journeyMilestones?: boolean;
  consultationUpdates?: boolean;
  healthLoggingReminders?: boolean;
  quietHoursEnabled?: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  timezone?: string;
  pushEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  carePlanUpdates: true,
  medicationReminders: true,
  sugarCheckReminders: true,
  appointmentReminders: true,
  emergencyAlerts: true,
  taskReminders: true,
  journeyMilestones: true,
  consultationUpdates: true,
  healthLoggingReminders: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  timezone: 'Asia/Kolkata',
  pushEnabled: false,
  emailEnabled: true,
  smsEnabled: false,
};

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile>({
    email: 'patient@aarogyadamu.in',
    fullName: 'Pranav Mirage',
    diabetesType: 'TYPE_2',
    diagnosisYear: 2021,
    primaryClinician: 'Dr. Sneha Kulkarni',
    knownAllergies: 'None documented',
    targetFastingMin: 80,
    targetFastingMax: 130,
    targetPostMealMax: 180,
    emergencyContactName: 'Family Caregiver',
    emergencyContactPhone: '+91 98765 43210',
    preferredLanguage: 'English',
    timeZone: 'Asia/Kolkata',
  });

  const [caregivers, setCaregivers] = useState<CaregiverConsentItem[]>([]);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);

  // Modals
  const [showEditPersonal, setShowEditPersonal] = useState(false);
  const [showEditHealth, setShowEditHealth] = useState(false);
  const [showInviteCaregiver, setShowInviteCaregiver] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Edit Personal Form
  const [editFullName, setEditFullName] = useState('');
  const [editDob, setEditDob] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editLanguage, setEditLanguage] = useState('English');
  const [savingPersonal, setSavingPersonal] = useState(false);

  // Edit Health Form
  const [editDiabetesType, setEditDiabetesType] = useState('TYPE_2');
  const [editDiagnosisYear, setEditDiagnosisYear] = useState('2021');
  const [editAllergies, setEditAllergies] = useState('None documented');
  const [editClinician, setEditClinician] = useState('Dr. Sneha Kulkarni');
  const [editFastingMin, setEditFastingMin] = useState('80');
  const [editFastingMax, setEditFastingMax] = useState('130');
  const [editPostMealMax, setEditPostMealMax] = useState('180');
  const [savingHealth, setSavingHealth] = useState(false);

  // Edit Permissions Form
  const [editingConsent, setEditingConsent] = useState<CaregiverConsentItem | null>(null);
  const [showEditPermissions, setShowEditPermissions] = useState(false);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [editPerms, setEditPerms] = useState<Record<string, boolean>>({
    VIEW_HEALTH_SUMMARY: true,
    VIEW_MEDICATIONS: true,
    VIEW_MEDICATION_ADHERENCE: true,
    VIEW_TASKS: true,
    COMPLETE_TASKS_ON_BEHALF: false,
    VIEW_APPOINTMENTS: true,
    VIEW_REPORTS: false,
    VIEW_HEALTH_TIMELINE: false,
  });

  // Caregiver Actions History Modal
  const [viewingActionsConsent, setViewingActionsConsent] = useState<CaregiverConsentItem | null>(null);
  const [showCaregiverActions, setShowCaregiverActions] = useState(false);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [caregiverActions, setCaregiverActions] = useState<CaregiverActionHistoryItem[]>([]);

  // Invite Caregiver Form
  const [cgName, setCgName] = useState('');
  const [cgEmail, setCgEmail] = useState('');
  const [cgRelationship, setCgRelationship] = useState('FAMILY');
  const [cgPermObs, setCgPermObs] = useState(true);
  const [cgPermMeds, setCgPermMeds] = useState(true);
  const [cgPermAdherence, setCgPermAdherence] = useState(true);
  const [cgPermTasks, setCgPermTasks] = useState(true);
  const [cgPermCompleteTasks, setCgPermCompleteTasks] = useState(false);
  const [cgPermAppt, setCgPermAppt] = useState(true);
  const [cgPermReports, setCgPermReports] = useState(false);
  const [cgPermTimeline, setCgPermTimeline] = useState(false);
  const [invitingCg, setInvitingCg] = useState(false);

  // Delete Account Form
  const [deletePassword, setDeletePassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  const loadProfileData = useCallback(async () => {
    try {
      // 1. Fetch Profile
      try {
        const res = await mobileApiFetch<{ profile?: any; user?: any }>('/profile');
        if (res?.profile) {
          const p = res.profile;
          setProfile({
            email: res.user?.email || 'patient@aarogyadamu.in',
            fullName: p.fullName || 'Patient',
            dateOfBirth: p.dateOfBirth,
            diabetesType: p.diabetesType || 'TYPE_2',
            diagnosisYear: p.diagnosisYear || 2021,
            primaryClinician: p.primaryClinician || 'Dr. Sneha Kulkarni',
            knownAllergies: p.knownAllergies || 'None documented',
            targetFastingMin: p.targetFastingMin || 80,
            targetFastingMax: p.targetFastingMax || 130,
            targetPostMealMax: p.targetPostMealMax || 180,
            emergencyContactName: p.emergencyContactName,
            emergencyContactPhone: p.emergencyContactPhone,
            preferredLanguage: p.preferredLanguage || 'English',
            timeZone: p.timeZone || 'Asia/Kolkata',
          });
          setEditFullName(p.fullName || '');
          setEditDob(p.dateOfBirth ? p.dateOfBirth.slice(0, 10) : '');
          setEditPhone(p.emergencyContactPhone || '');
          setEditLanguage(p.preferredLanguage || 'English');
          setEditDiabetesType(p.diabetesType || 'TYPE_2');
          setEditDiagnosisYear(String(p.diagnosisYear || 2021));
          setEditAllergies(p.knownAllergies || 'None documented');
          setEditClinician(p.primaryClinician || 'Dr. Sneha Kulkarni');
        }
      } catch {
        // Fallback profile
      }

      // 2. Fetch Caregivers
      try {
        const cgRes = await mobileApiFetch<{ consents: CaregiverConsentItem[] }>('/caregivers');
        if (cgRes?.consents) {
          setCaregivers(cgRes.consents.filter((c) => c.status === 'ACTIVE'));
        }
      } catch {
        // Caregiver fallback
      }

      // 3. Fetch Notification Preferences
      try {
        const prefRes = await mobileApiFetch<{ preferences: NotificationPrefs }>('/notifications/preferences');
        if (prefRes?.preferences) {
          setPrefs(prefRes.preferences);
        }
      } catch {
        // Prefs fallback
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfileData();
  }, [loadProfileData]);

  // --- SAVE PERSONAL INFO ---
  const handleSavePersonal = async () => {
    if (!editFullName.trim()) {
      showToast('Full name is required.');
      return;
    }
    setSavingPersonal(true);
    try {
      await mobileApiFetch('/profile', {
        method: 'PUT',
        body: JSON.stringify({
          fullName: editFullName.trim(),
          dateOfBirth: editDob ? new Date(editDob).toISOString() : undefined,
          emergencyContactPhone: editPhone.trim() || undefined,
          preferredLanguage: editLanguage,
        }),
      });
      showToast('Personal information updated');
      setShowEditPersonal(false);
      await loadProfileData();
    } catch {
      showToast('Unable to update profile. Please try again.');
    } finally {
      setSavingPersonal(false);
    }
  };

  // --- SAVE HEALTH PROFILE ---
  const handleSaveHealth = async () => {
    setSavingHealth(true);
    try {
      await mobileApiFetch('/profile', {
        method: 'PUT',
        body: JSON.stringify({
          diabetesType: editDiabetesType,
          diagnosisYear: parseInt(editDiagnosisYear, 10) || 2021,
          primaryClinician: editClinician.trim() || undefined,
          knownAllergies: editAllergies.trim() || undefined,
          targetFastingMin: parseFloat(editFastingMin) || 80,
          targetFastingMax: parseFloat(editFastingMax) || 130,
          targetPostMealMax: parseFloat(editPostMealMax) || 180,
        }),
      });
      showToast('Health targets updated');
      setShowEditHealth(false);
      await loadProfileData();
    } catch {
      showToast('Unable to update health targets.');
    } finally {
      setSavingHealth(false);
    }
  };

  // --- INVITE CAREGIVER ---
  const handleInviteCaregiver = async () => {
    if (!cgEmail.trim() || !cgName.trim()) {
      showToast('Caregiver name and email are required.');
      return;
    }
    setInvitingCg(true);

    const permissions: string[] = [];
    if (cgPermObs) permissions.push('VIEW_HEALTH_SUMMARY');
    if (cgPermMeds) permissions.push('VIEW_MEDICATIONS');
    if (cgPermAdherence) permissions.push('VIEW_MEDICATION_ADHERENCE');
    if (cgPermTasks) permissions.push('VIEW_TASKS');
    if (cgPermCompleteTasks) permissions.push('COMPLETE_TASKS_ON_BEHALF');
    if (cgPermAppt) permissions.push('VIEW_APPOINTMENTS');
    if (cgPermReports) permissions.push('VIEW_REPORTS');
    if (cgPermTimeline) permissions.push('VIEW_HEALTH_TIMELINE');

    if (permissions.length === 0) {
      showToast('Select at least one authorized permission.');
      setInvitingCg(false);
      return;
    }

    try {
      await caregiverApi.inviteCaregiver({
        caregiverEmail: cgEmail.trim().toLowerCase(),
        caregiverName: cgName.trim(),
        relationship: cgRelationship,
        permissions,
      });
      showToast('Caregiver invitation granted');
      setShowInviteCaregiver(false);
      setCgName('');
      setCgEmail('');
      await loadProfileData();
    } catch {
      showToast('Unable to delegate caregiver access.');
    } finally {
      setInvitingCg(false);
    }
  };

  // --- EDIT PERMISSIONS HANDLERS ---
  const handleOpenEditPermissions = (cg: CaregiverConsentItem) => {
    setEditingConsent(cg);
    const existing = cg.permissions || [];
    setEditPerms({
      VIEW_HEALTH_SUMMARY: existing.includes('VIEW_HEALTH_SUMMARY') || existing.includes('VIEW_OBSERVATIONS'),
      VIEW_MEDICATIONS: existing.includes('VIEW_MEDICATIONS'),
      VIEW_MEDICATION_ADHERENCE: existing.includes('VIEW_MEDICATION_ADHERENCE'),
      VIEW_TASKS: existing.includes('VIEW_TASKS'),
      COMPLETE_TASKS_ON_BEHALF: existing.includes('COMPLETE_TASKS_ON_BEHALF') || existing.includes('LOG_ON_BEHALF'),
      VIEW_APPOINTMENTS: existing.includes('VIEW_APPOINTMENTS') || existing.includes('VIEW_CONSULTATIONS'),
      VIEW_REPORTS: existing.includes('VIEW_REPORTS') || existing.includes('VIEW_DOCUMENTS'),
      VIEW_HEALTH_TIMELINE: existing.includes('VIEW_HEALTH_TIMELINE') || existing.includes('VIEW_CARE_PLAN'),
    });
    setShowEditPermissions(true);
  };

  const handleToggleEditPerm = (permKey: string) => {
    setEditPerms((prev) => ({
      ...prev,
      [permKey]: !prev[permKey],
    }));
  };

  const handleSaveEditedPermissions = async () => {
    if (!editingConsent) return;
    const selectedPerms = Object.entries(editPerms)
      .filter(([_, enabled]) => enabled)
      .map(([k]) => k);

    if (selectedPerms.length === 0) {
      showToast('Caregiver must have at least one permission.');
      return;
    }

    setSavingPermissions(true);
    try {
      await caregiverApi.updatePermissions(editingConsent.id, selectedPerms);
      showToast(`Permissions updated for ${editingConsent.caregiverName}`);
      setShowEditPermissions(false);
      await loadProfileData();
    } catch (err: any) {
      showToast(err?.message || 'Failed to update caregiver permissions.');
    } finally {
      setSavingPermissions(false);
    }
  };

  // --- VIEW CAREGIVER ACTIONS HANDLERS ---
  const handleOpenCaregiverActions = async (cg: CaregiverConsentItem) => {
    setViewingActionsConsent(cg);
    setShowCaregiverActions(true);
    setActionsLoading(true);
    try {
      const res = await caregiverApi.getCaregiverActions(cg.id);
      setCaregiverActions(res.actions || []);
    } catch (err: any) {
      showToast(err?.message || 'Could not load activity log');
      setCaregiverActions([]);
    } finally {
      setActionsLoading(false);
    }
  };

  // --- REVOKE CAREGIVER ---
  const handleRevokeCaregiver = (id: string, name: string) => {
    Alert.alert(
      'Revoke Caregiver Access',
      `Are you sure you want to revoke all access for ${name}? They will immediately lose access to your medical records and care tasks.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke Access',
          style: 'destructive',
          onPress: async () => {
            try {
              await caregiverApi.revokeConsent(id);
              showToast(`Access revoked for ${name}`);
              await loadProfileData();
            } catch {
              showToast('Unable to revoke access.');
            }
          },
        },
      ]
    );
  };

  // --- UPDATE NOTIFICATION PREFS ---
  const handleTogglePref = async (key: keyof NotificationPrefs, value: boolean) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    try {
      await mobileApiFetch('/notifications/preferences', {
        method: 'PUT',
        body: JSON.stringify(updated),
      });
      showToast('Notification preferences updated');
    } catch {
      // Revert on error
      setPrefs(prefs);
      showToast('Unable to save preferences.');
    }
  };

  const handleTogglePush = async (enabled: boolean) => {
    if (enabled) {
      try {
        const granted = await registerForPushNotifications();
        if (granted) {
          const pseudoToken = `device-push-${Date.now()}`;
          await notificationsApi.registerPushToken(pseudoToken, 'EXPO', Platform.OS);
          await handleTogglePref('pushEnabled', true);
          showToast('Push notifications enabled');
        } else {
          showToast('Push notification permission was not granted by device.');
        }
      } catch {
        showToast('Error enabling push notifications.');
      }
    } else {
      await handleTogglePref('pushEnabled', false);
      showToast('Push notifications disabled.');
    }
  };

  // --- LOGOUT ---
  const handleLogout = async () => {
    try {
      try {
        await notificationsApi.unregisterPushToken('device-push-session');
      } catch {
        // Ignore unregister errors during logout
      }
      await logoutMobileSession();
      await clearMobileToken();
      showToast('Signed out successfully.');
      router.replace('/(auth)/role-selection');
    } catch {
      await clearMobileToken();
      router.replace('/(auth)/role-selection');
    }
  };

  // --- DELETE / DEACTIVATE ACCOUNT ---
  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      showToast('Password confirmation is required.');
      return;
    }
    setDeletingAccount(true);
    try {
      const res = await mobileApiFetch<{ success: boolean; message: string }>('/auth/deactivate', {
        method: 'POST',
        body: JSON.stringify({
          password: deletePassword,
          reason: 'User requested account deactivation via profile settings',
        }),
      });

      await clearMobileToken();
      setShowDeleteModal(false);
      Alert.alert(
        'Account Deactivated',
        res.message || 'Your account has been deactivated in compliance with clinical data retention regulations.',
        [
          {
            text: 'OK',
            onPress: () => router.replace('/(auth)/welcome'),
          },
        ],
      );
    } catch {
      showToast('Invalid password. Account deactivation cancelled.');
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Account & Settings</Text>
          <Text style={styles.headerSub}>Manage Profile, Caregivers & Security</Text>
        </View>
        <TouchableOpacity
          style={styles.logoutHeaderBtn}
          onPress={handleLogout}
          accessibilityRole="button"
          accessibilityLabel="Logout"
        >
          <LogOut color="#DC2626" size={18} />
          <Text style={styles.logoutHeaderText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.contentScroll, { paddingBottom: insets.bottom + 84 }]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>Loading profile details...</Text>
          </View>
        ) : (
          <>
            {/* PERSONAL INFORMATION */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleRow}>
                  <User color={theme.colors.primary} size={18} />
                  <Text style={styles.sectionTitle}>Personal Information</Text>
                </View>
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => setShowEditPersonal(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Edit Personal Information"
                >
                  <Edit2 color={theme.colors.primary} size={14} />
                  <Text style={styles.editBtnText}>Edit</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.infoGrid}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Full Name</Text>
                  <Text style={styles.infoValue}>{profile.fullName}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Email Address</Text>
                  <Text style={styles.infoValue}>{profile.email}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Date of Birth</Text>
                  <Text style={styles.infoValue}>{profile.dateOfBirth ? new Date(profile.dateOfBirth).toLocaleDateString('en-IN') : 'Not specified'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Emergency Phone</Text>
                  <Text style={styles.infoValue}>{profile.emergencyContactPhone || 'Not set'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Preferred Language</Text>
                  <Text style={styles.infoValue}>{profile.preferredLanguage || 'English'}</Text>
                </View>
              </View>
            </View>

            {/* HEALTH PROFILE */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleRow}>
                  <Stethoscope color={theme.colors.primary} size={18} />
                  <Text style={styles.sectionTitle}>Clinical Health Profile</Text>
                </View>
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => setShowEditHealth(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Edit Clinical Health Profile"
                >
                  <Edit2 color={theme.colors.primary} size={14} />
                  <Text style={styles.editBtnText}>Edit</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.infoGrid}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Diabetes Classification</Text>
                  <Text style={styles.infoValueHighlight}>{profile.diabetesType.replace(/_/g, ' ')}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Diagnosis Year</Text>
                  <Text style={styles.infoValue}>{profile.diagnosisYear || 2021}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Primary Endocrinologist</Text>
                  <Text style={styles.infoValue}>{profile.primaryClinician || 'Dr. Sneha Kulkarni'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Target Fasting Range</Text>
                  <Text style={styles.infoValue}>{profile.targetFastingMin} - {profile.targetFastingMax} mg/dL</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Target Post-Meal Max</Text>
                  <Text style={styles.infoValue}>{profile.targetPostMealMax} mg/dL</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Known Allergies</Text>
                  <Text style={styles.infoValue}>{profile.knownAllergies || 'None documented'}</Text>
                </View>
              </View>
            </View>

            {/* CAREGIVER ACCESS MANAGER */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleRow}>
                  <HeartHandshake color={theme.colors.primary} size={18} />
                  <Text style={styles.sectionTitle}>Caregiver Access Manager</Text>
                </View>
                <TouchableOpacity
                  style={styles.addCgBtn}
                  onPress={() => setShowInviteCaregiver(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Invite Caregiver"
                >
                  <Plus color={theme.colors.white} size={14} />
                  <Text style={styles.addCgBtnText}>Invite</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.sectionDesc}>
                Explicitly grant loved ones or trusted companions access to your glucose readings, medication schedule, and emergency alarms.
              </Text>

              {caregivers.length > 0 ? (
                caregivers.map((cg) => {
                  const lastAccessText = cg.lastAccessedAt
                    ? new Date(cg.lastAccessedAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Never';

                  return (
                    <View key={cg.id} style={styles.caregiverCardDetailed}>
                      <View style={styles.cgHeaderRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cgName}>{cg.caregiverName}</Text>
                          <Text style={styles.cgEmail}>
                            {cg.caregiverEmail} • {cg.relationship}
                          </Text>
                        </View>
                        <View style={styles.cgStatusBadge}>
                          <Text style={styles.cgStatusBadgeText}>Active Consent</Text>
                        </View>
                      </View>

                      <View style={styles.cgLastAccessRow}>
                        <Clock size={12} color="#64748B" />
                        <Text style={styles.cgLastAccessText}>
                          Last accessed on your behalf: <Text style={{ fontWeight: '700', color: '#0F172A' }}>{lastAccessText}</Text>
                        </Text>
                      </View>

                      <View style={styles.permissionsPillsRow}>
                        {cg.permissions.map((p) => (
                          <View key={p} style={styles.permPill}>
                            <Text style={styles.permPillText}>{p.replace(/_/g, ' ')}</Text>
                          </View>
                        ))}
                      </View>

                      <View style={styles.cgActionBtnRow}>
                        <TouchableOpacity
                          style={styles.cgEditBtn}
                          onPress={() => handleOpenEditPermissions(cg)}
                          accessibilityRole="button"
                          accessibilityLabel="Edit Permissions"
                        >
                          <Edit2 size={13} color={theme.colors.primary} />
                          <Text style={styles.cgEditBtnText}>Permissions</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.cgHistoryBtn}
                          onPress={() => handleOpenCaregiverActions(cg)}
                          accessibilityRole="button"
                          accessibilityLabel="View Activity History"
                        >
                          <History size={13} color="#0284C7" />
                          <Text style={styles.cgHistoryBtnText}>Activity</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.revokeBtn}
                          onPress={() => handleRevokeCaregiver(cg.id, cg.caregiverName)}
                          accessibilityRole="button"
                          accessibilityLabel="Revoke Access"
                        >
                          <XCircle color="#DC2626" size={13} />
                          <Text style={styles.revokeBtnText}>Revoke</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              ) : (
                <View style={styles.emptyCaregivers}>
                  <Users color={theme.colors.textMuted} size={28} />
                  <Text style={styles.emptyCgText}>No active caregivers delegated.</Text>
                  <Text style={styles.emptyCgSub}>Tap "+ Invite" to grant granular access to a family member.</Text>
                </View>
              )}
            </View>

            {/* PRIVACY & SECURITY SETTINGS */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleRow}>
                  <ShieldCheck color={theme.colors.primary} size={18} />
                  <Text style={styles.sectionTitle}>Privacy & Security Settings</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.securityRowItem}
                onPress={() => setShowPrivacyModal(true)}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.secItemTitle}>Clinical Data Governance Policy</Text>
                  <Text style={styles.secItemSub}>HIPAA, DISHA, and zero-retention voice privacy standards</Text>
                </View>
                <ChevronRight color={theme.colors.textMuted} size={18} />
              </TouchableOpacity>

              <View style={styles.securityRowItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.secItemTitle}>Active Session Security</Text>
                  <Text style={styles.secItemSub}>Device authenticated with rotating JWT and SQLite session lock</Text>
                </View>
                <View style={styles.statusPillActive}>
                  <Text style={styles.statusPillActiveText}>Protected</Text>
                </View>
              </View>
            </View>

            {/* NOTIFICATION PREFERENCES & QUIET HOURS */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleRow}>
                  <Bell color={theme.colors.primary} size={18} />
                  <Text style={styles.sectionTitle}>Notification Preferences & Quiet Hours</Text>
                </View>
              </View>

              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>Device Push Notifications</Text>
                  <Text style={styles.toggleSub}>Lock-screen alerts with privacy-preserving previews</Text>
                </View>
                <Switch
                  value={prefs.pushEnabled}
                  onValueChange={(val) => void handleTogglePush(val)}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                />
              </View>

              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>Medication Dose Reminders</Text>
                  <Text style={styles.toggleSub}>Receive timely alerts when your prescribed medicines are due</Text>
                </View>
                <Switch
                  value={prefs.medicationReminders}
                  onValueChange={(val) => handleTogglePref('medicationReminders', val)}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                />
              </View>

              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>Blood Sugar Check Reminders</Text>
                  <Text style={styles.toggleSub}>Fasting morning and post-prandial logging prompts</Text>
                </View>
                <Switch
                  value={prefs.sugarCheckReminders}
                  onValueChange={(val) => handleTogglePref('sugarCheckReminders', val)}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                />
              </View>

              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>Care Plan & Task Updates</Text>
                  <Text style={styles.toggleSub}>Notifies when your doctor assigns or modifies your care plan</Text>
                </View>
                <Switch
                  value={prefs.carePlanUpdates}
                  onValueChange={(val) => handleTogglePref('carePlanUpdates', val)}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                />
              </View>

              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>Doctor-Assigned Tasks</Text>
                  <Text style={styles.toggleSub}>Reminders for scheduled clinical tasks</Text>
                </View>
                <Switch
                  value={prefs.taskReminders ?? true}
                  onValueChange={(val) => handleTogglePref('taskReminders', val)}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                />
              </View>

              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>Journey Milestones & Badges</Text>
                  <Text style={styles.toggleSub}>Celebrate 7-day adherence and glucose logging milestones</Text>
                </View>
                <Switch
                  value={prefs.journeyMilestones ?? true}
                  onValueChange={(val) => handleTogglePref('journeyMilestones', val)}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                />
              </View>

              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>Doctor Consultation Notes</Text>
                  <Text style={styles.toggleSub}>Alerts when your physician approves consultation summaries</Text>
                </View>
                <Switch
                  value={prefs.consultationUpdates ?? true}
                  onValueChange={(val) => handleTogglePref('consultationUpdates', val)}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                />
              </View>

              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>Emergency SOS Broadcast Alerts</Text>
                  <Text style={styles.toggleSub}>Critical health alerts delivered to caregivers & emergency contacts</Text>
                </View>
                <Switch
                  value={prefs.emergencyAlerts}
                  onValueChange={(val) => handleTogglePref('emergencyAlerts', val)}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                />
              </View>

              {/* Quiet Hours Section */}
              <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                <View style={styles.toggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.toggleTitle}>Quiet Hours (Night Rest)</Text>
                    <Text style={styles.toggleSub}>
                      Mutes non-urgent reminders during sleep (10:00 PM to 7:00 AM {prefs.timezone || 'IST'})
                    </Text>
                  </View>
                  <Switch
                    value={prefs.quietHoursEnabled ?? false}
                    onValueChange={(val) => handleTogglePref('quietHoursEnabled', val)}
                    trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                  />
                </View>
                {prefs.quietHoursEnabled && (
                  <View style={{ backgroundColor: '#F0FDFA', padding: 10, borderRadius: 8, marginTop: 8 }}>
                    <Text style={{ fontSize: 12, color: '#0F766E', fontWeight: '600' }}>
                      Quiet Window Active: {prefs.quietHoursStart || '22:00'} to {prefs.quietHoursEnd || '07:00'} ({prefs.timezone || 'Asia/Kolkata'})
                    </Text>
                    <Text style={{ fontSize: 11, color: '#115E59', marginTop: 2 }}>
                      Urgent clinical safety alerts bypass quiet hours automatically.
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* LOGOUT */}
            <TouchableOpacity
              style={styles.logoutCardBtn}
              onPress={handleLogout}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Sign Out of AarogyaDamu"
            >
              <LogOut color="#DC2626" size={18} />
              <Text style={styles.logoutCardText}>Sign Out (Logout Session)</Text>
            </TouchableOpacity>

            {/* DELETE ACCOUNT */}
            <TouchableOpacity
              style={styles.deleteCardBtn}
              onPress={() => setShowDeleteModal(true)}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Deactivate Account"
            >
              <Trash2 color="#991B1B" size={18} />
              <View style={{ flex: 1 }}>
                <Text style={styles.deleteCardTitle}>Delete / Deactivate Account</Text>
                <Text style={styles.deleteCardSub}>
                  Deactivate access in compliance with clinical data retention policies
                </Text>
              </View>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* MODAL: EDIT PERSONAL INFO */}
      <Modal visible={showEditPersonal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Personal Information</Text>
              <TouchableOpacity onPress={() => setShowEditPersonal(false)}>
                <X color={theme.colors.text} size={22} />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Full Legal Name</Text>
              <TextInput
                style={styles.textInput}
                value={editFullName}
                onChangeText={setEditFullName}
                placeholder="e.g. Pranav Mirage"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Date of Birth (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.textInput}
                value={editDob}
                onChangeText={setEditDob}
                placeholder="1985-06-15"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Emergency Phone</Text>
              <TextInput
                style={styles.textInput}
                value={editPhone}
                onChangeText={setEditPhone}
                placeholder="+91 98765 43210"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Preferred Language</Text>
              <TextInput
                style={styles.textInput}
                value={editLanguage}
                onChangeText={setEditLanguage}
                placeholder="English / Hindi / Telugu"
              />
            </View>

            <TouchableOpacity
              style={styles.modalSubmitBtn}
              onPress={handleSavePersonal}
              disabled={savingPersonal}
            >
              {savingPersonal ? <ActivityIndicator color={theme.colors.white} /> : <Text style={styles.modalSubmitBtnText}>Save Changes</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL: EDIT HEALTH TARGETS */}
      <Modal visible={showEditHealth} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Health Profile</Text>
              <TouchableOpacity onPress={() => setShowEditHealth(false)}>
                <X color={theme.colors.text} size={22} />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Primary Endocrinologist</Text>
              <TextInput
                style={styles.textInput}
                value={editClinician}
                onChangeText={setEditClinician}
                placeholder="Dr. Sneha Kulkarni"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Target Fasting Min - Max (mg/dL)</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TextInput
                  style={[styles.textInput, { flex: 1 }]}
                  value={editFastingMin}
                  onChangeText={setEditFastingMin}
                  keyboardType="numeric"
                  placeholder="Min (80)"
                />
                <TextInput
                  style={[styles.textInput, { flex: 1 }]}
                  value={editFastingMax}
                  onChangeText={setEditFastingMax}
                  keyboardType="numeric"
                  placeholder="Max (130)"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Target Post-Meal Max (mg/dL)</Text>
              <TextInput
                style={styles.textInput}
                value={editPostMealMax}
                onChangeText={setEditPostMealMax}
                keyboardType="numeric"
                placeholder="180"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Known Allergies</Text>
              <TextInput
                style={styles.textInput}
                value={editAllergies}
                onChangeText={setEditAllergies}
                placeholder="e.g. Sulfa drugs, Penicillin, None"
              />
            </View>

            <TouchableOpacity
              style={styles.modalSubmitBtn}
              onPress={handleSaveHealth}
              disabled={savingHealth}
            >
              {savingHealth ? <ActivityIndicator color={theme.colors.white} /> : <Text style={styles.modalSubmitBtnText}>Save Targets</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL: INVITE CAREGIVER */}
      <Modal visible={showInviteCaregiver} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Invite Trusted Caregiver</Text>
              <TouchableOpacity onPress={() => setShowInviteCaregiver(false)}>
                <X color={theme.colors.text} size={22} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Caregiver Full Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={cgName}
                  onChangeText={setCgName}
                  placeholder="e.g. Maya Mirage"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Caregiver Email</Text>
                <TextInput
                  style={styles.textInput}
                  value={cgEmail}
                  onChangeText={setCgEmail}
                  keyboardType="email-address"
                  placeholder="caregiver@gmail.com"
                  autoCapitalize="none"
                />
              </View>

              <Text style={[styles.inputLabel, { marginTop: 6, marginBottom: 4 }]}>
                Granular Delegated Permissions:
              </Text>

              <View style={styles.checkboxRow}>
                <Switch
                  value={cgPermObs}
                  onValueChange={setCgPermObs}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                />
                <Text style={styles.checkboxLabel}>View Blood Glucose & Health Summary</Text>
              </View>

              <View style={styles.checkboxRow}>
                <Switch
                  value={cgPermMeds}
                  onValueChange={setCgPermMeds}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                />
                <Text style={styles.checkboxLabel}>View Prescribed Medications</Text>
              </View>

              <View style={styles.checkboxRow}>
                <Switch
                  value={cgPermAdherence}
                  onValueChange={setCgPermAdherence}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                />
                <Text style={styles.checkboxLabel}>View Medication Adherence Log</Text>
              </View>

              <View style={styles.checkboxRow}>
                <Switch
                  value={cgPermTasks}
                  onValueChange={setCgPermTasks}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                />
                <Text style={styles.checkboxLabel}>View Doctor Care Tasks</Text>
              </View>

              <View style={styles.checkboxRow}>
                <Switch
                  value={cgPermCompleteTasks}
                  onValueChange={setCgPermCompleteTasks}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                />
                <Text style={styles.checkboxLabel}>Complete Tasks On My Behalf</Text>
              </View>

              <View style={styles.checkboxRow}>
                <Switch
                  value={cgPermAppt}
                  onValueChange={setCgPermAppt}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                />
                <Text style={styles.checkboxLabel}>View Upcoming Doctor Appointments</Text>
              </View>

              <View style={styles.checkboxRow}>
                <Switch
                  value={cgPermReports}
                  onValueChange={setCgPermReports}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                />
                <Text style={styles.checkboxLabel}>View Diagnostic Reports & Labs</Text>
              </View>

              <View style={styles.checkboxRow}>
                <Switch
                  value={cgPermTimeline}
                  onValueChange={setCgPermTimeline}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                />
                <Text style={styles.checkboxLabel}>View Health Timeline & Care Plan</Text>
              </View>

              <TouchableOpacity
                style={[styles.modalSubmitBtn, { marginTop: 16 }]}
                onPress={handleInviteCaregiver}
                disabled={invitingCg}
              >
                {invitingCg ? (
                  <ActivityIndicator color={theme.colors.white} />
                ) : (
                  <Text style={styles.modalSubmitBtnText}>Send Caregiver Invitation</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL: EDIT CAREGIVER PERMISSIONS */}
      <Modal visible={showEditPermissions} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Manage Access</Text>
                <Text style={styles.modalSubHeader}>
                  {editingConsent?.caregiverName} ({editingConsent?.caregiverEmail})
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowEditPermissions(false)}>
                <X color={theme.colors.text} size={22} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.inputLabel, { marginTop: 4, marginBottom: 8 }]}>
                Toggle Delegated Capabilities:
              </Text>

              <View style={styles.checkboxRow}>
                <Switch
                  value={editPerms.VIEW_HEALTH_SUMMARY}
                  onValueChange={() => handleToggleEditPerm('VIEW_HEALTH_SUMMARY')}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                />
                <Text style={styles.checkboxLabel}>View Blood Glucose & Health Summary</Text>
              </View>

              <View style={styles.checkboxRow}>
                <Switch
                  value={editPerms.VIEW_MEDICATIONS}
                  onValueChange={() => handleToggleEditPerm('VIEW_MEDICATIONS')}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                />
                <Text style={styles.checkboxLabel}>View Prescribed Medications</Text>
              </View>

              <View style={styles.checkboxRow}>
                <Switch
                  value={editPerms.VIEW_MEDICATION_ADHERENCE}
                  onValueChange={() => handleToggleEditPerm('VIEW_MEDICATION_ADHERENCE')}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                />
                <Text style={styles.checkboxLabel}>View Medication Adherence Log</Text>
              </View>

              <View style={styles.checkboxRow}>
                <Switch
                  value={editPerms.VIEW_TASKS}
                  onValueChange={() => handleToggleEditPerm('VIEW_TASKS')}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                />
                <Text style={styles.checkboxLabel}>View Doctor Care Tasks</Text>
              </View>

              <View style={styles.checkboxRow}>
                <Switch
                  value={editPerms.COMPLETE_TASKS_ON_BEHALF}
                  onValueChange={() => handleToggleEditPerm('COMPLETE_TASKS_ON_BEHALF')}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                />
                <Text style={styles.checkboxLabel}>Complete Tasks On My Behalf</Text>
              </View>

              <View style={styles.checkboxRow}>
                <Switch
                  value={editPerms.VIEW_APPOINTMENTS}
                  onValueChange={() => handleToggleEditPerm('VIEW_APPOINTMENTS')}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                />
                <Text style={styles.checkboxLabel}>View Upcoming Appointments</Text>
              </View>

              <View style={styles.checkboxRow}>
                <Switch
                  value={editPerms.VIEW_REPORTS}
                  onValueChange={() => handleToggleEditPerm('VIEW_REPORTS')}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                />
                <Text style={styles.checkboxLabel}>View Medical Reports & Lab Results</Text>
              </View>

              <View style={styles.checkboxRow}>
                <Switch
                  value={editPerms.VIEW_HEALTH_TIMELINE}
                  onValueChange={() => handleToggleEditPerm('VIEW_HEALTH_TIMELINE')}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                />
                <Text style={styles.checkboxLabel}>View Care Plan & Health Timeline</Text>
              </View>

              <TouchableOpacity
                style={[styles.modalSubmitBtn, { marginTop: 16 }]}
                onPress={handleSaveEditedPermissions}
                disabled={savingPermissions}
              >
                {savingPermissions ? (
                  <ActivityIndicator color={theme.colors.white} />
                ) : (
                  <Text style={styles.modalSubmitBtnText}>Save Permissions</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL: CAREGIVER ACTIVITY HISTORY */}
      <Modal visible={showCaregiverActions} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Caregiver Audit History</Text>
                <Text style={styles.modalSubHeader}>
                  Actions performed by {viewingActionsConsent?.caregiverName}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowCaregiverActions(false)}>
                <X color={theme.colors.text} size={22} />
              </TouchableOpacity>
            </View>

            {actionsLoading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={{ marginTop: 10, color: '#64748B', fontSize: 13 }}>
                  Fetching verified audit entries...
                </Text>
              </View>
            ) : caregiverActions.length === 0 ? (
              <View style={{ paddingVertical: 36, alignItems: 'center' }}>
                <History size={36} color="#94A3B8" />
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#0F172A', marginTop: 10 }}>
                  No Actions Recorded Yet
                </Text>
                <Text style={{ fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 4, paddingHorizontal: 16 }}>
                  When this caregiver marks a task complete or logs an entry on your behalf, it will be cryptographically attributed here.
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 8 }}>
                {caregiverActions.map((action) => (
                  <View key={action.id} style={styles.actionItemCard}>
                    <View style={styles.actionItemHeader}>
                      <Text style={styles.actionItemTitle}>{action.title}</Text>
                      <View style={styles.actionTypeBadge}>
                        <Text style={styles.actionTypeBadgeText}>{action.type.replace(/_/g, ' ')}</Text>
                      </View>
                    </View>
                    <Text style={styles.actionItemDetails}>{action.details}</Text>
                    <View style={styles.actionItemTimeRow}>
                      <Clock size={11} color="#94A3B8" />
                      <Text style={styles.actionItemTime}>
                        {new Date(action.timestamp).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}

            <TouchableOpacity
              style={[styles.modalSubmitBtn, { marginTop: 16, backgroundColor: '#0F172A' }]}
              onPress={() => setShowCaregiverActions(false)}
            >
              <Text style={styles.modalSubmitBtnText}>Close Activity Log</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL: CLINICAL PRIVACY POLICY */}
      <Modal visible={showPrivacyModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Clinical Data Governance</Text>
              <TouchableOpacity onPress={() => setShowPrivacyModal(false)}>
                <X color={theme.colors.text} size={22} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.privacyBody}>
                AarogyaDamu complies with the Indian Digital Personal Data Protection Act (DPDP), ABDM health records guidelines, and international clinical safety standards.
                {'\n\n'}
                1. Zero Audio Retention: Voice interactions with the Damu AI companion are processed entirely in ephemeral memory and discarded immediately upon transcription.
                {'\n\n'}
                2. Clinical Audit Continuity: Consultation notes, physician prescriptions, and emergency dispatch events are cryptographically attributed with immutable audit logs.
                {'\n\n'}
                3. Non-Prescribing Companion: Damu provides health education and adherence reminders but cannot independently diagnose, alter medication dosages, or replace licensed medical advice.
              </Text>
            </ScrollView>

            <TouchableOpacity
              style={styles.modalSubmitBtn}
              onPress={() => setShowPrivacyModal(false)}
            >
              <Text style={styles.modalSubmitBtnText}>Understood</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL: DELETE / DEACTIVATE ACCOUNT */}
      <Modal visible={showDeleteModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { borderColor: '#FECACA', borderWidth: 1 }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <AlertTriangle color="#DC2626" size={20} />
                <Text style={[styles.modalTitle, { color: '#B91C1C' }]}>Deactivate Account</Text>
              </View>
              <TouchableOpacity onPress={() => setShowDeleteModal(false)}>
                <X color={theme.colors.text} size={22} />
              </TouchableOpacity>
            </View>

            <Text style={styles.deleteWarningText}>
              Deactivating your account will immediately revoke all authentication sessions and cancel all caregiver access delegations.
              {'\n\n'}
              In compliance with healthcare regulations, historical medical consultation notes, prescriptions, and lab audits will be archived for legal and clinical continuity.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Confirm Your Password</Text>
              <TextInput
                style={styles.textInput}
                secureTextEntry
                placeholder="Enter account password"
                value={deletePassword}
                onChangeText={setDeletePassword}
              />
            </View>

            <TouchableOpacity
              style={styles.confirmDeleteBtn}
              onPress={handleDeleteAccount}
              disabled={deletingAccount}
            >
              {deletingAccount ? (
                <ActivityIndicator color={theme.colors.white} />
              ) : (
                <Text style={styles.confirmDeleteBtnText}>Confirm Deactivation & Sign Out</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.white },
  header: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    backgroundColor: theme.colors.white,
  },
  headerLeft: { flex: 1, marginRight: theme.spacing.md },
  headerTitle: {
    fontSize: theme.typography.sizes.heading,
    fontWeight: theme.typography.weights.black,
    color: theme.colors.text,
  },
  headerSub: {
    fontSize: theme.typography.sizes.bodySm,
    color: theme.colors.textMuted,
    marginTop: 2,
    fontWeight: theme.typography.weights.semibold,
  },
  logoutHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.md,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  logoutHeaderText: {
    fontSize: 12,
    fontWeight: theme.typography.weights.extrabold,
    color: '#DC2626',
  },
  contentScroll: {
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
    backgroundColor: theme.colors.bg,
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: theme.typography.sizes.bodySm,
    color: theme.colors.textMuted,
  },
  sectionCard: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: {
    fontSize: theme.typography.sizes.bodyLg,
    fontWeight: theme.typography.weights.black,
    color: theme.colors.text,
  },
  sectionDesc: {
    fontSize: 12,
    color: theme.colors.textMuted,
    lineHeight: 18,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.primarySurface,
  },
  editBtnText: {
    fontSize: 11,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primary,
  },
  infoGrid: { gap: 10, marginTop: 4 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textSecondary,
  },
  infoValue: {
    fontSize: 12,
    color: theme.colors.text,
    fontWeight: theme.typography.weights.medium,
  },
  infoValueHighlight: {
    fontSize: 12,
    fontWeight: theme.typography.weights.black,
    color: theme.colors.primary,
  },
  // Caregiver Styles
  addCgBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radius.sm,
  },
  addCgBtnText: {
    color: theme.colors.white,
    fontSize: 11,
    fontWeight: theme.typography.weights.bold,
  },
  caregiverCardDetailed: {
    backgroundColor: '#F8FAFC',
    borderRadius: theme.radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  cgHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cgStatusBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  cgStatusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  cgLastAccessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  cgLastAccessText: {
    fontSize: 11,
    color: '#64748B',
  },
  cgActionBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  cgEditBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: theme.colors.primarySurface,
    paddingVertical: 6,
    borderRadius: 6,
  },
  cgEditBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  cgHistoryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#E0F2FE',
    paddingVertical: 6,
    borderRadius: 6,
  },
  cgHistoryBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
  },
  caregiverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    gap: 10,
  },
  cgName: { fontSize: 13, fontWeight: theme.typography.weights.extrabold, color: theme.colors.text },
  cgEmail: { fontSize: 11, color: theme.colors.textMuted, marginTop: 1 },
  permissionsPillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  permPill: {
    backgroundColor: theme.colors.primarySurface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  permPillText: { fontSize: 9, fontWeight: theme.typography.weights.bold, color: theme.colors.primary },
  revokeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
  },
  revokeBtnText: { fontSize: 11, fontWeight: theme.typography.weights.bold, color: '#DC2626' },
  emptyCaregivers: { alignItems: 'center', paddingVertical: 16, gap: 4 },
  emptyCgText: { fontSize: 12, fontWeight: theme.typography.weights.bold, color: theme.colors.textSecondary },
  emptyCgSub: { fontSize: 11, color: theme.colors.textMuted, textAlign: 'center' },
  modalSubHeader: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  actionItemCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  actionItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  actionItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
  },
  actionTypeBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  actionTypeBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#0284C7',
    textTransform: 'uppercase',
  },
  actionItemDetails: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
    marginBottom: 6,
  },
  actionItemTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionItemTime: {
    fontSize: 10,
    color: '#94A3B8',
  },
  // Security Items
  securityRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  secItemTitle: { fontSize: 13, fontWeight: theme.typography.weights.bold, color: theme.colors.text },
  secItemSub: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  statusPillActive: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  statusPillActiveText: { fontSize: 10, fontWeight: theme.typography.weights.bold, color: '#16A34A' },
  // Toggles
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    gap: 12,
  },
  toggleTitle: { fontSize: 12, fontWeight: theme.typography.weights.bold, color: theme.colors.text },
  toggleSub: { fontSize: 10, color: theme.colors.textMuted, marginTop: 2, lineHeight: 14 },
  // Logout & Delete Buttons
  logoutCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.white,
    paddingVertical: 14,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  logoutCardText: { fontSize: 13, fontWeight: theme.typography.weights.extrabold, color: '#DC2626' },
  deleteCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FEF2F2',
    padding: theme.spacing.lg,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  deleteCardTitle: { fontSize: 13, fontWeight: theme.typography.weights.black, color: '#991B1B' },
  deleteCardSub: { fontSize: 11, color: '#B91C1C', marginTop: 2, lineHeight: 16 },
  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    gap: 14,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: theme.typography.sizes.headingSm, fontWeight: theme.typography.weights.black, color: theme.colors.text },
  inputGroup: { gap: 4 },
  inputLabel: { fontSize: 11, fontWeight: theme.typography.weights.bold, color: theme.colors.textSecondary },
  textInput: {
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: theme.typography.sizes.bodySm,
    color: theme.colors.text,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  checkboxLabel: { fontSize: 11, fontWeight: theme.typography.weights.medium, color: theme.colors.text, flex: 1 },
  modalSubmitBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  modalSubmitBtnText: { color: theme.colors.white, fontWeight: theme.typography.weights.bold, fontSize: 13 },
  privacyBody: { fontSize: 12, color: theme.colors.textSecondary, lineHeight: 18 },
  deleteWarningText: { fontSize: 12, color: '#7F1D1D', lineHeight: 18 },
  confirmDeleteBtn: {
    backgroundColor: '#DC2626',
    borderRadius: theme.radius.md,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  confirmDeleteBtnText: { color: theme.colors.white, fontWeight: theme.typography.weights.black, fontSize: 13 },
});
