import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
} from 'react-native';
import {
  AlertCircle,
  WifiOff,
  Clock,
  CheckCircle2,
  RefreshCw,
  FolderOpen,
  SearchX,
  Sparkles,
} from 'lucide-react-native';
import { theme } from '../../src/theme';

export type ViewStateType =
  | 'idle'
  | 'loading'
  | 'empty'
  | 'error'
  | 'offline'
  | 'no-results'
  | 'success';

export type SkeletonType = 'dashboard' | 'chart' | 'list' | 'cards' | 'generic';

interface StateViewProps {
  state: ViewStateType;
  skeletonType?: SkeletonType;
  title?: string;
  message?: string;
  ctaText?: string;
  onCtaPress?: () => void;
  onRetry?: () => void;
  lastUpdated?: string;
  pendingSyncCount?: number;
  children?: React.ReactNode;
}

export function StateView({
  state,
  skeletonType = 'generic',
  title,
  message,
  ctaText,
  onCtaPress,
  onRetry,
  lastUpdated,
  pendingSyncCount = 0,
  children,
}: StateViewProps) {
  const shimmerAnim = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    if (state === 'loading') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerAnim, {
            toValue: 1,
            duration: 850,
            useNativeDriver: true,
          }),
          Animated.timing(shimmerAnim, {
            toValue: 0.35,
            duration: 850,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [state, shimmerAnim]);

  if (state === 'idle') {
    return <>{children}</>;
  }

  // 1. Shimmering Loading Skeletons
  if (state === 'loading') {
    return (
      <View style={styles.skeletonContainer}>
        {skeletonType === 'dashboard' && (
          <>
            <Animated.View style={[styles.skHeroCard, { opacity: shimmerAnim }]} />
            <View style={styles.skActionsRow}>
              <Animated.View style={[styles.skActionBtn, { opacity: shimmerAnim }]} />
              <Animated.View style={[styles.skActionBtn, { opacity: shimmerAnim }]} />
              <Animated.View style={[styles.skActionBtn, { opacity: shimmerAnim }]} />
            </View>
            <Animated.View style={[styles.skCard, { opacity: shimmerAnim }]} />
            <Animated.View style={[styles.skCard, { opacity: shimmerAnim }]} />
          </>
        )}

        {skeletonType === 'chart' && (
          <>
            <View style={styles.skSpecialtyRow}>
              <Animated.View style={[styles.skTabPill, { opacity: shimmerAnim }]} />
              <Animated.View style={[styles.skTabPill, { opacity: shimmerAnim }]} />
              <Animated.View style={[styles.skTabPill, { opacity: shimmerAnim }]} />
            </View>
            <Animated.View style={[styles.skChartBox, { opacity: shimmerAnim }]} />
            <Animated.View style={[styles.skListItem, { opacity: shimmerAnim }]} />
          </>
        )}

        {skeletonType === 'list' && (
          <>
            <Animated.View style={[styles.skSearchBar, { opacity: shimmerAnim }]} />
            <Animated.View style={[styles.skListItem, { opacity: shimmerAnim }]} />
            <Animated.View style={[styles.skListItem, { opacity: shimmerAnim }]} />
            <Animated.View style={[styles.skListItem, { opacity: shimmerAnim }]} />
          </>
        )}

        {skeletonType === 'cards' && (
          <>
            <Animated.View style={[styles.skCard, { opacity: shimmerAnim }]} />
            <Animated.View style={[styles.skCard, { opacity: shimmerAnim }]} />
          </>
        )}

        {skeletonType === 'generic' && (
          <>
            <Animated.View style={[styles.skCard, { opacity: shimmerAnim }]} />
            <Animated.View style={[styles.skListItem, { opacity: shimmerAnim }]} />
          </>
        )}
      </View>
    );
  }

  // 2. Offline View
  if (state === 'offline') {
    return (
      <View style={styles.centeredContainer}>
        <View style={[styles.iconCircle, { backgroundColor: theme.colors.warningBg }]}>
          <WifiOff color={theme.colors.warning} size={32} />
        </View>
        <Text style={styles.stateTitle}>{title || 'Working Offline'}</Text>
        <Text style={styles.stateMessage}>
          {message || 'You are viewing saved local records on your device. Changes will synchronize automatically once reconnected.'}
        </Text>

        <View style={styles.offlineInfoBox}>
          {lastUpdated ? (
            <View style={styles.infoLine}>
              <Clock color={theme.colors.textMuted} size={14} />
              <Text style={styles.infoLineText}>Last saved update: {lastUpdated}</Text>
            </View>
          ) : null}

          <View style={styles.infoLine}>
            <CheckCircle2
              color={pendingSyncCount > 0 ? theme.colors.warning : theme.colors.success}
              size={14}
            />
            <Text style={styles.infoLineText}>
              {pendingSyncCount > 0
                ? `${pendingSyncCount} ${pendingSyncCount === 1 ? 'change' : 'changes'} waiting to sync`
                : 'All local changes are safely saved'}
            </Text>
          </View>
        </View>

        {onRetry && (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={onRetry}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Try reconnecting to health network"
          >
            <RefreshCw color={theme.colors.white} size={16} />
            <Text style={styles.actionBtnText}>Try Reconnecting</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // 3. Error State
  if (state === 'error') {
    return (
      <View style={styles.centeredContainer}>
        <View style={[styles.iconCircle, { backgroundColor: theme.colors.errorBg }]}>
          <AlertCircle color={theme.colors.error} size={32} />
        </View>
        <Text style={styles.stateTitle}>{title || 'Unable to Load Records'}</Text>
        <Text style={styles.stateMessage}>
          {message || 'Something went wrong while retrieving your health records. Please check your connection and try again.'}
        </Text>

        {onRetry && (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={onRetry}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Retry loading"
          >
            <RefreshCw color={theme.colors.white} size={16} />
            <Text style={styles.actionBtnText}>Try Again</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // 4. Empty State
  if (state === 'empty') {
    return (
      <View style={styles.centeredContainer}>
        <View style={[styles.iconCircle, { backgroundColor: theme.colors.primarySurface }]}>
          <FolderOpen color={theme.colors.primary} size={32} />
        </View>
        <Text style={styles.stateTitle}>{title || 'No Records Found'}</Text>
        <Text style={styles.stateMessage}>
          {message || 'Log your morning readings or upload a lab report to start monitoring your health goals.'}
        </Text>

        {ctaText && onCtaPress && (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={onCtaPress}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={ctaText}
          >
            <Text style={styles.actionBtnText}>{ctaText}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // 5. No Search Results State
  if (state === 'no-results') {
    return (
      <View style={styles.centeredContainer}>
        <View style={[styles.iconCircle, { backgroundColor: theme.colors.cardMuted }]}>
          <SearchX color={theme.colors.textMuted} size={30} />
        </View>
        <Text style={styles.stateTitle}>{title || 'No Matching Records'}</Text>
        <Text style={styles.stateMessage}>
          {message || 'Try adjusting your search terms or clearing the current filter.'}
        </Text>

        {ctaText && onCtaPress && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: theme.colors.cardMuted }]}
            onPress={onCtaPress}
          >
            <Text style={[styles.actionBtnText, { color: theme.colors.text }]}>{ctaText}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // 6. Success State
  if (state === 'success') {
    return (
      <View style={styles.centeredContainer}>
        <View style={[styles.iconCircle, { backgroundColor: theme.colors.successBg }]}>
          <CheckCircle2 color={theme.colors.success} size={32} />
        </View>
        <Text style={styles.stateTitle}>{title || 'Action Completed'}</Text>
        <Text style={styles.stateMessage}>
          {message || 'Your health record was saved successfully.'}
        </Text>

        {ctaText && onCtaPress && (
          <TouchableOpacity style={styles.actionBtn} onPress={onCtaPress}>
            <Text style={styles.actionBtnText}>{ctaText}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return <>{children}</>;
}

/**
 * Top Status Banner for Demo Mode, Offline Cache, or Live Sync
 */
interface SyncBannerProps {
  status: 'ONLINE' | 'OFFLINE_CACHE' | 'SYNC_ERROR' | 'SYNCING';
  isDemoMode?: boolean;
  lastUpdated?: string;
  pendingSyncCount?: number;
  onRetrySync?: () => void;
  onExitDemo?: () => void;
}

export function SyncBanner({
  status,
  isDemoMode,
  lastUpdated,
  pendingSyncCount = 0,
  onRetrySync,
  onExitDemo,
}: SyncBannerProps) {
  if (isDemoMode) {
    return (
      <View style={styles.bannerDemo}>
        <Sparkles color={theme.colors.accent} size={15} />
        <View style={{ flex: 1, marginHorizontal: 8 }}>
          <Text style={styles.bannerDemoText}>
            Demo Mode Active: Sample patient data is currently shown.
          </Text>
        </View>
        {onExitDemo && (
          <TouchableOpacity onPress={onExitDemo} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.bannerLinkText}>Use Real Data</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (status === 'OFFLINE_CACHE' || status === 'SYNC_ERROR') {
    return (
      <View style={styles.bannerOffline}>
        <WifiOff color={theme.colors.warning} size={15} />
        <View style={{ flex: 1, marginHorizontal: 8 }}>
          <Text style={styles.bannerOfflineTitle}>Offline: Viewing saved local records</Text>
          <Text style={styles.bannerOfflineSub}>
            {lastUpdated ? `Saved ${lastUpdated}` : 'Stored on this device'}
            {pendingSyncCount > 0 ? ` • ${pendingSyncCount} changes waiting to sync` : ''}
          </Text>
        </View>
        {onRetrySync && (
          <TouchableOpacity onPress={onRetrySync} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.bannerOfflineLink}>Sync Now</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (status === 'SYNCING') {
    return (
      <View style={styles.bannerSyncing}>
        <RefreshCw color={theme.colors.primary} size={14} />
        <Text style={styles.bannerSyncingText}>Syncing records with server...</Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  skeletonContainer: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  skHeroCard: {
    height: 140,
    backgroundColor: theme.colors.cardMuted,
    borderRadius: theme.radius.xl,
  },
  skActionsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  skActionBtn: {
    flex: 1,
    height: 80,
    backgroundColor: theme.colors.cardMuted,
    borderRadius: theme.radius.lg,
  },
  skCard: {
    height: 100,
    backgroundColor: theme.colors.cardMuted,
    borderRadius: theme.radius.lg,
  },
  skSpecialtyRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  skTabPill: {
    flex: 1,
    height: 48,
    backgroundColor: theme.colors.cardMuted,
    borderRadius: theme.radius.md,
  },
  skChartBox: {
    height: 200,
    backgroundColor: theme.colors.cardMuted,
    borderRadius: theme.radius.xl,
  },
  skSearchBar: {
    height: 48,
    backgroundColor: theme.colors.cardMuted,
    borderRadius: theme.radius.md,
  },
  skListItem: {
    height: 68,
    backgroundColor: theme.colors.cardMuted,
    borderRadius: theme.radius.md,
  },
  centeredContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xxl,
    minHeight: 280,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
  },
  stateTitle: {
    fontSize: theme.typography.sizes.headingSm,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
  },
  stateMessage: {
    fontSize: theme.typography.sizes.bodySm,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: theme.typography.lineHeights.bodySm,
    maxWidth: 320,
    marginBottom: theme.spacing.xl,
  },
  offlineInfoBox: {
    backgroundColor: theme.colors.cardMuted,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
    width: '100%',
    maxWidth: 340,
    marginBottom: theme.spacing.xl,
  },
  infoLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoLineText: {
    fontSize: theme.typography.sizes.caption,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.weights.semibold,
    flex: 1,
  },
  actionBtn: {
    minHeight: theme.touchTarget.minHeight,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionBtnText: {
    color: theme.colors.white,
    fontSize: theme.typography.sizes.body,
    fontWeight: theme.typography.weights.bold,
  },
  bannerDemo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.accentLight,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.sm,
  },
  bannerDemoText: {
    fontSize: theme.typography.sizes.caption,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.accent,
  },
  bannerLinkText: {
    fontSize: theme.typography.sizes.caption,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.primary,
  },
  bannerOffline: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.warningBg,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.warningBorder,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.sm,
  },
  bannerOfflineTitle: {
    fontSize: theme.typography.sizes.bodySm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.warning,
  },
  bannerOfflineSub: {
    fontSize: theme.typography.sizes.caption,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  bannerOfflineLink: {
    fontSize: theme.typography.sizes.caption,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.primary,
  },
  bannerSyncing: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primarySurface,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.primaryBorder,
  },
  bannerSyncingText: {
    fontSize: theme.typography.sizes.caption,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primary,
  },
});