import type { TableColumn } from '@adp/reporting';

import styles from './data-table.module.css';

type DataTableProps = {
  columns: readonly TableColumn[];
  rows: readonly Record<string, unknown>[];
  caption: string;
  identityKey?: string;
  emptyMessage?: string;
};

export function DataTable({
  columns,
  rows,
  caption,
  identityKey = 'id',
  emptyMessage = 'No rows to display.',
}: DataTableProps) {
  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={styles.empty}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => {
              const rowKey = String(row[identityKey] ?? index);
              return (
                <tr key={rowKey} tabIndex={0}>
                  {columns.map((column) => (
                    <td key={column.key}>{formatCell(row[column.key])}</td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
