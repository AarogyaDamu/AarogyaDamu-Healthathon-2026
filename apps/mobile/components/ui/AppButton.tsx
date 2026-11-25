import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { theme } from '../../src/theme';

interface AppButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'accent' | 'tertiary';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function AppButton({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  style,
  textStyle,
  icon,
  accessibilityLabel,
  accessibilityHint,
}: AppButtonProps) {
  const isPrimary = variant === 'primary';
  const isSecondary = variant === 'secondary';
  const isOutline = variant === 'outline';
  const isGhost = variant === 'ghost';
  const isAccent = variant === 'accent';
  const isTertiary = variant === 'tertiary';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.82}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[
        styles.button,
        styles[size],
        isPrimary && styles.primary,
        isSecondary && styles.secondary,
        isOutline && styles.outline,
        isGhost && styles.ghost,
        isAccent && styles.accent,
        isTertiary && styles.tertiary,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={isPrimary || isAccent ? theme.colors.white : theme.colors.primary}
        />
      ) : (
        <>
          {icon ? <>{icon}</> : null}
          <Text
            style={[
              styles.text,
              styles[`text_${size}`],
              isPrimary && styles.textPrimary,
              isSecondary && styles.textSecondary,
              isOutline && styles.textOutline,
              isGhost && styles.textGhost,
              isAccent && styles.textAccent,
              isTertiary && styles.textTertiary,
              textStyle,
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: theme.touchTarget.minHeight,
    borderRadius: theme.radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
  sm: {
    minHeight: 40,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.sm,
  },
  md: {
    minHeight: theme.touchTarget.minHeight,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
  },
  lg: {
    minHeight: 52,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.radius.lg,
  },
  primary: {
    backgroundColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 3,
  },
  secondary: {
    backgroundColor: theme.colors.cardHigh,
  },
  outline: {
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  accent: {
    backgroundColor: theme.colors.accent,
    shadowColor: theme.colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 3,
  },
  tertiary: {
    backgroundColor: theme.colors.tertiaryContainer,
  },
  disabled: {
    opacity: 0.45,
    shadowOpacity: 0,
    elevation: 0,
  },
  text: {
    fontWeight: theme.typography.weights.semibold,
    letterSpacing: 0.2,
  },
  text_sm: {
    fontSize: theme.typography.sizes.bodySm,
  },
  text_md: {
    fontSize: theme.typography.sizes.body,
  },
  text_lg: {
    fontSize: theme.typography.sizes.bodyLg,
  },
  textPrimary: {
    color: theme.colors.white,
  },
  textSecondary: {
    color: theme.colors.primary,
    fontWeight: theme.typography.weights.bold,
  },
  textOutline: {
    color: theme.colors.primary,
    fontWeight: theme.typography.weights.semibold,
  },
  textGhost: {
    color: theme.colors.primary,
  },
  textAccent: {
    color: theme.colors.white,
  },
  textTertiary: {
    color: theme.colors.onTertiaryContainer,
    fontWeight: theme.typography.weights.bold,
  },
});
