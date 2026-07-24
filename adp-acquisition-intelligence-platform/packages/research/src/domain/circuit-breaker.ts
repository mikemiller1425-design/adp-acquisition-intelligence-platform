/**
 * Request-budget and error-rate circuit breakers for research runs.
 * Fail-closed: open circuit stops new retrieval work.
 */

export type CircuitBreakerState = {
  consecutiveFailures: number;
  totalFailures: number;
  totalAttempts: number;
  open: boolean;
  openedAtMs: number | null;
  reason: string | null;
};

export type CircuitBreakerConfig = {
  /** Open after this many consecutive failures. */
  maxConsecutiveFailures: number;
  /** Open when failure ratio exceeds this (0–1) after minAttempts. */
  maxFailureRate: number;
  minAttempts: number;
  /** Request budget — open when requestsConsumed >= maxTotalRequests. */
  maxTotalRequests: number;
};

export function createCircuitBreakerState(): CircuitBreakerState {
  return {
    consecutiveFailures: 0,
    totalFailures: 0,
    totalAttempts: 0,
    open: false,
    openedAtMs: null,
    reason: null,
  };
}

export function evaluateRequestBudget(input: {
  requestsConsumed: number;
  maxTotalRequests: number;
}): { allowed: boolean; reason?: string } {
  if (input.maxTotalRequests > 0 && input.requestsConsumed >= input.maxTotalRequests) {
    return { allowed: false, reason: 'request_budget_exhausted' };
  }
  return { allowed: true };
}

export function recordCircuitAttempt(
  state: CircuitBreakerState,
  outcome: 'success' | 'failure',
  config: CircuitBreakerConfig,
  nowMs = Date.now(),
): CircuitBreakerState {
  const next: CircuitBreakerState = {
    ...state,
    totalAttempts: state.totalAttempts + 1,
  };
  if (outcome === 'success') {
    next.consecutiveFailures = 0;
  } else {
    next.consecutiveFailures = state.consecutiveFailures + 1;
    next.totalFailures = state.totalFailures + 1;
  }

  if (next.consecutiveFailures >= config.maxConsecutiveFailures) {
    return {
      ...next,
      open: true,
      openedAtMs: nowMs,
      reason: 'consecutive_failures',
    };
  }

  if (
    next.totalAttempts >= config.minAttempts &&
    next.totalFailures / next.totalAttempts > config.maxFailureRate
  ) {
    return {
      ...next,
      open: true,
      openedAtMs: nowMs,
      reason: 'error_rate_exceeded',
    };
  }

  return next;
}

export function assertCircuitClosed(state: CircuitBreakerState): void {
  if (state.open) {
    throw new Error(`circuit_open:${state.reason ?? 'unknown'}`);
  }
}
