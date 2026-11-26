const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const webSrc = (rel) => fs.readFileSync(path.join(__dirname, '..', 'src', rel), 'utf8');
const mobileFile = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', 'mobile', rel), 'utf8');

test('web and mobile OCR components remove fake fallbacks and Google Cloud Vision copy', () => {
  const reviewModal = webSrc(path.join('components', 'MedicalReportReviewModal.tsx'));
  const sourcePreview = webSrc(path.join('components', 'MedicalReportSourcePreview.tsx'));
  const doctorDash = webSrc(path.join('pages', 'DoctorDashboard.tsx'));
  const webHealth = webSrc(path.join('pages', 'Health.tsx'));
  const mobileHealth = mobileFile(path.join('app', '(tabs)', 'health.tsx'));

  for (const content of [reviewModal, sourcePreview, doctorDash, webHealth, mobileHealth]) {
    assert.doesNotMatch(content, /Local Resilient Fallback Parser|Local Fallback Parser|Google Cloud Vision/i);
  }

  // Source preview never fabricates static glucose/HbA1c numbers when extracted labs are absent
  assert.doesNotMatch(sourcePreview, /118 mg\/dL|142 mg\/dL|Dr\. V\. S\. Joshi|Dr\. Rupam Kulkarni/);
  assert.match(sourcePreview, /labEntries\.length === 0/);

  // Both Web and Mobile route to temporary in-memory Sarvam OCR when durable storage is off
  assert.match(doctorDash, /\/ocr\/extract-temporary/);
  assert.match(doctorDash, /saveToPatientRecord/);
  assert.match(doctorDash, /'Upload report'/);
  assert.doesNotMatch(doctorDash, /Scan Report \(Temp Sarvam OCR\)/);
  assert.match(doctorDash, /rawOcrText/);
  assert.match(doctorDash, /Temporary Sarvam OCR Result — File Not Stored/);
  assert.match(webHealth, /\/ocr\/extract-temporary/);
  assert.match(webHealth, /rawOcrText/);
  assert.match(webHealth, /Temporary Sarvam OCR Result — Not Saved to Storage/);
  assert.match(mobileHealth, /\/ocr\/extract-temporary/);
  assert.match(mobileHealth, /rawOcrText/);
  assert.match(mobileHealth, /Temporary Sarvam OCR Result/);
});

test('mobile client and web client exclude forgot-password and doctor self-registration flows', () => {
  const mobileClient = mobileFile(path.join('src', 'api', 'client.ts'));
  assert.doesNotMatch(mobileClient, /forgot-password|reset-password/);
});
