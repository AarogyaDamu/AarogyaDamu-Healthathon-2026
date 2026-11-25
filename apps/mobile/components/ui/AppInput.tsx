import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TextInputProps,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { theme } from '../../src/theme';

interface AppInputProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
  containerStyle?: ViewStyle;
}

export function AppInput({
  label,
  error,
  hint,
  containerStyle,
  style,
  onFocus,
  onBlur,
  ...props
}: AppInputProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          isFocused && styles.inputFocused,
          error ? styles.inputError : null,
          style,
        ]}
        placeholderTextColor={theme.colors.textPlaceholder}
        accessibilityLabel={label}
        accessibilityHint={hint || (error ? `Error: ${error}` : undefined)}
        accessibilityRole="none"
        onFocus={(e) => {
          setIsFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          onBlur?.(e);
        }}
        {...props}
      />
      {error ? (
        <Text
          style={styles.errorText}
          accessible={true}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hintText}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing.md,
    width: '100%',
  },
  label: {
    fontSize: theme.typography.sizes.caption,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    minHeight: theme.touchTarget.minHeight,
    backgroundColor: theme.colors.cardMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: theme.typography.sizes.body,
    color: theme.colors.text,
  },
  inputFocused: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.white,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  inputError: {
    borderColor: theme.colors.error,
    backgroundColor: theme.colors.errorBg,
  },
  errorText: {
    fontSize: theme.typography.sizes.caption,
    color: theme.colors.error,
    marginTop: theme.spacing.xs,
    fontWeight: theme.typography.weights.semibold,
  },
  hintText: {
    fontSize: theme.typography.sizes.caption,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.xs,
  },
});
