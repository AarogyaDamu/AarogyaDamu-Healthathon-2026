import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { env } from '../config/env';

export function initStorage(): void {
  if (!fs.existsSync(env.STORAGE_DIR)) {
    fs.mkdirSync(env.STORAGE_DIR, { recursive: true });
  }
}

export async function savePrivateFile(
  userId: string,
  originalFilename: string,
  buffer: Buffer
): Promise<{ storagePath: string; fileSizeBytes: number }> {
  initStorage();

  const userDir = path.join(env.STORAGE_DIR, userId);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  const safeHash = crypto.randomBytes(16).toString('hex');
  const safeFilename = `${safeHash}_${path.basename(originalFilename).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const targetPath = path.join(userDir, safeFilename);

  await fs.promises.writeFile(targetPath, buffer);

  return {
    storagePath: targetPath,
    fileSizeBytes: buffer.length,
  };
}

export async function deletePrivateFile(storagePath: string): Promise<void> {
  if (storagePath && fs.existsSync(storagePath)) {
    await fs.promises.unlink(storagePath).catch(() => null);
  }
}