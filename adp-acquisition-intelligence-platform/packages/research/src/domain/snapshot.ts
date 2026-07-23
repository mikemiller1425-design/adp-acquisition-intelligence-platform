import { createHash } from 'node:crypto';

export function contentHash(body: string | Buffer): string {
  return createHash('sha256').update(body).digest('hex');
}

export function contentUnchanged(
  previousHash: string | null | undefined,
  nextHash: string,
): boolean {
  return Boolean(previousHash) && previousHash === nextHash;
}

export type SnapshotRecordInput = {
  requestedUrl: string;
  finalUrl: string;
  domain: string;
  adapterVersion: string;
  policyVersion: string;
  retrievedAt: Date;
  httpStatus: number | null;
  contentType: string | null;
  contentLength: number | null;
  contentHash: string;
  etag: string | null;
  lastModified: string | null;
  redirectChain: string[];
  parserVersion: string;
  storageKey: string | null;
};

export function buildSnapshotMetadata(input: SnapshotRecordInput): SnapshotRecordInput {
  return { ...input };
}
