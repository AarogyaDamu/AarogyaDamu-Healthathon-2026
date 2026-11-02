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
import { Activity, Heart, Stethoscope } from 'lucide-react-native';
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
    badge: 'DIABETES CARE',
    title: 'Your complete diabetes journey companion',
    subtitle: 'Stay focused on daily glucose trends, medication habits, and meaningful milestones with Damu by your side.',
    icon: Activity,
    iconColor: theme.colors.primary,
    iconBg: theme.colors.primarySurface,
  },
  {
    id: '2',
    badge: 'FAMILY SUPPORT',
    title: 'Care for yourself or a loved one',
    subtitle: 'Choose a patient or caregiver role to keep the right health information, reminders, and approvals visible.',
    icon: Heart,
    iconColor: theme.colors.accent,
    iconBg: theme.colors.accentLight,
  },
  {
    id: '3',
    badge: 'CARE CONTINUITY',
    title: 'Clinical guidance without friction',
    subtitle: 'Track progress, review appointments, and prepare with confidence for every consultation or check-in.',
    icon: Stethoscope,
    iconColor: theme.colors.primaryDark,
    iconBg: theme.colors.primarySurface,
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
          { paddingBottom: insets.bottom > 0 ? insets.bottom + 20 : 28 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandHeader}>
          <View style={styles.artworkContainer}>
            <Image
              source={damuArtwork}
              style={styles.mascotImage}
              resizeMode="contain"
              accessibilityLabel="Damu Health Mascot"
            />
          </View>
        </View>

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

        <View style={styles.actionSection}>
          {isLastSlide ? (
            <AppButton
              title="Get started"
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
              <Text style={styles.secondaryButtonText}>Skip</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.legalRow}>
            <Text style={styles.legalText}>AarogyaDamu is designed to support patient and caregiver care journeys.</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
  },
  brandHeader: {
    alignItems: 'center',
    paddingTop: theme.spacing.lg,
  },
  artworkContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#fff7ed',
    borderWidth: 3,
    borderColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.card,
  },
  mascotImage: {
    width: 108,
    height: 108,
    borderRadius: 54,
  },
  carouselContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: theme.spacing.md,
  },
  slideItem: {
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  slideIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
  },
  slideBadge: {
    fontSize: 10,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.primary,
    letterSpacing: 1,
    marginBottom: 6,
  },
  slideTitle: {
    fontSize: 22,
    fontWeight: theme.typography.weights.black,
    color: theme.colors.text,
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: theme.spacing.sm,
    letterSpacing: -0.3,
  },
  slideSubtitle: {
    fontSize: theme.typography.sizes.bodySm,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: theme.spacing.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.border,
  },
  dotActive: {
    width: 24,
    backgroundColor: theme.colors.primary,
  },
  actionSection: {
    paddingTop: theme.spacing.md,
  },
  secondaryRow: {
    marginTop: theme.spacing.sm,
    alignItems: 'center',
  },
  secondaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: theme.colors.primary,
    fontWeight: theme.typography.weights.bold,
    fontSize: theme.typography.sizes.bodySm,
  },
  legalRow: {
    marginTop: theme.spacing.md,
  },
  legalText: {
    fontSize: theme.typography.sizes.caption,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
});