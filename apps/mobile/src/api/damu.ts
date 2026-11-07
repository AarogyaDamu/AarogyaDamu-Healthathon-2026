import { mobileApiFetch } from './client';
import {
  DamuInteractRequest,
  DamuInteractResponse,
  DamuStatusResponse,
  AgentPlanResponse,
  DamuSourceReference,
  DamuTransparency,
  DamuAvatarMode,
} from '@aarogyadamu/contracts';

export type DamuState = 'idle' | 'listening' | 'processing' | 'responding' | 'error' | 'completed';

export interface DamuChatMessage {
  id: string;
  sender: 'user' | 'damu';
  text: string;
  spokenText?: string;
  timestamp: string;
  isVoice?: boolean;
  intent?: string;
  avatarMode?: DamuAvatarMode;
  sources?: DamuSourceReference[];
  suggestedFollowUps?: string[];
  emergencyNotice?: string;
  emergencyEscalation?: boolean;
  plan?: AgentPlanResponse;
  planId?: string;
  isProhibited?: boolean;
  transparency?: DamuTransparency;
  audioBase64?: string;
  ttsProvider?: string;
  ttsSpeaker?: string;
  ttsError?: string;
  prohibitedRefusal?: {
    category: string;
    reason: string;
    safeAlternative?: string;
  };
}

export const DamuService = {
  /**
   * Fetches the current readiness status of the Damu voice companion.
   */
  async getStatus(): Promise<DamuStatusResponse> {
    return mobileApiFetch<DamuStatusResponse>('/damu/status');
  },

  /**
   * Sends voice audio or text prompt to Damu.
   * Enforces zero retention and requires explicit informed consent.
   */
  async interact(payload: DamuInteractRequest): Promise<DamuInteractResponse> {
    return mobileApiFetch<DamuInteractResponse>('/damu/interact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  },

  /**
   * List conversation sessions.
   */
  async getConversations(): Promise<{ conversations: any[] }> {
    return mobileApiFetch<{ conversations: any[] }>('/damu/conversations');
  },

  /**
   * Retrieve messages for a specific conversation session.
   */
  async getConversation(id: string): Promise<any> {
    return mobileApiFetch<any>(`/damu/conversations/${id}`);
  },

  /**
   * Start a new conversation.
   */
  async createConversation(title?: string, language?: string): Promise<any> {
    return mobileApiFetch<any>('/damu/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, language }),
    });
  },

  /**
   * Delete or clear a conversation session.
   */
  async deleteConversation(id: string): Promise<{ success: boolean }> {
    return mobileApiFetch<{ success: boolean }>(`/damu/conversations/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Synthesize text to speech using Sarvam Bulbul TTS on backend.
   */
  async synthesizeSpeech(text: string, language?: string, speaker?: string): Promise<{ audioBase64: string; format: string; provider: string; speaker: string }> {
    return mobileApiFetch<{ audioBase64: string; format: string; provider: string; speaker: string }>('/damu/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language, speaker }),
    });
  },
};
