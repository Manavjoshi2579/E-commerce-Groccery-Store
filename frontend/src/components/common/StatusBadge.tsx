import { clsx } from "clsx";

export function StatusBadge({ value }: { value: string }) {
  const tone = value.includes("Deliver") || value === "Paid" ? "green" : value.includes("Fail") || value.includes("Cancel") ? "red" : value.includes("Packed") || value.includes("Out") ? "blue" : "amber";
  return (
    <span
      className={clsx(
        "inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-normal",
        tone === "green" && "bg-green-50 text-green-700",
        tone === "red" && "bg-red-50 text-red-700",
        tone === "blue" && "bg-blue-50 text-blue-700",
        tone === "amber" && "bg-amber-50 text-amber-800",
      )}
    >
      {value}
    </span>
  );
}
