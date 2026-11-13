const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

// Import utilities and class from voicePlaybackService
const {
  VoicePlaybackManager,
  isValidAudioBase64,
  sanitizeTextForDeviceSpeech,
} = require('../src/services/voicePlaybackService.ts');

const VALID_MOCK_WAV = Buffer.from(
  'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='
).toString('base64');

test('Voice Playback Fallback Suite: Helper Functions', () => {
  // isValidAudioBase64 validation
  assert.strictEqual(isValidAudioBase64(null), false);
  assert.strictEqual(isValidAudioBase64(''), false);
  assert.strictEqual(isValidAudioBase64('short'), false);
  assert.strictEqual(isValidAudioBase64('invalid!@#$%^&*()_+~`|}{[]:;?><,./'), false);
  assert.strictEqual(isValidAudioBase64(VALID_MOCK_WAV), true);

  // sanitizeTextForDeviceSpeech
  const raw = '### Heading\nYour **fasting blood sugar** of *110 mg/dL* is good. Visit [link](https://test.com). • Walk 30m';
  const clean = sanitizeTextForDeviceSpeech(raw);
  assert.strictEqual(clean.includes('###'), false);
  assert.strictEqual(clean.includes('**'), false);
  assert.strictEqual(clean.includes('*'), false);
  assert.strictEqual(clean.includes('https://'), false);
  assert.strictEqual(clean.includes('•'), false);
  assert.strictEqual(clean.includes('Your fasting blood sugar of 110 mg/dL is good. Visit link. Walk 30m'), true);
});

test('1. Sarvam TTS success: plays pre-synthesized or on-demand audio and sets speaking status', async () => {
  let soundPlayed = false;

  const manager = new VoicePlaybackManager({
    isWeb: false,
    playNativeAudio: async (uri, onFinish, onError) => {
      soundPlayed = true;
      setTimeout(onFinish, 10);
      return { stop: async () => {} };
    },
  });

  const states = [];
  const unsub = manager.subscribe((st) => states.push({ ...st }));

  await manager.speak({
    messageId: 'msg-1',
    text: 'Your glucose is normal.',
    audioBase64: VALID_MOCK_WAV,
    providerName: 'sarvam:bulbul:v4-flash',
  });

  assert.strictEqual(soundPlayed, true);
  const speakingState = states.find((s) => s.status === 'speaking');
  assert.ok(speakingState);
  assert.strictEqual(speakingState.provider, 'sarvam');
  assert.strictEqual(speakingState.statusLabel, 'Speaking with Sarvam');

  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(manager.getState().status, 'idle');
  unsub();
});

test('2. Sarvam authentication failure (HTTP 401/403): automatically falls back to device speech', async () => {
  let deviceSpeechCalled = false;
  let deviceSpeechOptions = null;

  const manager = new VoicePlaybackManager({
    isWeb: false,
    synthesizeOnDemand: async () => {
      const err = new Error('Sarvam Bulbul TTS failed (401): Unauthorized invalid subscription key');
      err.status = 401;
      throw err;
    },
    speakDevice: (text, options) => {
      deviceSpeechCalled = true;
      deviceSpeechOptions = options;
      if (options.onDone) setTimeout(options.onDone, 5);
    },
  });

  const states = [];
  const unsub = manager.subscribe((st) => states.push({ ...st }));

  await manager.speak({
    messageId: 'msg-auth-fail',
    text: 'Please review your care plan.',
    // No audioBase64 triggers on-demand call which fails with 401
  });

  assert.strictEqual(deviceSpeechCalled, true);
  const deviceState = states.find((s) => s.provider === 'device');
  assert.ok(deviceState);
  assert.strictEqual(deviceState.statusLabel, 'Speaking with device voice');

  await new Promise((r) => setTimeout(r, 15));
  unsub();
});

test('3. Sarvam rate limit (HTTP 429): automatically falls back to device speech', async () => {
  let deviceSpeechCalled = false;

  const manager = new VoicePlaybackManager({
    isWeb: false,
    synthesizeOnDemand: async () => {
      const err = new Error('Sarvam Bulbul TTS failed (429): Rate limit exceeded');
      err.status = 429;
      throw err;
    },
    speakDevice: (text, options) => {
      deviceSpeechCalled = true;
      if (options.onDone) setTimeout(options.onDone, 5);
    },
  });

  const states = [];
  const unsub = manager.subscribe((st) => states.push({ ...st }));

  await manager.speak({
    messageId: 'msg-rate-limit',
    text: 'Keep hydrating and log your values.',
    ttsError: 'Rate limit exceeded on Sarvam provider',
  });

  assert.strictEqual(deviceSpeechCalled, true);
  const deviceState = states.find((s) => s.provider === 'device');
  assert.ok(deviceState);
  assert.strictEqual(deviceState.statusLabel, 'Speaking with device voice');
  unsub();
});

test('4. Sarvam server error (HTTP 5xx): automatically falls back to device speech', async () => {
  let deviceSpeechCalled = false;

  const manager = new VoicePlaybackManager({
    isWeb: false,
    speakDevice: (text, options) => {
      deviceSpeechCalled = true;
      if (options.onDone) setTimeout(options.onDone, 5);
    },
  });

  const states = [];
  const unsub = manager.subscribe((st) => states.push({ ...st }));

  await manager.speak({
    messageId: 'msg-server-err',
    text: 'Your afternoon glucose is within target.',
    ttsError: 'Sarvam Bulbul TTS failed (502)',
  });

  assert.strictEqual(deviceSpeechCalled, true);
  const deviceState = states.find((s) => s.provider === 'device');
  assert.ok(deviceState);
  assert.strictEqual(deviceState.statusLabel, 'Speaking with device voice');
  unsub();
});

