import {
  detectAndNormalizeAudio,
  createMockWavBuffer,
  sanitizeTextForTts,
  SarvamDamuProvider,
  GroqDamuProvider,
  MockDamuProvider,
  redactApiKey,
} from '../services/damuVoiceService';

describe('Sarvam STT & Bulbul TTS Voice Architecture Integration Suite', () => {
  // Test Audio Buffers
  const mockWav = createMockWavBuffer(16000, 3200);

  // M4A/MP4 buffer with valid ftyp magic bytes
  const mockM4a = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x20]), // box size: 32 bytes
    Buffer.from('ftypM4A '), // ftyp major brand
    Buffer.from([0x00, 0x00, 0x00, 0x00]), // minor version
    Buffer.from('M4A mp42isom'), // compatible brands
    Buffer.alloc(100, 0xAA), // audio payload bytes
  ]);

  // WebM buffer with EBML header
  const mockWebm = Buffer.concat([
    Buffer.from([0x1A, 0x45, 0xDF, 0xA3]), // EBML ID
    Buffer.from('webm'),
    Buffer.alloc(100, 0xBB),
  ]);

  // MP3 buffer with ID3 header
  const mockMp3 = Buffer.concat([
    Buffer.from('ID3'), // ID3 tag
    Buffer.from([0x03, 0x00, 0x00, 0x00, 0x00, 0x0A]),
    Buffer.alloc(100, 0xCC),
  ]);

  // AAC buffer with ADTS syncword (0xFFF1)
  const mockAac = Buffer.concat([
    Buffer.from([0xFF, 0xF1, 0x50, 0x80]),
    Buffer.alloc(100, 0xDD),
  ]);

  describe('1. Audio MIME Type Detection & Magic Byte Normalization', () => {
    it('rejects empty or zero-byte audio buffers with a clear error', () => {
      expect(() => detectAndNormalizeAudio(Buffer.alloc(0), 'audio/m4a')).toThrow(
        /Audio payload cannot be empty/
      );
    });

    it('corrects audio/m4a to audio/mp4 with .mp4 extension for genuine M4A/MP4 container', () => {
      const normalized = detectAndNormalizeAudio(mockM4a, 'audio/m4a');
      expect(normalized.mimeType).toBe('audio/mp4');
      expect(normalized.filename).toBeDefined();
      expect(normalized.filename.endsWith('.mp4')).toBe(true);
      expect(normalized.buffer.length).toBe(mockM4a.length);
      // Preserves original audio bytes exactly
      expect(normalized.buffer.equals(mockM4a)).toBe(true);
    });

    it('corrects audio/x-m4a to audio/mp4 for genuine M4A audio', () => {
      const normalized = detectAndNormalizeAudio(mockM4a, 'audio/x-m4a');
      expect(normalized.mimeType).toBe('audio/mp4');
      expect(normalized.filename.endsWith('.mp4')).toBe(true);
    });

    it('preserves genuine WAV audio buffer and normalizes MIME type to audio/wav', () => {
      const normalized = detectAndNormalizeAudio(mockWav, 'audio/wav');
      expect(normalized.mimeType).toBe('audio/wav');
      expect(normalized.filename.endsWith('.wav')).toBe(true);
      expect(normalized.buffer.equals(mockWav)).toBe(true);
    });

    it('preserves genuine WebM audio buffer and normalizes MIME type to audio/webm', () => {
      const normalized = detectAndNormalizeAudio(mockWebm, 'audio/webm');
      expect(normalized.mimeType).toBe('audio/webm');
      expect(normalized.filename.endsWith('.webm')).toBe(true);
      expect(normalized.buffer.equals(mockWebm)).toBe(true);
    });

    it('preserves genuine MP3 audio buffer and normalizes MIME type to audio/mpeg', () => {
      const normalized = detectAndNormalizeAudio(mockMp3, 'audio/mp3');
      expect(normalized.mimeType).toBe('audio/mpeg');
      expect(normalized.filename.endsWith('.mp3')).toBe(true);
      expect(normalized.buffer.equals(mockMp3)).toBe(true);
    });

    it('preserves genuine AAC audio buffer and normalizes MIME type to audio/aac', () => {
      const normalized = detectAndNormalizeAudio(mockAac, 'audio/aac');
      expect(normalized.mimeType).toBe('audio/aac');
      expect(normalized.filename.endsWith('.aac')).toBe(true);
      expect(normalized.buffer.equals(mockAac)).toBe(true);
    });

    it('maps legacy audio/m4a requestedMime to audio/mp4 even if container header is generic', () => {
      const genericBuffer = Buffer.concat([Buffer.from([0x00, 0x01, 0x02, 0x03]), Buffer.alloc(50)]);
      const normalized = detectAndNormalizeAudio(genericBuffer, 'audio/m4a');
      expect(normalized.mimeType).toBe('audio/mp4');
      expect(normalized.filename.endsWith('.mp4')).toBe(true);
    });
  });

  describe('2. Text Sanitization for Sarvam Bulbul TTS', () => {
    it('strips markdown headings, bolding, italics, bullet points and asterisks', () => {
      const rawText = '### Recommendation\nYour **fasting blood sugar** of *110 mg/dL* is in range.\n* Keep hydrating\n* Continue walks';
      const clean = sanitizeTextForTts(rawText);
      expect(clean).not.toContain('###');
      expect(clean).not.toContain('**');
      expect(clean).not.toContain('*');
      expect(clean).toContain('Your fasting blood sugar of 110 mg/dL is in range');
    });

    it('strips web links and markdown brackets', () => {
      const rawText = 'Please review your report at [AarogyaDamu](https://aarogyadamu.in/report) for details.';
      const clean = sanitizeTextForTts(rawText);
      expect(clean).not.toContain('https://');
      expect(clean).not.toContain('[');
      expect(clean).not.toContain(']');
      expect(clean).toContain('AarogyaDamu');
    });

    it('limits text to 500 characters cleanly for fast TTS synthesis', () => {
      const longText = 'Your blood glucose is stable. '.repeat(30);
      const clean = sanitizeTextForTts(longText);
      expect(clean.length).toBeLessThanOrEqual(500);
    });
  });

  describe('3. Sarvam Bulbul TTS Provider Implementation', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('calls Sarvam Bulbul TTS API with model bulbul:v4-flash, correct speaker and BCP-47 language', async () => {
      const mockWavBase64 = Buffer.from('RIFF mock wav audio data').toString('base64');
      let capturedRequest: any = null;

      global.fetch = jest.fn().mockImplementation(async (url: string, init: any) => {
        if (url.includes('api.sarvam.ai/text-to-speech')) {
          capturedRequest = {
            url,
            headers: init.headers,
            body: JSON.parse(init.body),
          };
          return {
            ok: true,
            json: async () => ({
              audios: [mockWavBase64],
            }),
          };
        }
        return { ok: false, status: 404, text: async () => 'Not found' };
      }) as any;

      const provider = new SarvamDamuProvider('test-sarvam-key-12345');

      const result = await provider.synthesizeSpeech({
        text: 'Your fasting blood glucose is 110 milligrams per deciliter.',
        language: 'en-IN',
        speaker: 'shubh_enhi_ads',
      });

      expect(result).toBeDefined();
      expect(result.audioBase64).toBe(mockWavBase64);
      expect(result.format).toBe('audio/wav');
      expect(result.provider).toContain('sarvam');
      expect(result.speaker).toBe('shubh_enhi_ads');

      // Verify payload sent to Sarvam
      expect(capturedRequest).toBeDefined();
      expect(capturedRequest.url).toBe('https://api.sarvam.ai/text-to-speech');
      expect(capturedRequest.headers['api-subscription-key']).toBe('test-sarvam-key-12345');
      expect(capturedRequest.headers['Content-Type']).toBe('application/json');
      expect(capturedRequest.body.model).toBe('bulbul:v4-flash');
      expect(capturedRequest.body.speaker).toBe('shubh_enhi_ads');
      expect(capturedRequest.body.target_language_code).toBe('en-IN');
      expect(capturedRequest.body.inputs).toHaveLength(1);
    });

    it('maps regional language codes correctly (hi-IN, mr-IN)', async () => {
      const mockWavBase64 = Buffer.from('RIFF mock wav audio data').toString('base64');
      let targetLang = '';

      global.fetch = jest.fn().mockImplementation(async (url: string, init: any) => {
        const body = JSON.parse(init.body);
        targetLang = body.target_language_code;
        return {
          ok: true,
          json: async () => ({ audios: [mockWavBase64] }),
        };
      }) as any;

      const provider = new SarvamDamuProvider('test-sarvam-key-12345');

      // Hindi
      await provider.synthesizeSpeech({ text: 'नमस्ते, आपकी शुगर स्थिर है।', language: 'hi-IN' });
      expect(targetLang).toBe('hi-IN');

      // Marathi
      await provider.synthesizeSpeech({ text: 'नमस्कार, तुमची साखर सामान्य आहे.', language: 'mr-IN' });
      expect(targetLang).toBe('mr-IN');
    });

    it('handles Sarvam API failure by throwing an informative error without silent fallback', async () => {
      global.fetch = jest.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 400,
          text: async () => 'Invalid speaker ID',
        };
      }) as any;

      const provider = new SarvamDamuProvider('test-sarvam-key-12345');

      await expect(
        provider.synthesizeSpeech({ text: 'Test speech', language: 'en-IN' })
      ).rejects.toThrow(/Sarvam Bulbul TTS failed \(400\)/);
    });

    it('handles Sarvam 401/403 authentication failures with informative error', async () => {
      global.fetch = jest.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 401,
          text: async () => 'Unauthorized: Invalid subscription key',
        };
      }) as any;

      const provider = new SarvamDamuProvider('invalid-key');

      await expect(
        provider.synthesizeSpeech({ text: 'Test speech', language: 'en-IN' })
      ).rejects.toThrow(/Sarvam Bulbul TTS failed \(401\)/);
    });

    it('handles Sarvam 429 rate limit errors with informative error', async () => {
      global.fetch = jest.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 429,
          text: async () => 'Rate limit exceeded: Too many requests',
        };
      }) as any;

      const provider = new SarvamDamuProvider('test-key');

      await expect(
        provider.synthesizeSpeech({ text: 'Test speech', language: 'en-IN' })
      ).rejects.toThrow(/Sarvam Bulbul TTS failed \(429\)/);
    });

    it('handles Sarvam 5xx server errors with informative error', async () => {
      global.fetch = jest.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 503,
          text: async () => 'Service Temporarily Unavailable',
        };
      }) as any;

      const provider = new SarvamDamuProvider('test-key');

      await expect(
        provider.synthesizeSpeech({ text: 'Test speech', language: 'en-IN' })
      ).rejects.toThrow(/Sarvam Bulbul TTS failed \(503\)/);
    });

    it('throws error when Sarvam returns empty or invalid audio array', async () => {
      global.fetch = jest.fn().mockImplementation(async () => {
        return {
          ok: true,
          json: async () => ({ audios: [] }),
        };
      }) as any;

      const provider = new SarvamDamuProvider('test-key');

      await expect(
        provider.synthesizeSpeech({ text: 'Test speech', language: 'en-IN' })
      ).rejects.toThrow(/Sarvam TTS returned an empty audio response/);
    });

    it('handles network connection timeout or failure', async () => {
      global.fetch = jest.fn().mockImplementation(async () => {
        throw new Error('connect ECONNREFUSED 104.18.2.1:443');
      }) as any;

      const provider = new SarvamDamuProvider('test-key');

      await expect(
        provider.synthesizeSpeech({ text: 'Test speech', language: 'en-IN' })
      ).rejects.toThrow(/request failed after 2 retries/);
    });

    it('transcribes genuine M4A audio by sending audio/mp4 MIME type to Sarvam STT', async () => {
      global.fetch = jest.fn().mockImplementation(async (url: string) => {
        if (url.includes('speech-to-text')) {
          return {
            ok: true,
            json: async () => ({
              transcript: 'My fasting blood sugar is 115',
              language_code: 'en-IN',
            }),
          };
        }
        return { ok: false, status: 404 };
      }) as any;

      const provider = new SarvamDamuProvider('test-sarvam-key-12345');

      const result = await provider.transcribeAudio(mockM4a, 'audio/m4a', 'en-IN');
      expect(result.transcript).toBe('My fasting blood sugar is 115');
      expect(result.detectedLanguage).toBe('en-IN');
    });
  });

  describe('4. Groq Provider Guard: Speech Synthesis Prohibition', () => {
    it('strictly refuses speech generation with a 503 error', async () => {
      const groqProvider = new GroqDamuProvider('gsk_test123456789');

      await expect(
        groqProvider.synthesizeSpeech({ text: 'Hello from Groq', language: 'en-IN' })
      ).rejects.toThrow(
        /Groq does not provide text-to-speech/
      );
    });

    it('confirms Groq status reports ttsProvider as none or unavailable', async () => {
      const groqProvider = new GroqDamuProvider('gsk_test123456789');
      const status = await groqProvider.getProviderStatus();

      expect(status.ttsProvider).toBe('none');
      expect(status.models.tts).toBe('none');
    });
  });

  describe('5. Mock Damu Provider', () => {
    it('returns valid base64 audio and mock-sarvam-bulbul provider', async () => {
      const mockProvider = new MockDamuProvider();
      const result = await mockProvider.synthesizeSpeech({ text: 'Hello patient', language: 'en-IN' });

      expect(result.audioBase64).toBeDefined();
      expect(result.audioBase64.length).toBeGreaterThan(0);
      expect(result.provider).toBe('mock-sarvam-bulbul');
      expect(result.speaker).toBe('shubh_enhi_ads');
      expect(result.format).toBe('audio/wav');
    });
  });

  describe('6. Security & Credential Redaction', () => {
    it('redacts Sarvam subscription keys and Groq API keys from strings and logs', () => {
      const errorMsg = 'Sarvam failed with key test-secret-key-abcdef123456 and Groq key gsk_abcdefghijklmnopqrstuvwxyz';
      const redacted = redactApiKey(errorMsg, 'test-secret-key-abcdef123456');

      expect(redacted).not.toContain('gsk_abcdefghijklmnopqrstuvwxyz');
      expect(redacted).not.toContain('test-secret-key-abcdef123456');
      expect(redacted).toContain('[REDACTED_API_KEY]');
    });
  });
});
