import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Storage } from '@google-cloud/storage';
import { env } from '../config/env';

let cachedStorageClient: Storage | null = null;

export class PrivateStorageUnavailableError extends Error {
  readonly status = 503;
  readonly code = 'DURABLE_STORAGE_UNAVAILABLE';

  constructor(message = 'Persistent medical document storage is unavailable because no durable private storage bucket is configured.') {
    super(message);
    this.name = 'PrivateStorageUnavailableError';
  }
}

/**
 * Builds @google-cloud/* client options supporting both mounted key files
 * (GOOGLE_APPLICATION_CREDENTIALS / ADC) and inline JSON secrets (Render env vars).
 */
export function getGoogleCloudClientOptions(): { projectId?: string; credentials?: Record<string, any> } {
  const options: { projectId?: string; credentials?: Record<string, any> } = {};
  if (env.GOOGLE_CLOUD_PROJECT_ID) {
    options.projectId = env.GOOGLE_CLOUD_PROJECT_ID;
  }
  if (env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    options.credentials = JSON.parse(env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  }
  return options;
}

export function isCloudStorageEnabled(): boolean {
  return Boolean(env.GOOGLE_CLOUD_STORAGE_BUCKET);
}

/**
 * In deployed environments (NODE_ENV=production, including Render Free staging),
 * local ephemeral filesystems must NEVER be used as permanent document storage.
 */
export function isDurableStorageAvailable(): boolean {
  if (env.NODE_ENV === 'production' || process.env.NODE_ENV === 'production') {
    return isCloudStorageEnabled();
  }
  return true;
}

function getStorageClient(): Storage {
  if (!cachedStorageClient) {
    cachedStorageClient = new Storage(getGoogleCloudClientOptions());
  }
  return cachedStorageClient;
}

function parseGcsStorageUri(storagePath: string): { bucket: string; objectKey: string } {
  const prefix = 'gs://';
  if (!storagePath.startsWith(prefix)) {
    throw new Error('Security Error: Invalid cloud storage URI.');
  }
  const rest = storagePath.slice(prefix.length);
  const slashIndex = rest.indexOf('/');
  if (slashIndex <= 0 || slashIndex === rest.length - 1) {
    throw new Error('Security Error: Incomplete cloud storage URI.');
  }
  const bucket = rest.slice(0, slashIndex);
  const objectKey = rest.slice(slashIndex + 1);
  if (
    (env.GOOGLE_CLOUD_STORAGE_BUCKET && bucket !== env.GOOGLE_CLOUD_STORAGE_BUCKET) ||
    !objectKey.startsWith('private/') ||
    objectKey.includes('..') ||
    objectKey.includes('\\')
  ) {
    throw new Error('Security Error: Access denied outside authorized private bucket boundary.');
  }
  return { bucket, objectKey };
}

function resolveSafeExtension(originalFilename: string, detectedMime?: string): string {
  if (detectedMime === 'application/pdf') return '.pdf';
  if (detectedMime === 'image/png') return '.png';
  if (detectedMime === 'image/jpeg') return '.jpg';
  if (detectedMime === 'image/webp') return '.webp';

  const rawExt = path.extname(originalFilename).toLowerCase();
  if (['.pdf', '.png', '.jpg', '.jpeg', '.webp'].includes(rawExt)) {
    return rawExt;
  }
  return '.bin';
}

export function initStorage(): void {
  if (!fs.existsSync(env.STORAGE_DIR)) {
    fs.mkdirSync(env.STORAGE_DIR, { recursive: true });
  }
}

/**
 * Validates buffer against file signature magic bytes to prevent spoofed uploads.
 */
export function validateFileMagicBytes(buffer: Buffer): { isValid: boolean; detectedMime?: string } {
  if (!buffer || buffer.length < 4) {
    return { isValid: false };
  }

  // PDF signature: %PDF- (0x25 0x50 0x44 0x46)
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return { isValid: true, detectedMime: 'application/pdf' };
  }

  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4E &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0D &&
    buffer[5] === 0x0A &&
    buffer[6] === 0x1A &&
    buffer[7] === 0x0A
  ) {
    return { isValid: true, detectedMime: 'image/png' };
  }

  // JPEG signature: FF D8 FF
  if (
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { isValid: true, detectedMime: 'image/jpeg' };
  }

  // WebP signature: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { isValid: true, detectedMime: 'image/webp' };
  }

  return { isValid: false };
}

/**
 * Prevents directory traversal attacks by ensuring the path resides strictly within STORAGE_DIR.
 */
export function assertSafeStoragePath(filePath: string): string {
  const resolvedBase = path.resolve(env.STORAGE_DIR);
  const resolvedTarget = path.resolve(filePath);
  if (!resolvedTarget.startsWith(resolvedBase + path.sep) && resolvedTarget !== resolvedBase) {
    throw new Error('Security Error: Path traversal attempt outside storage boundary');
  }
  return resolvedTarget;
}

function resolveSafeLocalDocumentPath(storagePath: string): string | null {
  const baseDir = path.resolve(env.STORAGE_DIR);
  const candidates: string[] = [];

  if (path.isAbsolute(storagePath)) {
    candidates.push(path.resolve(storagePath));
  } else {
    // Support legacy relative paths stored during seed/demo runs without escaping STORAGE_DIR
    const normalizedRel = storagePath.replace(/^[/\\]+/, '');
    const strippedUploadsPrefix = normalizedRel.replace(/^uploads[/\\]private[/\\]/i, '');
    candidates.push(path.resolve(baseDir, strippedUploadsPrefix));
    candidates.push(path.resolve(process.cwd(), normalizedRel));
    candidates.push(path.resolve(process.cwd(), 'services/api', normalizedRel));
  }
  candidates.push(path.resolve(baseDir, path.basename(storagePath)));

  for (const candidate of candidates) {
    if (
      (candidate.startsWith(baseDir + path.sep) || candidate === baseDir) &&
      fs.existsSync(candidate)
    ) {
      return candidate;
    }
  }
  return null;
}

