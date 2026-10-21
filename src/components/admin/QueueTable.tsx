type Column<T> = {
  key: string;
  label: string;
  render: (row: T) => React.ReactNode;
};

export function QueueTable<T extends { id: string }>({
  columns,
  rows,
  emptyMessage = "No records yet."
}: {
  columns: Column<T>[];
  rows: T[];
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="panel empty-state empty-queue-state" role="status">
        <p className="muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td key={column.key}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
