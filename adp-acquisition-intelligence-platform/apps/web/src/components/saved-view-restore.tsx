'use client';

import type { SavedViewRecord } from '@adp/reporting';
import { usePathname, useRouter } from 'next/navigation';

import { buildFilterSearchParams } from '@/lib/filter-url';

import styles from './saved-view-restore.module.css';

type SavedViewRestoreProps = {
  views: readonly SavedViewRecord[];
};

export function SavedViewRestore({ views }: SavedViewRestoreProps) {
  const router = useRouter();
  const pathname = usePathname();

  function restore(view: SavedViewRecord) {
    const params = buildFilterSearchParams(view.filters);
    params.set('saved_view', view.id);
    if (view.sort) {
      params.set('sort', view.sort.field);
      params.set('sort_dir', view.sort.direction);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  if (views.length === 0) {
    return (
      <div className={styles.wrapper}>
        <label className={styles.label} htmlFor="saved-view-select">
          Saved view
        </label>
        <select id="saved-view-select" className={styles.select} disabled>
          <option>No saved views</option>
        </select>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <label className={styles.label} htmlFor="saved-view-select">
        Saved view
      </label>
      <select
        id="saved-view-select"
        className={styles.select}
        defaultValue=""
        onChange={(event) => {
          const view = views.find((item) => item.id === event.target.value);
          if (view) restore(view);
        }}
      >
        <option value="" disabled>
          Restore a saved view…
        </option>
        {views.map((view) => (
          <option key={view.id} value={view.id}>
            {view.name}
          </option>
        ))}
      </select>
    </div>
  );
}