export async function savePrivateFile(
  userId: string,
  originalFilename: string,
  buffer: Buffer,
  detectedMime?: string
): Promise<{ storagePath: string; fileSizeBytes: number }> {
  const sanitizedUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!sanitizedUserId) {
    throw new Error('Security Error: Invalid storage owner identifier.');
  }

  const safeExt = resolveSafeExtension(originalFilename, detectedMime);
  const safeFilename = `${crypto.randomUUID()}${safeExt}`;

  if (env.GOOGLE_CLOUD_STORAGE_BUCKET) {
    const bucketName = env.GOOGLE_CLOUD_STORAGE_BUCKET;
    const objectKey = `private/${sanitizedUserId}/${safeFilename}`;
    const file = getStorageClient().bucket(bucketName).file(objectKey);
    await file.save(buffer, {
      resumable: false,
      contentType: detectedMime || 'application/octet-stream',
      metadata: {
        cacheControl: 'private, no-store',
      },
    });
    return {
      storagePath: `gs://${bucketName}/${objectKey}`,
      fileSizeBytes: buffer.length,
    };
  }

  if (!isDurableStorageAvailable()) {
    throw new PrivateStorageUnavailableError(
      'Persistent medical document upload is disabled in this hosted demo because durable cloud storage is not configured. Use temporary Sarvam OCR extraction instead.',
    );
  }

  initStorage();
  const userDir = path.join(env.STORAGE_DIR, sanitizedUserId);
  assertSafeStoragePath(userDir);

  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  const targetPath = path.join(userDir, safeFilename);
  const validatedPath = assertSafeStoragePath(targetPath);

  await fs.promises.writeFile(validatedPath, buffer);

  return {
    storagePath: validatedPath,
    fileSizeBytes: buffer.length,
  };
}

export async function readPrivateFile(
  storagePath?: string | null
): Promise<{ buffer: Buffer; ext: string } | null> {
  if (!storagePath) return null;

  if (storagePath.startsWith('gs://')) {
    const { bucket, objectKey } = parseGcsStorageUri(storagePath);
    const file = getStorageClient().bucket(bucket).file(objectKey);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [buffer] = await file.download();
    return {
      buffer,
      ext: path.extname(objectKey) || '.pdf',
    };
  }

  const resolvedPath = resolveSafeLocalDocumentPath(storagePath);
  if (!resolvedPath) return null;
  const buffer = await fs.promises.readFile(resolvedPath);
  return {
    buffer,
    ext: path.extname(resolvedPath) || '.pdf',
  };
}

export async function deletePrivateFile(storagePath: string): Promise<void> {
  if (!storagePath) return;

  if (storagePath.startsWith('gs://')) {
    const { bucket, objectKey } = parseGcsStorageUri(storagePath);
    await getStorageClient()
      .bucket(bucket)
      .file(objectKey)
      .delete({ ignoreNotFound: true });
    return;
  }

  const validatedPath = assertSafeStoragePath(storagePath);
  if (fs.existsSync(validatedPath)) {
    await fs.promises.unlink(validatedPath).catch(() => null);
  }
}

/**
 * Generates an ISO 32000-1 compliant synthetic PDF buffer with exact xref table,
 * startxref byte offset, and %%EOF marker.
 */
export function generateValidSyntheticPdfBuffer(
  reportTitle: string = 'Diagnostic Lab Report',
  patientName: string = 'Ramesh Deshmukh',
  lines: string[] = [
    'HbA1c: 6.3% (Normal <5.7%, Diabetes Target <7.0%)',
    'Fasting Blood Sugar: 118 mg/dL (Target 80-130 mg/dL)',
    'Post-Prandial Glucose: 142 mg/dL (Target <180 mg/dL)',
  ]
): Buffer {
  const contentStream = [
    'BT',
    '/F1 14 Tf',
    '50 750 Td',
    `(${reportTitle.replace(/[()\\]/g, '')}) Tj`,
    '/F1 10 Tf',
    '0 -25 Td',
    `(Patient: ${patientName.replace(/[()\\]/g, '')}) Tj`,
    '0 -15 Td',
    `(Facility: Metropolis Healthcare Pune) Tj`,
    '0 -20 Td',
    ...lines.map((l) => `(${l.replace(/[()\\]/g, '')}) Tj\n0 -15 Td`),
    'ET',
  ].join('\n');

  const streamBytes = Buffer.from(contentStream, 'utf8');
  const streamLength = streamBytes.length;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];

  offsets.push(Buffer.byteLength(pdf, 'utf8'));
  pdf += '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';

  offsets.push(Buffer.byteLength(pdf, 'utf8'));
  pdf += '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';

  offsets.push(Buffer.byteLength(pdf, 'utf8'));
  pdf += '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n';

  offsets.push(Buffer.byteLength(pdf, 'utf8'));
  pdf += `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${contentStream}\nendstream\nendobj\n`;

  offsets.push(Buffer.byteLength(pdf, 'utf8'));
  pdf += '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += 'xref\n0 6\n0000000000 65535 f \n';
  for (const offset of offsets) {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf += 'trailer\n<< /Size 6 /Root 1 0 R >>\n';
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'utf8');
}
