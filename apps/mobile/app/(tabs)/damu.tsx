import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Animated,
  Easing,
  Alert,
  Platform,
  Linking,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import {
  Mic,
  MicOff,
  Send,
  Volume2,
  VolumeX,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Info,
  CheckCircle,
  HelpCircle,
  Zap,
  Bot,
  Phone,
  BookOpen,
  FileText,
  User,
} from 'lucide-react-native';
import { theme } from '../../src/theme';
import { DamuService, DamuState, DamuChatMessage } from '../../src/api/damu';
import { AgentService } from '../../src/api/agent';
import { AgentProposalCard } from '../../src/components/AgentProposalCard';
import { DamuAvatar } from '../../src/components/DamuAvatar';
import { DamuStatusResponse, AgentActionStatus, DamuAvatarMode } from '@aarogyadamu/contracts';
import { voicePlaybackManager, VoicePlaybackState } from '../../src/services/voicePlaybackService';

const SUPPORTED_LANGUAGES: Array<{ code: string; label: string; native: string }> = [
  { code: 'en-IN', label: 'English', native: 'English' },
  { code: 'hi-IN', label: 'Hindi', native: 'हिन्दी' },
  { code: 'te-IN', label: 'Telugu', native: 'తెలుగు' },
  { code: 'ta-IN', label: 'Tamil', native: 'தமிழ்' },
  { code: 'kn-IN', label: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'bn-IN', label: 'Bengali', native: 'বাংলা' },
  { code: 'mr-IN', label: 'Marathi', native: 'मराठी' },
  { code: 'gu-IN', label: 'Gujarati', native: 'ગુજરાતી' },
];

const SUGGESTED_QUERIES = [
  'What should my fasting blood sugar be?',
  'Explain my HbA1c target in simple words',
  'What foods help avoid post-meal sugar spikes?',
  'Why do I feel dizzy when my sugar drops?',
];

const AGENT_SUGGESTED_QUERIES = [
  'Remind me to take Metformin 500mg at 8 PM',
  'Schedule fasting blood sugar test for tomorrow',
  'Log fasting blood sugar 115 mg/dL',
  'Request appointment with Dr. Sharma for next week',
  'Log 30 minutes morning walking',
  'Draft care plan proposal to review meal timings',
];

