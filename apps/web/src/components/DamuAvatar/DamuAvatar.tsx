import React, { useEffect, useRef, useState } from 'react';
import { createDamuScene, DamuSceneController, DamuSceneMode } from './damuScene';

export interface DamuAvatarProps {
  mode?: DamuSceneMode;
  paused?: boolean;
  size?: number;
  triggerWave?: boolean | number;
  className?: string;
  onError?: () => void;
}

export const DamuAvatar: React.FC<DamuAvatarProps> = ({
  mode = 'idle',
  paused = false,
  size = 240,
  triggerWave,
  className = '',
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

  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.setMode(mode);
    }
  }, [mode]);

  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.setPaused(paused);
    }
  }, [paused]);

  useEffect(() => {
    if (triggerWave && controllerRef.current) {
      controllerRef.current.wave();
    }
  }, [triggerWave]);

  if (hasError) {
    return (
      <div
        className={`damu-avatar-fallback relative flex flex-col items-center justify-center rounded-2xl bg-gradient-to-b from-orange-50 to-orange-100 border border-orange-200 p-4 ${className}`}
        style={{ width: size, height: size }}
        role="img"
        aria-label="Damu health companion avatar"
      >
        <div className="w-20 h-20 rounded-full bg-orange-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg animate-pulse">
          ♥
        </div>
        <p className="mt-2 text-xs font-semibold text-orange-900 uppercase tracking-wide">
          Damu Companion ({mode})
        </p>
      </div>
    );
  }

  return (
    <div
      className={`damu-3d-avatar-container relative flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Damu 3D interactive companion in ${mode} mode`}
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
    </div>
  );
};

export default DamuAvatar;
