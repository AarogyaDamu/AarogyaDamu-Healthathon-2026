import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { mobileApiFetch } from '../client';
import {
  getCachedObservations,
  setCachedObservations,
  syncOfflineQueue,
} from '../services/offlineStorage';

export default function HomeScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [observations, setObservations] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      // 1. Attempt offline synchronization if back online
      const syncResult = await syncOfflineQueue();
      if (syncResult.syncedCount > 0) {
        Alert.alert('Data Synced', `Uploaded ${syncResult.syncedCount} queued reading(s) to your cloud profile.`);
      }

      // 2. Fetch live data
      const [dashRes, obsRes] = await Promise.all([
        mobileApiFetch<any>('/dashboard'),
        mobileApiFetch<any>('/observations'),
      ]);

      setProfile(dashRes.profile);
      setTasks(dashRes.pendingTasks || []);
      const liveObs = obsRes.observations || [];
      setObservations(liveObs);
      await setCachedObservations(liveObs);
      setOfflineNotice(null);
    } catch (err: any) {
      // Fallback to offline cached records
      const cached = await getCachedObservations();
      setObservations(cached);
      setOfflineNotice('Operating offline. Showing cached glycemic records.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#0f766e" />
        <Text style={styles.loadingText}>Loading clinical records...</Text>
      </SafeAreaView>
    );
  }

  const latestReading = observations[0];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0f766e']} />}
      >
        {/* Offline Banner */}
        {offlineNotice && (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineBannerText}>{offlineNotice}</Text>
          </View>
        )}

        {/* Patient Profile Card */}
        <View style={styles.card}>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.patientName}>{profile?.fullName || 'Patient'}</Text>
          <Text style={styles.conditionSubtext}>
            {(profile?.diabetesType || 'TYPE_2_DIABETES').replace(/_/g, ' ')} • Diagnosed {profile?.diagnosisYear || '2021'}
          </Text>
        </View>

        {/* Latest Glucose Card */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>LATEST BLOOD SUGAR</Text>
          {latestReading ? (
            <View style={styles.glucoseRow}>
              <View>
                <Text style={styles.glucoseValue}>
                  {latestReading.numericValue}{' '}
                  <Text style={styles.glucoseUnit}>{latestReading.unit || 'mg/dL'}</Text>
                </Text>
                <Text style={styles.contextBadge}>
                  {latestReading.context?.toLowerCase().replace(/_/g, ' ')}
                </Text>
              </View>
              <View
                style={[
                  styles.statusPill,
                  latestReading.numericValue < 70
                    ? styles.pillLow
                    : latestReading.numericValue <= 180
                    ? styles.pillNormal
                    : styles.pillHigh,
                ]}
              >
                <Text
                  style={[
                    styles.statusPillText,
                    latestReading.numericValue < 70
                      ? styles.textLow
                      : latestReading.numericValue <= 180
                      ? styles.textNormal
                      : styles.textHigh,
                  ]}
                >
                  {latestReading.numericValue < 70
                    ? 'Low'
                    : latestReading.numericValue <= 180
                    ? 'In Target'
                    : 'High'}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={styles.emptyText}>No blood sugar checks recorded yet.</Text>
          )}
        </View>

        {/* Action Button Strip */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton]}
            onPress={() => navigation.navigate('SugarChecks')}
          >
            <Text style={styles.primaryButtonText}>+ Log Sugar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.secondaryButton]}
            onPress={() => navigation.navigate('AskDamu')}
          >
            <Text style={styles.secondaryButtonText}>Ask Damu</Text>
          </TouchableOpacity>
        </View>

        {/* Pending Care Tasks */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>TODAY'S CARE PLAN ({tasks.length})</Text>
          {tasks.length === 0 ? (
            <Text style={styles.emptyText}>All scheduled care tasks are complete.</Text>
          ) : (
            tasks.map((task) => (
              <View key={task.id} style={styles.taskItem}>
                <View style={styles.taskBullet} />
                <View style={styles.taskTextWrapper}>
                  <Text style={styles.taskTitle}>{task.title}</Text>
                  <Text style={styles.taskDue}>
                    Due: {new Date(task.dueAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 13, color: '#64748b', fontWeight: '500' },
  scrollContent: { padding: 16, gap: 14 },
  offlineBanner: {
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
    borderWidth: 1,
    padding: 10,
    borderRadius: 8,
  },
  offlineBannerText: { color: '#be123c', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 18,
  },
  greeting: { fontSize: 12, color: '#64748b', fontWeight: '600', textTransform: 'uppercase' },
  patientName: { fontSize: 22, color: '#0f172a', fontWeight: '800', marginTop: 2 },
  conditionSubtext: { fontSize: 13, color: '#475569', marginTop: 4 },
  cardHeader: { fontSize: 11, fontWeight: '700', color: '#94a3b8', letterSpacing: 0.8, marginBottom: 12 },
  glucoseRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  glucoseValue: { fontSize: 32, fontWeight: '800', color: '#0f172a' },
  glucoseUnit: { fontSize: 16, fontWeight: '600', color: '#64748b' },
  contextBadge: { fontSize: 12, color: '#0f766e', fontWeight: '700', textTransform: 'capitalize', marginTop: 2 },
  statusPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  pillNormal: { backgroundColor: '#d1fae5' },
  pillHigh: { backgroundColor: '#ffe4e6' },
  pillLow: { backgroundColor: '#e0f2fe' },
  statusPillText: { fontSize: 12, fontWeight: '700' },
  textNormal: { color: '#065f46' },
  textHigh: { color: '#9f1239' },
  textLow: { color: '#075985' },
  emptyText: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic', paddingVertical: 8 },
  buttonRow: { flexDirection: 'row', gap: 10 },
  actionButton: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  primaryButton: { backgroundColor: '#0f766e' },
  primaryButtonText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  secondaryButton: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1' },
  secondaryButtonText: { color: '#0f172a', fontWeight: '700', fontSize: 14 },
  taskItem: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, gap: 10 },
  taskBullet: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#0f766e', marginTop: 6 },
  taskTextWrapper: { flex: 1 },
  taskTitle: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
  taskDue: { fontSize: 11, color: '#64748b', marginTop: 2 },
});