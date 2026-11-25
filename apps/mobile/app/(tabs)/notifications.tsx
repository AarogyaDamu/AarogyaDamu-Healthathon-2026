import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  Bell,
  CheckCheck,
  Trash2,
  ChevronLeft,
  Settings,
  Pill,
  CheckSquare,
  Calendar,
  Activity,
  HeartPulse,
  Award,
  User,
  Info,
  Clock,
  FileText,
} from 'lucide-react-native';
import { notificationsApi, type MobileNotificationItem } from '../../src/api/notifications';
import { useToast } from '../../components/ui/ToastProvider';
import { theme } from '../../src/theme';

type CategoryFilter =
  | 'ALL'
  | 'MEDICATION'
  | 'TASK'
  | 'APPOINTMENT'
  | 'CARE_PLAN'
  | 'HEALTH_LOGGING'
  | 'CONSULTATION'
  | 'MILESTONE'
  | 'ACCOUNT';

const CATEGORIES: { key: CategoryFilter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'MEDICATION', label: 'Meds' },
  { key: 'TASK', label: 'Tasks' },
  { key: 'APPOINTMENT', label: 'Visits' },
  { key: 'CARE_PLAN', label: 'Care Plan' },
  { key: 'HEALTH_LOGGING', label: 'Sugar Log' },
  { key: 'CONSULTATION', label: 'Consultations' },
  { key: 'MILESTONE', label: 'Milestones' },
];

