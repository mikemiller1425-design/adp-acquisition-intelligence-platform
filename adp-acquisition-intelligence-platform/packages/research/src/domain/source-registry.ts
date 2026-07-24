import type { ApprovedSourceRecord, ApprovedSourceRepository } from './persistence-ports.js';
import type { SourceGateInput } from './research-run-gates.js';
import { canExecuteApprovedSource } from './approved-source.js';

/**
 * Canonical approved-source registry port.
 * PostgreSQL and memory providers both expose ApprovedSourceRepository;
 * this wrapper enforces fail-closed mapping for research-run gates.
 */
export type SourceRegistryPort = {
  getByKey(sourceKey: string): Promise<ApprovedSourceRecord | null>;
  requireGate(sourceKey: string): Promise<
    | { ok: true; source: ApprovedSourceRecord; gate: SourceGateInput }
    | { ok: false; code: string; message: string }
  >;
  loadGates(sourceKeys: string[]): Promise<{
    gates: SourceGateInput[];
    records: ApprovedSourceRecord[];
    missing: string[];
    denied: Array<{ sourceKey: string; code: string; message: string }>;
  }>;
};

export function toSourceGateInput(record: ApprovedSourceRecord): SourceGateInput {
  return {
    sourceKey: record.sourceKey,
    adapterType: record.adapterType,
    lifecycle: record.lifecycle,
    killSwitchActive: record.killSwitchActive,
    termsReviewStatus: record.termsReviewStatus,
    privacyReviewStatus: record.privacyReviewStatus,
    legalReviewStatus: record.legalReviewStatus,
    securityReviewStatus: record.securityReviewStatus,
  };
}

export function createSourceRegistry(repo: ApprovedSourceRepository): SourceRegistryPort {
  return {
    getByKey: (sourceKey) => repo.getByKey(sourceKey),
    async requireGate(sourceKey) {
      const record = await repo.getByKey(sourceKey);
      if (!record) {
        return {
          ok: false,
          code: 'source_not_found',
          message: `Source ${sourceKey} is not in the approved registry`,
        };
      }
      // Unknown / empty review statuses deny.
      for (const [field, status] of [
        ['terms', record.termsReviewStatus],
        ['privacy', record.privacyReviewStatus],
        ['legal', record.legalReviewStatus],
        ['security', record.securityReviewStatus],
      ] as const) {
        if (!status || !String(status).trim()) {
          return {
            ok: false,
            code: `${field}_unknown`,
            message: `${field} review status is missing`,
          };
        }
      }
      if (!record.lifecycle || !record.adapterType) {
        return {
          ok: false,
          code: 'source_incomplete',
          message: `Source ${sourceKey} is missing lifecycle or adapter type`,
        };
      }
      const gate = toSourceGateInput(record);
      const decision = canExecuteApprovedSource(gate);
      if (!decision.allowed) {
        return { ok: false, code: decision.code, message: decision.message };
      }
      return { ok: true, source: record, gate };
    },
    async loadGates(sourceKeys) {
      const gates: SourceGateInput[] = [];
      const records: ApprovedSourceRecord[] = [];
      const missing: string[] = [];
      const denied: Array<{ sourceKey: string; code: string; message: string }> = [];
      for (const key of sourceKeys) {
        const result = await this.requireGate(key);
        if (!result.ok) {
          if (result.code === 'source_not_found') missing.push(key);
          else denied.push({ sourceKey: key, code: result.code, message: result.message });
          // Still push a fail-closed gate so evaluateLaunchGates can report.
          gates.push({
            sourceKey: key,
            adapterType: 'unknown',
            lifecycle: 'draft',
            killSwitchActive: true,
            termsReviewStatus: 'pending',
            privacyReviewStatus: 'pending',
            legalReviewStatus: 'pending',
            securityReviewStatus: 'pending',
          });
          continue;
        }
        gates.push(result.gate);
        records.push(result.source);
      }
      return { gates, records, missing, denied };
    },
  };
}

/** Snapshot fields persisted on the run for immutable policy/source versions. */
export function sourcePolicySnapshot(records: ApprovedSourceRecord[]): Record<string, unknown> {
  return {
    sources: records.map((r) => ({
      sourceKey: r.sourceKey,
      adapterType: r.adapterType,
      lifecycle: r.lifecycle,
      killSwitchActive: r.killSwitchActive,
      termsReviewStatus: r.termsReviewStatus,
      privacyReviewStatus: r.privacyReviewStatus,
      legalReviewStatus: r.legalReviewStatus,
      securityReviewStatus: r.securityReviewStatus,
      rateLimitPerMinute: r.rateLimitPerMinute,
      concurrencyLimit: r.concurrencyLimit,
      pageLimit: r.pageLimit,
      responseSizeLimitBytes: r.responseSizeLimitBytes,
      timeoutMs: r.timeoutMs,
      redirectPolicy: r.redirectPolicy,
      parserVersion: r.parserVersion,
      approvalEvidence: r.approvalEvidence,
    })),
    policyVersion: 'research-run-policy-v1',
    snappedAt: new Date().toISOString(),
  };
}
