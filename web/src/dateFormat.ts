// A bare toLocaleDateString()/toLocaleString() follows the browser/OS locale,
// which renders DD/MM/YYYY on non-US locales - force 'en-US' so numeric dates
// are always MM/DD/YYYY regardless of the viewer's system settings.
export function formatDate(d: Date | string | number): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString('en-US');
}

export function formatDateTime(d: Date | string | number): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleString('en-US', { hour12: true });
}
