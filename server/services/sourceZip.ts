import fs from 'fs';
import JSZip from 'jszip';
import path from 'path';

const EXCLUDED_DIRS = new Set([
  'node_modules',
  'dist',
  '.data',
  '.git',
  '.aistudio',
  '.next',
]);

const EXCLUDED_FILES = new Set([
  '.env',
  '.env.local',
  '.env.production',
]);

export async function buildProjectSourceZip(
  rootDir = process.cwd()
): Promise<{ buffer: Buffer; fileCount: number; files: string[] }> {
  const zip = new JSZip();
  const rootFolder = zip.folder('host-finder')!;
  const includedFiles: string[] = [];

  function walk(currentDir: string, relativePrefix: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        walk(fullPath, relPath);
      } else if (entry.isFile()) {
        if (EXCLUDED_FILES.has(entry.name)) continue;
        if (entry.name.endsWith('.zip')) continue;
        const content = fs.readFileSync(fullPath);
        rootFolder.file(relPath, content);
        includedFiles.push(relPath);
      }
    }
  }

  walk(rootDir, '');
  includedFiles.sort();

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return { buffer, fileCount: includedFiles.length, files: includedFiles };
}
