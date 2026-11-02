import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Image,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Send, Sparkles, Mic, FileText, CheckCircle2, AlertCircle } from 'lucide-react-native';
import { clinicalStore } from '../../src/api/client';
import { theme } from '../../src/theme';

const damuArtwork = require('../../assets/damu.png');

interface StructuredCard {
  testName: string;
  value: string;
  date: string;
  sourceDoc: string;
}

interface ChatMessage {
  id: string;
  sender: 'damu' | 'user';
  text: string;
  time: string;
  card?: StructuredCard;
  disclaimer?: string;
  isFact?: boolean;
}

const PROMPT_SUGGESTIONS = [
  'Summarize my latest blood sugar readings',
  'What should I eat before my 2:30 PM walk?',
  'What questions should I ask Dr. Patra?',
];

export default function AskDamuScreen() {
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Floating mascot animation
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: -8, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, [floatAnim]);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm-0',
      sender: 'damu',
      text: "Namaste! I'm Damu, your personal care companion. I can help organize your sugar logs, explain doctor notes, and answer everyday questions.",
      time: '10:30 AM',
    },
  ]);

  const handleSend = (textToSend?: string) => {
    const query = textToSend || input;
    if (!query.trim()) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: query.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput('');
    setIsTyping(true);

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);

    // Context-aware response that clearly distinguishes real facts from AI explanation
    setTimeout(() => {
      const lower = query.toLowerCase();
      let replyText = "I'm here to support your daily diabetes routine.";
      let card: StructuredCard | undefined = undefined;
      let disclaimer: string | undefined = undefined;
      let isFact = false;

      if (lower.includes('summar') || lower.includes('sugar') || lower.includes('reading')) {
        const latest = clinicalStore.observations[0];
        
        // Safety check to prevent crash if no readings exist
        if (latest) {
          replyText = `Here is your latest recorded measurement from your Health Vault:`;
          card = {
            testName: latest.type === 'FASTING' ? 'Fasting Blood Sugar' : 'Post-Meal Sugar',
            value: `${latest.value} mg/dL (Goal: ${latest.patientBaseline} mg/dL)`,
            date: `${latest.date} at ${latest.time}`,
            sourceDoc: 'Health Vault Observation Registry',
          };
          disclaimer = 'Recorded Fact from your device log. Always consult your doctor before changing medication.';
          isFact = true;
        } else {
          replyText = "I don't see any blood sugar readings in your Health Vault right now. You can log a new reading in the Health tab!";
        }
      } else if (lower.includes('walk') || lower.includes('eat') || lower.includes('snack')) {
        replyText = 'A handful of roasted chana, a few almonds, or a small apple 20 minutes before walking provides sustained energy and prevents sudden sugar drops.';
        disclaimer = 'General dietary recommendation. Confirm with your clinical nutritionist.';
      } else if (lower.includes('doctor') || lower.includes('patra') || lower.includes('ask')) {
        replyText = 'Here are 3 key topics for Dr. Patra:\n1. Reviewing your recent HbA1c (5.8%)\n2. Confirming Metformin 500mg timing\n3. Scheduling your upcoming retinal eye exam';
        disclaimer = 'Prepared from your consultation readiness checklist.';
      }

      const damuMsg: ChatMessage = {
        id: `d-${Date.now()}`,
        sender: 'damu',
        text: replyText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        card,
        disclaimer,
        isFact,
      };

      setIsTyping(false);
      setMessages((prev) => [...prev, damuMsg]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }, 750);
  };

  const handleVoiceToggle = () => {
    if (!isListening) {
      setIsListening(true);
      setTimeout(() => {
        setIsListening(false);
        handleSend('Summarize my latest blood sugar readings');
      }, 2500);
    } else {
      setIsListening(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Header with Official Damu Avatar */}
      <View style={styles.header}>
        <View style={styles.avatarHeader}>
          <Image source={damuArtwork} style={styles.avatarImgMini} resizeMode="cover" />
          <View style={styles.onlineDot} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Damu</Text>
          <Text style={styles.headerSubtitle}>Diabetes Care Companion • Active</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={styles.chatArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.chatList, { paddingBottom: 24 }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.welcomeBanner}>
              <Animated.View style={[styles.mascotBox, { transform: [{ translateY: floatAnim }] }]}>
                <Image source={damuArtwork} style={styles.mascotImg} resizeMode="contain" />
              </Animated.View>
              <Text style={styles.welcomeTitle}>Namaste! I'm Damu</Text>
              <Text style={styles.welcomeDesc}>
                Ask me about blood sugar logs, doctor visits, or healthy meal choices in simple words.
              </Text>

              <View style={styles.promptList}>
                {PROMPT_SUGGESTIONS.map((p, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.promptChip}
                    onPress={() => handleSend(p)}
                    activeOpacity={0.8}
                  >
                    <Sparkles color={theme.colors.primary} size={13} />
                    <Text style={styles.promptText}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          }
          renderItem={({ item }) => {
            const isDamu = item.sender === 'damu';
            return (
              <View style={[styles.bubbleRow, isDamu ? styles.bubbleRowLeft : styles.bubbleRowRight]}>
                {isDamu && <Image source={damuArtwork} style={styles.bubbleAvatar} resizeMode="cover" />}

                <View style={[styles.bubble, isDamu ? styles.bubbleDamu : styles.bubbleUser]}>
                  {item.isFact && (
                    <View style={styles.factBadge}>
                      <CheckCircle2 color={theme.colors.success} size={12} />
                      <Text style={styles.factBadgeText}>Verified Health Vault Record</Text>
                    </View>
                  )}

                  <Text style={[styles.bubbleText, isDamu ? styles.bubbleTextDamu : styles.bubbleTextUser]}>
                    {item.text}
                  </Text>

                  {/* Structured Result Card */}
                  {item.card && (
                    <View style={styles.structuredCard}>
                      <Text style={styles.cardTestName}>{item.card.testName}</Text>
                      <Text style={styles.cardTestVal}>{item.card.value}</Text>
                      <Text style={styles.cardTestDate}>Date: {item.card.date}</Text>
                      <View style={styles.sourceLinkRow}>
                        <FileText color={theme.colors.primary} size={12} />
                        <Text style={styles.sourceLinkText}>{item.card.sourceDoc}</Text>
                      </View>
                    </View>
                  )}

                  {/* Medical Advisory / Clarification Note */}
                  {item.disclaimer && (
                    <View style={styles.disclaimerRow}>
                      <AlertCircle color={theme.colors.textMuted} size={11} />
                      <Text style={styles.disclaimerText}>{item.disclaimer}</Text>
                    </View>
                  )}

                  <Text style={[styles.bubbleTime, isDamu ? styles.bubbleTimeDamu : styles.bubbleTimeUser]}>
                    {item.time}
                  </Text>
                </View>
              </View>
            );
          }}
          ListFooterComponent={
            isTyping ? (
              <View style={styles.typingRow}>
                <Image source={damuArtwork} style={styles.bubbleAvatar} resizeMode="cover" />
                <View style={styles.typingBubble}>
                  <Text style={styles.typingText}>Damu is writing a helpful note...</Text>
                </View>
              </View>
            ) : null
          }
        />

        {/* Voice Listening Overlay */}
        {isListening && (
          <View style={styles.listeningBox}>
            <Text style={styles.listeningText}>Listening... Speak your question now</Text>
          </View>
        )}

        {/* Input Dock */}
        <View style={[styles.inputDock, { paddingBottom: insets.bottom > 0 ? 10 : 14 }]}>
          <TouchableOpacity
            style={[styles.micBtn, isListening && styles.micBtnActive]}
            onPress={handleVoiceToggle}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Speak voice query"
          >
            <Mic color={isListening ? theme.colors.white : theme.colors.primary} size={18} />
          </TouchableOpacity>

          <TextInput
            style={styles.inputField}
            placeholder="Ask Damu about readings, food, visits..."
            placeholderTextColor={theme.colors.textPlaceholder}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => handleSend()}
            returnKeyType="send"
          />

          <TouchableOpacity
            style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
            onPress={() => handleSend()}
            disabled={!input.trim()}
          >
            <Send color={theme.colors.white} size={18} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.white },
  header: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  avatarHeader: { position: 'relative' },
  avatarImgMini: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff7ed' },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.success,
    borderWidth: 2,
    borderColor: theme.colors.white,
  },
  headerTitle: { fontSize: 18, fontWeight: theme.typography.weights.black, color: theme.colors.text },
  headerSubtitle: { fontSize: 12, color: theme.colors.primary, fontWeight: theme.typography.weights.bold },
  chatArea: { flex: 1, backgroundColor: theme.colors.bg },
  chatList: { padding: theme.spacing.lg },
  welcomeBanner: { alignItems: 'center', marginBottom: 18 },
  mascotBox: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#fff7ed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 3,
    borderColor: theme.colors.white,
    ...theme.shadows.card,
  },
  mascotImg: { width: 144, height: 144, borderRadius: 72 },
  welcomeTitle: { fontSize: 22, fontWeight: theme.typography.weights.black, color: theme.colors.text, marginBottom: 4 },
  welcomeDesc: { fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 18, paddingHorizontal: 16, marginBottom: 14 },
  promptList: { width: '100%', gap: 8 },
  promptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
  },
  promptText: { fontSize: 13, fontWeight: theme.typography.weights.semibold, color: theme.colors.textSecondary, flex: 1 },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 14, gap: 8 },
  bubbleRowLeft: { justifyContent: 'flex-start' },
  bubbleRowRight: { justifyContent: 'flex-end' },
  bubbleAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff7ed', marginBottom: 2 },
  bubble: { maxWidth: '82%', borderRadius: theme.radius.lg, paddingHorizontal: 16, paddingVertical: 12 },
  bubbleDamu: { backgroundColor: theme.colors.white, borderWidth: 1, borderColor: theme.colors.border, borderBottomLeftRadius: 4 },
  bubbleUser: { backgroundColor: theme.colors.primary, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 14, lineHeight: 21 },
  bubbleTextDamu: { color: theme.colors.text },
  bubbleTextUser: { color: theme.colors.white },
  bubbleTime: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  bubbleTimeDamu: { color: theme.colors.textMuted },
  bubbleTimeUser: { color: theme.colors.primaryBorder },
  factBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.colors.successBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginBottom: 6 },
  factBadgeText: { fontSize: 10, fontWeight: theme.typography.weights.bold, color: theme.colors.success },
  structuredCard: {
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardTestName: { fontSize: 13, fontWeight: theme.typography.weights.extrabold, color: theme.colors.text },
  cardTestVal: { fontSize: 16, fontWeight: theme.typography.weights.black, color: theme.colors.primary, marginVertical: 2, fontVariant: ['tabular-nums'] },
  cardTestDate: { fontSize: 11, color: theme.colors.textMuted },
  sourceLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  sourceLinkText: { fontSize: 11, fontWeight: theme.typography.weights.bold, color: theme.colors.primary },
  disclaimerRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  disclaimerText: { fontSize: 10, color: theme.colors.textMuted, fontStyle: 'italic', flex: 1 },
  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  typingBubble: { backgroundColor: theme.colors.cardMuted, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  typingText: { fontSize: 12, color: theme.colors.textMuted, fontStyle: 'italic' },
  listeningBox: { backgroundColor: theme.colors.primarySurface, padding: 8, alignItems: 'center', borderTopWidth: 1, borderTopColor: theme.colors.primaryBorder },
  listeningText: { fontSize: 12, fontWeight: theme.typography.weights.bold, color: theme.colors.primary },
  inputDock: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 8,
    backgroundColor: theme.colors.white,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    gap: 8,
  },
  micBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
  },
  micBtnActive: { backgroundColor: theme.colors.error, borderColor: theme.colors.error },
  inputField: {
    flex: 1,
    minHeight: theme.touchTarget.minHeight,
    backgroundColor: theme.colors.bg,
    borderRadius: 24,
    paddingHorizontal: 16,
    fontSize: 14,
    color: theme.colors.text,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
});