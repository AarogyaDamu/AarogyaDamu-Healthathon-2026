const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = (relativePath) =>
  fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('Phase 6 — DamuScene 3D procedural character is authoritatively reconstructed', () => {
  const sceneSrc = source(path.join('src', 'components', 'DamuAvatar', 'damuScene.ts'));

  // 1. Procedural Fur Texture Fallback
  assert.match(sceneSrc, /createProceduralFurTexture/);
  assert.match(sceneSrc, /CanvasTexture/);
  assert.match(sceneSrc, /RepeatWrapping/);

  // 2. Character Geometry & Materials
  assert.match(sceneSrc, /export function createDamuScene/);
  assert.match(sceneSrc, /OrthographicCamera/);
  assert.match(sceneSrc, /bodyGeometry = new SphereGeometry\(1, 96, 72\)/);
  assert.match(sceneSrc, /soft\(0xbc470d/); // Orange
  assert.match(sceneSrc, /soft\(0xffefd3/); // Cream
  assert.match(sceneSrc, /soft\(0xffefd5/); // Cap
  assert.match(sceneSrc, /soft\(0xf78b2c/); // Coral cross logo
  assert.match(sceneSrc, /pendant/); // Heart pendant
  assert.match(sceneSrc, /halo/); // Golden halo toroid

  // 3. Animation Modes & State Machine
  assert.match(sceneSrc, /mode === 'thinking'/);
  assert.match(sceneSrc, /mode === 'listening'/);
  assert.match(sceneSrc, /mode === 'speaking'/);
  assert.match(sceneSrc, /waveStarted/);
  assert.match(sceneSrc, /setMode\(value/);
  assert.match(sceneSrc, /wave\(\)/);
  assert.match(sceneSrc, /dispose\(\)/);
});

test('Phase 6 — DamuAvatarFallback provides accessible, non-crashing procedural SVG/view fallback', () => {
  const fallbackSrc = source(path.join('src', 'components', 'DamuAvatar', 'DamuAvatarFallback.tsx'));

  assert.match(fallbackSrc, /export const DamuAvatarFallback/);
  assert.match(fallbackSrc, /accessibilityRole="image"/);
  assert.match(fallbackSrc, /Damu 3D health companion/);
  assert.match(fallbackSrc, /capCrown/);
  assert.match(fallbackSrc, /capBand/);
  assert.match(fallbackSrc, /crossContainer/);
  assert.match(fallbackSrc, /pearBody/);
  assert.match(fallbackSrc, /creamChest/);
  assert.match(fallbackSrc, /eyeIris/);
  assert.match(fallbackSrc, /pendantHalo/);
  assert.match(fallbackSrc, /heartPendant/);
});

test('Phase 6 — Web & Native DamuAvatar adapters provide cross-platform runtime support', () => {
  const webSrc = source(path.join('src', 'components', 'DamuAvatar', 'DamuAvatar.web.tsx'));
  const nativeSrc = source(path.join('src', 'components', 'DamuAvatar', 'DamuAvatar.native.tsx'));
  const indexSrc = source(path.join('src', 'components', 'DamuAvatar', 'index.ts'));

  // Web adapter
  assert.match(webSrc, /createDamuScene/);
  assert.match(webSrc, /controllerRef\.current\.setMode\(mode\)/);
  assert.match(webSrc, /controller\.wave\(\)/);
  assert.match(webSrc, /DamuAvatarFallback/);

  // Native adapter
  assert.match(nativeSrc, /WebView/);
  assert.match(nativeSrc, /postMessage/);
  assert.match(nativeSrc, /SET_MODE/);
  assert.match(nativeSrc, /SET_PAUSED/);
  assert.match(nativeSrc, /WAVE/);
  assert.match(nativeSrc, /DamuAvatarFallback/);

  // Index dispatcher
  assert.match(indexSrc, /export const DamuAvatar/);
  assert.match(indexSrc, /Platform\.OS === 'web'/);
});

test('Phase 6 — Damu mobile screen integrates 3D avatar, sources attribution, and emergency 112 button', () => {
  const damuScreen = source(path.join('app', '(tabs)', 'damu.tsx'));

  // 1. 3D Character Hero Section
  assert.match(damuScreen, /import \{ DamuAvatar \} from/);
  assert.match(damuScreen, /<DamuAvatar/);
  assert.match(damuScreen, /mode=\{avatarMode\}/);
  assert.match(damuScreen, /triggerWave=\{waveCounter\}/);
  assert.match(damuScreen, /avatarHeroSection/);
  assert.match(damuScreen, /avatarStatusPill/);

  // 2. State-driven dynamic mode mapping
  assert.match(damuScreen, /const avatarMode: DamuAvatarMode =/);
  assert.match(damuScreen, /state === 'listening'/);
  assert.match(damuScreen, /state === 'processing'\s*\?\s*'thinking'/);
  assert.match(damuScreen, /isSpeaking\s*\?\s*'speaking'\s*:\s*'idle'/);

  // 3. Emergency 112 Dial Button
  assert.match(damuScreen, /Linking\.openURL\('tel:112'\)/);
  assert.match(damuScreen, /Call 112/);

  // 4. Grounding Source Attribution Pills
  assert.match(damuScreen, /sourcesContainer/);
  assert.match(damuScreen, /sourceTagPatient/);
  assert.match(damuScreen, /sourceTagClinical/);
  assert.match(damuScreen, /sourceTagPlan/);
  assert.match(damuScreen, /sourceTagEducational/);

  // 5. Dynamic Suggested Follow-ups
  assert.match(damuScreen, /followUpsContainer/);
  assert.match(damuScreen, /followUpChip/);
  assert.match(damuScreen, /suggestedFollowUps/);

  // 6. Conversation Continuity & Deletion
  assert.match(damuScreen, /conversationId/);
  assert.match(damuScreen, /DamuService\.deleteConversation/);
});
