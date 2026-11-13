import { apiFetch } from '../api/client';

export type WebVoiceProvider = 'sarvam' | 'device' | null;

export type WebVoiceStatus = 'idle' | 'loading' | 'speaking' | 'unavailable';

export interface WebVoiceState {
  status: WebVoiceStatus;
  provider: WebVoiceProvider;
  statusLabel: string | null;
  activeMessageId: string | null;
  error: string | null;
}

export type WebVoiceListener = (state: WebVoiceState) => void;

export function isValidBase64Audio(base64?: string | null): boolean {
  if (!base64 || typeof base64 !== 'string') return false;
  const trimmed = base64.trim();
  if (trimmed.length < 64) return false;
  return /^[A-Za-z0-9+/=]+$/.test(trimmed.slice(0, 100));
}

export function sanitizeTextForSpeech(text: string): string {
  if (!text) return '';
  return text
    .replace(/###?\s+/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[•\-\*]\s+/g, '')
    .replace(/[_~`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export class WebVoiceManager {
  private state: WebVoiceState = {
    status: 'idle',
    provider: null,
    statusLabel: null,
    activeMessageId: null,
    error: null,
  };

  private listeners: Set<WebVoiceListener> = new Set();
  private currentAudio: HTMLAudioElement | null = null;
  private currentToken = 0;
  private userCancelled = false;

  public subscribe(listener: WebVoiceListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): WebVoiceState {
    return { ...this.state };
  }

  private updateState(partial: Partial<WebVoiceState>) {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.warn('[WebVoiceManager] Listener error:', err);
      }
    }
  }

  public stop(userRequested = true): void {
    if (userRequested) {
      this.userCancelled = true;
    }
    this.currentToken++;

    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.src = '';
      } catch {}
      this.currentAudio = null;
    }

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

  public async speak(params: {
    messageId: string;
    text: string;
    language?: string;
    audioBase64?: string;
    ttsError?: string;
  }): Promise<void> {
    const { messageId, text, language = 'en-IN', audioBase64, ttsError } = params;

    this.stop(false);
    this.userCancelled = false;

    const token = ++this.currentToken;
    const cleanText = sanitizeTextForSpeech(text);

    if (!cleanText) {
      this.updateState({
        status: 'unavailable',
        provider: null,
        statusLabel: 'Voice unavailable — text is available',
        activeMessageId: messageId,
        error: 'Text cannot be empty.',
      });
      return;
    }

    // 1. Try Sarvam TTS (Primary)
    if (isValidBase64Audio(audioBase64) && !ttsError) {
      const sarvamSuccess = await this.tryPlaySarvamAudio(audioBase64!, token, messageId);
      if (sarvamSuccess || this.userCancelled || token !== this.currentToken) return;
    } else if (!ttsError && !audioBase64) {
      this.updateState({
        status: 'loading',
        provider: 'sarvam',
        statusLabel: 'Speaking with Sarvam',
        activeMessageId: messageId,
        error: null,
      });

      try {
        const res = await apiFetch<{ audioBase64: string }>('/damu/tts', {
          method: 'POST',
          body: JSON.stringify({ text: cleanText, language }),
        });

        if (token !== this.currentToken || this.userCancelled) return;

        if (isValidBase64Audio(res.audioBase64)) {
          const sarvamSuccess = await this.tryPlaySarvamAudio(res.audioBase64, token, messageId);
          if (sarvamSuccess || this.userCancelled || token !== this.currentToken) return;
        }
      } catch (err) {
        console.warn('[WebVoiceManager] Sarvam on-demand synthesis failed:', err);
      }
    }

    if (this.userCancelled || token !== this.currentToken) return;

    // 2. Fallback to Browser Native Speech Synthesis
    console.log('[WebVoiceManager] Falling back to browser speech synthesis for message:', messageId);
    const deviceSuccess = await this.tryPlayDeviceSpeech(cleanText, language, token, messageId);
    if (deviceSuccess || this.userCancelled || token !== this.currentToken) return;

    // 3. Last Fallback: Text-only response
    if (token === this.currentToken && !this.userCancelled) {
      this.updateState({
        status: 'unavailable',
        provider: null,
        statusLabel: 'Voice unavailable — text is available',
        activeMessageId: messageId,
        error: 'Speech playback is unavailable. Text response is complete.',
      });
    }
  }

  private tryPlaySarvamAudio(
    audioBase64: string,
    token: number,
    messageId: string
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      try {
        if (typeof window === 'undefined' || typeof window.Audio === 'undefined') {
          resolve(false);
          return;
        }

        this.updateState({
          status: 'speaking',
          provider: 'sarvam',
          statusLabel: 'Speaking with Sarvam',
          activeMessageId: messageId,
          error: null,
        });

        const audio = new window.Audio(`data:audio/wav;base64,${audioBase64}`);
        this.currentAudio = audio;

        audio.onended = () => {
          if (token === this.currentToken) {
            this.updateState({
              status: 'idle',
              provider: null,
              statusLabel: null,
              activeMessageId: null,
            });
          }
          this.currentAudio = null;
          resolve(true);
        };

        audio.onerror = () => {
          this.currentAudio = null;
          resolve(false);
        };

        audio.play().catch((playErr) => {
          console.warn('[WebVoiceManager] HTML5 Audio play rejected:', playErr);
          this.currentAudio = null;
          resolve(false);
        });
      } catch (err) {
        console.warn('[WebVoiceManager] Sarvam audio playback error:', err);
        resolve(false);
      }
    });
  }

  private tryPlayDeviceSpeech(
    cleanText: string,
    language: string,
    token: number,
    messageId: string
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        resolve(false);
        return;
      }

      try {
        window.speechSynthesis.cancel();
        this.updateState({
          status: 'speaking',
          provider: 'device',
          statusLabel: 'Speaking with device voice',
          activeMessageId: messageId,
          error: null,
        });

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
          console.warn('[WebVoiceManager] SpeechSynthesis error:', e);
          resolve(false);
        };

        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn('[WebVoiceManager] SpeechSynthesis invocation failed:', err);
        resolve(false);
      }
    });
  }
}

export const webVoiceManager = new WebVoiceManager();
