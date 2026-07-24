export type RateLimitState = {
  windowStartedAtMs: number;
  requestCount: number;
};

export type RateLimitDecision =
  | { allowed: true; nextState: RateLimitState }
  | { allowed: false; retryAfterMs: number; nextState: RateLimitState };

export function evaluateRateLimit(
  state: RateLimitState | null,
  nowMs: number,
  limitPerMinute: number,
  windowMs = 60_000,
): RateLimitDecision {
  if (limitPerMinute <= 0) {
    return {
      allowed: false,
      retryAfterMs: windowMs,
      nextState: state ?? { windowStartedAtMs: nowMs, requestCount: 0 },
    };
  }
  if (!state || nowMs - state.windowStartedAtMs >= windowMs) {
    return {
      allowed: true,
      nextState: { windowStartedAtMs: nowMs, requestCount: 1 },
    };
  }
  if (state.requestCount >= limitPerMinute) {
    return {
      allowed: false,
      retryAfterMs: Math.max(0, windowMs - (nowMs - state.windowStartedAtMs)),
      nextState: state,
    };
  }
  return {
    allowed: true,
    nextState: { ...state, requestCount: state.requestCount + 1 },
  };
}
