import type { ReactNode } from "react";

export function DataTable({
  columns,
  rows,
  onRowClick,
  empty,
}: {
  columns: Array<{ key: string; label: string; width?: string }>;
  rows: Array<Record<string, ReactNode> & { _id: string }>;
  onRowClick?: (id: string) => void;
  empty?: string;
}) {
  if (!rows.length) {
    return <div className="card muted">{empty ?? "Пусто"}</div>;
  }
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={c.width ? { width: c.width } : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r._id} onClick={() => onRowClick?.(r._id)}>
              {columns.map((c) => (
                <td key={c.key}>{r[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
