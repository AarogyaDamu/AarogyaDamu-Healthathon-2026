import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from './client';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const memoryCache = new Map<string, CacheEntry<any>>();

export function clearApiCache(): void {
  memoryCache.clear();
}

/**
 * Prefetch / Pre-render cache primer
 * Triggered on hover over links, buttons, or bottom-nav tabs
 */
export function prefetchUrl<T = any>(endpoint: string): void {
  apiFetch<T>(endpoint)
    .then((data) => {
      memoryCache.set(endpoint, { data, timestamp: Date.now() });
    })
    .catch(() => {});
}

/**
 * Stale-While-Revalidate Hook with Optimistic Updates & Idempotency Keys
 */
export function useSWR<T>(
  endpoint: string | null,
  options: {
    ttlMs?: number;
    fallbackData?: T;
  } = {}
) {
  const { ttlMs = 60000, fallbackData } = options;
  const [data, setData] = useState<T>(() => {
    if (!endpoint) return fallbackData as T;
    const cached = memoryCache.get(endpoint);
    return cached ? cached.data : (fallbackData as T);
  });
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const revalidateRef = useRef<() => Promise<void>>();

  const revalidate = useCallback(async () => {
    if (!endpoint) return;
    setIsValidating(true);
    try {
      const fresh = await apiFetch<T>(endpoint);
      memoryCache.set(endpoint, { data: fresh, timestamp: Date.now() });
      setData(fresh);
      setError(null);
    } catch (err: any) {
      setError(err);
    } finally {
      setIsValidating(false);
    }
  }, [endpoint]);

  revalidateRef.current = revalidate;

  useEffect(() => {
    if (!endpoint) return;
    const cached = memoryCache.get(endpoint);
    const isStale = !cached || Date.now() - cached.timestamp > ttlMs;

    if (cached) {
      setData(cached.data);
    }

    if (isStale) {
      revalidate();
    }
  }, [endpoint, ttlMs, revalidate]);

  /**
   * Optimistic update with automatic rollback on network failure
   */
  const mutateOptimistic = useCallback(
    async (
      optimisticValue: T | ((curr: T) => T),
      networkMutation: (idempotencyKey: string) => Promise<any>
    ) => {
      const previousData = data;
      const nextData =
        typeof optimisticValue === 'function'
          ? (optimisticValue as any)(previousData)
          : optimisticValue;

      // 1. Instant optimistic swap in UI & Cache
      setData(nextData);
      if (endpoint) {
        memoryCache.set(endpoint, { data: nextData, timestamp: Date.now() });
      }

      // 2. Generate unique Idempotency Key
      const idempotencyKey = `idemp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      try {
        await networkMutation(idempotencyKey);
        // Refresh with canonical server response
        if (revalidateRef.current) await revalidateRef.current();
      } catch (err) {
        // Rollback to previous state on network failure
        setData(previousData);
        if (endpoint) {
          memoryCache.set(endpoint, { data: previousData, timestamp: Date.now() });
        }
        throw err;
      }
    },
    [data, endpoint]
  );

  return { data, isValidating, error, revalidate, mutateOptimistic };
}