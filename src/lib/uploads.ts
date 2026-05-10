import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

/**
 * Upload helpers — write files (images / PDFs) into the configured backend
 * (Cloudflare R2 in production, local disk in dev) and return URLs the
 * rest of the app can render without caring how they got there.
 *
 * Backend selection (in priority order):
 *   1. R2_ACCOUNT_ID + R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY + R2_BUCKET → R2
 *   2. otherwise → local disk under ./uploads/
 *
 * URL shapes returned:
 *   - R2:    /api/uploads/<folder>/<file>  (streamed via the route handler;
 *            we never expose raw R2 URLs so reads stay behind auth)
 *   - Local: /api/uploads/<folder>/<file>  (same, served from disk)
 *
 * The route handler at src/app/api/uploads/[...path]/route.ts inspects the
 * configured backend and streams from whichever one stored the file.
 */

const ALLOWED_IMAGE = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
]);
const ALLOWED_DOC = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);
const MAX_BYTES = 25 * 1024 * 1024; // 25MB

export type UploadKind = 'image' | 'document' | 'any';

export type SavedUpload = {
  url: string;            // /api/uploads/<folder>/<file>
  originalName: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'document';
};

// ---------------------------------------------------------------------
// Backend resolution
// ---------------------------------------------------------------------

type Backend = { kind: 'r2'; client: S3Client; bucket: string } | { kind: 'local'; root: string };

let cachedBackend: Backend | null = null;

export function getBackend(): Backend {
  if (cachedBackend) return cachedBackend;
  const accountId = process.env.R2_ACCOUNT_ID;
  const keyId = process.env.R2_ACCESS_KEY_ID;
  const secret = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (accountId && keyId && secret && bucket) {
    cachedBackend = {
      kind: 'r2',
      bucket,
      client: new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: keyId, secretAccessKey: secret },
      }),
    };
  } else {
    cachedBackend = {
      kind: 'local',
      root: process.env.UPLOADS_DIR
        ? path.resolve(process.env.UPLOADS_DIR)
        : path.resolve(process.cwd(), 'uploads'),
    };
  }
  return cachedBackend;
}

/** For tests / route handler — back-compat exported name kept stable. */
export function uploadsRoot(): string {
  const b = getBackend();
  if (b.kind !== 'local') {
    throw new Error('uploadsRoot() called when backend is not local');
  }
  return b.root;
}

// ---------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------

function sanitizeFilename(file: File): string {
  const original = file.name || 'upload';
  const safeBase = original
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(-80) || 'upload';
  const stamp = randomBytes(4).toString('hex');
  return `${Date.now()}-${stamp}-${safeBase}`;
}

function validateFile(file: File, allow: UploadKind): { isImage: boolean; isDoc: boolean } {
  if (file.size > MAX_BYTES) {
    throw new Error(`File too large: ${file.name} (${file.size} bytes; max ${MAX_BYTES})`);
  }
  const mime = file.type || 'application/octet-stream';
  const isImage = ALLOWED_IMAGE.has(mime);
  const isDoc = ALLOWED_DOC.has(mime);
  if (allow === 'image' && !isImage) throw new Error(`Unsupported image type: ${mime}`);
  if (allow === 'document' && !isImage && !isDoc) throw new Error(`Unsupported document type: ${mime}`);
  if (allow === 'any' && !isImage && !isDoc) throw new Error(`Unsupported file type: ${mime}`);
  return { isImage, isDoc };
}

export async function saveUpload(
  file: File,
  folder: string,
  opts: { allow?: UploadKind } = {},
): Promise<SavedUpload | null> {
  if (!file || !(file instanceof File)) return null;
  if (file.size === 0) return null;
  const allow = opts.allow ?? 'image';
  const { isImage } = validateFile(file, allow);
  const finalName = sanitizeFilename(file);
  const mime = file.type || 'application/octet-stream';
  const buf = Buffer.from(await file.arrayBuffer());
  const backend = getBackend();
  const key = `${folder}/${finalName}`;

  if (backend.kind === 'r2') {
    await backend.client.send(new PutObjectCommand({
      Bucket: backend.bucket,
      Key: key,
      Body: buf,
      ContentType: mime,
    }));
  } else {
    const baseDir = path.join(backend.root, folder);
    await fs.mkdir(baseDir, { recursive: true });
    await fs.writeFile(path.join(baseDir, finalName), buf);
  }

  return {
    url: `/api/uploads/${key}`,
    originalName: file.name || 'upload',
    mimeType: mime,
    size: file.size,
    kind: isImage ? 'image' : 'document',
  };
}

export async function saveUploads(
  files: FormDataEntryValue[],
  folder: string,
  opts: { allow?: UploadKind } = {},
): Promise<SavedUpload[]> {
  const out: SavedUpload[] = [];
  for (const f of files) {
    if (typeof f === 'string') continue;
    try {
      const saved = await saveUpload(f as File, folder, opts);
      if (saved) out.push(saved);
    } catch (e) {
      console.error('[saveUploads] skip', (f as File).name, e);
    }
  }
  return out;
}

// ---------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------

export async function deleteUpload(url: string | null | undefined): Promise<void> {
  if (!url) return;
  let key: string | null = null;
  if (url.startsWith('/api/uploads/')) {
    key = url.slice('/api/uploads/'.length);
  } else if (url.startsWith('/uploads/')) {
    // Legacy URLs (pre-route-handler-fix). Best-effort delete from disk only.
    const legacy = path.join(process.cwd(), 'public', url);
    try { await fs.unlink(legacy); } catch { /* already gone */ }
    return;
  } else {
    return;
  }
  const backend = getBackend();
  if (backend.kind === 'r2') {
    try {
      await backend.client.send(new DeleteObjectCommand({ Bucket: backend.bucket, Key: key }));
    } catch (e) {
      console.error('[deleteUpload] r2 delete failed', key, e);
    }
  } else {
    const fullPath = path.join(backend.root, key);
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(backend.root + path.sep) && resolved !== backend.root) return;
    try { await fs.unlink(resolved); } catch { /* already gone */ }
  }
}

// ---------------------------------------------------------------------
// Read (used by the route handler)
// ---------------------------------------------------------------------

export type UploadStream = {
  body: Uint8Array;
  contentType: string;
  size: number;
  lastModified: Date;
};

export async function readUpload(segments: string[]): Promise<UploadStream | null> {
  if (segments.length === 0) return null;
  for (const seg of segments) {
    if (!seg || !/^[A-Za-z0-9._-]+$/.test(seg)) return null;
  }
  const key = segments.join('/');
  const backend = getBackend();
  if (backend.kind === 'r2') {
    try {
      const out = await backend.client.send(new GetObjectCommand({ Bucket: backend.bucket, Key: key }));
      const arr = await out.Body!.transformToByteArray();
      return {
        body: arr,
        contentType: out.ContentType ?? 'application/octet-stream',
        size: arr.byteLength,
        lastModified: out.LastModified ?? new Date(),
      };
    } catch (e) {
      const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  }
  const fullPath = path.join(backend.root, key);
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(backend.root + path.sep) && resolved !== backend.root) return null;
  let stat;
  try { stat = await fs.stat(resolved); } catch { return null; }
  if (!stat.isFile()) return null;
  const buf = await fs.readFile(resolved);
  return {
    body: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
    contentType: contentTypeFor(resolved),
    size: stat.size,
    lastModified: stat.mtime,
  };
}

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.heic': 'image/heic',
  '.heif': 'image/heif', '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function contentTypeFor(p: string): string {
  return MIME_BY_EXT[path.extname(p).toLowerCase()] ?? 'application/octet-stream';
}
