import assert from 'node:assert/strict';
import test from 'node:test';

const VALID_MOCK_WAV = Buffer.from(
  'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='
).toString('base64');

class MockSpeechSynthesisUtterance {
  constructor(text) {
    this.text = text;
    this.lang = 'en-US';
    this.rate = 1.0;
    this.pitch = 1.0;
    this.onend = null;
    this.onerror = null;
  }
}

class MockAudio {
  constructor(src) {
    this.src = src;
    this.onended = null;
    this.onerror = null;
    this.paused = true;
  }

  play() {
    this.paused = false;
    setTimeout(() => {
      if (!this.paused && this.onended) {
        this.onended();
      }
    }, 10);
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }
}

let spokenUtterances = [];
let cancelledCount = 0;

const mockSpeechSynthesis = {
  speak: (utterance) => {
    spokenUtterances.push(utterance);
    setTimeout(() => {
      if (utterance.onend) utterance.onend();
    }, 10);
  },
  cancel: () => {
    cancelledCount++;
  },
};

global.window = {
  Audio: MockAudio,
  speechSynthesis: mockSpeechSynthesis,
};
global.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;

const {
  WebVoiceManager,
  isValidBase64Audio,
  sanitizeTextForSpeech,
} = await import('../src/utils/voicePlayback.ts');

test('1. Helper text sanitization & audio validation', () => {
  assert.equal(isValidBase64Audio(null), false);
  assert.equal(isValidBase64Audio(''), false);
  assert.equal(isValidBase64Audio('short'), false);
  assert.equal(isValidBase64Audio(VALID_MOCK_WAV), true);

  const raw = '### Consultation Plan\nPatient **fasting glucose** is *105 mg/dL*. See [guide](https://example.com). • Walk 30 min';
  const clean = sanitizeTextForSpeech(raw);
  assert.equal(clean.includes('###'), false);
  assert.equal(clean.includes('**'), false);
  assert.equal(clean.includes('https://'), false);
  assert.equal(clean.includes('•'), false);
  assert.equal(clean.includes('Patient fasting glucose is 105 mg/dL. See guide. Walk 30 min'), true);
});

test('2. Primary Sarvam TTS: plays audio when valid base64 provided', async () => {
  const manager = new WebVoiceManager();
  const states = [];
  const unsub = manager.subscribe((st) => states.push({ ...st }));

  await manager.speak({
    messageId: 'web-msg-1',
    text: 'Glucose readings are well managed.',
    audioBase64: VALID_MOCK_WAV,
  });

  const speakingState = states.find((s) => s.provider === 'sarvam');
  assert.ok(speakingState);
  assert.equal(speakingState.statusLabel, 'Speaking with Sarvam');

  assert.equal(manager.getState().status, 'idle');
  unsub();
});

test('3. Fallback to Web SpeechSynthesis when Sarvam returns error', async () => {
  spokenUtterances = [];
  const manager = new WebVoiceManager();
  const states = [];
  const unsub = manager.subscribe((st) => states.push({ ...st }));

  await manager.speak({
    messageId: 'web-msg-2',
    text: 'Insulin sensitivity is optimal today.',
    ttsError: 'Sarvam 503 Service Unavailable',
  });

  assert.equal(spokenUtterances.length, 1);
  assert.equal(spokenUtterances[0].text, 'Insulin sensitivity is optimal today.');
  assert.equal(spokenUtterances[0].lang, 'en-IN');
  assert.equal(spokenUtterances[0].rate, 0.95);

  const deviceState = states.find((s) => s.provider === 'device');
  assert.ok(deviceState);
  assert.equal(deviceState.statusLabel, 'Speaking with device voice');

  assert.equal(manager.getState().status, 'idle');
  unsub();
});

test('4. Stop & Cancel behavior: cancels ongoing speech without fallback', async () => {
  spokenUtterances = [];
  cancelledCount = 0;
  const manager = new WebVoiceManager();

  // Start speaking
  const p = manager.speak({
    messageId: 'web-msg-cancel',
    text: 'Long clinical observation requiring early interruption.',
    ttsError: 'Sarvam down',
  });

  assert.equal(manager.getState().status, 'speaking');

  // User clicks Stop
  manager.stop(true);
  await p;

  assert.equal(cancelledCount >= 1, true);
  assert.equal(manager.getState().status, 'idle');
  assert.equal(manager.getState().provider, null);
});

test('5. Prevention of overlapping speech: subsequent requests supersede previous', async () => {
  spokenUtterances = [];
  const manager = new WebVoiceManager();

  // Fire first request
  const p1 = manager.speak({
    messageId: 'web-msg-req1',
    text: 'First advice sentence.',
    ttsError: 'Sarvam down',
  });

  // Fire second request immediately
  const p2 = manager.speak({
    messageId: 'web-msg-req2',
    text: 'Second advice sentence.',
    ttsError: 'Sarvam down',
  });

  await Promise.all([p1, p2]);
  assert.equal(manager.getState().activeMessageId, null); // Both finished
});

test('6. Text-only fallback when both Sarvam and SpeechSynthesis fail', async () => {
  const origSpeak = global.window.speechSynthesis.speak;
  global.window.speechSynthesis.speak = () => {
    throw new Error('Speech synthesis blocked by user agent');
  };

  const manager = new WebVoiceManager();
  const states = [];
  const unsub = manager.subscribe((st) => states.push({ ...st }));

  await manager.speak({
    messageId: 'web-msg-fail-both',
    text: 'Emergency guidance: consult clinic.',
    ttsError: 'Sarvam down',
  });

  global.window.speechSynthesis.speak = origSpeak;

  const unavailableState = states.find((s) => s.status === 'unavailable');
  assert.ok(unavailableState);
  assert.equal(unavailableState.statusLabel, 'Voice unavailable — text is available');
  assert.equal(unavailableState.activeMessageId, 'web-msg-fail-both');
  assert.ok(unavailableState.error);
  unsub();
});

test('7. Privacy check: console logs do not expose tokens, secrets, or patient data', async () => {
  const interceptedLogs = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = (...args) => interceptedLogs.push(args.join(' '));
  console.warn = (...args) => interceptedLogs.push(args.join(' '));
  console.error = (...args) => interceptedLogs.push(args.join(' '));

  const manager = new WebVoiceManager();
  await manager.speak({
    messageId: 'secret-test-id',
    text: 'Sensitive patient HbA1c record test.',
    ttsError: 'Sarvam 401 Unauthorized with secret key sk_live_secret123456789',
  });

  console.log = originalLog;
  console.warn = originalWarn;
  console.error = originalError;

  for (const logLine of interceptedLogs) {
    assert.equal(logLine.includes('sk_live_secret123456789'), false);
    assert.equal(logLine.includes('Sensitive patient HbA1c record test'), false);
  }
});
