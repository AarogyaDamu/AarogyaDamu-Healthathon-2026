import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  Phone,
  ShieldAlert,
  Bell,
  CheckCircle2,
  X,
  Plus,
  Trash2,
  Clock,
  MapPin,
  Info,
  Calendar,
  Check,
  AlertCircle,
} from 'lucide-react-native';
import { theme } from '../../src/theme';
import {
  emergencyApi,
  notificationsApi,
  remindersApi,
  type MobileEmergencyContact,
  type MobileEmergencySosEvent,
  type MobileNotificationItem,
  type MobileReminder,
  type ReminderCategory,
} from '../../src/api/notifications';
import { useToast } from '../../components/ui/ToastProvider';

export default function SosScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'SOS' | 'CONTACTS' | 'REMINDERS'>('SOS');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // SOS State
  const [activeSos, setActiveSos] = useState<MobileEmergencySosEvent | null>(null);
  const [showSosModal, setShowSosModal] = useState(false);
  const [sosReason, setSosReason] = useState('Severe Hypoglycemia / Health Crisis');
  const [sosLocationConsent, setSosLocationConsent] = useState(false);
  const [confirmEmergency, setConfirmEmergency] = useState(false);
  const [activatingSos, setActivatingSos] = useState(false);

  // Cancel SOS State
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancellingSos, setCancellingSos] = useState(false);

  // Emergency Contacts State
  const [contacts, setContacts] = useState<MobileEmergencyContact[]>([]);
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactRelationship, setNewContactRelationship] = useState('Spouse');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactIsPrimary, setNewContactIsPrimary] = useState(false);
  const [savingContact, setSavingContact] = useState(false);

  // Reminders & Notifications State
  const [reminders, setReminders] = useState<MobileReminder[]>([]);
  const [notifications, setNotifications] = useState<MobileNotificationItem[]>([]);
  const [showAddReminderModal, setShowAddReminderModal] = useState(false);
  const [newReminderTitle, setNewReminderTitle] = useState('');
  const [newReminderCategory, setNewReminderCategory] = useState<ReminderCategory>('MEDICATION');
  const [newReminderTime, setNewReminderTime] = useState(new Date(Date.now() + 3600000).toISOString());
  const [ackUnreviewed, setAckUnreviewed] = useState(false);
  const [savingReminder, setSavingReminder] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [sos, contactList, reminderList, notificationList] = await Promise.all([
        emergencyApi.getActiveSos(),
        emergencyApi.getContacts().catch(() => []),
        remindersApi.getReminders().catch(() => []),
        notificationsApi.getNotifications().catch(() => []),
      ]);

      setActiveSos(sos);
      setContacts(contactList);
      setReminders(reminderList);
      setNotifications(notificationList);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load emergency data';
      showToast(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // --- Handlers: SOS Activation ---
  const handleTriggerSos = async () => {
    if (!confirmEmergency) {
      Alert.alert('Confirmation Required', 'You must explicitly confirm this emergency activation.');
      return;
    }

    try {
      setActivatingSos(true);
      const sos = await emergencyApi.activateSos({
        confirmEmergency: true,
        reason: sosReason.trim() || 'Severe Emergency',
        locationConsent: sosLocationConsent,
        latitude: sosLocationConsent ? 17.385 : undefined,
        longitude: sosLocationConsent ? 78.4867 : undefined,
      });

      setActiveSos(sos);
      setShowSosModal(false);
      setConfirmEmergency(false);
      showToast('Emergency SOS activated. Care team notified.');
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to activate SOS';
      showToast(msg);
    } finally {
      setActivatingSos(false);
    }
  };

  // --- Handlers: SOS Cancellation ---
  const handleCancelSos = async () => {
    if (!activeSos) return;
    if (cancelReason.trim().length < 3) {
      Alert.alert('Reason Required', 'Please enter a valid cancellation reason (minimum 3 characters).');
      return;
    }

    try {
      setCancellingSos(true);
      await emergencyApi.cancelSos(activeSos.id, { reason: cancelReason.trim() });
      setActiveSos(null);
      setShowCancelModal(false);
      setCancelReason('');
      showToast('Emergency SOS cancelled.');
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to cancel SOS';
      showToast(msg);
    } finally {
      setCancellingSos(false);
    }
  };

  // --- Handlers: Contacts ---
  const handleAddContact = async () => {
    if (!newContactName.trim() || !newContactPhone.trim()) {
      Alert.alert('Missing Details', 'Please provide a name and valid phone number.');
      return;
    }

    try {
      setSavingContact(true);
      await emergencyApi.createContact({
        name: newContactName.trim(),
        relationship: newContactRelationship,
        phone: newContactPhone.trim(),
        isPrimary: newContactIsPrimary,
        canReceiveSosAlerts: true,
      });
      setShowAddContactModal(false);
      setNewContactName('');
      setNewContactPhone('');
      setNewContactIsPrimary(false);
      showToast('Emergency contact added.');
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add contact';
      showToast(msg);
    } finally {
      setSavingContact(false);
    }
  };

  const handleDeleteContact = async (id: string) => {
    try {
      await emergencyApi.deleteContact(id);
      showToast('Contact removed.');
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to remove contact';
      showToast(msg);
    }
  };

  // --- Handlers: Reminders ---
  const handleAcknowledgeReminder = async (id: string) => {
    try {
      await remindersApi.acknowledgeReminder(id);
      showToast('Reminder acknowledged.');
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to acknowledge reminder';
      showToast(msg);
    }
  };

  const handleCreateReminder = async () => {
    if (!newReminderTitle.trim()) {
      Alert.alert('Missing Title', 'Please enter a reminder title.');
      return;
    }

    if (newReminderCategory === 'MEDICATION' && !ackUnreviewed) {
      Alert.alert(
        'Safety Acknowledgment',
        'Please confirm that you acknowledge this reminder is from your schedule and does not alter any prescription.',
      );
      return;
    }

    try {
      setSavingReminder(true);
      await remindersApi.createReminder({
        title: newReminderTitle.trim(),
        category: newReminderCategory,
        scheduledTime: newReminderTime,
        recurrence: 'DAILY',
        acknowledgeUnreviewedSource: ackUnreviewed,
      });
      setShowAddReminderModal(false);
      setNewReminderTitle('');
      setAckUnreviewed(false);
      showToast('Reminder created.');
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create reminder';
      showToast(msg);
    } finally {
      setSavingReminder(false);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      await notificationsApi.markAllAsRead();
      showToast('All notifications marked as read.');
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to mark read';
      showToast(msg);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading Emergency & Safety Center...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <ShieldAlert color={theme.colors.error} size={24} />
          <Text style={styles.headerTitle}>Emergency SOS & Reminders</Text>
        </View>
        <Text style={styles.headerSubtitle}>Safety coordinator, emergency alerts & daily care reminders</Text>
      </View>

      {/* Prominent Emergency Limitation Disclaimer Banner */}
      <View style={styles.disclaimerBanner}>
        <View style={styles.disclaimerHeader}>
          <AlertTriangle color={theme.colors.error} size={18} />
          <Text style={styles.disclaimerTitle}>EMERGENCY NOTICE (NOT 112 / 108)</Text>
        </View>
        <Text style={styles.disclaimerBody}>
          AarogyaDamu is a personal diabetes care companion and is NOT a substitute for local emergency services. In life-threatening emergencies, immediately call 112 or 108 (India) or your local hospital emergency room.
        </Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'SOS' && styles.tabButtonActive]}
          onPress={() => setActiveTab('SOS')}
        >
          <Text style={[styles.tabText, activeTab === 'SOS' && styles.tabTextActive]}>Emergency SOS</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'CONTACTS' && styles.tabButtonActive]}
          onPress={() => setActiveTab('CONTACTS')}
        >
          <Text style={[styles.tabText, activeTab === 'CONTACTS' && styles.tabTextActive]}>
            Contacts ({contacts.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'REMINDERS' && styles.tabButtonActive]}
          onPress={() => setActiveTab('REMINDERS')}
        >
          <Text style={[styles.tabText, activeTab === 'REMINDERS' && styles.tabTextActive]}>
            Reminders ({reminders.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        {/* ========================================================================= */}
        {/* TAB 1: EMERGENCY SOS                                                      */}
        {/* ========================================================================= */}
        {activeTab === 'SOS' && (
          <View style={styles.sectionContainer}>
            {activeSos ? (
              <View style={styles.activeSosCard}>
                <View style={styles.activeSosHeader}>
                  <AlertCircle color="#DC2626" size={26} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.activeSosTitle}>ACTIVE SOS DISPATCHED</Text>
                    <Text style={styles.activeSosSub}>
                      Triggered: {new Date(activeSos.triggeredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>

                <View style={styles.activeSosDetails}>
                  <Text style={styles.detailRowText}>
                    <Text style={styles.detailLabel}>Reason: </Text>
                    {activeSos.reason || 'Urgent Health Crisis'}
                  </Text>
                  <Text style={styles.detailRowText}>
                    <Text style={styles.detailLabel}>Delivery Status: </Text>
                    {activeSos.deliveryStatus} (In-app dispatched; no SMS provider configured)
                  </Text>
                  <Text style={styles.detailRowText}>
                    <Text style={styles.detailLabel}>Carrier Status: </Text>
                    {activeSos.externalCarrierStatus}
                  </Text>
                  <Text style={styles.detailRowText}>
                    <Text style={styles.detailLabel}>Location Status: </Text>
                    {activeSos.locationStatus}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.cancelSosBtn}
                  onPress={() => setShowCancelModal(true)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.cancelSosBtnText}>Cancel Accidental Activation</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.sosTriggerContainer}>
                <TouchableOpacity
                  style={styles.sosMainButton}
                  onPress={() => setShowSosModal(true)}
                  activeOpacity={0.88}
                >
                  <View style={styles.sosInnerCircle}>
                    <AlertTriangle color="#FFFFFF" size={48} />
                    <Text style={styles.sosButtonText}>TRIGGER SOS</Text>
                    <Text style={styles.sosButtonSub}>2-Step Confirmation</Text>
                  </View>
                </TouchableOpacity>
                <Text style={styles.sosHelperText}>
                  Pressing this button opens a deliberate confirmation dialog before alerting your designated emergency contacts and care team.
                </Text>
              </View>
            )}

            {/* Quick Emergency Numbers */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Immediate National Emergency Numbers</Text>
              <View style={styles.quickCallRow}>
                <View style={styles.quickCallBox}>
                  <Phone color={theme.colors.primary} size={20} />
                  <Text style={styles.quickCallNumber}>112</Text>
                  <Text style={styles.quickCallLabel}>National Emergency</Text>
                </View>
                <View style={styles.quickCallBox}>
                  <Phone color={theme.colors.primary} size={20} />
                  <Text style={styles.quickCallNumber}>108</Text>
                  <Text style={styles.quickCallLabel}>Medical Ambulance</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: EMERGENCY CONTACTS                                                 */}
        {/* ========================================================================= */}
        {activeTab === 'CONTACTS' && (
          <View style={styles.sectionContainer}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Emergency Contacts ({contacts.length})</Text>
              <TouchableOpacity
                style={styles.primarySmallBtn}
                onPress={() => setShowAddContactModal(true)}
              >
                <Plus color="#FFFFFF" size={16} />
                <Text style={styles.primarySmallBtnText}>Add Contact</Text>
              </TouchableOpacity>
            </View>

            {contacts.length === 0 ? (
              <View style={styles.emptyCard}>
                <Info color={theme.colors.textMuted} size={28} />
                <Text style={styles.emptyTitle}>No Emergency Contacts Configured</Text>
                <Text style={styles.emptySubtitle}>
                  Add family members, caregivers, or your primary doctor who should be notified in case of an emergency.
                </Text>
              </View>
            ) : (
              contacts.map((contact) => (
                <View key={contact.id} style={styles.contactCard}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.contactNameRow}>
                      <Text style={styles.contactName}>{contact.name}</Text>
                      {contact.isPrimary && (
                        <View style={styles.badgePrimary}>
                          <Text style={styles.badgePrimaryText}>Primary</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.contactMeta}>
                      {contact.relationship} • {contact.phone}
                    </Text>
                    {contact.canReceiveSosAlerts && (
                      <Text style={styles.sosRecipientBadge}>✓ Receives in-app SOS dispatches</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDeleteContact(contact.id)}
                  >
                    <Trash2 color={theme.colors.textMuted} size={18} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: REMINDERS & NOTIFICATIONS                                          */}
        {/* ========================================================================= */}
        {activeTab === 'REMINDERS' && (
          <View style={styles.sectionContainer}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Active Reminders ({reminders.length})</Text>
              <TouchableOpacity
                style={styles.primarySmallBtn}
                onPress={() => setShowAddReminderModal(true)}
              >
                <Plus color="#FFFFFF" size={16} />
                <Text style={styles.primarySmallBtnText}>New Reminder</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.safetyInfoBox}>
              <Info color={theme.colors.primary} size={16} />
              <Text style={styles.safetyInfoText}>
                Safety rule: Reminders never auto-mark medications as taken, never modify dosages, and never alter clinical prescriptions.
              </Text>
            </View>

            {reminders.length === 0 ? (
              <View style={styles.emptyCard}>
                <Clock color={theme.colors.textMuted} size={28} />
                <Text style={styles.emptyTitle}>No Active Reminders</Text>
                <Text style={styles.emptySubtitle}>
                  Set up user-configured reminders for medication schedules, appointments, or care-plan tasks.
                </Text>
              </View>
            ) : (
              reminders.map((reminder) => (
                <View key={reminder.id} style={styles.reminderCard}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.reminderHeaderRow}>
                      <Text style={styles.reminderTitle}>{reminder.title}</Text>
                      <View style={[styles.reminderBadge, reminder.status === 'ACKNOWLEDGED' ? styles.badgeGood : styles.badgePending]}>
                        <Text style={[styles.reminderBadgeText, reminder.status === 'ACKNOWLEDGED' ? styles.textGood : styles.textPending]}>
                          {reminder.status}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.reminderMeta}>
                      Category: {reminder.category} • Recurrence: {reminder.recurrence}
                    </Text>
                    <Text style={styles.reminderTime}>
                      🕒 {new Date(reminder.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  {reminder.status === 'SCHEDULED' && (
                    <TouchableOpacity
                      style={styles.ackBtn}
                      onPress={() => handleAcknowledgeReminder(reminder.id)}
                    >
                      <Check color="#FFFFFF" size={16} />
                      <Text style={styles.ackBtnText}>Acknowledge</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}

            {/* Notifications Inbox Preview */}
            <View style={[styles.cardHeaderRow, { marginTop: 24 }]}>
              <Text style={styles.cardTitle}>In-App Notifications ({notifications.length})</Text>
              {notifications.some((n) => !n.isRead) && (
                <TouchableOpacity onPress={handleMarkAllNotificationsRead}>
                  <Text style={styles.markAllReadText}>Mark All Read</Text>
                </TouchableOpacity>
              )}
            </View>

            {notifications.length === 0 ? (
              <Text style={styles.emptySubtitle}>No recent notifications.</Text>
            ) : (
              notifications.slice(0, 5).map((notif) => (
                <View key={notif.id} style={[styles.notifCard, !notif.isRead && styles.notifUnread]}>
                  <Bell color={notif.isRead ? theme.colors.textMuted : theme.colors.primary} size={18} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.notifTitle}>{notif.title}</Text>
                    <Text style={styles.notifBody}>{notif.body}</Text>
                    <Text style={styles.notifTime}>
                      {new Date(notif.createdAt).toLocaleDateString()} at {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* ========================================================================= */}
      {/* MODAL 1: DELIBERATE SOS ACTIVATION CONFIRMATION                           */}
      {/* ========================================================================= */}
      <Modal visible={showSosModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <AlertTriangle color="#DC2626" size={24} />
                <Text style={styles.modalTitle}>Confirm Emergency SOS</Text>
              </View>
              <TouchableOpacity onPress={() => setShowSosModal(false)}>
                <X color={theme.colors.textMuted} size={22} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalWarningBox}>
              <Text style={styles.modalWarningText}>
                ⚠️ This will trigger an emergency alert to your care team and designated emergency contacts. It does not replace dialling 112 or 108.
              </Text>
            </View>

            <Text style={styles.inputLabel}>Reason / Clinical Context</Text>
            <TextInput
              style={styles.textInput}
              value={sosReason}
              onChangeText={setSosReason}
              placeholder="e.g. Severe Hypoglycemia (< 54 mg/dL), Loss of consciousness"
            />

            <View style={styles.switchRow}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={styles.switchLabel}>Include GPS Location</Text>
                <Text style={styles.switchSub}>
                  If disabled, location is marked PERMISSION_DENIED and coordinates will not be gathered.
                </Text>
              </View>
              <Switch
                value={sosLocationConsent}
                onValueChange={setSosLocationConsent}
                trackColor={{ false: '#E2E8F0', true: theme.colors.primary }}
              />
            </View>

            <View style={styles.confirmationRow}>
              <TouchableOpacity
                style={[styles.checkbox, confirmEmergency && styles.checkboxChecked]}
                onPress={() => setConfirmEmergency(!confirmEmergency)}
              >
                {confirmEmergency && <Check color="#FFFFFF" size={14} />}
              </TouchableOpacity>
              <Text style={styles.confirmationLabel}>
                I explicitly confirm this is an urgent health event and request alert dispatch.
              </Text>
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowSosModal(false)}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalDangerBtn, !confirmEmergency && styles.modalBtnDisabled]}
                disabled={!confirmEmergency || activatingSos}
                onPress={handleTriggerSos}
              >
                {activatingSos ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalDangerBtnText}>Activate SOS Now</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 2: CANCEL ACCIDENTAL SOS ACTIVATION                                 */}
      {/* ========================================================================= */}
      <Modal visible={showCancelModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Cancel SOS False Alarm</Text>
            <Text style={styles.modalSubtitle}>
              Please supply a brief explanation for cancelling this emergency activation for clinical audit purposes.
            </Text>

            <TextInput
              style={[styles.textInput, { height: 80, textAlignVertical: 'top' }]}
              value={cancelReason}
              onChangeText={setCancelReason}
              placeholder="e.g. Accidental click, patient stabilized with oral glucose"
              multiline
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowCancelModal(false)}
              >
                <Text style={styles.modalCancelBtnText}>Keep Active</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryActionBtn, cancelReason.trim().length < 3 && styles.modalBtnDisabled]}
                disabled={cancelReason.trim().length < 3 || cancellingSos}
                onPress={handleCancelSos}
              >
                {cancellingSos ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.primaryActionBtnText}>Confirm Cancellation</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 3: ADD EMERGENCY CONTACT                                            */}
      {/* ========================================================================= */}
      <Modal visible={showAddContactModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Emergency Contact</Text>
              <TouchableOpacity onPress={() => setShowAddContactModal(false)}>
                <X color={theme.colors.textMuted} size={22} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Contact Full Name</Text>
            <TextInput
              style={styles.textInput}
              value={newContactName}
              onChangeText={setNewContactName}
              placeholder="e.g. Priya Sharma"
            />

            <Text style={styles.inputLabel}>Relationship</Text>
            <TextInput
              style={styles.textInput}
              value={newContactRelationship}
              onChangeText={setNewContactRelationship}
              placeholder="e.g. Spouse, Parent, Child, Primary Doctor"
            />

            <Text style={styles.inputLabel}>Phone Number</Text>
            <TextInput
              style={styles.textInput}
              value={newContactPhone}
              onChangeText={setNewContactPhone}
              placeholder="e.g. +91 98765 43210"
              keyboardType="phone-pad"
            />

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Mark as Primary Emergency Contact</Text>
              <Switch
                value={newContactIsPrimary}
                onValueChange={setNewContactIsPrimary}
                trackColor={{ false: '#E2E8F0', true: theme.colors.primary }}
              />
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowAddContactModal(false)}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryActionBtn}
                disabled={savingContact}
                onPress={handleAddContact}
              >
                {savingContact ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.primaryActionBtnText}>Save Contact</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 4: ADD REMINDER                                                     */}
      {/* ========================================================================= */}
      <Modal visible={showAddReminderModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Care Reminder</Text>
              <TouchableOpacity onPress={() => setShowAddReminderModal(false)}>
                <X color={theme.colors.textMuted} size={22} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Reminder Title</Text>
            <TextInput
              style={styles.textInput}
              value={newReminderTitle}
              onChangeText={setNewReminderTitle}
              placeholder="e.g. Metformin 500mg with breakfast"
            />

            <Text style={styles.inputLabel}>Category</Text>
            <View style={styles.categoryPickerRow}>
              {(['MEDICATION', 'CARE_PLAN', 'APPOINTMENT', 'LIFESTYLE'] as ReminderCategory[]).map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.categoryPill, newReminderCategory === cat && styles.categoryPillActive]}
                  onPress={() => setNewReminderCategory(cat)}
                >
                  <Text style={[styles.categoryPillText, newReminderCategory === cat && styles.categoryPillTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {newReminderCategory === 'MEDICATION' && (
              <View style={styles.confirmationRow}>
                <TouchableOpacity
                  style={[styles.checkbox, ackUnreviewed && styles.checkboxChecked]}
                  onPress={() => setAckUnreviewed(!ackUnreviewed)}
                >
                  {ackUnreviewed && <Check color="#FFFFFF" size={14} />}
                </TouchableOpacity>
                <Text style={styles.confirmationLabel}>
                  I acknowledge this reminder does NOT modify any clinical prescription or auto-mark doses as taken.
                </Text>
              </View>
            )}

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowAddReminderModal(false)}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryActionBtn}
                disabled={savingReminder}
                onPress={handleCreateReminder}
              >
                {savingReminder ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.primaryActionBtnText}>Create Reminder</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.white },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: theme.typography.sizes.bodySm, color: theme.colors.textMuted },
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    backgroundColor: theme.colors.white,
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: theme.typography.sizes.heading, fontWeight: theme.typography.weights.black, color: theme.colors.text },
  headerSubtitle: { fontSize: theme.typography.sizes.caption, color: theme.colors.textMuted, marginTop: 2 },
  disclaimerBanner: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
  },
  disclaimerHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  disclaimerTitle: { fontSize: theme.typography.sizes.caption, fontWeight: theme.typography.weights.extrabold, color: '#DC2626' },
  disclaimerBody: { fontSize: 11, color: '#991B1B', lineHeight: 15 },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tabButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabButtonActive: { borderBottomColor: theme.colors.primary },
  tabText: { fontSize: 13, fontWeight: theme.typography.weights.bold, color: theme.colors.textMuted },
  tabTextActive: { color: theme.colors.primary },
  scrollContent: { padding: theme.spacing.lg, gap: theme.spacing.lg, backgroundColor: theme.colors.bg },
  sectionContainer: { gap: theme.spacing.md },
  // SOS Trigger
  sosTriggerContainer: { alignItems: 'center', paddingVertical: 24, gap: 14 },
  sosMainButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  sosInnerCircle: { alignItems: 'center', justifyContent: 'center', gap: 4 },
  sosButtonText: { fontSize: 16, fontWeight: '900', color: '#FFFFFF', letterSpacing: 1 },
  sosButtonSub: { fontSize: 11, color: '#FEE2E2', fontWeight: '600' },
  sosHelperText: { textAlign: 'center', fontSize: 12, color: theme.colors.textMuted, maxWidth: 300, lineHeight: 16 },
  // Active SOS Card
  activeSosCard: {
    backgroundColor: '#FFF1F2',
    borderWidth: 2,
    borderColor: '#E11D48',
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: 12,
  },
  activeSosHeader: { flexDirection: 'row', alignItems: 'center' },
  activeSosTitle: { fontSize: 16, fontWeight: '900', color: '#BE123C' },
  activeSosSub: { fontSize: 12, color: '#9F1239' },
  activeSosDetails: { backgroundColor: '#FFFFFF', padding: 12, borderRadius: theme.radius.md, gap: 6 },
  detailRowText: { fontSize: 12, color: theme.colors.text },
  detailLabel: { fontWeight: '700', color: theme.colors.textMuted },
  cancelSosBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#BE123C',
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  cancelSosBtnText: { color: '#BE123C', fontWeight: '800', fontSize: 13 },
  // Standard Cards
  card: { backgroundColor: theme.colors.white, borderRadius: theme.radius.lg, padding: theme.spacing.lg, borderWidth: 1, borderColor: theme.colors.border },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: theme.typography.sizes.bodyLg, fontWeight: theme.typography.weights.extrabold, color: theme.colors.text },
  quickCallRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  quickCallBox: {
    flex: 1,
    backgroundColor: theme.colors.primarySurface,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
    borderRadius: theme.radius.md,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  quickCallNumber: { fontSize: 20, fontWeight: '900', color: theme.colors.primary },
  quickCallLabel: { fontSize: 11, color: theme.colors.textMuted, fontWeight: '600' },
  // Contact Cards
  contactCard: {
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  contactNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  contactName: { fontSize: 14, fontWeight: '800', color: theme.colors.text },
  contactMeta: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  sosRecipientBadge: { fontSize: 11, color: theme.colors.success, marginTop: 4, fontWeight: '600' },
  deleteBtn: { padding: 6 },
  badgePrimary: { backgroundColor: theme.colors.primarySurface, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgePrimaryText: { fontSize: 10, fontWeight: '800', color: theme.colors.primary },
  emptyCard: { backgroundColor: theme.colors.white, padding: 24, borderRadius: theme.radius.lg, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.borderLight },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.text, marginTop: 8 },
  emptySubtitle: { fontSize: 12, color: theme.colors.textMuted, textAlign: 'center', marginTop: 4 },
  primarySmallBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.colors.primary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: theme.radius.md },
  primarySmallBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  // Reminders
  safetyInfoBox: { flexDirection: 'row', gap: 8, backgroundColor: theme.colors.primarySurface, padding: 10, borderRadius: theme.radius.md, alignItems: 'center' },
  safetyInfoText: { fontSize: 11, color: theme.colors.primary, flex: 1, lineHeight: 15 },
  reminderCard: {
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  reminderHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reminderTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.text },
  reminderBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  reminderBadgeText: { fontSize: 10, fontWeight: '800' },
  badgeGood: { backgroundColor: '#DCFCE7' },
  textGood: { color: '#15803D', fontSize: 10, fontWeight: '800' },
  badgePending: { backgroundColor: '#FEF3C7' },
  textPending: { color: '#B45309', fontSize: 10, fontWeight: '800' },
  reminderMeta: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  reminderTime: { fontSize: 12, color: theme.colors.text, marginTop: 4, fontWeight: '600' },
  ackBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.colors.primary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: theme.radius.md },
  ackBtnText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  // Notifications
  markAllReadText: { fontSize: 12, color: theme.colors.primary, fontWeight: '700' },
  notifCard: { flexDirection: 'row', backgroundColor: theme.colors.white, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: 12, alignItems: 'flex-start' },
  notifUnread: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  notifTitle: { fontSize: 13, fontWeight: '800', color: theme.colors.text },
  notifBody: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  notifTime: { fontSize: 10, color: theme.colors.textPlaceholder, marginTop: 4 },
  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: theme.spacing.lg },
  modalContent: { backgroundColor: theme.colors.white, borderRadius: theme.radius.lg, padding: theme.spacing.lg, gap: 12 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalTitle: { fontSize: 16, fontWeight: '900', color: theme.colors.text },
  modalSubtitle: { fontSize: 12, color: theme.colors.textMuted },
  modalWarningBox: { backgroundColor: '#FEF2F2', padding: 10, borderRadius: theme.radius.md },
  modalWarningText: { fontSize: 11, color: '#991B1B', lineHeight: 15 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.text },
  textInput: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: 10, fontSize: 13 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  switchLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.text },
  switchSub: { fontSize: 10, color: theme.colors.textMuted, maxWidth: 220 },
  confirmationRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F8FAFC', padding: 10, borderRadius: theme.radius.md },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: theme.colors.primary },
  confirmationLabel: { flex: 1, fontSize: 11, color: theme.colors.text, lineHeight: 15, fontWeight: '600' },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border },
  modalCancelBtnText: { color: theme.colors.textMuted, fontWeight: '700' },
  modalDangerBtn: { flex: 1, backgroundColor: '#DC2626', paddingVertical: 12, alignItems: 'center', borderRadius: theme.radius.md },
  modalDangerBtnText: { color: '#FFFFFF', fontWeight: '800' },
  primaryActionBtn: { flex: 1, backgroundColor: theme.colors.primary, paddingVertical: 12, alignItems: 'center', borderRadius: theme.radius.md },
  primaryActionBtnText: { color: '#FFFFFF', fontWeight: '800' },
  modalBtnDisabled: { opacity: 0.5 },
  categoryPickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  categoryPill: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: theme.radius.sm, backgroundColor: '#F1F5F9' },
  categoryPillActive: { backgroundColor: theme.colors.primarySurface, borderWidth: 1, borderColor: theme.colors.primaryBorder },
  categoryPillText: { fontSize: 11, fontWeight: '700', color: theme.colors.textMuted },
  categoryPillTextActive: { color: theme.colors.primary },
});
