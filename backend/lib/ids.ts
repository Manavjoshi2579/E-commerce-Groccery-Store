export function orderNumber(sequence: number) {
  return `EC-${String(sequence).padStart(4, "0")}`;
}

export function invoiceNumber(orderNumberValue: string) {
  return `INV-${orderNumberValue}`;
}

export function sku(prefix: string, sequence: number) {
  return `${prefix}-${String(sequence).padStart(4, "0")}`.toUpperCase();
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
