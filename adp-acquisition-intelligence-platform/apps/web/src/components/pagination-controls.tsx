'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import styles from './pagination-controls.module.css';

type PaginationControlsProps = {
  page: number;
  limit: number;
  total: number;
};

export function PaginationControls({ page, limit, total }: PaginationControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  function goToPage(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage <= 1) {
      params.delete('page');
    } else {
      params.set('page', String(nextPage));
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <nav className={styles.nav} aria-label="Table pagination">
      <p className={styles.summary}>
        Showing {from}–{to} of {total}
      </p>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.button}
          disabled={page <= 1}
          onClick={() => goToPage(page - 1)}
          aria-label="Previous page"
        >
          Previous
        </button>
        <span className={styles.pageLabel} aria-current="page">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          className={styles.button}
          disabled={page >= totalPages}
          onClick={() => goToPage(page + 1)}
          aria-label="Next page"
        >
          Next
        </button>
      </div>
    </nav>
  );
}
