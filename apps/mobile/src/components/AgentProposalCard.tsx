import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import {
  Calendar,
  Bell,
  Clock,
  Activity,
  Heart,
  FileText,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  Check,
  X,
  ShieldAlert,
} from 'lucide-react-native';
import { AgentActionItem, AgentToolName } from '@aarogyadamu/contracts';
import {
  getToolDisplayName,
  getRiskTierConfig,
  getActionStatusConfig,
  formatActionParameters,
  generateUUID,
} from '../api/agent';
import { theme } from '../theme';

export interface AgentProposalCardProps {
  action: AgentActionItem;
  planId?: string;
  planVersion?: number;
  onConfirm?: (actionId: string, idempotencyKey: string) => Promise<void>;
  onCancel?: (actionId: string, reason: string) => Promise<void>;
  isConfirming?: boolean;
  isCancelling?: boolean;
  errorMessage?: string | null;
}

const CANCEL_REASONS = [
  'No longer needed',
  'Incorrect details',
  'Scheduled by mistake',
  'Decided on another approach',
];

export function AgentProposalCard({
  action,
  planId,
  planVersion,
  onConfirm,
  onCancel,
  isConfirming = false,
  isCancelling = false,
  errorMessage = null,
}: AgentProposalCardProps) {
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string>(CANCEL_REASONS[0]);
  const [customReason, setCustomReason] = useState<string>('');
  const [useCustomReason, setUseCustomReason] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const toolDisplayName = getToolDisplayName(action.toolName);
  const riskConfig = getRiskTierConfig(action.riskTier);
  const statusConfig = getActionStatusConfig(action.status);
  const formattedParams = formatActionParameters(action.toolName, action.parameters);

  const isAwaitingConfirmation = action.status === 'AWAITING_CONFIRMATION';
  const isDoctorGated = action.status === 'PENDING_CLINICIAN_APPROVAL';
  const isCompleted = action.status === 'COMPLETED';
  const isCancelled = action.status === 'CANCELLED';
  const isExpired = action.status === 'EXPIRED';
  const isFailed = action.status === 'FAILED';
  const isRejected = action.status === 'REJECTED';
  const isEmergencyAborted =
    (action.status as any) === 'EMERGENCY_ABORTED' ||
    ((action.status as any) === 'CANCELLED' && (action.parameters as any)?.reason?.includes('Emergency'));

  const getToolIcon = (toolName: AgentToolName | string) => {
    switch (toolName) {
      case 'tool_schedule_care_task':
        return <Calendar size={18} color="#004D4D" />;
      case 'tool_schedule_reminder':
        return <Bell size={18} color="#004D4D" />;
      case 'tool_request_appointment':
        return <Calendar size={18} color="#004D4D" />;
      case 'tool_log_lifestyle_record':
        return <Activity size={18} color="#059669" />;
      case 'tool_query_health_summary':
        return <Activity size={18} color="#004D4D" />;
      case 'tool_log_health_vital':
        return <Heart size={18} color="#ba1a1a" />;
      case 'tool_draft_care_proposal':
        return <FileText size={18} color="#0E7C7B" />;
      default:
        return <Info size={18} color="#004D4D" />;
    }
  };

  const handleConfirmPress = async () => {
    if (!onConfirm || isConfirming || isCancelling) return;
    setLocalError(null);
    try {
      const idempotencyKey = generateUUID();
      await onConfirm(action.id, idempotencyKey);
    } catch (err: any) {
      setLocalError(err?.message || 'Failed to confirm action.');
    }
  };

  const handleCancelSubmit = async () => {
    if (!onCancel || isCancelling || isConfirming) return;
    const finalReason = useCustomReason ? customReason.trim() : selectedReason;
    if (finalReason.length < 3) {
      setLocalError('Please provide a reason of at least 3 characters.');
      return;
    }
    setLocalError(null);
    try {
      await onCancel(action.id, finalReason);
      setShowCancelPrompt(false);
    } catch (err: any) {
      setLocalError(err?.message || 'Failed to cancel action.');
    }
  };

  const formatExpiry = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <View style={styles.card}>
      {/* 1. Header: Icon, Tool Display Name, Description, and Risk Tier Badge */}
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <View style={styles.iconCircle}>{getToolIcon(action.toolName)}</View>
          <View style={styles.titleTextContainer}>
            <Text style={styles.toolTitle}>{toolDisplayName}</Text>
            <Text style={styles.actionSummary}>{action.summary}</Text>
          </View>
        </View>

        {/* Risk Badge */}
        <View
          style={[
            styles.riskBadge,
            { backgroundColor: riskConfig.bgColor, borderColor: riskConfig.borderColor },
          ]}
        >
          <Text style={[styles.riskBadgeText, { color: riskConfig.color }]}>
            {riskConfig.label}
          </Text>
        </View>
      </View>

      {/* 2. Status Pill */}
      <View style={styles.statusRow}>
        <View
          style={[
            styles.statusPill,
            { backgroundColor: statusConfig.bgColor, borderColor: statusConfig.borderColor },
          ]}
        >
          {isCompleted ? (
            <CheckCircle size={13} color={statusConfig.color} />
          ) : isCancelled ? (
            <XCircle size={13} color={statusConfig.color} />
          ) : isEmergencyAborted ? (
            <ShieldAlert size={13} color={statusConfig.color} />
          ) : (
            <Clock size={13} color={statusConfig.color} />
          )}
          <Text style={[styles.statusPillText, { color: statusConfig.color }]}>
            {statusConfig.label}
          </Text>
        </View>

        {/* Expiry tag */}
        {!statusConfig.isFinal && action.expiresAt && (
          <Text style={styles.expiryText}>Expires at {formatExpiry(action.expiresAt)}</Text>
        )}
      </View>

      {/* 3. Formatted Parameters List */}
      {formattedParams.length > 0 && (
        <View style={styles.paramsBox}>
          {formattedParams.map((param, idx) => (
            <View key={idx} style={styles.paramRow}>
              <Text style={styles.paramLabel}>{param.label}:</Text>
              <Text style={styles.paramValue}>{param.value}</Text>
            </View>
          ))}
        </View>
      )}

      {/* 4. Clinical Boundary Notice for Doctor Review Gated Actions */}
      {isDoctorGated && (
        <View style={styles.doctorGatedNotice}>
          <Info size={16} color="#004D4D" />
          <View style={styles.doctorGatedTextContainer}>
            <Text style={styles.doctorGatedTitle}>Doctor Review Required</Text>
            <Text style={styles.doctorGatedBody}>
              This proposal modifies your clinical care plan. To protect your medical safety,
              a licensed clinician must review and approve this action. Patients cannot confirm it directly.
            </Text>
          </View>
        </View>
      )}

      {/* 5. Emergency Precedence Halt Notice */}
      {isEmergencyAborted && (
        <View style={styles.emergencyAbortedNotice}>
          <AlertTriangle size={18} color="#ba1a1a" />
          <View style={styles.emergencyAbortedTextContainer}>
            <Text style={styles.emergencyAbortedTitle}>Action Halted for Clinical Safety</Text>
            <Text style={styles.emergencyAbortedBody}>
              An acute emergency condition was detected. Agent execution was halted immediately.
              Please seek immediate emergency medical care or call 112 / 108.
            </Text>
          </View>
        </View>
      )}

      {/* 6. Success / Terminal Badges */}
      {isCompleted && (
        <View style={styles.completedNotice}>
          <CheckCircle size={16} color="#059669" />
          <Text style={styles.completedText}>Action executed and verified successfully.</Text>
        </View>
      )}

      {isCancelled && (
        <View style={styles.terminalNotice}>
          <XCircle size={16} color="#737784" />
          <Text style={styles.terminalText}>Action was cancelled by patient or caregiver.</Text>
        </View>
      )}

      {isExpired && (
        <View style={styles.terminalNotice}>
          <Clock size={16} color="#737784" />
          <Text style={styles.terminalText}>
            Proposal has expired. Ask Damu again if you still need this action.
          </Text>
        </View>
      )}

      {isFailed && (
        <View style={styles.failedNotice}>
          <AlertTriangle size={16} color="#ba1a1a" />
          <Text style={styles.failedText}>Action execution failed. Please try again or contact support.</Text>
        </View>
      )}

      {isRejected && (
        <View style={styles.failedNotice}>
          <XCircle size={16} color="#ba1a1a" />
          <Text style={styles.failedText}>Proposal was reviewed and rejected by clinician.</Text>
        </View>
      )}

      {/* 7. Inline Errors */}
      {(errorMessage || localError) && (
        <View style={styles.errorBox}>
          <AlertTriangle size={14} color="#ba1a1a" />
          <Text style={styles.errorBoxText}>{errorMessage || localError}</Text>
        </View>
      )}

      {/* 8. Cancellation Reason Prompt */}
      {showCancelPrompt && (
        <View style={styles.cancelPromptBox}>
          <Text style={styles.cancelPromptTitle}>Reason for Cancellation</Text>
          <Text style={styles.cancelPromptSubtitle}>
            Please select or provide a reason to cancel this proposed action:
          </Text>

          <View style={styles.reasonChipsContainer}>
            {CANCEL_REASONS.map((reason, idx) => {
              const isSelected = !useCustomReason && selectedReason === reason;
              return (
                <TouchableOpacity
                  key={idx}
                  style={[styles.reasonChip, isSelected && styles.reasonChipSelected]}
                  onPress={() => {
                    setUseCustomReason(false);
                    setSelectedReason(reason);
                  }}
                  disabled={isCancelling}
                >
                  <Text style={[styles.reasonChipText, isSelected && styles.reasonChipTextSelected]}>
                    {reason}
                  </Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={[styles.reasonChip, useCustomReason && styles.reasonChipSelected]}
              onPress={() => setUseCustomReason(true)}
              disabled={isCancelling}
            >
              <Text style={[styles.reasonChipText, useCustomReason && styles.reasonChipTextSelected]}>
                Other (Type reason)
              </Text>
            </TouchableOpacity>
          </View>

          {useCustomReason && (
            <TextInput
              style={styles.customReasonInput}
              placeholder="Type cancellation reason (min 3 chars)..."
              placeholderTextColor="#737784"
              value={customReason}
              onChangeText={setCustomReason}
              maxLength={200}
              editable={!isCancelling}
            />
          )}

          <View style={styles.cancelActionsRow}>
            <TouchableOpacity
              style={styles.cancelAbortButton}
              onPress={() => setShowCancelPrompt(false)}
              disabled={isCancelling}
            >
              <Text style={styles.cancelAbortText}>Back</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cancelConfirmButton, isCancelling && styles.buttonDisabled]}
              onPress={handleCancelSubmit}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <X size={15} color="#ffffff" />
                  <Text style={styles.cancelConfirmButtonText}>Confirm Cancellation</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 9. Action Buttons */}
      {!showCancelPrompt && !statusConfig.isFinal && (
        <View style={styles.actionsFooter}>
          {isAwaitingConfirmation && (
            <View style={styles.buttonsRow}>
              <TouchableOpacity
                style={[styles.cancelButton, (isConfirming || isCancelling) && styles.buttonDisabled]}
                onPress={() => setShowCancelPrompt(true)}
                disabled={isConfirming || isCancelling}
                accessibilityRole="button"
                accessibilityLabel="Cancel action proposal"
              >
                <X size={15} color="#ba1a1a" />
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmButton, (isConfirming || isCancelling) && styles.buttonDisabled]}
                onPress={handleConfirmPress}
                disabled={isConfirming || isCancelling}
                accessibilityRole="button"
                accessibilityLabel="Confirm action execution"
              >
                {isConfirming ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Check size={15} color="#ffffff" />
                    <Text style={styles.confirmButtonText}>Confirm Action</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {isDoctorGated && (
            <View style={styles.buttonsRow}>
              <TouchableOpacity
                style={[styles.cancelButton, isCancelling && styles.buttonDisabled]}
                onPress={() => setShowCancelPrompt(true)}
                disabled={isCancelling}
                accessibilityRole="button"
                accessibilityLabel="Withdraw proposed modification"
              >
                <X size={15} color="#ba1a1a" />
                <Text style={styles.cancelButtonText}>Withdraw Proposal</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(9, 76, 178, 0.08)',
    padding: 14,
    marginVertical: 6,
    shadowColor: '#004D4D',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  titleGroup: {
    flexDirection: 'row',
    flex: 1,
    gap: 10,
    marginRight: 8,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(9, 76, 178, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  titleTextContainer: {
    flex: 1,
  },
  toolTitle: {
    fontFamily: 'Noto Serif',
    fontSize: 14,
    fontWeight: '700',
    color: '#191c20',
    marginBottom: 2,
  },
  actionSummary: {
    fontFamily: 'Inter',
    fontSize: 11.5,
    color: '#434653',
    lineHeight: 16,
  },
  riskBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  riskBadgeText: {
    fontFamily: 'Public Sans',
    fontSize: 9.5,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    gap: 5,
  },
  statusPillText: {
    fontFamily: 'Public Sans',
    fontSize: 10.5,
    fontWeight: '700',
  },
  expiryText: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: '#737784',
  },
  paramsBox: {
    backgroundColor: '#f2f3f9',
    borderRadius: 10,
    padding: 10,
    gap: 6,
    marginBottom: 10,
  },
  paramRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  paramLabel: {
    fontFamily: 'Public Sans',
    fontSize: 11,
    fontWeight: '700',
    color: '#737784',
    flex: 1,
  },
  paramValue: {
    fontFamily: 'Inter',
    fontSize: 11.5,
    color: '#191c20',
    fontWeight: '600',
    flex: 2,
    textAlign: 'right',
  },
  doctorGatedNotice: {
    flexDirection: 'row',
    backgroundColor: '#f8f9fc',
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#004D4D',
    padding: 10,
    gap: 8,
    marginBottom: 10,
  },
  doctorGatedTextContainer: {
    flex: 1,
  },
  doctorGatedTitle: {
    fontFamily: 'Public Sans',
    fontSize: 11.5,
    fontWeight: '700',
    color: '#004D4D',
    marginBottom: 2,
  },
  doctorGatedBody: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: '#33628b',
    lineHeight: 15,
  },
  emergencyAbortedNotice: {
    flexDirection: 'row',
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#ba1a1a',
    padding: 10,
    gap: 8,
    marginBottom: 10,
  },
  emergencyAbortedTextContainer: {
    flex: 1,
  },
  emergencyAbortedTitle: {
    fontFamily: 'Public Sans',
    fontSize: 11.5,
    fontWeight: '700',
    color: '#ba1a1a',
    marginBottom: 2,
  },
  emergencyAbortedBody: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: '#7f1d1d',
    lineHeight: 15,
  },
  completedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    borderRadius: 8,
    padding: 8,
    gap: 6,
    marginBottom: 8,
  },
  completedText: {
    fontFamily: 'Public Sans',
    fontSize: 11.5,
    color: '#059669',
    fontWeight: '700',
  },
  terminalNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eceef3',
    borderRadius: 8,
    padding: 8,
    gap: 6,
    marginBottom: 8,
  },
  terminalText: {
    fontFamily: 'Inter',
    fontSize: 11.5,
    color: '#737784',
  },
  failedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 8,
    gap: 6,
    marginBottom: 8,
  },
  failedText: {
    fontFamily: 'Inter',
    fontSize: 11.5,
    color: '#ba1a1a',
    fontWeight: '600',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 8,
    gap: 6,
    marginBottom: 8,
  },
  errorBoxText: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: '#ba1a1a',
    flex: 1,
  },
  actionsFooter: {
    marginTop: 4,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f2f3f9',
    gap: 5,
  },
  cancelButtonText: {
    fontFamily: 'Public Sans',
    fontSize: 11.5,
    fontWeight: '700',
    color: '#ba1a1a',
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#004D4D',
    gap: 6,
    shadowColor: '#004D4D',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 1,
  },
  confirmButtonText: {
    fontFamily: 'Public Sans',
    fontSize: 11.5,
    fontWeight: '700',
    color: '#ffffff',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  cancelPromptBox: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
  },
  cancelPromptTitle: {
    fontFamily: 'Public Sans',
    fontSize: 12,
    fontWeight: '700',
    color: '#92400e',
    marginBottom: 2,
  },
  cancelPromptSubtitle: {
    fontFamily: 'Inter',
    fontSize: 10.5,
    color: '#b45309',
    marginBottom: 8,
  },
  reasonChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  reasonChip: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  reasonChipSelected: {
    backgroundColor: '#d97706',
    borderColor: '#d97706',
  },
  reasonChipText: {
    fontFamily: 'Inter',
    fontSize: 10.5,
    color: '#78350f',
  },
  reasonChipTextSelected: {
    color: '#ffffff',
    fontWeight: '700',
  },
  customReasonInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 11.5,
    fontFamily: 'Inter',
    color: '#191c20',
    marginBottom: 8,
  },
  cancelActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  cancelAbortButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#f2f3f9',
  },
  cancelAbortText: {
    fontFamily: 'Public Sans',
    fontSize: 11,
    fontWeight: '700',
    color: '#737784',
  },
  cancelConfirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#ba1a1a',
    gap: 4,
  },
  cancelConfirmButtonText: {
    fontFamily: 'Public Sans',
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
  },
});