export default function DamuVoiceScreen() {
  const insets = useSafeAreaInsets();

  // Assistant State
  const [state, setState] = useState<DamuState>('idle');
  const [mode, setMode] = useState<'companion' | 'agent'>('companion');
  const [status, setStatus] = useState<DamuStatusResponse | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('en-IN');
  const [consentGiven, setConsentGiven] = useState<boolean>(false);
  const [textInput, setTextInput] = useState<string>('');
  const [messages, setMessages] = useState<DamuChatMessage[]>([]);
  const [activeEmergency, setActiveEmergency] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [waveCounter, setWaveCounter] = useState<number>(1);
  const [voiceState, setVoiceState] = useState<VoicePlaybackState>(voicePlaybackManager.getState());

  // Derived 3D avatar animation mode
  const avatarMode: DamuAvatarMode =
    state === 'listening'
      ? 'listening'
      : state === 'processing'
      ? 'thinking'
      : isSpeaking
      ? 'speaking'
      : 'idle';

  // Agent in-flight state tracking
  const [confirmingActionId, setConfirmingActionId] = useState<string | null>(null);
  const [cancellingActionId, setCancellingActionId] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  // Native recording and speech references
  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const webAudioRef = useRef<any>(null);

  // Pulse animation for recording state
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    loadProviderStatus();
    const unsub = voicePlaybackManager.subscribe((st) => {
      setVoiceState(st);
      setIsSpeaking(st.status === 'speaking');
    });

    return () => {
      unsub();
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
      voicePlaybackManager.stop(false).catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (state === 'listening') {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.25,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoop.current.start();
    } else {
      if (pulseLoop.current) {
        pulseLoop.current.stop();
        pulseLoop.current = null;
      }
      pulseAnim.setValue(1);
    }
  }, [state]);

  const loadProviderStatus = async () => {
    try {
      const res = await DamuService.getStatus();
      setStatus(res);
    } catch {
      // Offline fallback
    }
  };

  const speakResponse = async (
    text: string,
    lang?: string,
    audioBase64?: string,
    providerName?: string,
    speakerName?: string,
    ttsError?: string,
    messageId?: string
  ) => {
    const activeMsgId =
      messageId ||
      (messages.length > 0 ? messages[messages.length - 1]?.id : `msg-${Date.now()}`);

    try {
      await voicePlaybackManager.speak({
        messageId: activeMsgId,
        text,
        language: lang || selectedLanguage,
        audioBase64,
        providerName,
        speakerName,
        ttsError,
      });
    } catch {
      setIsSpeaking(false);
    }
  };

  const stopSpeaking = async () => {
    try {
      Speech.stop();
    } catch {}
    try {
      await voicePlaybackManager.stop(true);
    } catch {}
    setIsSpeaking(false);
  };

  // Device speech synthesis helper using expo-speech as reliable fallback
  const speakWithDeviceVoice = (text: string, lang?: string) => {
    Speech.speak(text, {
      language: lang || selectedLanguage,
      rate: 0.95,
      pitch: 1.0,
      onDone: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  };

  const handleStartVoice = async () => {
    if (!consentGiven) {
      Alert.alert(
        'Informed Consent Required',
        'Please review and accept informed consent before using voice interaction.',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      stopSpeaking();
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Microphone Permission Required',
          'Please grant microphone permission to interact with Damu using your voice.'
        );
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setState('listening');
      setErrorMessage(null);
    } catch (err: any) {
      setState('error');
      setErrorMessage(err?.message || 'Failed to start microphone recording.');
    }
  };

  const handleFinishVoiceRecording = async () => {
    if (!recordingRef.current) {
      setState('idle');
      return;
    }

    setState('processing');
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) {
        setState('idle');
        return;
      }

      const response = await fetch(uri);
      const blob = await response.blob();
      const audioBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const res = reader.result as string;
          resolve(res.includes(',') ? res.split(',')[1] : res);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const lowerUri = uri.toLowerCase();
      const isWav = lowerUri.endsWith('.wav');
      const isWebm = lowerUri.endsWith('.webm');
      const mimeType = isWav ? 'audio/wav' : isWebm ? 'audio/webm' : 'audio/mp4';

      await submitVoicePayload(audioBase64, mimeType);
    } catch (err: any) {
      setState('error');
      setErrorMessage(err?.message || 'Failed to process voice recording.');
    }
  };

  const handleCancelVoice = async () => {
    try {
      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync();
        recordingRef.current = null;
      }
    } catch {}
    setState('idle');
  };

  const isAgentQuery = (text: string): boolean => {
    const lower = text.toLowerCase().trim();
    return (
      mode === 'agent' ||
      lower.startsWith('schedule') ||
      lower.startsWith('remind') ||
      lower.startsWith('request appointment') ||
      lower.startsWith('book') ||
      lower.startsWith('log ') ||
      lower.startsWith('draft ')
    );
  };

  const handleGenerateAgentPlan = async (userQuery: string) => {
    setState('processing');
    setErrorMessage(null);

    try {
      const planRes = await AgentService.generatePlan({
        userQuery,
        language: selectedLanguage,
        consentObtained: true,
        consentVersion: 'v1.0-mobile',
      });

      if (!planRes.success) {
        if (planRes.hasEmergency) {
          const emergencyText =
            planRes.emergencyNotice ||
            'Emergency condition detected: Agent planning halted immediately.';
          setActiveEmergency(emergencyText);
          const emergencyDamuMsg: DamuChatMessage = {
            id: `damu-${Date.now()}`,
            sender: 'damu',
            text: emergencyText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            emergencyNotice: emergencyText,
          };
          setMessages((prev) => [...prev, emergencyDamuMsg]);
          speakResponse(emergencyText);
          setState('responding');
          return;
        }

        if (planRes.isProhibited) {
          const refusalReason =
            planRes.prohibitedRefusal?.reason ||
            'This clinical action is prohibited. Damu cannot prescribe medications or alter clinical dosages.';
          const prohibitedDamuMsg: DamuChatMessage = {
            id: `damu-${Date.now()}`,
            sender: 'damu',
            text: refusalReason,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isProhibited: true,
            prohibitedRefusal: planRes.prohibitedRefusal,
          };
          setMessages((prev) => [...prev, prohibitedDamuMsg]);
          speakResponse(refusalReason);
          setState('responding');
          return;
        }

        setState('error');
        setErrorMessage(planRes.error || 'Failed to generate agent plan.');
        return;
      }

      const plan = planRes.plan!;
      const effectivePlanId = plan.planId || (plan as any).id;
      const damuMsg: DamuChatMessage = {
        id: `damu-${Date.now()}`,
        sender: 'damu',
        text:
          plan.explanation ||
          `I have prepared a governed action plan for "${plan.userIntent}". Please inspect and confirm the actions below:`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        planId: effectivePlanId,
        plan: plan,
      };

      setMessages((prev) => [...prev, damuMsg]);
      setState('responding');
      speakResponse(plan.explanation || 'I have generated your action plan. Please review and confirm on screen.');
    } catch (err: any) {
      setState('error');
      setErrorMessage(err?.message || 'Damu Assistant is currently unavailable. Please try again shortly.');
    }
  };

  const handleConfirmAction = async (
    planId: string,
    planVersion: number,
    actionId: string,
    idempotencyKey: string,
  ) => {
    setConfirmingActionId(actionId);
    setActionErrors((prev) => {
      const next = { ...prev };
      delete next[actionId];
      return next;
    });

    try {
      const res = await AgentService.confirmAction(actionId, {
        planId,
        planVersion,
        confirm: true,
        idempotencyKey,
      });

      if (!res.success) {
        if (res.hasEmergency) {
          const emergencyNotice =
            res.emergencyNotice || 'Critical emergency condition detected. Action halted.';
          setActiveEmergency(emergencyNotice);
          speakResponse(emergencyNotice);
        }
        setActionErrors((prev) => ({
          ...prev,
          [actionId]: res.error || 'Failed to execute confirmed action.',
        }));
        if (res.status) {
          updateActionStatus(planId, actionId, res.status);
        }
        return;
      }

      updateActionStatus(planId, actionId, res.status || 'COMPLETED');
    } catch (err: any) {
      setActionErrors((prev) => ({
        ...prev,
        [actionId]: err?.message || 'Network or execution error confirming action.',
      }));
    } finally {
      setConfirmingActionId(null);
    }
  };

  const handleCancelAction = async (
    planId: string,
    planVersion: number,
    actionId: string,
    reason: string,
  ) => {
    setCancellingActionId(actionId);
    setActionErrors((prev) => {
      const next = { ...prev };
      delete next[actionId];
      return next;
    });

    try {
      const res = await AgentService.cancelAction(actionId, {
        planId,
        planVersion,
        reason,
      });

      if (!res.success) {
        setActionErrors((prev) => ({
          ...prev,
          [actionId]: res.error || 'Failed to cancel action.',
        }));
        return;
      }

      updateActionStatus(planId, actionId, res.status || 'CANCELLED');
    } catch (err: any) {
      setActionErrors((prev) => ({
        ...prev,
        [actionId]: err?.message || 'Error cancelling action.',
      }));
    } finally {
      setCancellingActionId(null);
    }
  };

  const updateActionStatus = (planId: string, actionId: string, newStatus: AgentActionStatus) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (!msg.plan) return msg;
        const msgPlanId = msg.plan.planId || (msg.plan as any).id;
        if (msgPlanId && planId && msgPlanId !== planId) return msg;
        const updatedActions = msg.plan.actions.map((act) => {
          if (act.id !== actionId) return act;
          return { ...act, status: newStatus };
        });
        return {
          ...msg,
          plan: {
            ...msg.plan,
            actions: updatedActions,
          },
        };
      })
    );
  };

  const submitVoicePayload = async (audioBase64: string, mimeType: string) => {
    try {
      const response = await DamuService.interact({
        audioBase64,
        mimeType,
        language: selectedLanguage,
        consentObtained: true,
        consentVersion: 'v1.0-mobile',
        conversationId,
      });

      if (response.conversationId) {
        setConversationId(response.conversationId);
      }

      const userTranscript = response.transcript || 'Spoken Voice Query';

      const userMsg: DamuChatMessage = {
        id: `user-${Date.now()}`,
        sender: 'user',
        text: userTranscript,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isVoice: true,
      };

      setMessages((prev) => [...prev, userMsg]);

      if (isAgentQuery(userTranscript)) {
        await handleGenerateAgentPlan(userTranscript);
        return;
      }

      const damuMsg: DamuChatMessage = {
        id: `damu-${Date.now()}`,
        sender: 'damu',
        text: response.textResponse,
        spokenText: response.spokenText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        intent: response.intent,
        avatarMode: response.avatarMode,
        sources: response.sources,
        suggestedFollowUps: response.suggestedFollowUps,
        emergencyNotice: response.emergencyNotice,
        emergencyEscalation: response.emergencyEscalation,
        isProhibited: response.isProhibited,
        transparency: response.transparency,
        audioBase64: response.audioBase64,
        ttsProvider: response.ttsProvider,
        ttsSpeaker: response.ttsSpeaker,
        ttsError: response.ttsError,
      };

      setMessages((prev) => [...prev, damuMsg]);

      if (response.emergencyNotice) {
        setActiveEmergency(response.emergencyNotice);
      }

      setState('responding');
      await speakResponse(
        response.spokenText || response.textResponse,
        response.detectedLanguage || selectedLanguage,
        response.audioBase64,
        response.ttsProvider,
        response.ttsSpeaker,
        response.ttsError,
        damuMsg.id
      );
    } catch (err: any) {
      setState('error');
      setErrorMessage(err?.message || 'Failed to process voice interaction with Damu.');
    }
  };

  const handleSendText = async () => {
    if (!textInput.trim()) return;

    if (!consentGiven) {
      Alert.alert(
        'Informed Consent Required',
        'Please confirm your consent before interacting with Damu.',
        [{ text: 'OK' }]
      );
      return;
    }

    const prompt = textInput.trim();
    setTextInput('');
    setState('processing');
    setErrorMessage(null);

    const userMsg: DamuChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: prompt,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isVoice: false,
    };
    setMessages((prev) => [...prev, userMsg]);

    if (isAgentQuery(prompt)) {
      await handleGenerateAgentPlan(prompt);
      return;
    }

    try {
      const response = await DamuService.interact({
        textPrompt: prompt,
        language: selectedLanguage,
        consentObtained: true,
        consentVersion: 'v1.0-mobile',
        conversationId,
      });

      if (response.conversationId) {
        setConversationId(response.conversationId);
      }

      const damuMsg: DamuChatMessage = {
        id: `damu-${Date.now()}`,
        sender: 'damu',
        text: response.textResponse,
        spokenText: response.spokenText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        intent: response.intent,
        avatarMode: response.avatarMode,
        sources: response.sources,
        suggestedFollowUps: response.suggestedFollowUps,
        emergencyNotice: response.emergencyNotice,
        emergencyEscalation: response.emergencyEscalation,
        isProhibited: response.isProhibited,
        transparency: response.transparency,
        audioBase64: response.audioBase64,
        ttsProvider: response.ttsProvider,
        ttsSpeaker: response.ttsSpeaker,
        ttsError: response.ttsError,
      };

      setMessages((prev) => [...prev, damuMsg]);

      if (response.emergencyNotice) {
        setActiveEmergency(response.emergencyNotice);
      }

      setState('responding');
      await speakResponse(
        response.spokenText || response.textResponse,
        response.detectedLanguage || selectedLanguage,
        response.audioBase64,
        response.ttsProvider,
        response.ttsSpeaker,
        response.ttsError,
        damuMsg.id
      );
    } catch (err: any) {
      setState('error');
      setErrorMessage(err?.message || 'Failed to communicate with Damu.');
    }
  };

  const handleResetSession = () => {
    stopSpeaking();
    if (recordingRef.current) {
      recordingRef.current.stopAndUnloadAsync().catch(() => {});
      recordingRef.current = null;
    }
    if (conversationId) {
      DamuService.deleteConversation(conversationId).catch(() => {});
      setConversationId(undefined);
    }
    setMessages([]);
    setActiveEmergency(null);
    setErrorMessage(null);
    setState('idle');
    setIsSpeaking(false);
    setConfirmingActionId(null);
    setCancellingActionId(null);
    setActionErrors({});
    setWaveCounter((c) => c + 1);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      {/* 1. Header with Status & Zero Retention Badge (Alexandria Style) */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.titleRow}>
            <View style={styles.beaconDot} />
            <View>
              <Text style={styles.headerTitle}>Damu Companion</Text>
              <Text style={styles.headerSubtitle}>
                {status?.models.llm ? 'ACTIVE • CLINICAL COMPANION' : 'MULTILINGUAL CARE COMPANION'}
              </Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.resetButton}
              onPress={handleResetSession}
              accessibilityLabel="Reset conversation"
            >
              <RotateCcw size={16} color="#737784" />
            </TouchableOpacity>
            <View style={styles.avatarCircle}>
              <User color="#ffffff" size={16} />
            </View>
          </View>
        </View>

        {/* Zero-Retention Pill */}
        <View style={styles.zeroRetentionPill}>
          <ShieldCheck size={14} color="#004D4D" />
          <Text style={styles.zeroRetentionText}>
            Zero-Retention Privacy: Audio processed in-memory only (0 days stored)
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* 2. Emergency Banner if Triggered */}
        {activeEmergency && (
          <View style={styles.emergencyBanner}>
            <AlertTriangle size={24} color="#ba1a1a" />
            <View style={styles.emergencyTextContainer}>
              <Text style={styles.emergencyTitle}>URGENT CLINICAL ALERT</Text>
              <Text style={styles.emergencyBody}>{activeEmergency}</Text>
              <TouchableOpacity
                style={styles.emergencyCallBtn}
                onPress={() => Linking.openURL('tel:112')}
                accessibilityRole="button"
                accessibilityLabel="Call 112 Emergency"
              >
                <Phone size={14} color="#FFFFFF" />
                <Text style={styles.emergencyCallBtnText}>Call 112 (National Emergency)</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* 2b. 3D Interactive Three.js Damu Character Hero Stage */}
        <View style={styles.avatarHeroSection}>
          <DamuAvatar
            mode={avatarMode}
            size={200}
            triggerWave={waveCounter}
            testID="damu-character-3d"
          />
          <View style={styles.avatarStatusPill}>
            <View
              style={[
                styles.avatarStatusDot,
                avatarMode === 'listening'
                  ? styles.statusDotListening
                  : avatarMode === 'thinking'
                  ? styles.statusDotThinking
                  : avatarMode === 'speaking'
                  ? styles.statusDotSpeaking
                  : styles.statusDotIdle,
              ]}
            />
            <Text style={styles.avatarStatusLabel}>
              {avatarMode === 'listening'
                ? 'Damu is listening...'
                : avatarMode === 'thinking'
                ? 'Consulting health records...'
                : avatarMode === 'speaking'
                ? 'Damu is speaking...'
                : 'Damu is ready to help'}
            </Text>
          </View>
        </View>

        {/* 3. Informed Consent Checkbox */}
        <TouchableOpacity
          style={[styles.consentCard, consentGiven && styles.consentCardActive]}
          onPress={() => setConsentGiven(!consentGiven)}
          activeOpacity={0.8}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: consentGiven }}
        >
          <View style={[styles.checkbox, consentGiven && styles.checkboxActive]}>
            {consentGiven && <CheckCircle size={16} color="#FFFFFF" />}
          </View>
          <View style={styles.consentTextContainer}>
            <Text style={styles.consentTitle}>Informed Patient Consent (v1.0)</Text>
            <Text style={styles.consentDescription}>
              I understand that Damu is an AI educational companion, not a doctor. Damu cannot diagnose medical
              conditions, prescribe drugs, or alter insulin doses. For emergencies, call 112 or 108.
            </Text>
          </View>
        </TouchableOpacity>

        {/* 3b. Mode Selector: Companion Q&A vs Governed Actions */}
        <View style={styles.modeToggleContainer}>
          <TouchableOpacity
            style={[styles.modeToggleBtn, mode === 'companion' && styles.modeToggleBtnActive]}
            onPress={() => setMode('companion')}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === 'companion' }}
          >
            <Bot size={15} color={mode === 'companion' ? '#FFFFFF' : '#737784'} />
            <Text style={[styles.modeToggleText, mode === 'companion' && styles.modeToggleTextActive]}>
              Companion Q&A
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeToggleBtn, mode === 'agent' && styles.modeToggleBtnActive]}
            onPress={() => setMode('agent')}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === 'agent' }}
          >
            <Zap size={15} color={mode === 'agent' ? '#FFFFFF' : '#737784'} />
            <Text style={[styles.modeToggleText, mode === 'agent' && styles.modeToggleTextActive]}>
              Governed Actions
            </Text>
          </TouchableOpacity>
        </View>

        {/* 4. Language Selection Carousel */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Preferred Regional Language</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.langScrollView}>
          {SUPPORTED_LANGUAGES.map((lang) => {
            const isSelected = selectedLanguage === lang.code;
            return (
              <TouchableOpacity
                key={lang.code}
                style={[styles.langChip, isSelected && styles.langChipSelected]}
                onPress={() => setSelectedLanguage(lang.code)}
                accessibilityLabel={`Select language ${lang.label}`}
              >
                <Text style={[styles.langNative, isSelected && styles.langNativeSelected]}>{lang.native}</Text>
                <Text style={[styles.langLabel, isSelected && styles.langLabelSelected]}>{lang.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* 5. Message Thread */}
        <View style={styles.messagesContainer}>
          {messages.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                {mode === 'agent' ? (
                  <Zap size={30} color="#004D4D" />
                ) : (
                  <Sparkles size={30} color="#004D4D" />
                )}
              </View>
              <Text style={styles.emptyTitle}>
                {mode === 'agent' ? 'Damu Governed Agent Assistant' : 'Namaste! How can I help you today?'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {mode === 'agent'
                  ? 'Request bounded actions for care tasks, reminders, vitals, appointments, and care proposals:'
                  : 'Tap the microphone to speak in your language or select a common diabetes question below:'}
              </Text>

              {/* Suggestions */}
              <View style={styles.suggestionsList}>
                {(mode === 'agent' ? AGENT_SUGGESTED_QUERIES : SUGGESTED_QUERIES).map((q, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.suggestionButton}
                    onPress={() => {
                      if (!consentGiven) {
                        setConsentGiven(true);
                      }
                      setTextInput(q);
                    }}
                  >
                    {mode === 'agent' ? (
                      <Zap size={14} color="#004D4D" />
                    ) : (
                      <HelpCircle size={14} color="#004D4D" />
                    )}
                    <Text style={styles.suggestionText}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            messages.map((msg) => (
              <View
                key={msg.id}
                style={[
                  styles.messageBubble,
                  msg.sender === 'user' ? styles.userBubble : styles.damuBubble,
                ]}
              >
                <View style={styles.bubbleHeader}>
                  <Text style={[styles.bubbleSender, msg.sender === 'user' && styles.userBubbleSender]}>
                    {msg.sender === 'user' ? 'You' : 'Damu'}
                  </Text>
                  <Text style={[styles.bubbleTime, msg.sender === 'user' && styles.userBubbleTime]}>
                    {msg.timestamp}
                  </Text>
                </View>

                <Text style={[styles.bubbleText, msg.sender === 'user' && styles.userBubbleText]}>
                  {msg.text}
                </Text>

                {/* Governed Agent Plan Actions */}
                {msg.plan && msg.plan.actions && msg.plan.actions.length > 0 && (
                  <View style={styles.planCardContainer}>
                    <View style={styles.planCardHeader}>
                      <View style={styles.planHeaderTitleRow}>
                        <Sparkles size={15} color="#004D4D" />
                        <Text style={styles.planHeaderTitle}>Governed Agent Plan</Text>
                      </View>
                      <Text style={styles.planActionCountText}>
                        {msg.plan.actions.length} {msg.plan.actions.length === 1 ? 'Action' : 'Actions'} (Max 3)
                      </Text>
                    </View>

                    {msg.plan.actions.map((act) => {
                      const effectivePlanId = msg.plan!.planId || (msg.plan as any).id || (act as any).planId;
                      const effectivePlanVersion = msg.plan!.planVersion || (msg.plan as any).version || (act as any).planVersion || 1;
                      return (
                        <AgentProposalCard
                          key={act.id}
                          action={act}
                          planId={effectivePlanId}
                          planVersion={effectivePlanVersion}
                          isConfirming={confirmingActionId === act.id}
                          isCancelling={cancellingActionId === act.id}
                          errorMessage={actionErrors[act.id]}
                          onConfirm={(actionId, idempotencyKey) =>
                            handleConfirmAction(effectivePlanId, effectivePlanVersion, actionId, idempotencyKey)
                          }
                          onCancel={(actionId, reason) =>
                            handleCancelAction(effectivePlanId, effectivePlanVersion, actionId, reason)
                          }
                        />
                      );
                    })}
                  </View>
                )}

                {/* Prohibited Intent Guardrail Notice */}
                {msg.isProhibited && msg.prohibitedRefusal && (
                  <View style={styles.prohibitedBox}>
                    <AlertTriangle size={15} color="#ba1a1a" />
                    <View style={styles.prohibitedContent}>
                      <Text style={styles.prohibitedTitle}>Clinical Safety Refusal • Doctor Guidance Required</Text>
                      <Text style={styles.prohibitedBody}>{msg.prohibitedRefusal.reason}</Text>
                      {msg.prohibitedRefusal.safeAlternative && (
                        <Text style={styles.prohibitedAlternative}>
                          Safe Alternative & Next Steps: {msg.prohibitedRefusal.safeAlternative}
                        </Text>
                      )}
                    </View>
                  </View>
                )}

                {msg.emergencyNotice && (
                  <View style={styles.bubbleEmergencyNotice}>
                    <AlertTriangle size={14} color="#ba1a1a" />
                    <Text style={styles.bubbleEmergencyText}>{msg.emergencyNotice}</Text>
                  </View>
                )}

                {/* Voice Playback & Automatic Fallback Controls */}
                {msg.sender === 'damu' && (
                  <View style={styles.voiceMetaRow}>
                    {voiceState.activeMessageId === msg.id && voiceState.status === 'speaking' ? (
                      <TouchableOpacity
                        style={styles.stopVoiceBtn}
                        onPress={() => voicePlaybackManager.stop(true)}
                        accessibilityRole="button"
                        accessibilityLabel="Stop voice playback"
                      >
                        <VolumeX size={13} color="#ba1a1a" />
                        <Text style={styles.stopVoiceText}>Stop</Text>
                      </TouchableOpacity>
                    ) : voiceState.activeMessageId === msg.id && voiceState.status === 'loading' ? (
                      <View style={styles.loadingVoiceBtn}>
                        <ActivityIndicator size="small" color="#004D4D" />
                        <Text style={styles.loadingVoiceText}>Loading voice...</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.replayVoiceBtn}
                        onPress={() =>
                          speakResponse(
                            msg.spokenText || msg.text,
                            selectedLanguage,
                            msg.audioBase64,
                            msg.ttsProvider,
                            msg.ttsSpeaker,
                            msg.ttsError,
                            msg.id
                          )
                        }
                        accessibilityRole="button"
                        accessibilityLabel="Play spoken response"
                      >
                        <Volume2 size={13} color="#004D4D" />
                        <Text style={styles.replayVoiceText}>Play Spoken Voice</Text>
                      </TouchableOpacity>
                    )}

                    {/* Small Status Indicator */}
                    {voiceState.activeMessageId === msg.id && voiceState.status === 'speaking' && (
                      <View style={styles.voiceStatusBadge}>
                        <Text style={styles.voiceStatusText}>
                          {voiceState.provider === 'sarvam'
                            ? 'Speaking with Sarvam'
                            : 'Speaking with device voice'}
                        </Text>
                      </View>
                    )}

                    {/* Fallback Unavailable State with Retry */}
                    {voiceState.activeMessageId === msg.id && voiceState.status === 'unavailable' && (
                      <View style={styles.voiceUnavailableRow}>
                        <Text style={styles.voiceUnavailableText}>Voice unavailable — text is available</Text>
                        <TouchableOpacity
                          style={styles.retryVoiceBtn}
                          onPress={() =>
                            speakResponse(
                              msg.spokenText || msg.text,
                              selectedLanguage,
                              undefined,
                              undefined,
                              undefined,
                              undefined,
                              msg.id
                            )
                          }
                          accessibilityRole="button"
                          accessibilityLabel="Retry voice playback"
                        >
                          <RotateCcw size={11} color="#004D4D" />
                          <Text style={styles.retryVoiceText}>Retry</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}

                {/* Grounding Source Attribution Pills */}
                {msg.sources && msg.sources.length > 0 && (
                  <View style={styles.sourcesContainer}>
                    <Text style={styles.sourcesHeading}>Clinical & Record Grounding:</Text>
                    <View style={styles.sourcesList}>
                      {msg.sources.map((src, idx) => (
                        <View
                          key={idx}
                          style={[
                            styles.sourceTag,
                            src.type === 'PATIENT_RECORD'
                              ? styles.sourceTagPatient
                              : src.type === 'CLINICAL_SUMMARY'
                              ? styles.sourceTagClinical
                              : src.type === 'CARE_PLAN'
                              ? styles.sourceTagPlan
                              : styles.sourceTagEducational,
                          ]}
                        >
                          {src.type === 'PATIENT_RECORD' && <FileText size={11} color="#004D4D" />}
                          {src.type === 'CLINICAL_SUMMARY' && <Sparkles size={11} color="#0E7C7B" />}
                          {src.type === 'CARE_PLAN' && <CheckCircle size={11} color="#c95410" />}
                          {src.type === 'EDUCATIONAL_KNOWLEDGE' && <BookOpen size={11} color="#059669" />}
                          <Text
                            style={[
                              styles.sourceTagText,
                              src.type === 'PATIENT_RECORD'
                                ? styles.sourceTextPatient
                                : src.type === 'CLINICAL_SUMMARY'
                                ? styles.sourceTextClinical
                                : src.type === 'CARE_PLAN'
                                ? styles.sourceTextPlan
                                : styles.sourceTextEducational,
                            ]}
                            numberOfLines={1}
                          >
                            {src.title}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {msg.transparency && (
                  <View style={styles.transparencyBox}>
                    <Text style={styles.transparencyHeading}>Why Damu answered this way</Text>
                    <Text style={styles.transparencyText}>
                      Basis: {msg.transparency.answerBasis.replace(/_/g, ' ').toLowerCase()} · Confidence: {msg.transparency.confidence.toLowerCase()} · Sources: {msg.transparency.sourceCount}
                    </Text>
                    <Text style={styles.transparencyText}>{msg.transparency.confidenceReason}</Text>
                    {msg.transparency.limitations.slice(0, 2).map((limitation, idx) => (
                      <Text key={idx} style={styles.transparencyText}>• {limitation}</Text>
                    ))}
                  </View>
                )}

                {/* Dynamic Suggested Follow-ups */}
                {msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                  <View style={styles.followUpsContainer}>
                    <Text style={styles.followUpsHeading}>Suggested Follow-ups:</Text>
                    <View style={styles.followUpsRow}>
                      {msg.suggestedFollowUps.map((fu, idx) => (
                        <TouchableOpacity
                          key={idx}
                          style={styles.followUpChip}
                          onPress={() => {
                            if (!consentGiven) setConsentGiven(true);
                            setTextInput(fu);
                          }}
                        >
                          <Text style={styles.followUpText}>{fu}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {msg.sender === 'damu' && (
                  <View style={styles.bubbleFooter}>
                    <Text style={styles.disclaimerMini}>
                      {msg.plan
                        ? 'Governed Agent Actions • Patient Confirmation & Safety Rules Enforced'
                        : 'Educational only • Not a medical diagnosis'}
                    </Text>
                  </View>
                )}
              </View>
            ))
          )}
        </View>

        {/* Error Notice */}
        {errorMessage && (
          <View style={styles.errorNotice}>
            <Info size={16} color="#ba1a1a" />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}
      </ScrollView>

      {/* 6. Voice Interaction Control Panel & Text Fallback */}
      <View style={[styles.controlFooter, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {/* Dynamic Voice State Indicator */}
        {state === 'listening' && (
          <View style={styles.listeningOverlay}>
            <Text style={styles.listeningPrompt}>Listening to your voice in {selectedLanguage}...</Text>
            <View style={styles.listeningActions}>
              <TouchableOpacity
                style={styles.actionPillCancel}
                onPress={handleCancelVoice}
              >
                <MicOff size={16} color="#ba1a1a" />
                <Text style={styles.actionPillCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionPillDone}
                onPress={handleFinishVoiceRecording}
              >
                <CheckCircle size={16} color="#FFFFFF" />
                <Text style={styles.actionPillDoneText}>Finish Speaking</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {state === 'processing' && (
          <View style={styles.processingRow}>
            <ActivityIndicator size="small" color="#004D4D" />
            <Text style={styles.processingText}>Listening and preparing your response...</Text>
          </View>
        )}

        {state === 'responding' && isSpeaking && (
          <View style={styles.speakingRow}>
            <Volume2 size={18} color="#004D4D" />
            <Text style={styles.speakingText}>Damu is speaking...</Text>
            <TouchableOpacity onPress={stopSpeaking}>
              <VolumeX size={18} color="#737784" />
            </TouchableOpacity>
          </View>
        )}

        {/* Big Mic Button & Text Input Bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            placeholder={
              !consentGiven
                ? "Check consent above to start..."
                : mode === 'agent'
                ? "Ask Damu to schedule, remind, or log..."
                : "Ask Damu anything about diabetes..."
            }
            placeholderTextColor="#737784"
            value={textInput}
            onChangeText={setTextInput}
            editable={consentGiven && state !== 'processing'}
            onSubmitEditing={handleSendText}
          />

          {textInput.trim().length > 0 ? (
            <TouchableOpacity
              style={styles.sendButton}
              onPress={handleSendText}
              disabled={state === 'processing'}
            >
              <Send size={18} color="#FFFFFF" />
            </TouchableOpacity>
          ) : (
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <TouchableOpacity
                style={[
                  styles.micButton,
                  !consentGiven && styles.micButtonDisabled,
                  state === 'listening' && styles.micButtonActive,
                ]}
                onPress={state === 'listening' ? handleFinishVoiceRecording : handleStartVoice}
                activeOpacity={0.8}
                accessibilityLabel="Activate voice assistant"
              >
                <Mic size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fc',
  },
  header: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(9, 76, 178, 0.08)',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  beaconDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#059669',
  },
  headerTitle: {
    fontFamily: 'Noto Serif',
    fontSize: 18,
    fontWeight: '700',
    color: '#191c20',
  },
  headerSubtitle: {
    fontFamily: 'Public Sans',
    fontSize: 10.5,
    fontWeight: '700',
    color: '#33628b',
    letterSpacing: 0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resetButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f2f3f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#004D4D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zeroRetentionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(9, 76, 178, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(9, 76, 178, 0.15)',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 6,
  },
  zeroRetentionText: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: '#004D4D',
    fontWeight: '600',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  emergencyBanner: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  emergencyTextContainer: {
    flex: 1,
  },
  emergencyTitle: {
    fontFamily: 'Public Sans',
    fontSize: 12.5,
    fontWeight: '800',
    color: '#ba1a1a',
    marginBottom: 2,
  },
  emergencyBody: {
    fontFamily: 'Inter',
    fontSize: 11.5,
    color: '#7f1d1d',
    lineHeight: 16,
  },
  emergencyCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ba1a1a',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 8,
    alignSelf: 'flex-start',
    gap: 6,
  },
  emergencyCallBtnText: {
    fontFamily: 'Public Sans',
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
  avatarHeroSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(9, 76, 178, 0.08)',
    shadowColor: '#004D4D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  avatarStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f2f3f9',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 12,
    marginTop: 6,
    gap: 6,
  },
  avatarStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotIdle: {
    backgroundColor: '#059669',
  },
  statusDotListening: {
    backgroundColor: '#ba1a1a',
  },
  statusDotThinking: {
    backgroundColor: '#d97706',
  },
  statusDotSpeaking: {
    backgroundColor: '#004D4D',
  },
  avatarStatusLabel: {
    fontFamily: 'Public Sans',
    fontSize: 11,
    fontWeight: '600',
    color: '#434653',
  },
  consentCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(9, 76, 178, 0.08)',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
    shadowColor: '#004D4D',
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  consentCardActive: {
    borderColor: '#004D4D',
    backgroundColor: '#f8f9fc',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#c3c6d5',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    backgroundColor: '#ffffff',
  },
  checkboxActive: {
    borderColor: '#004D4D',
    backgroundColor: '#004D4D',
  },
  consentTextContainer: {
    flex: 1,
  },
  consentTitle: {
    fontFamily: 'Noto Serif',
    fontSize: 13,
    fontWeight: '700',
    color: '#191c20',
    marginBottom: 2,
  },
  consentDescription: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: '#737784',
    lineHeight: 16,
  },
  modeToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#eceef3',
    borderRadius: 12,
    padding: 3,
    marginBottom: 14,
    gap: 4,
  },
  modeToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  modeToggleBtnActive: {
    backgroundColor: '#004D4D',
    shadowColor: '#004D4D',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  modeToggleText: {
    fontFamily: 'Public Sans',
    fontSize: 11.5,
    fontWeight: '600',
    color: '#737784',
  },
  modeToggleTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  sectionHeader: {
    marginBottom: 8,
  },
  sectionLabel: {
    fontFamily: 'Public Sans',
    fontSize: 10.5,
    fontWeight: '700',
    color: '#737784',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  langScrollView: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  langChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(9, 76, 178, 0.08)',
    marginRight: 8,
    alignItems: 'center',
  },
  langChipSelected: {
    backgroundColor: '#004D4D',
    borderColor: '#004D4D',
  },
  langNative: {
    fontFamily: 'Public Sans',
    fontSize: 13,
    fontWeight: '700',
    color: '#191c20',
  },
  langNativeSelected: {
    color: '#FFFFFF',
  },
  langLabel: {
    fontFamily: 'Inter',
    fontSize: 10,
    color: '#737784',
  },
  langLabelSelected: {
    color: '#E6F8EF',
  },
  messagesContainer: {
    minHeight: 200,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    paddingHorizontal: 12,
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(9, 76, 178, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontFamily: 'Noto Serif',
    fontSize: 17,
    fontWeight: '700',
    color: '#191c20',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: 'Inter',
    fontSize: 12.5,
    color: '#737784',
    textAlign: 'center',
    marginBottom: 18,
    lineHeight: 18,
  },
  suggestionsList: {
    width: '100%',
    gap: 8,
  },
  suggestionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(9, 76, 178, 0.08)',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 10,
  },
  suggestionText: {
    fontFamily: 'Inter',
    fontSize: 12.5,
    color: '#334155',
    flex: 1,
  },
  messageBubble: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    maxWidth: '90%',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#004D4D',
    borderBottomRightRadius: 4,
  },
  damuBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(9, 76, 178, 0.08)',
    borderBottomLeftRadius: 4,
    shadowColor: '#004D4D',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  bubbleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  bubbleSender: {
    fontFamily: 'Public Sans',
    fontSize: 11,
    fontWeight: '700',
    color: '#737784',
  },
  userBubbleSender: {
    color: '#E6F8EF',
  },
  bubbleTime: {
    fontFamily: 'Inter',
    fontSize: 10,
    color: '#737784',
  },
  userBubbleTime: {
    color: '#E6F8EF',
  },
  bubbleText: {
    fontFamily: 'Inter',
    fontSize: 13.5,
    lineHeight: 20,
    color: '#191c20',
  },
  userBubbleText: {
    color: '#ffffff',
  },
  bubbleEmergencyNotice: {
    marginTop: 8,
    padding: 10,
    backgroundColor: '#fef2f2',
    borderLeftWidth: 3,
    borderLeftColor: '#ba1a1a',
    borderRadius: 6,
    flexDirection: 'row',
    gap: 6,
  },
  bubbleEmergencyText: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: '#7f1d1d',
    flex: 1,
    fontWeight: '600',
  },
  bubbleFooter: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f2f3f9',
    paddingTop: 6,
  },
  disclaimerMini: {
    fontFamily: 'Inter',
    fontSize: 10,
    color: '#737784',
    fontStyle: 'italic',
  },
  errorNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    padding: 12,
    borderRadius: 12,
    gap: 8,
    marginVertical: 10,
  },
  errorText: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: '#ba1a1a',
    flex: 1,
  },
  controlFooter: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: 'rgba(9, 76, 178, 0.08)',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  listeningOverlay: {
    backgroundColor: '#f8f9fc',
    borderWidth: 1,
    borderColor: '#004D4D',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    alignItems: 'center',
  },
  listeningPrompt: {
    fontFamily: 'Public Sans',
    fontSize: 12,
    fontWeight: '700',
    color: '#004D4D',
    marginBottom: 8,
  },
  listeningActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionPillCancel: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    gap: 4,
  },
  actionPillCancelText: {
    fontFamily: 'Public Sans',
    fontSize: 11.5,
    color: '#ba1a1a',
    fontWeight: '700',
  },
  actionPillDone: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#004D4D',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    gap: 4,
  },
  actionPillDoneText: {
    fontFamily: 'Public Sans',
    fontSize: 11.5,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  processingText: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: '#004D4D',
    fontWeight: '600',
  },
  speakingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f2f3f9',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  speakingText: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: '#434653',
    flex: 1,
    marginLeft: 6,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  textInput: {
    flex: 1,
    height: 46,
    backgroundColor: '#f2f3f9',
    borderRadius: 23,
    paddingHorizontal: 18,
    fontSize: 13.5,
    fontFamily: 'Inter',
    color: '#191c20',
  },
  micButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#c95410',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#c95410',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  micButtonActive: {
    backgroundColor: '#ba1a1a',
  },
  micButtonDisabled: {
    backgroundColor: '#c3c6d5',
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#004D4D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planCardContainer: {
    marginTop: 10,
    backgroundColor: '#f8f9fc',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(9, 76, 178, 0.08)',
    width: '100%',
  },
  planCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f3f9',
  },
  planHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  planHeaderTitle: {
    fontFamily: 'Public Sans',
    fontSize: 11.5,
    fontWeight: '800',
    color: '#004D4D',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  planActionCountText: {
    fontFamily: 'Public Sans',
    fontSize: 10.5,
    color: '#737784',
    fontWeight: '600',
  },
  prohibitedBox: {
    marginTop: 8,
    backgroundColor: '#fef2f2',
    borderLeftWidth: 3,
    borderLeftColor: '#ba1a1a',
    borderRadius: 8,
    padding: 10,
    flexDirection: 'row',
    gap: 8,
  },
  prohibitedContent: {
    flex: 1,
  },
  prohibitedTitle: {
    fontFamily: 'Public Sans',
    fontSize: 11.5,
    fontWeight: '700',
    color: '#ba1a1a',
    marginBottom: 2,
  },
  prohibitedBody: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: '#7f1d1d',
    lineHeight: 15,
  },
  prohibitedAlternative: {
    marginTop: 4,
    fontFamily: 'Inter',
    fontSize: 10.5,
    color: '#ba1a1a',
    fontStyle: 'italic',
  },
  sourcesContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f2f3f9',
  },
  transparencyBox: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#f8f9fc',
    borderWidth: 1,
    borderColor: 'rgba(9, 76, 178, 0.08)',
  },
  transparencyHeading: {
    fontFamily: 'Public Sans',
    fontSize: 11,
    fontWeight: '800',
    color: '#191c20',
    marginBottom: 3,
  },
  transparencyText: {
    fontFamily: 'Inter',
    fontSize: 10,
    lineHeight: 15,
    color: '#737784',
  },
  sourcesHeading: {
    fontFamily: 'Public Sans',
    fontSize: 10.5,
    fontWeight: '700',
    color: '#737784',
    marginBottom: 4,
  },
  sourcesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  sourceTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    gap: 4,
  },
  sourceTagPatient: {
    backgroundColor: 'rgba(9, 76, 178, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(9, 76, 178, 0.15)',
  },
  sourceTagClinical: {
    backgroundColor: '#f8e37f',
    borderWidth: 1,
    borderColor: '#beab4e',
  },
  sourceTagPlan: {
    backgroundColor: '#fff0d8',
    borderWidth: 1,
    borderColor: '#fbd38d',
  },
  sourceTagEducational: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  sourceTagText: {
    fontFamily: 'Public Sans',
    fontSize: 10,
    fontWeight: '700',
  },
  sourceTextPatient: {
    color: '#004D4D',
  },
  sourceTextClinical: {
    color: '#211b00',
  },
  sourceTextPlan: {
    color: '#c95410',
  },
  sourceTextEducational: {
    color: '#059669',
  },
  followUpsContainer: {
    marginTop: 10,
  },
  followUpsHeading: {
    fontFamily: 'Public Sans',
    fontSize: 11,
    fontWeight: '700',
    color: '#737784',
    marginBottom: 6,
  },
  followUpsRow: {
    flexDirection: 'column',
    gap: 6,
  },
  followUpChip: {
    backgroundColor: '#f8f9fc',
    borderWidth: 1,
    borderColor: 'rgba(9, 76, 178, 0.08)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  followUpText: {
    fontFamily: 'Inter',
    fontSize: 11.5,
    color: '#004D4D',
    fontWeight: '600',
  },
  voiceMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  replayVoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(9, 76, 178, 0.08)',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  replayVoiceText: {
    fontFamily: 'Public Sans',
    fontSize: 10.5,
    fontWeight: '700',
    color: '#004D4D',
  },
  stopVoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  stopVoiceText: {
    fontFamily: 'Public Sans',
    fontSize: 10.5,
    fontWeight: '700',
    color: '#ba1a1a',
  },
  loadingVoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f2f3f9',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  loadingVoiceText: {
    fontFamily: 'Inter',
    fontSize: 10.5,
    color: '#737784',
    fontWeight: '500',
  },
  voiceStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  voiceStatusText: {
    fontFamily: 'Public Sans',
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  voiceUnavailableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fffbeb',
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  voiceUnavailableText: {
    fontFamily: 'Inter',
    fontSize: 10,
    fontWeight: '500',
    color: '#92400e',
  },
  retryVoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#c3c6d5',
    borderRadius: 4,
    paddingVertical: 1,
    paddingHorizontal: 4,
  },
  retryVoiceText: {
    fontFamily: 'Public Sans',
    fontSize: 10,
    fontWeight: '700',
    color: '#004D4D',
  },
});
