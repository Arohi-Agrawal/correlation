interface FilePreviewTableProps {
  title: string;
  headers: string[];
  rows: Record<string, string | null>[];
}

export function FilePreviewTable({ title, headers, rows }: FilePreviewTableProps) {
  if (!headers.length) {
    return null;
  }

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="section-title">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table min-w-full">
          <thead>
            <tr>
              {headers.map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={headers.length} className="px-3 py-4 text-xs text-slate-500">
                  No rows available
                </td>
              </tr>
            )}
            {rows.map((row, idx) => (
              <tr key={idx}>
                {headers.map((header) => (
                  <td key={`${idx}-${header}`}>{row[header] ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
