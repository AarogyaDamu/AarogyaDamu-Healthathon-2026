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
} from 'lucide-react-native';
import { theme } from '../../src/theme';
import { DamuService, DamuState, DamuChatMessage } from '../../src/api/damu';
import { AgentService } from '../../src/api/agent';
import { AgentProposalCard } from '../../src/components/AgentProposalCard';
import { DamuAvatar } from '../../src/components/DamuAvatar';
import { DamuStatusResponse, AgentActionStatus, DamuAvatarMode } from '@aarogyadamu/contracts';

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
    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
      if (soundRef.current) {
        soundRef.current.stopAsync().catch(() => {});
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
      if (Platform.OS === 'web' && webAudioRef.current) {
        try { webAudioRef.current.pause(); webAudioRef.current = null; } catch {}
      }
      Speech.stop().catch(() => {});
      if (Platform.OS === 'web' && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try { window.speechSynthesis.cancel(); } catch {}
      }
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
      }
      pulseAnim.setValue(1);
    }
  }, [state, pulseAnim]);

  const loadProviderStatus = async () => {
    try {
      const res = await DamuService.getStatus();
      setStatus(res);
    } catch {
      // Never report an offline or unconfigured provider as available. The
      // assistant must fail closed instead of presenting mock readiness.
      setStatus({
        configuredProvider: 'Damu Voice Assistant (provider unavailable)',
        isAvailable: false,
        models: {
          stt: 'saarika:v2',
          llm: 'llama-3.3-70b-versatile',
          tts: 'bulbul:v4-flash',
        },
        ttsProvider: 'sarvam:bulbul:v4-flash',
        supportedLanguages: ['en-IN', 'hi-IN', 'te-IN', 'ta-IN', 'kn-IN', 'bn-IN', 'mr-IN', 'gu-IN'],
        audioRetentionPolicy: 'SESSION_ONLY_ZERO_RETENTION',
        clinicalDisclaimer:
          'Damu is an AI diabetes companion, not a doctor. Cannot diagnose or prescribe. In emergencies call 112 / 108.',
      });
    }
  };

  const stopSpeaking = async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    } catch {}
    if (Platform.OS === 'web' && webAudioRef.current) {
      try { webAudioRef.current.pause(); webAudioRef.current = null; } catch {}
    }
    try {
      Speech.stop();
    } catch {}
    if (Platform.OS === 'web' && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch {}
    }
    setIsSpeaking(false);
  };

  // Explicit device speech synthesis helper (disabled by default; Sarvam Bulbul TTS is enforced without silent fallback)
  const speakWithRoboticFallbackIfExplicitlyEnabled = (text: string, lang?: string) => {
    // Never called silently; Sarvam Bulbul TTS via playSarvamAudio is Damu's enforced voice
    Speech.speak(text, {
      language: lang || selectedLanguage,
      rate: 0.95,
      pitch: 1.0,
      onDone: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  };

  const playSarvamAudio = async (
    audioBase64: string,
    providerName?: string,
    speakerName?: string
  ) => {
    try {
      await stopSpeaking();
      setIsSpeaking(true);
      if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.Audio !== 'undefined') {
        const audio = new window.Audio(`data:audio/wav;base64,${audioBase64}`);
        webAudioRef.current = audio;
        audio.onended = () => { setIsSpeaking(false); setState('completed'); webAudioRef.current = null; };
        audio.onerror = (e) => { console.warn('[Damu Audio] Web audio error:', e); setIsSpeaking(false); setState('completed'); webAudioRef.current = null; };
        await audio.play();
        return;
      }
      console.log(
        `[Damu Audio] Playing voice generated by: ${providerName || 'sarvam:bulbul:v4-flash'} (speaker: ${speakerName || 'shubh_enhi_ads'})`
      );

      const { sound } = await Audio.Sound.createAsync(
        { uri: `data:audio/wav;base64,${audioBase64}` },
        { shouldPlay: true }
      );
      soundRef.current = sound;

      sound.setOnPlaybackStatusUpdate((playbackStatus) => {
        if (playbackStatus.isLoaded) {
          if (playbackStatus.didJustFinish) {
            setIsSpeaking(false);
            setState('completed');
            sound.unloadAsync().catch(() => {});
            if (soundRef.current === sound) {
              soundRef.current = null;
            }
          }
        } else {
          const errorMsg = 'error' in playbackStatus ? (playbackStatus as { error?: string }).error : 'Playback error';
          console.warn('[Damu Audio] Playback status error:', errorMsg);
          setIsSpeaking(false);
          setState('completed');
          sound.unloadAsync().catch(() => {});
          if (soundRef.current === sound) {
            soundRef.current = null;
          }
        }
      });
    } catch (err: any) {
      console.warn('[Damu Audio] Failed to play Sarvam audio:', err?.message);
      setIsSpeaking(false);
      setState('completed');
      setErrorMessage('Spoken voice playback failed. Please check audio output or read the response above.');
    }
  };

  const speakResponse = async (
    text: string,
    lang?: string,
    audioBase64?: string,
    providerName?: string,
    speakerName?: string,
    ttsError?: string
  ) => {
    // 1. If Sarvam TTS audio was provided by the backend response, play it
    if (audioBase64) {
      await playSarvamAudio(audioBase64, providerName, speakerName);
      return;
    }

    // 2. If TTS explicitly failed on backend, report the error without silent robotic fallback
    if (ttsError) {
      console.warn('[Damu Audio] Sarvam Bulbul TTS generation failed:', ttsError);
      setErrorMessage(`Spoken voice unavailable: ${ttsError}. Please read the response above.`);
      setIsSpeaking(false);
      setState('completed');
      return;
    }

    // 3. If no pre-synthesized audio, synthesize on-demand via Sarvam Bulbul backend endpoint
    try {
      setIsSpeaking(true);
      const ttsRes = await DamuService.synthesizeSpeech(text, lang || selectedLanguage);
      if (ttsRes.audioBase64) {
        await playSarvamAudio(ttsRes.audioBase64, ttsRes.provider, ttsRes.speaker);
        return;
      }
    } catch (err: any) {
      console.warn('[Damu Audio] Voice synthesis unavailable from Sarvam TTS:', err?.message);
      // Explicit error notification: NEVER silently switch to device robotic speech synthesis
      setIsSpeaking(false);
      setState('completed');
      setErrorMessage('Spoken voice is currently unavailable from Sarvam. Please read the response above.');
    }
  };

  const handleStartVoice = async () => {
    if (!consentGiven) {
      Alert.alert(
        'Informed Consent Required',
        'Please confirm your consent before activating voice interactions with Damu.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (Platform.OS === 'web') {
      Alert.alert(
        'Voice Input on Web',
        'Voice recording is optimized for mobile native devices. You can interact with Damu seamlessly by typing your question or care request below!',
        [{ text: 'OK' }]
      );
      setState('idle');
      return;
    }

    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Microphone Permission Required',
          'AarogyaDamu needs microphone access to record your question for Damu. You can also type using the text box below.',
          [{ text: 'OK' }]
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
      // Graceful fallback to text input on hardware or permission errors
      setState('idle');
      setErrorMessage('Microphone unavailable. Please type your message below.');
    }
  };

  const handleFinishVoiceRecording = async () => {
    if (!recordingRef.current) {
      setState('error');
      setErrorMessage('No voice recording was captured. Please try again or type your question.');
      return;
    }

    setState('processing');
    setErrorMessage(null);

    try {
      const recording = recordingRef.current;
      recordingRef.current = null;
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();

      if (!uri) {
        throw new Error('No audio captured.');
      }

      // Convert audio file URI to base64
      const responseBlob = await fetch(uri);
      const blob = await responseBlob.blob();
      if (blob.size === 0) {
        throw new Error('Recorded audio file is empty. Please speak clearly and try again.');
      }

      const audioBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const res = reader.result as string;
          resolve(res.includes(',') ? res.split(',')[1] : res);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      // Detect container from URI; Sarvam STT accepts 'audio/mp4' and 'audio/x-m4a' (rejects 'audio/m4a' with 400).
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
      setErrorMessage(err?.message || 'Failed to communicate with Damu Agent Runtime.');
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

      // If user is in agent mode or transcript indicates an agent request, route to Agent Runtime
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
        response.ttsError
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
        response.ttsError
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
      {/* 1. Header with Status & Zero Retention Badge */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.titleRow}>
            <View style={styles.mascotBadge}>
              <Sparkles size={20} color="#0D9488" />
            </View>
            <View>
              <Text style={styles.headerTitle}>Damu Voice Companion</Text>
              <Text style={styles.headerSubtitle}>
                {status?.models.llm ? `Groq Llama 3.3 • Whisper Turbo` : 'Multilingual Diabetes Assistant'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.resetButton}
            onPress={handleResetSession}
            accessibilityLabel="Reset conversation"
          >
            <RotateCcw size={18} color="#64748B" />
          </TouchableOpacity>
        </View>

        {/* Zero-Retention Pill */}
        <View style={styles.zeroRetentionPill}>
          <ShieldCheck size={14} color="#0D9488" />
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
            <AlertTriangle size={24} color="#B91C1C" />
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

        {/* 2b. 3D Interactive Three.js Damu Character Hero */}
        <View style={styles.avatarHeroSection}>
          <DamuAvatar
            mode={avatarMode}
            size={190}
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
            <Bot size={15} color={mode === 'companion' ? '#FFFFFF' : '#475569'} />
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
            <Zap size={15} color={mode === 'agent' ? '#FFFFFF' : '#475569'} />
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
                  <Zap size={32} color="#0D9488" />
                ) : (
                  <Mic size={32} color="#0D9488" />
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
                      <Zap size={15} color="#0D9488" />
                    ) : (
                      <HelpCircle size={15} color="#0D9488" />
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
                  <Text style={styles.bubbleSender}>
                    {msg.sender === 'user' ? 'You' : 'Damu'}
                  </Text>
                  <Text style={styles.bubbleTime}>{msg.timestamp}</Text>
                </View>

                <Text style={styles.bubbleText}>{msg.text}</Text>

                {/* Governed Agent Plan Actions */}
                {msg.plan && msg.plan.actions && msg.plan.actions.length > 0 && (
                  <View style={styles.planCardContainer}>
                    <View style={styles.planCardHeader}>
                      <View style={styles.planHeaderTitleRow}>
                        <Sparkles size={15} color="#0D9488" />
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
                    <AlertTriangle size={15} color="#DC2626" />
                    <View style={styles.prohibitedContent}>
                      <Text style={styles.prohibitedTitle}>Clinical Safety Refusal</Text>
                      <Text style={styles.prohibitedBody}>{msg.prohibitedRefusal.reason}</Text>
                      {msg.prohibitedRefusal.safeAlternative && (
                        <Text style={styles.prohibitedAlternative}>
                          Safe Alternative: {msg.prohibitedRefusal.safeAlternative}
                        </Text>
                      )}
                    </View>
                  </View>
                )}

                {msg.emergencyNotice && (
                  <View style={styles.bubbleEmergencyNotice}>
                    <AlertTriangle size={14} color="#B91C1C" />
                    <Text style={styles.bubbleEmergencyText}>{msg.emergencyNotice}</Text>
                  </View>
                )}

                {/* Voice Replay Controls */}
                {msg.sender === 'damu' && (
                  <View style={styles.voiceMetaRow}>
                    <TouchableOpacity
                      style={styles.replayVoiceBtn}
                      onPress={() =>
                        speakResponse(
                          msg.spokenText || msg.text,
                          selectedLanguage,
                          msg.audioBase64,
                          msg.ttsProvider,
                          msg.ttsSpeaker,
                          msg.ttsError
                        )
                      }
                      accessibilityRole="button"
                      accessibilityLabel="Replay spoken response"
                    >
                      <Volume2 size={13} color="#0D9488" />
                      <Text style={styles.replayVoiceText}>
                        {msg.ttsSpeaker ? `Sarvam Voice (${msg.ttsSpeaker})` : 'Sarvam Bulbul Voice'}
                      </Text>
                    </TouchableOpacity>
                    {isSpeaking && (
                      <TouchableOpacity
                        style={styles.stopVoiceBtn}
                        onPress={stopSpeaking}
                        accessibilityRole="button"
                        accessibilityLabel="Stop voice"
                      >
                        <VolumeX size={13} color="#DC2626" />
                        <Text style={styles.stopVoiceText}>Stop</Text>
                      </TouchableOpacity>
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
                          {src.type === 'PATIENT_RECORD' && <FileText size={11} color="#0284C7" />}
                          {src.type === 'CLINICAL_SUMMARY' && <Sparkles size={11} color="#7C3AED" />}
                          {src.type === 'CARE_PLAN' && <CheckCircle size={11} color="#EA580C" />}
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
            <Info size={16} color="#DC2626" />
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
                <MicOff size={16} color="#DC2626" />
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
            <ActivityIndicator size="small" color="#0D9488" />
            <Text style={styles.processingText}>Processing audio with Groq Whisper & Llama 3.3...</Text>
          </View>
        )}

        {state === 'responding' && isSpeaking && (
          <View style={styles.speakingRow}>
            <Volume2 size={18} color="#0D9488" />
            <Text style={styles.speakingText}>Damu is vocalizing with device speech synthesis...</Text>
            <TouchableOpacity onPress={stopSpeaking}>
              <VolumeX size={18} color="#64748B" />
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
            placeholderTextColor="#94A3B8"
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
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
  mascotBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  resetButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  zeroRetentionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    gap: 6,
  },
  zeroRetentionText: {
    fontSize: 11,
    color: '#0F766E',
    fontWeight: '500',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  emergencyBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#F87171',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  emergencyTextContainer: {
    flex: 1,
  },
  emergencyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B91C1C',
    marginBottom: 2,
  },
  emergencyBody: {
    fontSize: 12,
    color: '#7F1D1D',
    lineHeight: 16,
  },
  consentCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  consentCardActive: {
    borderColor: '#0D9488',
    backgroundColor: '#F0FDFA',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxActive: {
    borderColor: '#0D9488',
    backgroundColor: '#0D9488',
  },
  consentTextContainer: {
    flex: 1,
  },
  consentTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 2,
  },
  consentDescription: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
  },
  sectionHeader: {
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
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
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 8,
    alignItems: 'center',
  },
  langChipSelected: {
    backgroundColor: '#0D9488',
    borderColor: '#0D9488',
  },
  langNative: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  langNativeSelected: {
    color: '#FFFFFF',
  },
  langLabel: {
    fontSize: 10,
    color: '#64748B',
  },
  langLabelSelected: {
    color: '#E6FFFA',
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
    backgroundColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  suggestionText: {
    fontSize: 13,
    color: '#334155',
    flex: 1,
  },
  messageBubble: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    maxWidth: '90%',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#0D9488',
    borderBottomRightRadius: 2,
  },
  damuBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderBottomLeftRadius: 2,
  },
  bubbleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  bubbleSender: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  bubbleTime: {
    fontSize: 10,
    color: '#94A3B8',
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#0F172A',
  },
  bubbleEmergencyNotice: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#FEF2F2',
    borderLeftWidth: 3,
    borderLeftColor: '#DC2626',
    borderRadius: 4,
    flexDirection: 'row',
    gap: 6,
  },
  bubbleEmergencyText: {
    fontSize: 11,
    color: '#991B1B',
    flex: 1,
    fontWeight: '600',
  },
  bubbleFooter: {
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 4,
  },
  disclaimerMini: {
    fontSize: 10,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  errorNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    padding: 10,
    borderRadius: 8,
    gap: 8,
    marginVertical: 10,
  },
  errorText: {
    fontSize: 12,
    color: '#991B1B',
    flex: 1,
  },
  controlFooter: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  listeningOverlay: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#5EEAD4',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    alignItems: 'center',
  },
  listeningPrompt: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F766E',
    marginBottom: 8,
  },
  listeningActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionPillCancel: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 4,
  },
  actionPillCancelText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
  },
  actionPillDone: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D9488',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 4,
  },
  actionPillDoneText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  processingText: {
    fontSize: 12,
    color: '#0D9488',
    fontWeight: '500',
  },
  speakingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginBottom: 8,
  },
  speakingText: {
    fontSize: 11,
    color: '#475569',
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
    height: 44,
    backgroundColor: '#F1F5F9',
    borderRadius: 22,
    paddingHorizontal: 16,
    fontSize: 14,
    color: '#0F172A',
  },
  micButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonActive: {
    backgroundColor: '#DC2626',
  },
  micButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
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
    borderRadius: 8,
    gap: 6,
  },
  modeToggleBtnActive: {
    backgroundColor: '#0D9488',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  modeToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  modeToggleTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  planCardContainer: {
    marginTop: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    width: '100%',
  },
  planCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  planHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  planHeaderTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F766E',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  planActionCountText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  prohibitedBox: {
    marginTop: 8,
    backgroundColor: '#FEF2F2',
    borderLeftWidth: 3,
    borderLeftColor: '#DC2626',
    borderRadius: 6,
    padding: 10,
    flexDirection: 'row',
    gap: 8,
  },
  prohibitedContent: {
    flex: 1,
  },
  prohibitedTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B91C1C',
    marginBottom: 2,
  },
  prohibitedBody: {
    fontSize: 11,
    color: '#7F1D1D',
    lineHeight: 15,
  },
  prohibitedAlternative: {
    marginTop: 4,
    fontSize: 11,
    color: '#991B1B',
    fontStyle: 'italic',
  },
  emergencyCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DC2626',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 8,
    alignSelf: 'flex-start',
    gap: 6,
  },
  emergencyCallBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  avatarHeroSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  avatarStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  avatarStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotIdle: {
    backgroundColor: '#10B981',
  },
  statusDotListening: {
    backgroundColor: '#EF4444',
  },
  statusDotThinking: {
    backgroundColor: '#F59E0B',
  },
  statusDotSpeaking: {
    backgroundColor: '#0D9488',
  },
  avatarStatusLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  sourcesContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  transparencyBox: {
    marginTop: 8,
    padding: 9,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  transparencyHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 3,
  },
  transparencyText: {
    fontSize: 10,
    lineHeight: 15,
    color: '#64748B',
  },
  sourcesHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
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
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  sourceTagClinical: {
    backgroundColor: '#FAF5FF',
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  sourceTagPlan: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFEDD5',
  },
  sourceTagEducational: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  sourceTagText: {
    fontSize: 10,
    fontWeight: '600',
  },
  sourceTextPatient: {
    color: '#0369A1',
  },
  sourceTextClinical: {
    color: '#6D28D9',
  },
  sourceTextPlan: {
    color: '#C2410C',
  },
  sourceTextEducational: {
    color: '#047857',
  },
  followUpsContainer: {
    marginTop: 10,
  },
  followUpsHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
  },
  followUpsRow: {
    flexDirection: 'column',
    gap: 6,
  },
  followUpChip: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  followUpText: {
    fontSize: 12,
    color: '#0F766E',
    fontWeight: '500',
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
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  replayVoiceText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0D9488',
  },
  stopVoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  stopVoiceText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#DC2626',
  },
});
