import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { DamuSceneMode } from './damuScene';

interface DamuAvatarFallbackProps {
  mode?: DamuSceneMode;
  size?: number;
  testID?: string;
}

export const DamuAvatarFallback: React.FC<DamuAvatarFallbackProps> = ({
  mode = 'idle',
  size = 220,
  testID = 'damu-avatar-fallback',
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Breathing / floating animation loop
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -6,
          duration: 1600,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 1600,
          useNativeDriver: true,
        }),
      ])
    );
    floatLoop.start();

    return () => floatLoop.stop();
  }, [floatAnim]);

  useEffect(() => {
    if (mode === 'listening' || mode === 'speaking') {
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoop.start();
      return () => pulseLoop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [mode, pulseAnim]);

  const scaleRatio = size / 220;

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        { width: size, height: size },
      ]}
      accessibilityRole="image"
      accessibilityLabel={`Damu 3D health companion in ${mode} mode`}
    >
      <Animated.View
        style={[
          styles.characterContainer,
          {
            transform: [
              { scale: scaleRatio },
              { translateY: floatAnim },
              { scale: pulseAnim },
            ],
          },
        ]}
      >
        {/* Shadow */}
        <View style={styles.shadow} />

        {/* Winged Cap */}
        <View style={styles.capRoot}>
          {/* Left Wing */}
          <View style={[styles.wing, styles.leftWing]}>
            <View style={styles.feather1} />
            <View style={styles.feather2} />
          </View>

          {/* Crown & Stitched Band */}
          <View style={styles.capCrown} />
          <View style={styles.capBand}>
            {/* Orange Cross Logo */}
            <View style={styles.crossContainer}>
              <View style={styles.crossVertical} />
              <View style={styles.crossHorizontal} />
            </View>
          </View>

          {/* Right Wing */}
          <View style={[styles.wing, styles.rightWing]}>
            <View style={styles.feather1} />
            <View style={styles.feather2} />
          </View>
        </View>

        {/* Pear Body */}
        <View style={styles.pearBody}>
          {/* Cream Chest Patch */}
          <View style={styles.creamChest} />

          {/* Eyes */}
          <View style={styles.eyesRow}>
            {/* Left Eye */}
            <View style={styles.eyeOuter}>
              <View style={styles.eyeIris}>
                <View style={styles.eyePupil}>
                  <View style={styles.eyeHighlight1} />
                  <View style={styles.eyeHighlight2} />
                </View>
              </View>
            </View>

            {/* Right Eye */}
            <View style={styles.eyeOuter}>
              <View style={styles.eyeIris}>
                <View style={styles.eyePupil}>
                  <View style={styles.eyeHighlight1} />
                  <View style={styles.eyeHighlight2} />
                </View>
              </View>
            </View>
          </View>

          {/* Smile / Mouth */}
          <View
            style={[
              styles.mouth,
              mode === 'speaking' && styles.mouthSpeaking,
              mode === 'listening' && styles.mouthListening,
            ]}
          />
        </View>

        {/* Heart Pendant on Golden Halo */}
        <View style={styles.pendantRoot}>
          <View style={styles.pendantHalo}>
            <View style={styles.heartPendant}>
              <Text style={styles.heartSymbol}>♥</Text>
            </View>
          </View>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  characterContainer: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  shadow: {
    position: 'absolute',
    bottom: 8,
    width: 140,
    height: 18,
    borderRadius: 70,
    backgroundColor: 'rgba(117, 65, 26, 0.18)',
  },
  capRoot: {
    position: 'absolute',
    top: 10,
    alignItems: 'center',
    zIndex: 10,
  },
  capCrown: {
    width: 110,
    height: 48,
    borderTopLeftRadius: 55,
    borderTopRightRadius: 55,
    backgroundColor: '#fff0d8',
    borderColor: '#e8dbca',
    borderWidth: 1.5,
  },
  capBand: {
    width: 116,
    height: 24,
    backgroundColor: '#fff0d8',
    borderRadius: 12,
    marginTop: -8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#eeddce',
  },
  crossContainer: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crossVertical: {
    position: 'absolute',
    width: 4,
    height: 14,
    backgroundColor: '#f78b2c',
    borderRadius: 2,
  },
  crossHorizontal: {
    position: 'absolute',
    width: 14,
    height: 4,
    backgroundColor: '#f78b2c',
    borderRadius: 2,
  },
  wing: {
    position: 'absolute',
    top: 6,
    width: 32,
    height: 28,
  },
  leftWing: {
    left: -24,
    transform: [{ rotate: '-12deg' }],
  },
  rightWing: {
    right: -24,
    transform: [{ rotate: '12deg' }],
  },
  feather1: {
    width: 28,
    height: 12,
    backgroundColor: '#fff0d8',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#eeddce',
  },
  feather2: {
    width: 24,
    height: 10,
    backgroundColor: '#fff0d8',
    borderRadius: 5,
    marginTop: 2,
    borderWidth: 1,
    borderColor: '#eeddce',
  },
  pearBody: {
    width: 140,
    height: 130,
    backgroundColor: '#c95410',
    borderRadius: 70,
    marginTop: 38,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#75411a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  creamChest: {
    position: 'absolute',
    bottom: -10,
    width: 100,
    height: 90,
    backgroundColor: '#fff0d8',
    borderTopLeftRadius: 50,
    borderTopRightRadius: 50,
  },
  eyesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 82,
    marginTop: 24,
    zIndex: 5,
  },
  eyeOuter: {
    width: 28,
    height: 34,
    borderRadius: 14,
    backgroundColor: '#bc470d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeIris: {
    width: 24,
    height: 28,
    borderRadius: 12,
    backgroundColor: '#4d1b0b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyePupil: {
    width: 18,
    height: 22,
    borderRadius: 9,
    backgroundColor: '#150b08',
    position: 'relative',
  },
  eyeHighlight1: {
    position: 'absolute',
    top: 3,
    left: 2,
    width: 6,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#ffffff',
  },
  eyeHighlight2: {
    position: 'absolute',
    bottom: 3,
    right: 2,
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#ffffff',
  },
  mouth: {
    width: 16,
    height: 8,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    borderWidth: 2,
    borderColor: '#74331b',
    borderTopWidth: 0,
    marginTop: 10,
    zIndex: 5,
  },
  mouthSpeaking: {
    height: 12,
    width: 18,
    borderRadius: 8,
    backgroundColor: '#74331b',
  },
  mouthListening: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#74331b',
  },
  pendantRoot: {
    position: 'absolute',
    bottom: 22,
    zIndex: 12,
    alignItems: 'center',
  },
  pendantHalo: {
    width: 32,
    height: 36,
    borderRadius: 16,
    borderWidth: 2.5,
    borderColor: '#ffd477',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff0d8',
  },
  heartPendant: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartSymbol: {
    fontSize: 16,
    color: '#c95410',
    fontWeight: 'bold',
  },
});
