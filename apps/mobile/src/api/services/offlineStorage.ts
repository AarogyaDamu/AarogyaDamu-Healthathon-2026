import AsyncStorage from '@react-native-async-storage/async-storage';
import { mobileApiFetch } from '../client';

const READINGS_CACHE_KEY = '@aarogyadamu_cached_observations';
const OFFLINE_QUEUE_KEY = '@aarogyadamu_sync_queue';

export interface QueuedObservation {
  localId: string;
  type: string;
  numericValue: number;
  unit: string;
  context: string;
  notes?: string;
  observedAt: string;
}

export async function getCachedObservations(): Promise<any[]> {
  try {
    const data = await AsyncStorage.getItem(READINGS_CACHE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function setCachedObservations(observations: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(READINGS_CACHE_KEY, JSON.stringify(observations));
  } catch (err) {
    console.warn('Failed to write cached observations', err);
  }
}

export async function enqueueOfflineObservation(item: Omit<QueuedObservation, 'localId'>): Promise<void> {
  const queue = await getOfflineQueue();
  const queuedItem: QueuedObservation = {
    ...item,
    localId: `offline_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  };
  queue.push(queuedItem);
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

export async function getOfflineQueue(): Promise<QueuedObservation[]> {
  try {
    const data = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function syncOfflineQueue(): Promise<{ syncedCount: number; errors: number }> {
  const queue = await getOfflineQueue();
  if (queue.length === 0) return { syncedCount: 0, errors: 0 };

  const remainingQueue: QueuedObservation[] = [];
  let syncedCount = 0;
  let errors = 0;

  for (const item of queue) {
    try {
      await mobileApiFetch('/observations', {
        method: 'POST',
        body: JSON.stringify({
          type: item.type,
          numericValue: item.numericValue,
          unit: item.unit,
          context: item.context,
          notes: item.notes ? `${item.notes} (Logged Offline)` : '(Logged Offline)',
          observedAt: item.observedAt,
        }),
      });
      syncedCount++;
    } catch {
      remainingQueue.push(item);
      errors++;
    }
  }

  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remainingQueue));
  return { syncedCount, errors };
}