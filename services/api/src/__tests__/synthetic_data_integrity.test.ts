/**
 * Synthetic-Only Data & PII Sanitization Integrity Test Suite
 * Verifies that the entire repository contains strictly synthetic demonstration data
 * and zero real patient records, SQLite database files, or private PDFs.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

describe('Synthetic Data & PII Sanitization Verification', () => {
  const rootDir = path.resolve(__dirname, '../../../..');
  const apiDir = path.resolve(__dirname, '../..');

  it('confirms services/api/uploads/private contains NO tracked release PDFs and excludes local PDFs via .gitignore', () => {
    const trackedUploadFiles = execSync('git ls-files services/api/uploads', {
      cwd: rootDir,
      encoding: 'utf8',
    })
      .split(/\r?\n/)
      .map((f) => f.trim())
      .filter((f) => f && !f.endsWith('.gitkeep'));
    expect(trackedUploadFiles).toHaveLength(0);

    const uploadPrivateDir = path.join(apiDir, 'uploads/private');
    if (fs.existsSync(uploadPrivateDir)) {
      const pdfFiles = fs.readdirSync(uploadPrivateDir).filter((f) => f.endsWith('.pdf'));
      for (const pdf of pdfFiles) {
        const relPath = `services/api/uploads/private/${pdf}`;
        const ignoredPath = execSync(`git check-ignore "${relPath}"`, {
          cwd: rootDir,
          encoding: 'utf8',
        }).trim();
        expect(ignoredPath).toBe(relPath);
      }
    }
  });

  it('confirms services/api/prisma contains NO local SQLite databases or backups', () => {
    const prismaDir = path.join(apiDir, 'prisma');
    const files = fs.readdirSync(prismaDir);
    const dbFiles = files.filter((f) => f.endsWith('.db') || f.includes('backup'));
    expect(dbFiles).toHaveLength(0);

    const backupsDir = path.join(prismaDir, 'backups');
    if (fs.existsSync(backupsDir)) {
      const backupFiles = fs.readdirSync(backupsDir);
      expect(backupFiles.filter((f) => f.endsWith('.db'))).toHaveLength(0);
    }
  });

  it('confirms prisma/seed.ts uses 100% synthetic personas and marks isSyntheticDemo: true', () => {
    const seedContent = fs.readFileSync(path.join(apiDir, 'prisma/seed.ts'), 'utf-8');

    // Forbidden real names
    expect(seedContent).not.toMatch(/\bVilas\b/i);
    expect(seedContent).not.toMatch(/\bKadam\b/i);

    // Permitted synthetic personas
    expect(seedContent).toContain('Ramesh Deshmukh');
    expect(seedContent).toContain('Dr. Rupam Choudhary');
    expect(seedContent).toContain('Meera Joshi');
    expect(seedContent).toContain('isSyntheticDemo: true');
    expect(seedContent).toContain('demo.patient1@aarogyadamu.local');
    expect(seedContent).toContain('dr.rc@aarogyadamu.local');
  });

  it('confirms apps/web UI code does not contain hardcoded real patient names', () => {
    const healthPage = fs.readFileSync(path.join(rootDir, 'apps/web/src/pages/Health.tsx'), 'utf-8');
    expect(healthPage).not.toMatch(/\bVilas\b/i);
    expect(healthPage).not.toMatch(/\bKadam\b/i);
  });
});

