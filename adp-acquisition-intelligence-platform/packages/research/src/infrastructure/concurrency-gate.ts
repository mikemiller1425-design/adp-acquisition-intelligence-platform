import type { ConcurrencyGatePort } from '../domain/persistence-ports.js';

/** Process-local concurrency gate (safe for single-worker pilots). */
export class InProcessConcurrencyGate implements ConcurrencyGatePort {
  private readonly held = new Map<string, number>();

  async tryAcquire(sourceId: string, limit: number): Promise<boolean> {
    const current = this.held.get(sourceId) ?? 0;
    if (current >= limit) return false;
    this.held.set(sourceId, current + 1);
    return true;
  }

  async release(sourceId: string): Promise<void> {
    const current = this.held.get(sourceId) ?? 0;
    if (current <= 1) this.held.delete(sourceId);
    else this.held.set(sourceId, current - 1);
  }
}
