export type VoiceProvider = 'sarvam' | 'device' | null;

export type VoicePlaybackStatus =
  | 'idle'
  | 'loading'
  | 'speaking'
  | 'unavailable';

export interface VoicePlaybackState {
  status: VoicePlaybackStatus;
  provider: VoiceProvider;
  statusLabel: string | null;
  activeMessageId: string | null;
  error: string | null;
}

export type VoiceStateListener = (state: VoicePlaybackState) => void;

export interface VoicePlaybackDrivers {
  playNativeAudio?: (
    uri: string,
    onFinish: () => void,
    onError: (err: any) => void
  ) => Promise<{ stop: () => Promise<void> }>;
  speakDevice?: (
    text: string,
    options: {
      language: string;
      rate?: number;
      pitch?: number;
      onDone?: () => void;
      onError?: (err: any) => void;
      onStopped?: () => void;
    }
  ) => void;
  stopDeviceSpeech?: () => void;
  synthesizeOnDemand?: (
    text: string,
    language?: string
  ) => Promise<{ audioBase64: string; format?: string; provider?: string; speaker?: string }>;
  isWeb?: boolean;
}

/**
 * Validates whether an audio base64 payload is non-empty and has reasonable length.
 */
export function isValidAudioBase64(base64?: string | null): boolean {
  if (!base64 || typeof base64 !== 'string') return false;
  const trimmed = base64.trim();
  if (trimmed.length < 64) return false;
  return /^[A-Za-z0-9+/=]+$/.test(trimmed.slice(0, 100));
}

/**
 * Sanitizes text for device text-to-speech engine:
 * Removes markdown formatting, URLs, symbols, and excess whitespace.
 */
