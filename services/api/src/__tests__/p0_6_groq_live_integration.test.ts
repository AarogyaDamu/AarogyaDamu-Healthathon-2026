import { GroqDamuProvider } from '../services/damuVoiceService';

/**
 * Phase P0.6 Optional Live Groq Integration Test Suite
 *
 * This test file executes live network calls against Groq endpoints ONLY when
 * a valid GROQ_API_KEY environment variable is configured.
 * When GROQ_API_KEY is omitted, all tests cleanly skip with an explanatory log.
 */
describe('Phase P0.6 — Groq Multilingual Voice Assistant Live Integration (Optional)', () => {
  const liveApiKey = process.env.GROQ_API_KEY?.trim();
  const isLiveConfigured = Boolean(liveApiKey && liveApiKey.startsWith('gsk_'));

  if (!isLiveConfigured) {
    it('skips live Groq integration tests when GROQ_API_KEY is not configured', () => {
      console.log('Skipping live Groq integration tests: GROQ_API_KEY not configured or simulated.');
      expect(true).toBe(true);
    });
    return;
  }

  const liveProvider = new GroqDamuProvider(liveApiKey!);

  it('connects to live Groq Llama 3.3 endpoint and returns response', async () => {
    const result = await liveProvider.generateResponse({
      prompt: 'What are whole grains suitable for diabetes?',
      language: 'en-IN',
    });

    expect(result.textResponse).toBeDefined();
    expect(result.textResponse.length).toBeGreaterThan(10);
    expect(result.isMock).toBe(false);
  }, 15000);

  it('correctly reports live provider status', async () => {
    const status = await liveProvider.getProviderStatus();
    expect(status.isAvailable).toBe(true);
    expect(status.models.stt).toBe('whisper-large-v3-turbo');
    expect(status.models.llm).toBe('openai/gpt-oss-120b');
    expect(status.audioRetentionPolicy).toBe('SESSION_ONLY_ZERO_RETENTION');
  });
});