test('5. Network timeout: automatically falls back to device speech', async () => {
  let deviceSpeechCalled = false;

  const manager = new VoicePlaybackManager({
    isWeb: false,
    synthesizeOnDemand: async () => {
      const err = new Error('Request timed out after 10000ms');
      err.name = 'AbortError';
      throw err;
    },
    speakDevice: (text, options) => {
      deviceSpeechCalled = true;
      if (options.onDone) setTimeout(options.onDone, 5);
    },
  });

  const states = [];
  const unsub = manager.subscribe((st) => states.push({ ...st }));

  await manager.speak({
    messageId: 'msg-timeout',
    text: 'Emergency guidance: call 112 if dizziness persists.',
  });

  assert.strictEqual(deviceSpeechCalled, true);
  const deviceState = states.find((s) => s.provider === 'device');
  assert.ok(deviceState);
  assert.strictEqual(deviceState.statusLabel, 'Speaking with device voice');
  unsub();
});

test('6. Empty or malformed audio response: validates audio and automatically falls back', async () => {
  let deviceSpeechCalled = false;

  const manager = new VoicePlaybackManager({
    isWeb: false,
    speakDevice: (text, options) => {
      deviceSpeechCalled = true;
      if (options.onDone) setTimeout(options.onDone, 5);
    },
  });

  const states = [];
  const unsub = manager.subscribe((st) => states.push({ ...st }));

  await manager.speak({
    messageId: 'msg-malformed',
    text: 'Healthy nutrition prevents glucose spikes.',
    audioBase64: 'corrupted-audio-not-valid-base64',
    ttsError: 'Malformed audio returned',
  });

  assert.strictEqual(deviceSpeechCalled, true);
  const deviceState = states.find((s) => s.provider === 'device');
  assert.ok(deviceState);
  assert.strictEqual(deviceState.statusLabel, 'Speaking with device voice');
  unsub();
});

test('7. Device speech fallback success: configures Indian regional language, rate and pitch', async () => {
  let capturedOptions = null;
  let capturedText = null;

  const manager = new VoicePlaybackManager({
    isWeb: false,
    speakDevice: (text, options) => {
      capturedText = text;
      capturedOptions = options;
      if (options.onDone) setTimeout(options.onDone, 5);
    },
  });

  const states = [];
  const unsub = manager.subscribe((st) => states.push({ ...st }));

  await manager.speak({
    messageId: 'msg-fallback-params',
    text: '**Good morning!** Your fasting sugar is *105 mg/dL*.',
    language: 'hi-IN',
    ttsError: 'Sarvam down',
  });

  assert.strictEqual(capturedText, 'Good morning! Your fasting sugar is 105 mg/dL.');
  assert.strictEqual(capturedOptions.language, 'hi-IN');
  assert.strictEqual(capturedOptions.rate, 0.95);
  assert.strictEqual(capturedOptions.pitch, 1.0);
  const deviceState = states.find((s) => s.provider === 'device');
  assert.ok(deviceState);
  assert.strictEqual(deviceState.statusLabel, 'Speaking with device voice');
  unsub();
});

test('8. Both providers unavailable: preserves text response, transitions to unavailable with retry', async () => {
  const manager = new VoicePlaybackManager({
    isWeb: false,
    speakDevice: (text, options) => {
      if (options.onError) {
        setTimeout(() => options.onError(new Error('Device TTS engine unavailable')), 5);
      }
    },
  });

  await manager.speak({
    messageId: 'msg-both-fail',
    text: 'Fasting glucose target is 70 to 130 mg/dL.',
    ttsError: 'Sarvam service unavailable',
  });

  await new Promise((r) => setTimeout(r, 20));

  const state = manager.getState();
  assert.strictEqual(state.status, 'unavailable');
  assert.strictEqual(state.statusLabel, 'Voice unavailable — text is available');
  assert.strictEqual(state.activeMessageId, 'msg-both-fail');
  assert.ok(state.error);
});

test('9. Stop and cancel behavior: does not fall back when user cancels', async () => {
  let deviceSpeechCalled = false;
  let soundStopped = false;

  const manager = new VoicePlaybackManager({
    isWeb: false,
    playNativeAudio: async (uri, onFinish, onError) => {
      return {
        stop: async () => {
          soundStopped = true;
        },
      };
    },
    speakDevice: () => {
      deviceSpeechCalled = true;
    },
  });

  // Start speaking
  const speakPromise = manager.speak({
    messageId: 'msg-cancel',
    text: 'This is a long clinical explanation.',
    audioBase64: VALID_MOCK_WAV,
  });

  // User immediately presses Stop
  await manager.stop(true);
  await speakPromise;

  assert.strictEqual(soundStopped, true);
  assert.strictEqual(deviceSpeechCalled, false); // Crucial: User cancellation must NOT trigger device fallback!
  assert.strictEqual(manager.getState().status, 'idle');
});

test('10. Preventing duplicate playback: consecutive speak requests abort stale playback', async () => {
  let playedAudios = [];

  const manager = new VoicePlaybackManager({
    isWeb: false,
    playNativeAudio: async (uri) => {
      playedAudios.push(uri);
      return { stop: async () => {} };
    },
  });

  // Launch request 1
  const p1 = manager.speak({
    messageId: 'msg-first',
    text: 'First response',
    audioBase64: VALID_MOCK_WAV,
  });

  // Launch request 2 immediately
  const p2 = manager.speak({
    messageId: 'msg-second',
    text: 'Second response',
    audioBase64: VALID_MOCK_WAV,
  });

  await Promise.all([p1, p2]);

  assert.strictEqual(manager.getState().activeMessageId, 'msg-second');
});
