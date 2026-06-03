export function daysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

export function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}
