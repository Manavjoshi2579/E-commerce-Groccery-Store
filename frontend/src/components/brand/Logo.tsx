import { Crown } from "lucide-react";

export function Logo({ compact = false, invert = false }: { compact?: boolean; invert?: boolean }) {
  return (
    <div className="flex items-center gap-2" aria-label="Eagle Mart Logo">
      <div className="gold-gradient flex h-10 w-10 items-center justify-center rounded-md text-black shadow-sm">
        <Crown size={22} fill="currentColor" />
      </div>
      {!compact && (
        <div className={invert ? "text-white" : "text-black"}>
          <div className="display-font text-xl font-extrabold uppercase leading-none tracking-normal">Eagle Mart</div>
        </div>
      )}
    </div>
  );
}
