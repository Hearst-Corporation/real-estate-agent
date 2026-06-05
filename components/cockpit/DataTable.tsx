/**
 * DataTable — tableau générique typé autour de .est-listing-table (déjà stylée).
 * Server component (les colonnes peuvent rendre des composants clients).
 */

import type { ReactNode } from "react";

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Alignement de la colonne. "right" → tabular-nums. */
  align?: "left" | "right";
};

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  emptyLabel: string;
  getKey: (row: T) => string;
};

export function DataTable<T>({ columns, rows, emptyLabel, getKey }: DataTableProps<T>) {
  if (rows.length === 0) {
    return <p className="ct-placeholder">{emptyLabel}</p>;
  }

  return (
    <div className="est-listing-table-wrap">
      <table className="est-listing-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={col.align === "right" ? "ct-table-num" : undefined}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getKey(row)}>
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={col.align === "right" ? "ct-table-num" : undefined}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