export default function NotificationsScreen() {
  const { showToast } = useToast();
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('ALL');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [notifications, setNotifications] = useState<MobileNotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await notificationsApi.getNotifications(
        activeCategory === 'ALL' ? undefined : activeCategory,
        unreadOnly,
      );
      setNotifications(data || []);
    } catch {
      showToast('Could not load notifications');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeCategory, unreadOnly, showToast]);

  useEffect(() => {
    setLoading(true);
    void loadNotifications();
  }, [loadNotifications]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadNotifications();
  };

  const handleMarkAsRead = async (item: MobileNotificationItem) => {
    if (item.isRead) return;
    try {
      setProcessingId(item.id);
      await notificationsApi.markAsRead(item.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)),
      );
    } catch {
      showToast('Failed to mark as read');
    } finally {
      setProcessingId(null);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      setLoading(true);
      await notificationsApi.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      showToast('All notifications marked as read');
    } catch {
      showToast('Failed to mark all as read');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteNotification = (item: MobileNotificationItem) => {
    Alert.alert(
      'Delete Notification',
      'Are you sure you want to dismiss this notification?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setProcessingId(item.id);
              await notificationsApi.deleteNotification(item.id);
              setNotifications((prev) => prev.filter((n) => n.id !== item.id));
              showToast('Notification deleted');
            } catch {
              showToast('Failed to delete notification');
            } finally {
              setProcessingId(null);
            }
          },
        },
      ],
    );
  };

  const handleNotificationPress = async (item: MobileNotificationItem) => {
    if (!item.isRead) {
      void handleMarkAsRead(item);
    }

    const cat = item.category?.toUpperCase() || '';
    const type = item.type?.toUpperCase() || '';

    if (cat === 'MEDICATION' || type.includes('MEDICATION')) {
      router.push('/(tabs)/medications');
    } else if (cat === 'TASK' || type.includes('TASK')) {
      router.push('/(tabs)/tasks');
    } else if (cat === 'APPOINTMENT' || type.includes('APPOINTMENT')) {
      router.push('/(tabs)/appointments');
    } else if (cat === 'CARE_PLAN' || type.includes('CARE_PLAN')) {
      router.push('/(tabs)/journey');
    } else if (cat === 'HEALTH_LOGGING' || type.includes('SUGAR')) {
      router.push('/(tabs)/health');
    } else if (cat === 'CONSULTATION' || type.includes('CONSULTATION')) {
      router.push('/(tabs)/consultation');
    } else if (cat === 'MILESTONE') {
      router.push('/(tabs)/journey');
    } else if (cat === 'ACCOUNT') {
      router.push('/(tabs)/profile');
    }
  };

  const renderCategoryIcon = (category?: string) => {
    switch (category?.toUpperCase()) {
      case 'MEDICATION':
        return <Pill color="#0284C7" size={18} />;
      case 'TASK':
        return <CheckSquare color="#0D9488" size={18} />;
      case 'APPOINTMENT':
        return <Calendar color="#8B5CF6" size={18} />;
      case 'CARE_PLAN':
        return <Activity color="#4F46E5" size={18} />;
      case 'HEALTH_LOGGING':
        return <HeartPulse color="#E11D48" size={18} />;
      case 'CONSULTATION':
        return <FileText color="#2563EB" size={18} />;
      case 'MILESTONE':
        return <Award color="#D97706" size={18} />;
      case 'ACCOUNT':
        return <User color="#475569" size={18} />;
      default:
        return <Bell color={theme.colors.primary} size={18} />;
    }
  };

  const getEmptyMessage = () => {
    switch (activeCategory) {
      case 'MEDICATION':
        return 'No medication reminders. All scheduled doses are up to date!';
      case 'TASK':
        return 'No task alerts. Great job staying on track with your care plan!';
      case 'APPOINTMENT':
        return 'No upcoming visit alerts scheduled.';
      case 'CARE_PLAN':
        return 'No care plan updates from your care team right now.';
      case 'HEALTH_LOGGING':
        return 'No blood sugar logging reminders pending.';
      case 'CONSULTATION':
        return 'No new doctor consultation notes or summaries.';
      case 'MILESTONE':
        return 'Keep recording your daily health habits to unlock your next milestone!';
      case 'ACCOUNT':
        return 'No account security notices.';
      default:
        return 'All caught up! No notifications right now.';
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ChevronLeft color={theme.colors.text} size={24} />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount} new</Text>
            </View>
          )}
        </View>

        <View style={styles.headerActions}>
          {unreadCount > 0 && (
            <TouchableOpacity
              style={styles.actionIconBtn}
              onPress={handleMarkAllRead}
              accessibilityRole="button"
              accessibilityLabel="Mark all as read"
            >
              <CheckCheck color={theme.colors.primary} size={20} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.actionIconBtn}
            onPress={() => router.push('/(tabs)/profile')}
            accessibilityRole="button"
            accessibilityLabel="Notification preferences"
          >
            <Settings color={theme.colors.textMuted} size={20} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Category Filter Pills */}
      <View style={styles.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.key;
            return (
              <TouchableOpacity
                key={cat.key}
                style={[styles.filterPill, isActive && styles.filterPillActive]}
                onPress={() => setActiveCategory(cat.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <Text
                  style={[styles.filterPillText, isActive && styles.filterPillTextActive]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Unread Toggle Row */}
      <View style={styles.subFilterRow}>
        <TouchableOpacity
          style={[styles.unreadTogglePill, unreadOnly && styles.unreadTogglePillActive]}
          onPress={() => setUnreadOnly((prev) => !prev)}
        >
          <Clock color={unreadOnly ? '#fff' : theme.colors.textMuted} size={13} />
          <Text
            style={[styles.unreadToggleText, unreadOnly && styles.unreadToggleTextActive]}
          >
            {unreadOnly ? 'Showing Unread Only' : 'Show Unread Only'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.totalCountText}>
          {notifications.length} notification{notifications.length === 1 ? '' : 's'}
        </Text>
      </View>

      {/* Notifications List */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading care notifications...</Text>
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconWrap}>
            <Bell color={theme.colors.textMuted} size={36} />
          </View>
          <Text style={styles.emptyTitle}>No Notifications</Text>
          <Text style={styles.emptySub}>{getEmptyMessage()}</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
            />
          }
        >
          {notifications.map((item) => {
            const isProcessing = processingId === item.id;
            const isUrgent = item.priority === 'URGENT' || item.priority === 'HIGH';

            return (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.notificationCard,
                  !item.isRead && styles.notificationCardUnread,
                  isUrgent && styles.notificationCardUrgent,
                ]}
                onPress={() => void handleNotificationPress(item)}
                activeOpacity={0.7}
              >
                {/* Category & Status Row */}
                <View style={styles.cardHeader}>
                  <View style={styles.cardCatBadge}>
                    {renderCategoryIcon(item.category)}
                    <Text style={styles.cardCatText}>
                      {item.category?.replace('_', ' ') || 'GENERAL'}
                    </Text>
                  </View>

                  <View style={styles.cardHeaderRight}>
                    {isUrgent && (
                      <View style={styles.priorityBadge}>
                        <Text style={styles.priorityBadgeText}>{item.priority}</Text>
                      </View>
                    )}
                    {!item.isRead && <View style={styles.unreadDot} />}
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        handleDeleteNotification(item);
                      }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.deleteBtn}
                      disabled={isProcessing}
                    >
                      <Trash2 color={theme.colors.textMuted} size={15} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Content */}
                <Text style={[styles.cardTitle, !item.isRead && styles.cardTitleUnread]}>
                  {item.title}
                </Text>
                <Text style={styles.cardBody} numberOfLines={3}>
                  {item.message || item.body || ''}
                </Text>

                {/* Footer */}
                <View style={styles.cardFooter}>
                  <Text style={styles.cardDate}>
                    {new Date(item.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                  {!item.isRead && (
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        void handleMarkAsRead(item);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.markReadText}>Mark read</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}

          <View style={styles.privacyNote}>
            <Info color={theme.colors.textMuted} size={14} />
            <Text style={styles.privacyNoteText}>
              Lock-screen previews suppress clinical details for privacy. Full details are visible in-app.
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderBottomWidth: 1,
    borderBottomColor: theme.borders.ghost,
  },
  backBtn: {
    padding: 6,
    marginRight: 6,
  },
  headerTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontFamily: theme.typography.fonts.serif,
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.onSurface,
  },
  unreadBadge: {
    backgroundColor: '#E6F8EF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.borders.radius.full,
  },
  unreadBadgeText: {
    fontFamily: theme.typography.fonts.label,
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionIconBtn: {
    padding: 8,
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: theme.borders.ghost,
  },
  filterBar: {
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderBottomWidth: 1,
    borderBottomColor: theme.borders.ghost,
    paddingVertical: 10,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: theme.borders.ghost,
  },
  filterPillActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    ...theme.shadows.soft,
  },
  filterPillText: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.onSurfaceVariant,
  },
  filterPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  subFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  unreadTogglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: theme.borders.ghost,
  },
  unreadTogglePillActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  unreadToggleText: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.onSurfaceVariant,
  },
  unreadToggleTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  totalCountText: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 12,
    color: theme.colors.outline,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.borders.ghost,
  },
  emptyTitle: {
    fontFamily: theme.typography.fonts.serif,
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.onSurface,
    marginBottom: 8,
  },
  emptySub: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 19,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  notificationCard: {
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: theme.borders.radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.borders.ghost,
    ...theme.shadows.elevation2,
  },
  notificationCardUnread: {
    borderColor: 'rgba(9, 76, 178, 0.25)',
    backgroundColor: 'rgba(0, 77, 77, 0.08)',
  },
  notificationCardUrgent: {
    borderLeftWidth: 4,
    borderLeftColor: '#ba1a1a',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardCatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardCatText: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.secondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  priorityBadge: {
    backgroundColor: '#ffdad6',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: theme.borders.radius.sm,
  },
  priorityBadgeText: {
    fontFamily: theme.typography.fonts.label,
    color: '#ba1a1a',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
  },
  deleteBtn: {
    padding: 2,
  },
  cardTitle: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.onSurface,
    marginBottom: 4,
  },
  cardTitleUnread: {
    fontWeight: '700',
    color: theme.colors.onSurface,
  },
  cardBody: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
    lineHeight: 18,
    marginBottom: 10,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: theme.colors.surfaceContainerHigh,
    paddingTop: 8,
  },
  cardDate: {
    fontFamily: theme.typography.fonts.sans,
    fontSize: 11,
    color: theme.colors.outline,
  },
  markReadText: {
    fontFamily: theme.typography.fonts.label,
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: theme.borders.radius.lg,
    backgroundColor: theme.colors.surfaceContainerLow,
    marginTop: 8,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: theme.borders.ghost,
  },
  privacyNoteText: {
    flex: 1,
    fontFamily: theme.typography.fonts.sans,
    fontSize: 11,
    color: theme.colors.onSurfaceVariant,
    lineHeight: 16,
  },
});
