export type AppErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'
  | 'DEPENDENCY_UNAVAILABLE';

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;
  readonly expose: boolean;

  constructor(input: {
    code: AppErrorCode;
    message: string;
    statusCode?: number;
    details?: unknown;
    expose?: boolean;
    cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = 'AppError';
    this.code = input.code;
    this.statusCode = input.statusCode ?? defaultStatus(input.code);
    this.details = input.details;
    this.expose = input.expose ?? input.code !== 'INTERNAL_ERROR';
  }
}

function defaultStatus(code: AppErrorCode): number {
  switch (code) {
    case 'UNAUTHORIZED':
      return 401;
    case 'FORBIDDEN':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'VALIDATION_FAILED':
      return 400;
    case 'CONFLICT':
      return 409;
    case 'DEPENDENCY_UNAVAILABLE':
      return 503;
    default:
      return 500;
  }
}

export function toErrorEnvelope(error: AppError, correlationId?: string) {
  return {
    error: {
      code: error.code,
      message: error.expose ? error.message : 'An unexpected error occurred',
      ...(correlationId ? { correlationId } : {}),
      ...(error.expose && error.details !== undefined ? { details: error.details } : {}),
    },
  };
}