export function sanitizeTextForDeviceSpeech(text: string): string {
  if (!text) return '';
  return text
    .replace(/###?\s+/g, '') // Remove markdown headings
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Bold
    .replace(/\*([^*]+)\*/g, '$1') // Italics
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links [text](url) -> text
    .replace(/https?:\/\/\S+/g, '') // Raw URLs
    .replace(/[•\-\*]\s+/g, '') // Bullet points
    .replace(/[_~`>#]/g, '') // Markdown symbols
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();
}

function getPlatformIsWeb(drivers?: VoicePlaybackDrivers): boolean {
  if (drivers?.isWeb !== undefined) return drivers.isWeb;
  if (typeof window !== 'undefined' && typeof window.document !== 'undefined') return true;
  try {
    // Dynamic import to prevent crash in non-RN node runners
    const RN = require('react-native');
    return RN?.Platform?.OS === 'web';
  } catch {
    return false;
  }
}

/**
 * Controller for reliable voice playback with automatic fallback:
 * Priority:
 * 1. Sarvam Bulbul TTS (natural AI voice)
 * 2. Device Text-to-Speech (expo-speech on native, SpeechSynthesis on web)
 * 3. Text-only response (never hides text, allows user retry)
 */
export class VoicePlaybackManager {
  private state: VoicePlaybackState = {
    status: 'idle',
    provider: null,
    statusLabel: null,
    activeMessageId: null,
    error: null,
  };

  private listeners: Set<VoiceStateListener> = new Set();
  private currentNativeSound: { stop: () => Promise<void> } | null = null;
  private currentWebAudio: any = null;
  private currentToken = 0;
  private userCancelled = false;

  constructor(private drivers?: VoicePlaybackDrivers) {}

  public subscribe(listener: VoiceStateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): VoicePlaybackState {
    return { ...this.state };
  }

  private updateState(partial: Partial<VoicePlaybackState>) {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.warn('[VoiceManager] Listener notification error:', err);
      }
    }
  }

  /**
   * Stops any currently playing audio across all providers.
   * Cancels ongoing speech and resets speaking state.
   */
  public async stop(userRequested = true): Promise<void> {
    if (userRequested) {
      this.userCancelled = true;
    }

    // Invalidate any in-flight token to prevent race conditions
    this.currentToken++;

    // 1. Stop native sound
    if (this.currentNativeSound) {
      try {
        await this.currentNativeSound.stop();
      } catch {}
      this.currentNativeSound = null;
    }

    // 2. Stop HTML5 Web audio if running
    if (this.currentWebAudio) {
      try {
        this.currentWebAudio.pause();
        this.currentWebAudio.src = '';
      } catch {}
      this.currentWebAudio = null;
    }

    // 3. Stop device speech
    if (this.drivers?.stopDeviceSpeech) {
      try {
        this.drivers.stopDeviceSpeech();
      } catch {}
    } else {
      try {
        const Speech = require('expo-speech');
        Speech.stop();
      } catch {}
    }

    // 4. Stop Web SpeechSynthesis if in browser
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }

    this.updateState({
      status: 'idle',
      provider: null,
      statusLabel: null,
      activeMessageId: null,
    });
  }

  /**
   * Main entry point to speak a response.
   * Seamlessly tries Sarvam first, then automatically falls back to device voice,
   * and finally provides a clean text-only fallback state.
   */
  public async speak(params: {
    messageId: string;
    text: string;
    language?: string;
    audioBase64?: string;
    providerName?: string;
    speakerName?: string;
    ttsError?: string;
  }): Promise<void> {
    const { messageId, text, language = 'en-IN', audioBase64, ttsError } = params;

    // Allocate token and reset user cancellation flag synchronously
    const token = ++this.currentToken;
    this.userCancelled = false;

    // Stop any previously playing audio
    if (this.currentNativeSound) {
      const prevSound = this.currentNativeSound;
      this.currentNativeSound = null;
      try {
        await prevSound.stop();
      } catch {}
    }
    if (this.currentWebAudio) {
      try {
        this.currentWebAudio.pause();
        this.currentWebAudio.src = '';
      } catch {}
      this.currentWebAudio = null;
    }
    if (this.drivers?.stopDeviceSpeech) {
      try {
        this.drivers.stopDeviceSpeech();
      } catch {}
    } else {
      try {
        const Speech = require('expo-speech');
        Speech.stop();
      } catch {}
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }

    if (token !== this.currentToken || this.userCancelled) {
      return;
    }

    const cleanText = sanitizeTextForDeviceSpeech(text);

    if (!cleanText) {
      this.updateState({
        status: 'unavailable',
        provider: null,
        statusLabel: 'Voice unavailable — text is available',
        activeMessageId: messageId,
        error: 'Text is empty',
      });
      return;
    }

    // Step 1: Attempt Sarvam TTS (Primary)
    const sarvamAudioAvailable = isValidAudioBase64(audioBase64);

    if (sarvamAudioAvailable && !ttsError) {
      const sarvamSuccess = await this.tryPlaySarvamAudio(audioBase64!, token, messageId);
      if (sarvamSuccess || this.userCancelled || token !== this.currentToken) {
        return;
      }
    } else if (!ttsError && !audioBase64) {
      this.updateState({
        status: 'loading',
        provider: 'sarvam',
        statusLabel: 'Speaking with Sarvam',
        activeMessageId: messageId,
        error: null,
      });

      try {
        let res: { audioBase64: string } | null = null;
        if (this.drivers?.synthesizeOnDemand) {
          res = await this.drivers.synthesizeOnDemand(cleanText, language);
        } else {
          const { DamuService } = require('../api/damu');
          res = await DamuService.synthesizeSpeech(cleanText, language);
        }

        if (token !== this.currentToken || this.userCancelled) return;

        if (res && isValidAudioBase64(res.audioBase64)) {
          const sarvamSuccess = await this.tryPlaySarvamAudio(res.audioBase64, token, messageId);
          if (sarvamSuccess || this.userCancelled || token !== this.currentToken) {
            return;
          }
        }
      } catch (err: any) {
        console.warn('[VoiceManager] Sarvam on-demand synthesis failed:', err?.message || err);
      }
    }

    // If user cancelled, don't fallback
    if (this.userCancelled || token !== this.currentToken) return;

    // Step 2: Automatic Fallback to Device Text-to-Speech
    console.log('[VoiceManager] Falling back to device speech engine for message:', messageId);
    const deviceSuccess = await this.tryPlayDeviceSpeech(cleanText, language, token, messageId);
    if (deviceSuccess || this.userCancelled || token !== this.currentToken) {
      return;
    }

    // Step 3: Last Fallback: Text-only response
    if (token === this.currentToken && !this.userCancelled) {
      this.updateState({
        status: 'unavailable',
        provider: null,
        statusLabel: 'Voice unavailable — text is available',
        activeMessageId: messageId,
        error: 'Speech playback is currently unavailable. Text response is complete.',
      });
    }
  }

  /**
   * Plays Sarvam audio using HTML5 Audio (Web) or native sound driver.
   */
  private async tryPlaySarvamAudio(
    audioBase64: string,
    token: number,
    messageId: string
  ): Promise<boolean> {
    try {
      this.updateState({
        status: 'speaking',
        provider: 'sarvam',
        statusLabel: 'Speaking with Sarvam',
        activeMessageId: messageId,
        error: null,
      });

      const isWeb = getPlatformIsWeb(this.drivers);

      // Web Audio
      if (isWeb && typeof window !== 'undefined' && typeof window.Audio !== 'undefined') {
        return new Promise<boolean>((resolve) => {
          try {
            const audio = new window.Audio(`data:audio/wav;base64,${audioBase64}`);
            this.currentWebAudio = audio;

            audio.onended = () => {
              if (token === this.currentToken) {
                this.updateState({
                  status: 'idle',
                  provider: null,
                  statusLabel: null,
                  activeMessageId: null,
                });
              }
              this.currentWebAudio = null;
              resolve(true);
            };

            audio.onerror = (e) => {
              console.warn('[VoiceManager] HTML5 Audio error:', e);
              this.currentWebAudio = null;
              resolve(false);
            };

            audio.play().catch((playErr) => {
              console.warn('[VoiceManager] HTML5 Audio play() rejected:', playErr?.message);
              this.currentWebAudio = null;
              resolve(false);
            });
          } catch (initErr) {
            console.warn('[VoiceManager] Web Audio initialization error:', initErr);
            this.currentWebAudio = null;
            resolve(false);
          }
        });
      }

      // Native Audio via custom driver or expo-av
      if (this.drivers?.playNativeAudio) {
        const soundInstance = await this.drivers.playNativeAudio(
          `data:audio/wav;base64,${audioBase64}`,
          () => {
            if (token === this.currentToken) {
              this.updateState({
                status: 'idle',
                provider: null,
                statusLabel: null,
                activeMessageId: null,
              });
            }
            this.currentNativeSound = null;
          },
          (err) => {
            console.warn('[VoiceManager] Driver audio error:', err);
            this.currentNativeSound = null;
          }
        );

        if (token !== this.currentToken || this.userCancelled) {
          this.currentNativeSound = null;
          try {
            await soundInstance?.stop();
          } catch {}
          return false;
        }

        this.currentNativeSound = soundInstance;
        return true;
      }

      // Default: expo-av Audio.Sound
      const { Audio } = require('expo-av');
      const { sound } = await Audio.Sound.createAsync(
        { uri: `data:audio/wav;base64,${audioBase64}` },
        { shouldPlay: true }
      );

      if (token !== this.currentToken || this.userCancelled) {
        sound.unloadAsync().catch(() => {});
        return false;
      }

      this.currentNativeSound = {
        stop: async () => {
          try {
            await sound.stopAsync();
            await sound.unloadAsync();
          } catch {}
        },
      };

      return new Promise<boolean>((resolve) => {
        sound.setOnPlaybackStatusUpdate((status: any) => {
          if (!status.isLoaded) {
            this.currentNativeSound = null;
            sound.unloadAsync().catch(() => {});
            resolve(false);
            return;
          }

          if (status.didJustFinish) {
            if (token === this.currentToken) {
              this.updateState({
                status: 'idle',
                provider: null,
                statusLabel: null,
                activeMessageId: null,
              });
            }
            this.currentNativeSound = null;
            sound.unloadAsync().catch(() => {});
            resolve(true);
          }
        });
      });
    } catch (err: any) {
      console.warn('[VoiceManager] Failed to start Sarvam audio playback:', err?.message || err);
      return false;
    }
  }

  /**
   * Plays speech using the device platform engine.
   */
  private async tryPlayDeviceSpeech(
    cleanText: string,
    language: string,
    token: number,
    messageId: string
  ): Promise<boolean> {
    try {
      this.updateState({
        status: 'speaking',
        provider: 'device',
        statusLabel: 'Speaking with device voice',
        activeMessageId: messageId,
        error: null,
      });

      const isWeb = getPlatformIsWeb(this.drivers);

      // Browser Web Speech API fallback for web environments
      if (isWeb && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        return new Promise<boolean>((resolve) => {
          try {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(cleanText);
            utterance.lang = language || 'en-IN';
            utterance.rate = 0.95;
            utterance.pitch = 1.0;

            utterance.onend = () => {
              if (token === this.currentToken) {
                this.updateState({
                  status: 'idle',
                  provider: null,
                  statusLabel: null,
                  activeMessageId: null,
                });
              }
              resolve(true);
            };

            utterance.onerror = (e) => {
              console.warn('[VoiceManager] Web SpeechSynthesis error:', e);
              resolve(false);
            };

            window.speechSynthesis.speak(utterance);
          } catch (webSpeechErr) {
            console.warn('[VoiceManager] Web SpeechSynthesis call failed:', webSpeechErr);
            resolve(false);
          }
        });
      }

      // Device speech via custom driver or expo-speech
      if (this.drivers?.speakDevice) {
        return new Promise<boolean>((resolve) => {
          this.drivers!.speakDevice!(cleanText, {
            language: language || 'en-IN',
            rate: 0.95,
            pitch: 1.0,
            onDone: () => {
              if (token === this.currentToken) {
                this.updateState({
                  status: 'idle',
                  provider: null,
                  statusLabel: null,
                  activeMessageId: null,
                });
              }
              resolve(true);
            },
            onStopped: () => {
              resolve(true);
            },
            onError: () => {
              resolve(false);
            },
          });
        });
      }

      // Default: expo-speech
      const Speech = require('expo-speech');
      return new Promise<boolean>((resolve) => {
        try {
          Speech.speak(cleanText, {
            language: language || 'en-IN',
            rate: 0.95,
            pitch: 1.0,
            onDone: () => {
              if (token === this.currentToken) {
                this.updateState({
                  status: 'idle',
                  provider: null,
                  statusLabel: null,
                  activeMessageId: null,
                });
              }
              resolve(true);
            },
            onStopped: () => {
              resolve(true);
            },
            onError: (err: any) => {
              console.warn('[VoiceManager] expo-speech error:', err);
              resolve(false);
            },
          });
        } catch (speechErr) {
          console.warn('[VoiceManager] expo-speech invocation failed:', speechErr);
          resolve(false);
        }
      });
    } catch (err: any) {
      console.warn('[VoiceManager] Failed to start device speech:', err?.message || err);
      return false;
    }
  }
}

export const voicePlaybackManager = new VoicePlaybackManager();
