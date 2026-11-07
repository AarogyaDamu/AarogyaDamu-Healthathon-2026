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

  const riskConfig = getRiskTierConfig(action.riskTier);
  const statusConfig = getActionStatusConfig(action.status);
  const formattedParams = formatActionParameters(action.toolName, action.parameters);

  const getToolIcon = (toolName: AgentToolName | string) => {
    switch (toolName) {
      case 'tool_schedule_care_task':
        return <Calendar size={18} color="#0D9488" />;
      case 'tool_schedule_reminder':
        return <Bell size={18} color="#0D9488" />;
      case 'tool_request_appointment':
        return <Clock size={18} color="#0D9488" />;
      case 'tool_log_lifestyle_record':
        return <Activity size={18} color="#0D9488" />;
      case 'tool_query_health_summary':
        return <Activity size={18} color="#0D9488" />;
      case 'tool_log_health_vital':
        return <Heart size={18} color="#0D9488" />;
      case 'tool_draft_care_proposal':
        return <FileText size={18} color="#1D4ED8" />;
      default:
        return <Info size={18} color="#0D9488" />;
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

  const formatExpiry = (isoString: string): string => {
    try {
      const d = new Date(isoString);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    } catch {}
    return isoString;
  };

  const isAwaitingConfirmation = action.status === 'AWAITING_CONFIRMATION';
  const isDoctorGated = action.status === 'PENDING_CLINICIAN_APPROVAL';
  const isCompleted = action.status === 'COMPLETED';
  const isCancelled = action.status === 'CANCELLED';
  const isExpired = action.status === 'EXPIRED';
  const isFailed = action.status === 'FAILED';
  const isRejected = action.status === 'REJECTED';
  const isEmergencyAborted = (action.status as string) === 'EMERGENCY_ABORTED';

  return (
    <View style={styles.card}>
      {/* 1. Header: Tool Name, Icon & Risk Tier Badge */}
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <View style={styles.iconCircle}>{getToolIcon(action.toolName)}</View>
          <View style={styles.titleTextContainer}>
            <Text style={styles.toolTitle}>{getToolDisplayName(action.toolName)}</Text>
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
          <Info size={16} color="#1D4ED8" />
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
          <AlertTriangle size={18} color="#B91C1C" />
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
          <CheckCircle size={16} color="#15803D" />
          <Text style={styles.completedText}>Action executed and verified successfully.</Text>
        </View>
      )}

      {isCancelled && (
        <View style={styles.terminalNotice}>
          <XCircle size={16} color="#64748B" />
          <Text style={styles.terminalText}>Action was cancelled by patient or caregiver.</Text>
        </View>
      )}

      {isExpired && (
        <View style={styles.terminalNotice}>
          <Clock size={16} color="#64748B" />
          <Text style={styles.terminalText}>
            Proposal has expired. Ask Damu again if you still need this action.
          </Text>
        </View>
      )}

      {isFailed && (
        <View style={styles.failedNotice}>
          <AlertTriangle size={16} color="#B91C1C" />
          <Text style={styles.failedText}>Action execution failed. Please try again or contact support.</Text>
        </View>
      )}

      {isRejected && (
        <View style={styles.failedNotice}>
          <XCircle size={16} color="#B91C1C" />
          <Text style={styles.failedText}>Proposal was reviewed and rejected by clinician.</Text>
        </View>
      )}

      {/* 7. Inline Errors */}
      {(errorMessage || localError) && (
        <View style={styles.errorBox}>
          <AlertTriangle size={14} color="#B91C1C" />
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
              placeholderTextColor="#94A3B8"
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
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <X size={15} color="#FFFFFF" />
                  <Text style={styles.cancelConfirmButtonText}>Confirm Cancellation</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 9. Action Buttons (Confirm & Cancel) */}
      {!showCancelPrompt && (
        <View style={styles.actionsFooter}>
          {/* Awaiting Confirmation: Confirm & Cancel buttons */}
          {isAwaitingConfirmation && (
            <View style={styles.buttonsRow}>
              <TouchableOpacity
                style={[styles.cancelButton, isCancelling && styles.buttonDisabled]}
                onPress={() => setShowCancelPrompt(true)}
                disabled={isConfirming || isCancelling}
                accessibilityLabel="Cancel action"
              >
                <X size={16} color="#DC2626" />
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmButton, isConfirming && styles.buttonDisabled]}
                onPress={handleConfirmPress}
                disabled={isConfirming || isCancelling}
                accessibilityLabel="Confirm action"
              >
                {isConfirming ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Check size={16} color="#FFFFFF" />
                    <Text style={styles.confirmButtonText}>Confirm Action</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Pending Doctor Review: Withdraw option only, no patient confirmation button */}
          {isDoctorGated && (
            <View style={styles.buttonsRow}>
              <TouchableOpacity
                style={[styles.cancelButton, isCancelling && styles.buttonDisabled]}
                onPress={() => setShowCancelPrompt(true)}
                disabled={isCancelling}
                accessibilityLabel="Withdraw proposal"
              >
                <X size={15} color="#DC2626" />
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
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginVertical: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
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
    borderRadius: 17,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  titleTextContainer: {
    flex: 1,
  },
  toolTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  actionSummary: {
    fontSize: 12,
    color: '#475569',
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
    fontSize: 10,
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
    fontSize: 11,
    fontWeight: '600',
  },
  expiryText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  paramsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    gap: 6,
    marginBottom: 10,
  },
  paramRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  paramLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    flex: 1,
  },
  paramValue: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  doctorGatedNotice: {
    flexDirection: 'row',
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#2563EB',
    padding: 10,
    gap: 8,
    marginBottom: 10,
  },
  doctorGatedTextContainer: {
    flex: 1,
  },
  doctorGatedTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
    marginBottom: 2,
  },
  doctorGatedBody: {
    fontSize: 11,
    color: '#1E40AF',
    lineHeight: 15,
  },
  emergencyAbortedNotice: {
    flexDirection: 'row',
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#DC2626',
    padding: 10,
    gap: 8,
    marginBottom: 10,
  },
  emergencyAbortedTextContainer: {
    flex: 1,
  },
  emergencyAbortedTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B91C1C',
    marginBottom: 2,
  },
  emergencyAbortedBody: {
    fontSize: 11,
    color: '#7F1D1D',
    lineHeight: 15,
  },
  completedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    borderRadius: 6,
    padding: 8,
    gap: 6,
    marginBottom: 8,
  },
  completedText: {
    fontSize: 12,
    color: '#15803D',
    fontWeight: '600',
  },
  terminalNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    padding: 8,
    gap: 6,
    marginBottom: 8,
  },
  terminalText: {
    fontSize: 12,
    color: '#475569',
  },
  failedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderRadius: 6,
    padding: 8,
    gap: 6,
    marginBottom: 8,
  },
  failedText: {
    fontSize: 12,
    color: '#991B1B',
    fontWeight: '500',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    borderRadius: 6,
    padding: 8,
    gap: 6,
    marginBottom: 8,
  },
  errorBoxText: {
    fontSize: 11,
    color: '#B91C1C',
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
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    gap: 5,
  },
  cancelButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#0D9488',
    gap: 6,
  },
  confirmButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  cancelPromptBox: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 8,
    padding: 10,
    marginTop: 6,
  },
  cancelPromptTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9A3412',
    marginBottom: 2,
  },
  cancelPromptSubtitle: {
    fontSize: 11,
    color: '#C2410C',
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  reasonChipSelected: {
    backgroundColor: '#EA580C',
    borderColor: '#EA580C',
  },
  reasonChipText: {
    fontSize: 11,
    color: '#7C2D12',
  },
  reasonChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  customReasonInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    color: '#0F172A',
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
    backgroundColor: '#F1F5F9',
  },
  cancelAbortText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  cancelConfirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#DC2626',
    gap: 4,
  },
  cancelConfirmButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
