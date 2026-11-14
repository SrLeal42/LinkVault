import type * as React from 'react';

import styles from './emptystate.module.css';

export interface EmptyStateProps {
  eyebrow?: string;
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
}

export function EmptyState({
  eyebrow,
  title,
  description,
  icon,
  action,
  compact = false,
}: EmptyStateProps): React.JSX.Element {
  return (
    <section
      className={[styles.container, compact ? styles.compact : ''].filter(Boolean).join(' ')}
    >
      {icon && (
        <div className={styles.iconSlot} aria-hidden="true">
          {icon}
        </div>
      )}
      {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.description}>{description}</p>
      {action && <div className={styles.actionSlot}>{action}</div>}
    </section>
  );
}