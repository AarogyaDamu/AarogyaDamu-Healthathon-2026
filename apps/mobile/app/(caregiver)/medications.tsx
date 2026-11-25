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
import { useFocusEffect } from 'expo-router';
import {
  Pill,
  Clock,
  ShieldCheck,
  AlertCircle,
  Lock,
  Calendar,
  Info,
  CheckCircle2,
} from 'lucide-react-native';
import { theme } from '../../src/theme';
import {
  caregiverApi,
  CaregiverMedication,
  CaregiverPatient,
} from '../../src/api/caregiver';

export default function CaregiverMedicationsScreen() {
  const [activePatient, setActivePatient] = useState<CaregiverPatient | null>(null);
  const [medications, setMedications] = useState<CaregiverMedication[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setError('');
    try {
      const patientRes = await caregiverApi.getPatients();
      const patientList = patientRes.patients || [];

      if (patientList.length === 0) {
        setActivePatient(null);
        setMedications([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      let patientId = await caregiverApi.getActivePatientId();
      let patient = patientList.find((p) => p.patientId === patientId);
      if (!patient) {
        patient = patientList[0];
        patientId = patient.patientId;
        await caregiverApi.setActivePatientId(patientId);
      }
      setActivePatient(patient);

      const perms = patient.permissions || [];
      const canView = perms.includes('VIEW_MEDICATIONS') || perms.includes('MANAGE_MEDICATIONS');

      if (!canView) {
        setError('Requires VIEW_MEDICATIONS permission to inspect prescribed medicines.');
        setMedications([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const res = await caregiverApi.getMedications(patientId);
      setMedications(res.medications || []);
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : 'Unable to load medications.';
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData])
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
        <Text style={styles.headerTitle}>Medications for {activePatient?.name || 'Patient'}</Text>
        <Text style={styles.headerSubtitle}>
          DOCTOR-PRESCRIBED MEDICINES • View active dosages, timings, and dietary instructions.
        </Text>

        {/* Clinical Boundary Notice */}
        <View style={styles.boundaryNotice}>
          <Info size={14} color={theme.colors.primary} />
          <Text style={styles.boundaryNoticeText}>
            Prescriptions are strictly doctor-managed. Caregivers cannot create, alter dosages, pause, or delete clinical prescriptions.
          </Text>
        </View>
      </View>

      {/* Main Body */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading prescribed medications...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorCard}>
          <AlertCircle size={28} color="#ba1a1a" />
          <Text style={styles.errorTitle}>Access Restricted</Text>
          <Text style={styles.errorBody}>{error}</Text>
        </View>
      ) : medications.length === 0 ? (
        <View style={styles.emptyCard}>
          <Pill size={40} color={theme.colors.textPlaceholder} />
          <Text style={styles.emptyTitle}>No Prescriptions Found</Text>
          <Text style={styles.emptyBody}>
            There are currently no doctor-prescribed medications recorded for this patient.
          </Text>
        </View>
      ) : (
        medications.map((med) => {
          const isActive = med.status === 'ACTIVE';

          return (
            <View key={med.id} style={styles.medCard}>
              <View style={styles.cardHeader}>
                <View style={styles.medIconBox}>
                  <Pill size={18} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.medName}>{med.medicineName}</Text>
                  {med.genericName ? (
                    <Text style={styles.genericName}>{med.genericName}</Text>
                  ) : null}
                </View>
                <View style={[styles.statusBadge, isActive ? styles.statusActive : styles.statusPaused]}>
                  <Text style={[styles.statusText, isActive ? styles.statusTextActive : styles.statusTextPaused]}>
                    {med.status}
                  </Text>
                </View>
              </View>

              {/* Dosage Details Grid */}
              <View style={styles.dosageGrid}>
                <View style={styles.gridItem}>
                  <Text style={styles.gridLabel}>DOSAGE</Text>
                  <Text style={styles.gridValue}>{med.dosage}</Text>
                </View>
                <View style={styles.gridItem}>
                  <Text style={styles.gridLabel}>TIMING</Text>
                  <Text style={styles.gridValue}>{med.timing}</Text>
                </View>
                <View style={styles.gridItem}>
                  <Text style={styles.gridLabel}>FREQUENCY</Text>
                  <Text style={styles.gridValue}>{med.frequency || 'Daily'}</Text>
                </View>
              </View>

              {/* Instructions Callout */}
              {med.instructions ? (
                <View style={styles.instructionBox}>
                  <Text style={styles.instructionLabel}>DOCTOR INSTRUCTIONS</Text>
                  <Text style={styles.instructionText}>{med.instructions}</Text>
                </View>
              ) : null}

              {/* Food Instructions */}
              {med.foodInstructions ? (
                <View style={styles.foodBox}>
                  <Text style={styles.foodText}>Dietary: {med.foodInstructions}</Text>
                </View>
              ) : null}

              {/* Prescription Date */}
              <View style={styles.footerRow}>
                <Calendar size={12} color="#535f70" />
                <Text style={styles.footerText}>
                  Prescribed: {new Date(med.prescribedAt).toLocaleDateString()}
                </Text>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fc',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  header: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(9, 76, 178, 0.08)',
    gap: 10,
    ...theme.shadows.soft,
  },
  headerTitle: {
    fontFamily: theme.fonts.serif,
    fontSize: 20,
    fontWeight: '700',
    color: '#191c20',
  },
  headerSubtitle: {
    fontFamily: theme.fonts.label,
    fontSize: 11,
    fontWeight: '600',
    color: '#535f70',
    lineHeight: 16,
    letterSpacing: 0.4,
  },
  boundaryNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#fff0d8',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(201, 84, 16, 0.2)',
    marginTop: 4,
  },
  boundaryNoticeText: {
    fontFamily: theme.fonts.sans,
    fontSize: 11,
    color: '#78350f',
    lineHeight: 16,
    flex: 1,
    fontWeight: '500',
  },
  centerBox: {
    padding: 36,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontFamily: theme.fonts.sans,
    fontSize: 13,
    color: '#535f70',
  },
  errorCard: {
    backgroundColor: '#fff8f7',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#ffdad6',
  },
  errorTitle: {
    fontFamily: theme.fonts.sans,
    fontSize: 15,
    fontWeight: '700',
    color: '#ba1a1a',
  },
  errorBody: {
    fontFamily: theme.fonts.sans,
    fontSize: 12,
    color: '#93000a',
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(9, 76, 178, 0.08)',
    ...theme.shadows.soft,
  },
  emptyTitle: {
    fontFamily: theme.fonts.serif,
    fontSize: 16,
    fontWeight: '700',
    color: '#191c20',
  },
  emptyBody: {
    fontFamily: theme.fonts.sans,
    fontSize: 12,
    color: '#535f70',
    textAlign: 'center',
    lineHeight: 18,
  },
  medCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(9, 76, 178, 0.08)',
    gap: 12,
    ...theme.shadows.soft,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  medIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(9, 76, 178, 0.12)',
  },
  medName: {
    fontFamily: theme.fonts.sans,
    fontSize: 15,
    fontWeight: '700',
    color: '#191c20',
  },
  genericName: {
    fontFamily: theme.fonts.sans,
    fontSize: 11,
    color: '#535f70',
    marginTop: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusActive: {
    backgroundColor: '#e6f4ea',
  },
  statusPaused: {
    backgroundColor: '#fff8f7',
  },
  statusText: {
    fontFamily: theme.fonts.label,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  statusTextActive: {
    color: '#137333',
  },
  statusTextPaused: {
    color: '#ba1a1a',
  },
  dosageGrid: {
    flexDirection: 'row',
    backgroundColor: '#f2f3f9',
    borderRadius: 12,
    padding: 12,
    justifyContent: 'space-between',
  },
  gridItem: {
    alignItems: 'center',
    flex: 1,
  },
  gridLabel: {
    fontFamily: theme.fonts.label,
    fontSize: 9,
    fontWeight: '700',
    color: '#535f70',
    letterSpacing: 0.5,
  },
  gridValue: {
    fontFamily: theme.fonts.sans,
    fontSize: 12,
    fontWeight: '700',
    color: '#191c20',
    marginTop: 3,
  },
  instructionBox: {
    backgroundColor: '#f8f9fc',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 77, 77, 0.08)',
    gap: 4,
  },
  instructionLabel: {
    fontFamily: theme.fonts.label,
    fontSize: 9,
    fontWeight: '700',
    color: theme.colors.primary,
    letterSpacing: 0.5,
  },
  instructionText: {
    fontFamily: theme.fonts.sans,
    fontSize: 12,
    color: '#191c20',
    lineHeight: 18,
  },
  foodBox: {
    backgroundColor: '#eceef3',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  foodText: {
    fontFamily: theme.fonts.sans,
    fontSize: 11,
    color: '#41484d',
    fontWeight: '500',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  footerText: {
    fontFamily: theme.fonts.sans,
    fontSize: 10,
    color: '#71787e',
  },
});
