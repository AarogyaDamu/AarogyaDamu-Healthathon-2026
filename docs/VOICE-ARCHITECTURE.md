# AarogyaDamu — Voice Architecture & Sarvam AI Integration

**Standard:** Sarvam AI Saarika v2 (STT) + Sarvam AI Bulbul v4 Flash (TTS) + Groq Llama 3.3 (LLM)
**Security & Privacy:** Session-Only Zero Audio Retention (`SESSION_ONLY_ZERO_RETENTION`)
**Target Audience:** Patients and Caregivers across Indian Languages

---

## 1. Overview & Architecture Pipeline

AarogyaDamu provides a culturally resonant, clinically guarded voice companion named **Damu** to assist diabetes patients with lifestyle, diet, glucose log interpretations, and care plan understanding.

```
+---------------------------------------------------------------------------------------------------+
|                                          CLIENT TIER                                              |
|                                                                                                   |
|  [Mobile App (Expo / React Native)]                 [Doctor & Patient WebApp (Vite / React)]     |
|   - Audio.Recording (AAC in MP4 container)           - MediaRecorder API (WebM / WAV)            |
|   - expo-av Audio.Sound playback                     - HTML5 Audio playback                       |
+-------------------------------------------------+-------------------------------------------------+
                                                  |
                                                  | Multipart Audio Upload or JSON Text
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                      BACKEND GATEWAY (API)                                        |
|                                                                                                   |
|  1. Magic Byte Inspection (detectAndNormalizeAudio)                                               |
|     - Inspects ISO MP4/M4A ('ftyp'), WAV ('RIFF'), WebM ('EBML'), MP3 ('ID3'), AAC ('ADTS')      |
|     - Normalizes 'audio/m4a' -> 'audio/mp4' (prevents Sarvam 400 rejection)                       |
|     - Rejects empty/corrupt payloads with HTTP 400                                                |
|                                                                                                   |
|  2. Speech-to-Text Transcription (STT)                                                           |
|     - Provider: Sarvam AI Saarika v2 (https://api.sarvam.ai/speech-to-text)                       |
|     - BCP-47 Language mapping (en-IN, hi-IN, mr-IN, etc.)                                         |
|                                                                                                   |
|  3. Clinical Guardrail & Agent Execution Engine                                                    |
|     - Prohibited intent check (blocks self-prescribing / dose adjustments)                         |
|     - Emergency triage detector (hypoglycemia, severe symptoms -> 112 / 108 escalation)           |
|     - Contextual grounding via verified EHR / LOINC observations                                  |
|     - LLM Completion via Groq Llama 3.3 70B Versatile                                             |
|                                                                                                   |
|  4. Text Sanitization (sanitizeTextForTts)                                                        |
|     - Strips markdown formatting, links, URLs, and limits to 500 characters                       |
|                                                                                                   |
|  5. Text-to-Speech Synthesis (TTS)                                                                |
|     - Provider: Sarvam AI Bulbul (POST https://api.sarvam.ai/text-to-speech)                     |
|     - Model: bulbul:v4-flash (configured via SARVAM_TTS_MODEL)                                   |
|     - Voice: shubh_enhi_ads (configured via SARVAM_TTS_SPEAKER)                                   |
|     - Output: 22.05 kHz 16-bit Mono WAV in Base64                                                 |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Sarvam STT Audio MIME Fix

### The Problem
Mobile clients recording via Expo Audio record AAC inside an ISO MP4 container (`.m4a`). When sending `Content-Type: audio/m4a`, Sarvam's API responded with:
```text
Sarvam STT transcription failed (400): Invalid file type: audio/m4a
```

### The Fix
The function `detectAndNormalizeAudio()` in [`services/api/src/services/damuVoiceService.ts`](file:///services/api/src/services/damuVoiceService.ts):
1. Reads the binary header (magic bytes `0x66 0x74 0x79 0x70` / `ftyp`).
2. Confirms genuine MP4/M4A container bytes.
3. Automatically maps MIME to `audio/mp4` and sets filename to `voice_input_<timestamp>.mp4`.
4. Leaves raw audio bytes completely untouched (no transcoding overhead or quality loss).
5. Also supports genuine WAV (`RIFF`), WebM (`0x1A 0x45 0xDF 0xA3`), MP3 (`ID3`), and AAC (`0xFFF1`).

---

## 3. Sarvam Bulbul TTS Voice Configuration

Damu uses Sarvam Bulbul as its official, culturally authentic Indian voice.

### Configuration Parameters
| Parameter | Default Value | Description |
| :--- | :--- | :--- |
| `SARVAM_API_KEY` | *(Secret)* | Sarvam AI API subscription key (`api-subscription-key` header). |
| `SARVAM_TTS_MODEL` | `bulbul:v4-flash` | Ultra-fast low-latency speech synthesis model. |
| `SARVAM_TTS_SPEAKER` | `shubh_enhi_ads` | Natural, warm Indian speaker ID. |
| `SARVAM_STT_MODEL` | `saarika:v2` | High-accuracy multilingual Indian speech recognition model. |
| `ALLOW_ROBOTIC_VOICE_FALLBACK` | `false` | When false, prohibits silent fallback to browser/device speech synthesis. |

### Supported Languages & Speaker Mapping
| Language Code | Language Name | Primary Speaker |
| :--- | :--- | :--- |
| `en-IN` | English (India) | `shubh_enhi_ads` |
| `hi-IN` | Hindi | `shubh_enhi_ads` |
| `mr-IN` | Marathi | `shubh_enhi_ads` |
| `bn-IN` | Bengali | `shubh_enhi_ads` |
| `ta-IN` | Tamil | `shubh_enhi_ads` |
| `te-IN` | Telugu | `shubh_enhi_ads` |
| `kn-IN` | Kannada | `shubh_enhi_ads` |
| `gu-IN` | Gujarati | `shubh_enhi_ads` |
| `pa-IN` | Punjabi | `shubh_enhi_ads` |
| `ml-IN` | Malayalam | `shubh_enhi_ads` |
| `od-IN` | Odia | `shubh_enhi_ads` |

---

## 4. Groq Role Boundary

- **Groq Responsibilities:** Groq is strictly utilized for **LLM Chat Completion** (`llama-3.3-70b-versatile`) and as an STT fallback (`whisper-large-v3-turbo`).
- **Speech Generation Prohibition:** Groq does **not** generate speech. Any attempt to invoke `synthesizeSpeech` on `GroqDamuProvider` throws an explicit HTTP 503 error, ensuring robotic or non-Sarvam voices are never produced by Groq.

---

## 5. Client Playback Architecture & Lifecycle

### Mobile (`apps/mobile/app/(tabs)/damu.tsx`)
- Audio is delivered as a base64-encoded WAV in the API response (`audioBase64`).
- Played using `Audio.Sound.createAsync({ uri: 'data:audio/wav;base64,...' })`.
- **Single-Flight Guard:** When new speech starts, any active sound is automatically stopped and unloaded (`sound.unloadAsync()`).
- **Explicit Failure Alert:** If TTS synthesis fails, an actionable message is displayed with a manual Retry button. Silent fallback to robotic `expo-speech` is disabled.

### Web (`apps/web/src/pages/AskDamu.tsx`)
- Managed using HTML5 `HTMLAudioElement`.
- Message bubbles include a dedicated toggle: *"Play Spoken Voice (Sarvam Bulbul)"* and *"Stop Spoken Voice"*.
- Replays can be initiated at any time without re-running the LLM completion.

---

## 6. Automated Testing & Verification

A dedicated automated test suite verifies all voice operations:
```bash
# Run voice integration test suite
$env:NODE_ENV="test"; $env:AAROGYADAMU_TEST_TOKEN="valid-token"; $env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/aarogyadamu_test"; cd services/api; npx jest --config jest.config.js src/__tests__/sarvam_voice_integration.test.ts
```

### Coverage (19/19 Passing Tests):
1. Empty/zero-byte buffer rejection.
2. M4A/MP4 container magic byte detection and normalization to `audio/mp4`.
3. WAV, WebM, MP3, and AAC container preservation.
4. Markdown stripping and 500-char sanitization for Bulbul TTS.
5. Sarvam Bulbul TTS invocation with `bulbul:v4-flash` and `shubh_enhi_ads`.
6. Multilingual language code routing (`en-IN`, `hi-IN`, `mr-IN`).
7. Failure handling without silent robotic fallback.
8. Groq TTS strict prohibition (HTTP 503).
9. Mock provider fallback for offline testing.
10. API credential redaction in logs and error messages.
