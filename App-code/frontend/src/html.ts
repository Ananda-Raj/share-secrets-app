// Escapes text for safe interpolation into innerHTML, including inside a quoted HTML
// attribute (e.g. download="${escapeHtml(name)}") -- the previous per-page copies of this
// helper only escaped &, <, > via a textContent/innerHTML round-trip, which does NOT
// escape " or ', so attacker-controlled text (e.g. a file's original filename) could
// break out of an attribute and inject markup. Escaping all five characters here covers
// both contexts with one function.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
