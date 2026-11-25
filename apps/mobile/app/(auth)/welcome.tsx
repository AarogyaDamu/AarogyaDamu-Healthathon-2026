import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Activity, Heart, Stethoscope, Sparkles, Shield, ArrowRight } from 'lucide-react-native';
import { AppButton } from '../../components/ui/AppButton';
import { setMobileOnboardingCompleted } from '../../src/api/client';
import { theme } from '../../src/theme';

const { width } = Dimensions.get('window');
const damuArtwork = require('../../assets/damu.png');

interface Slide {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  icon: typeof Activity;
  iconColor: string;
  iconBg: string;
}

const slides: Slide[] = [
  {
    id: '1',
    badge: 'EVIDENCE-BASED CARE',
    title: 'Effortless Blood Sugar Intelligence',
    subtitle: 'Seamless CGM telemetry and intuitive micro-logging tailored for your daily metabolic rhythm.',
    icon: Activity,
    iconColor: theme.colors.primary,
    iconBg: 'rgba(0, 77, 77, 0.08)',
  },
  {
    id: '2',
    badge: 'FAMILY & SPECIALIST SUPPORT',
    title: 'Doctor-Assigned Care Plans',
    subtitle: 'Real-time synchronized insulin regimens, target ranges, and clinical interventions curated by your specialist.',
    icon: Heart,
    iconColor: theme.colors.mascotOrange,
    iconBg: 'rgba(201, 84, 16, 0.08)',
  },
  {
    id: '3',
    badge: 'CARE CONTINUITY',
    title: 'Compassionate AI Health Companion',
    subtitle: 'Multilingual dialogue in 8 Indian languages for gentle guidance anytime with zero judgement.',
    icon: Stethoscope,
    iconColor: theme.colors.primaryDark,
    iconBg: 'rgba(0, 77, 77, 0.08)',
  },
];

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const [activeSlide, setActiveSlide] = useState(0);
  const scrollRef = useRef<any>(null);

  const finishOnboarding = async () => {
    await setMobileOnboardingCompleted(true);
    router.replace('/(auth)/role-selection');
  };

  const handleNext = () => {
    if (activeSlide < slides.length - 1) {
      const nextSlide = activeSlide + 1;
      setActiveSlide(nextSlide);
      scrollRef.current?.scrollTo({ x: nextSlide * (width - 48), animated: true });
    }
  };

  const handleDotPress = (index: number) => {
    setActiveSlide(index);
    scrollRef.current?.scrollTo({ x: index * (width - 48), animated: true });
  };

  const isLastSlide = activeSlide === slides.length - 1;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom > 0 ? insets.bottom + 24 : 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Protocol Pill */}
        <View style={styles.topBadgeRow}>
          <View style={styles.protocolPill}>
            <View style={styles.protocolDot} />
            <Text style={styles.protocolPillText}>Clinical Protocol Active</Text>
          </View>
        </View>

        {/* Brand Header */}
        <View style={styles.brandHeader}>
          <View style={styles.brandBadgeRow}>
            <Image
              source={require('../../assets/brand/mark_primary_gradient_512.png')}
              style={styles.brandMarkSymbol}
              resizeMode="contain"
              accessibilityLabel="AarogyaDamu Official Brand Mark"
            />
            <Text style={styles.appTitle}>AarogyaDamu</Text>
          </View>
          <Text style={styles.appTagline}>
            Smarter Care. Connected.
          </Text>

          {/* 3D Mascot Artwork Frame */}
          <View style={styles.artworkContainer}>
            <Image
              source={damuArtwork}
              style={styles.mascotImage}
              resizeMode="contain"
              accessibilityLabel="Damu Health Mascot"
            />
          </View>

          {/* Conversational Greeting Bubble */}
          <View style={styles.greetingBubble}>
            <View style={styles.greetingHeader}>
              <View style={styles.damuBadgeIcon}>
                <Sparkles size={16} color={theme.colors.mascotOrange} />
              </View>
              <Text style={styles.damuName}>Damu</Text>
              <View style={styles.alwaysOnPill}>
                <Text style={styles.alwaysOnText}>Always On</Text>
              </View>
            </View>
            <Text style={styles.greetingQuote}>
              “Namaste! I’m Damu, your personal health companion. Together, we’ll make managing your blood sugar reassuring and straightforward.”
            </Text>
          </View>
        </View>

        {/* Carousel / Clinical Framework Pillars */}
        <View style={styles.carouselContainer}>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const slideWidth = width - 48;
              const index = Math.round(e.nativeEvent.contentOffset.x / slideWidth);
              if (index >= 0 && index < slides.length) {
                setActiveSlide(index);
              }
            }}
          >
            {slides.map((slide) => {
              const Icon = slide.icon;
              return (
                <View key={slide.id} style={[styles.slideItem, { width: width - 48 }]}>
                  <View style={[styles.slideIconWrap, { backgroundColor: slide.iconBg }]}>
                    <Icon size={24} color={slide.iconColor} />
                  </View>
                  <Text style={styles.slideBadge}>{slide.badge}</Text>
                  <Text style={styles.slideTitle}>{slide.title}</Text>
                  <Text style={styles.slideSubtitle}>{slide.subtitle}</Text>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.dotsRow}>
            {slides.map((_, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => handleDotPress(i)}
                style={[styles.dot, activeSlide === i && styles.dotActive]}
              />
            ))}
          </View>
        </View>

        {/* Zero-Judgement Space Ribbon */}
        <View style={styles.insightRibbon}>
          <View style={styles.insightIconBox}>
            <Shield size={16} color={theme.colors.archivalGold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.insightTitle}>Zero-Judgement Space</Text>
            <Text style={styles.insightDesc}>
              Damu tracks trends, not faults. Every reading informs progress.
            </Text>
          </View>
        </View>

        {/* Action Section */}
        <View style={styles.actionSection}>
          {isLastSlide ? (
            <AppButton
              title="Begin My Journey"
              size="lg"
              onPress={() => { void finishOnboarding(); }}
              accessibilityLabel="Get started"
            />
          ) : (
            <AppButton
              title="Next"
              size="lg"
              onPress={handleNext}
              accessibilityLabel="Next"
            />
          )}

          <View style={styles.secondaryRow}>
            <TouchableOpacity onPress={() => { void finishOnboarding(); }} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Already have an account? Sign In</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.legalRow}>
            <Text style={styles.legalText}>
              Adheres to clinical data privacy standards. AarogyaDamu is designed to support patient and caregiver care journeys.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.lg,
  },
  topBadgeRow: {
    alignItems: 'center',
    paddingTop: theme.spacing.md,
  },
  protocolPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
    backgroundColor: 'rgba(0, 77, 77, 0.08)',
  },
  protocolDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.success,
  },
  protocolPillText: {
    fontSize: theme.typography.sizes.caption,
    fontFamily: theme.typography.fonts.label,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  brandHeader: {
    alignItems: 'center',
    paddingTop: theme.spacing.md,
  },
  brandBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  brandMarkSymbol: {
    width: 32,
    height: 32,
  },
  appTitle: {
    fontSize: 28,
    fontFamily: theme.typography.fonts.serif,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primary,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  appTagline: {
    fontSize: theme.typography.sizes.bodySm,
    fontFamily: theme.typography.fonts.sans,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
    maxWidth: 320,
  },
  artworkContainer: {
    width: 124,
    height: 124,
    borderRadius: 62,
    backgroundColor: theme.colors.mascotCream,
    borderWidth: 2,
    borderColor: 'rgba(201, 84, 16, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.md,
    ...theme.shadows.card,
  },
  mascotImage: {
    width: 108,
    height: 108,
    borderRadius: 54,
  },
  greetingBubble: {
    width: '100%',
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: theme.borders.radius.xl,
    padding: theme.spacing.md,
    marginTop: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.borderGhost,
    ...theme.shadows.card,
  },
  greetingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  damuBadgeIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.mascotCream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  damuName: {
    fontSize: theme.typography.sizes.body,
    fontFamily: theme.typography.fonts.serif,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primary,
    flex: 1,
  },
  alwaysOnPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
    backgroundColor: theme.colors.surfaceContainerHigh,
  },
  alwaysOnText: {
    fontSize: 10,
    fontFamily: theme.typography.fonts.label,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.textMuted,
  },
  greetingQuote: {
    fontSize: theme.typography.sizes.bodySm,
    fontFamily: theme.typography.fonts.sans,
    color: theme.colors.text,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  carouselContainer: {
    marginTop: theme.spacing.md,
  },
  slideItem: {
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: theme.borders.radius.xl,
    paddingVertical: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.borderGhost,
  },
  slideIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xs,
  },
  slideBadge: {
    fontSize: 10,
    fontFamily: theme.typography.fonts.label,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.primary,
    letterSpacing: 1,
    marginBottom: 4,
  },
  slideTitle: {
    fontSize: 18,
    fontFamily: theme.typography.fonts.serif,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 4,
  },
  slideSubtitle: {
    fontSize: theme.typography.sizes.bodySm,
    fontFamily: theme.typography.fonts.sans,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 290,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: theme.spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.border,
  },
  dotActive: {
    width: 20,
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
  },
  insightRibbon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255, 240, 216, 0.4)',
    borderRadius: theme.borders.radius.lg,
    padding: theme.spacing.sm,
    marginTop: theme.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(201, 84, 16, 0.1)',
  },
  insightIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.mascotCream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightTitle: {
    fontSize: theme.typography.sizes.caption,
    fontFamily: theme.typography.fonts.label,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
  },
  insightDesc: {
    fontSize: theme.typography.sizes.caption,
    fontFamily: theme.typography.fonts.sans,
    color: theme.colors.textMuted,
  },
  actionSection: {
    marginTop: theme.spacing.md,
  },
  secondaryRow: {
    marginTop: theme.spacing.xs,
    alignItems: 'center',
  },
  secondaryButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: theme.colors.primary,
    fontFamily: theme.typography.fonts.sans,
    fontWeight: theme.typography.weights.semibold,
    fontSize: theme.typography.sizes.bodySm,
  },
  legalRow: {
    marginTop: theme.spacing.xs,
  },
  legalText: {
    fontSize: 10,
    fontFamily: theme.typography.fonts.sans,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 14,
  },
});
