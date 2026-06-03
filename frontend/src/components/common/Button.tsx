import { clsx } from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  children,
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "gold" | "outline" | "ghost"; children: ReactNode }) {
  return (
    <button
      className={clsx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-black text-white hover:bg-[#222]",
        variant === "gold" && "gold-gradient text-black hover:brightness-105",
        variant === "outline" && "border border-black bg-transparent text-black hover:bg-black hover:text-white",
        variant === "ghost" && "bg-transparent text-black hover:bg-black/5",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
