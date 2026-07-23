import type { PresentationState } from './filter-url';

export function resolvePresentationFromData(input: {
  explicit: PresentationState | null;
  denied?: boolean;
  errorMessage?: string | null;
  isEmpty?: boolean;
}): PresentationState | 'ready' {
  if (input.explicit) return input.explicit;
  if (input.denied) return 'denied';
  if (input.errorMessage) return 'error';
  if (input.isEmpty) return 'empty';
  return 'ready';
}

export function presentationTitle(state: PresentationState): string {
  switch (state) {
    case 'loading':
      return 'Loading';
    case 'empty':
      return 'No data';
    case 'denied':
      return 'Access denied';
    case 'error':
      return 'Unable to load data';
  }
}

export function presentationMessage(state: PresentationState, context?: string): string {
  switch (state) {
    case 'loading':
      return context ? `Loading ${context}…` : 'Loading data…';
    case 'empty':
      return context
        ? `No ${context} match the current filters. Adjust filters or import organizations to populate this view.`
        : 'No records match the current filters.';
    case 'denied':
      return 'You do not have permission to view this screen. Contact an administrator if you need access.';
    case 'error':
      return context
        ? `We could not load ${context}. Retry or contact support if the problem persists.`
        : 'An error occurred while loading this screen.';
  }
}
