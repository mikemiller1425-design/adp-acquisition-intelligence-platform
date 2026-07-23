import type { ReactNode } from 'react';

import styles from './screen-header.module.css';

type ScreenHeaderProps = {
  screenId: string;
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function ScreenHeader({ screenId, title, description, actions }: ScreenHeaderProps) {
  return (
    <header className={styles.header}>
      <div>
        <p className={styles.screenId}>{screenId}</p>
        <h1 className={styles.title}>{title}</h1>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
