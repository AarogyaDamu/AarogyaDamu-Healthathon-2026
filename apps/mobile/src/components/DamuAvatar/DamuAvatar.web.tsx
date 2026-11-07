import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { createDamuScene, DamuSceneController, DamuSceneMode } from './damuScene';
import { DamuAvatarFallback } from './DamuAvatarFallback';

export interface DamuAvatarProps {
  mode?: DamuSceneMode;
  paused?: boolean;
  size?: number;
  triggerWave?: boolean | number;
  testID?: string;
  onError?: () => void;
}

export const DamuAvatar: React.FC<DamuAvatarProps> = ({
  mode = 'idle',
  paused = false,
  size = 240,
  triggerWave,
  testID = 'damu-3d-avatar-web',
  onError,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<DamuSceneController | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!containerRef.current || hasError) return;

    try {
      const controller = createDamuScene(containerRef.current, {
        mode,
        paused,
        onError: () => {
          setHasError(true);
          onError?.();
        },
      });
      controllerRef.current = controller;

      // Initial greeting wave on scene mount
      controller.wave();

      return () => {
        controller.dispose();
        controllerRef.current = null;
      };
    } catch (err) {
      setHasError(true);
      onError?.();
    }
  }, [hasError, onError]);

  // Sync mode changes
  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.setMode(mode);
    }
  }, [mode]);

  // Sync paused changes
  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.setPaused(paused);
    }
  }, [paused]);

  // Sync wave triggers
  useEffect(() => {
    if (triggerWave && controllerRef.current) {
      controllerRef.current.wave();
    }
  }, [triggerWave]);

  if (hasError) {
    return <DamuAvatarFallback mode={mode} size={size} testID={testID} />;
  }

  return (
    <View
      testID={testID}
      style={[
        styles.host,
        {
          width: size,
          height: size,
        },
      ]}
      accessibilityRole="image"
      accessibilityLabel={`Damu interactive 3D companion in ${mode} state`}
    >
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          touchAction: 'none',
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  host: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
