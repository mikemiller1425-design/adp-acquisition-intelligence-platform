import type { PresentationState } from '@/lib/filter-url';
import { presentationMessage, presentationTitle } from '@/lib/page-states';

import styles from './page-states.module.css';

type PageStateProps = {
  state: PresentationState;
  context?: string;
  retryHref?: string;
};

export function PageState({ state, context, retryHref }: PageStateProps) {
  return (
    <section
      className={styles.state}
      role={state === 'loading' ? 'status' : 'alert'}
      aria-live="polite"
      data-state={state}
    >
      <h2 className={styles.title}>{presentationTitle(state)}</h2>
      <p className={styles.message}>{presentationMessage(state, context)}</p>
      {state === 'error' && retryHref ? (
        <a className={styles.retry} href={retryHref}>
          Retry
        </a>
      ) : null}
    </section>
  );
}

export function LoadingState({ context }: { context?: string }) {
  return <PageState state="loading" {...(context ? { context } : {})} />;
}

export function EmptyState({ context }: { context?: string }) {
  return <PageState state="empty" {...(context ? { context } : {})} />;
}

export function DeniedState() {
  return <PageState state="denied" />;
}

export function ErrorState({ context, retryHref }: { context?: string; retryHref?: string }) {
  return (
    <PageState
      state="error"
      {...(context ? { context } : {})}
      {...(retryHref ? { retryHref } : {})}
    />
  );
}
