import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, normalize, relative } from 'node:path';

import { AppError } from '../errors/index.js';

export type ObjectStoragePutInput = {
  key: string;
  body: Uint8Array;
  contentType: string;
  metadata?: Record<string, string>;
};

export type StoredObject = {
  key: string;
  sizeBytes: number;
  contentType: string;
  metadata: Record<string, string>;
  createdAt: Date;
};

export type ObjectStoragePort = {
  putPrivate(input: ObjectStoragePutInput): Promise<StoredObject>;
  getPrivate(key: string): Promise<Uint8Array>;
  deletePrivate(key: string): Promise<void>;
  describePrivate(key: string): Promise<StoredObject | null>;
};

export class LocalPrivateObjectStorage implements ObjectStoragePort {
  constructor(private readonly rootDirectory = join(tmpdir(), 'adp-private-object-storage')) {}

  async putPrivate(input: ObjectStoragePutInput): Promise<StoredObject> {
    const objectPath = this.pathFor(input.key);
    await mkdir(dirname(objectPath), { recursive: true, mode: 0o700 });
    await writeFile(objectPath, input.body, { mode: 0o600 });
    const metadata = input.metadata ?? {};
    await writeFile(
      `${objectPath}.metadata.json`,
      JSON.stringify({ contentType: input.contentType, metadata }, null, 2),
      { mode: 0o600 },
    );
    const fileStat = await stat(objectPath);
    return {
      key: input.key,
      sizeBytes: fileStat.size,
      contentType: input.contentType,
      metadata: { ...metadata },
      createdAt: fileStat.birthtime,
    };
  }

  async getPrivate(key: string): Promise<Uint8Array> {
    return readFile(this.pathFor(key));
  }

  async deletePrivate(key: string): Promise<void> {
    const objectPath = this.pathFor(key);
    await rm(objectPath, { force: true });
    await rm(`${objectPath}.metadata.json`, { force: true });
  }

  async describePrivate(key: string): Promise<StoredObject | null> {
    const objectPath = this.pathFor(key);
    try {
      const [fileStat, metadataBytes] = await Promise.all([
        stat(objectPath),
        readFile(`${objectPath}.metadata.json`),
      ]);
      const metadata = JSON.parse(new TextDecoder().decode(metadataBytes)) as {
        contentType?: unknown;
        metadata?: unknown;
      };
      return {
        key,
        sizeBytes: fileStat.size,
        contentType:
          typeof metadata.contentType === 'string'
            ? metadata.contentType
            : 'application/octet-stream',
        metadata:
          metadata.metadata !== null &&
          typeof metadata.metadata === 'object' &&
          !Array.isArray(metadata.metadata)
            ? (metadata.metadata as Record<string, string>)
            : {},
        createdAt: fileStat.birthtime,
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  private pathFor(key: string): string {
    if (key.trim() === '' || key.includes('\0') || key.startsWith('/')) {
      throw invalidKey(key);
    }
    const normalized = normalize(key);
    if (normalized === '..' || normalized.startsWith(`..${separatorFor(normalized)}`)) {
      throw invalidKey(key);
    }
    const objectPath = join(this.rootDirectory, normalized);
    if (relative(this.rootDirectory, objectPath).startsWith('..')) {
      throw invalidKey(key);
    }
    return objectPath;
  }
}

function separatorFor(value: string): string {
  return value.includes('\\') ? '\\' : '/';
}

function invalidKey(key: string): AppError {
  return new AppError({
    code: 'VALIDATION_FAILED',
    message: 'Object storage keys must be relative private keys',
    details: { key },
  });
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}
