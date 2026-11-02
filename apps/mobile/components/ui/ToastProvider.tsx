import React, { createContext, useContext, useState, useRef } from 'react';
import { Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../src/theme';

interface ToastContextType {
  showToast: (message: string, onUndo?: () => void) => void;
}

const ToastContext = createContext<ToastContextType>({ showToast: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [undoAction, setUndoAction] = useState<(() => void) | undefined>();

  const translateY = useRef(new Animated.Value(100)).current;

  const showToast = (message: string, onUndo?: () => void) => {
    setToastMessage(message);
    setUndoAction(() => onUndo);
    setVisible(true);

    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      friction: 8,
    }).start();

    setTimeout(() => {
      hideToast();
    }, 4500);
  };

  const hideToast = () => {
    Animated.timing(translateY, {
      toValue: 120,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setVisible(false));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {visible && (
        <Animated.View
          style={[
            styles.toastContainer,
            { bottom: insets.bottom + 72, transform: [{ translateY }] },
          ]}
          accessible={true}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.toastText}>{toastMessage}</Text>
          {undoAction && (
            <TouchableOpacity
              onPress={() => {
                undoAction();
                hideToast();
              }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.undoButton}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Undo action"
            >
              <Text style={styles.undoText}>UNDO</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    left: theme.spacing.lg,
    right: theme.spacing.lg,
    backgroundColor: theme.colors.text,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.radius.lg,
    ...theme.shadows.floating,
    zIndex: 9999,
  },
  toastText: {
    color: theme.colors.white,
    fontSize: theme.typography.sizes.bodySm,
    fontWeight: theme.typography.weights.semibold,
    flex: 1,
  },
  undoButton: {
    marginLeft: theme.spacing.lg,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  undoText: {
    color: '#38bdf8',
    fontWeight: theme.typography.weights.black,
    fontSize: theme.typography.sizes.meta,
    letterSpacing: 0.6,
  },
});