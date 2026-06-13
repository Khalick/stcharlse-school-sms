/**
 * Converts a JSON array to a CSV string and triggers a browser download.
 * @param data Array of objects representing rows.
 * @param filename Name of the file to be downloaded (e.g., 'students.csv').
 */
export function downloadAsCSV(data: any[], filename: string): void {
  if (!data || !data.length) {
    console.warn('No data to export.');
    return;
  }

  // Extract headers
  const headers = Object.keys(data[0]);
  
  // Map rows
  const csvRows = [
    headers.join(','), // Header row
    ...data.map(row => 
      headers.map(fieldName => {
        let val = row[fieldName];
        if (val === null || val === undefined) val = '';
        // Escape quotes and wrap in quotes if there's a comma
        const stringVal = String(val);
        if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n')) {
          return `"${stringVal.replace(/"/g, '""')}"`;
        }
        return stringVal;
      }).join(',')
    )
  ];

  const csvString = csvRows.join('\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  
  // Create a hidden link and trigger download
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
