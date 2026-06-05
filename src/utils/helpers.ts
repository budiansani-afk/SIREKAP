// Helper functions for Rupiah formatting and Excel extraction

export function formatRupiah(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) {
    return "Rp 0";
  }
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

export function formatPercent(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) {
    return "0,00%";
  }
  return new Intl.NumberFormat('id-ID', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value / 100);
}

export function formatDate(isoString: string | undefined | null): string {
  if (!isoString) return "-";
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  } catch {
    return isoString;
  }
}

// Simulated print trigger or download trigger for tabular data as Excel CSV
export function exportToCSV(data: any[], headers: string[], fileName: string) {
  const csvContent = "data:text/csv;charset=utf-8,\uFEFF" // Include BOM for proper Excel encoding of Indonesian terms
    + [headers.join(",")].concat(
        data.map(row => 
          headers.map(header => {
            const val = row[header];
            const cleanVal = val === undefined || val === null ? "" : String(val).replace(/"/g, '""');
            return `"${cleanVal}"`;
          }).join(",")
        )
      ).join("\n");
  
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `${fileName}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
