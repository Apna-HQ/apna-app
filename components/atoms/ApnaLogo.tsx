import Image from "next/image";

import { cn } from "@/lib/utils";

type ApnaLogoProps = {
  size?: number;
  className?: string;
  variant?: "mark" | "wordmark" | "lockup";
};

const APNA_GREEN = "#368564";

function GlassesMark({ size }: { size: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      role="img"
      aria-label="Apna"
      className="shrink-0"
    >
      <rect width="32" height="32" rx="7" fill={APNA_GREEN} />
      <rect x="4.5" y="13" width="9.5" height="6.5" rx="2.4" fill="#ffffff" />
      <rect x="18" y="13" width="9.5" height="6.5" rx="2.4" fill="#ffffff" />
      <rect x="13.5" y="15.4" width="5" height="1.7" rx="0.6" fill="#ffffff" />
      <rect x="3" y="14.7" width="1.8" height="3.2" rx="0.5" fill="#ffffff" />
      <rect x="27.2" y="14.7" width="1.8" height="3.2" rx="0.5" fill="#ffffff" />
    </svg>
  );
}

/**
 * Apna brand logo. Source of truth: apna-app/public/icon-512x512.png
 * (white glasses + APNA wordmark on Apna green).
 *
 * - `mark` — standalone green badge with white glasses (default).
 * - `wordmark` — mark + "Apna" text beside it (uses ambient text color).
 * - `lockup` — full PNG lockup including baked-in APNA text; use for splash
 *   surfaces where the original artwork should appear at >=48px.
 */
export function ApnaLogo({
  size = 16,
  className,
  variant = "mark",
}: ApnaLogoProps) {
  if (variant === "lockup") {
    return (
      <Image
        src="/icon-512x512.png"
        alt="Apna"
        width={size}
        height={size}
        priority
        className={cn("rounded-lg", className)}
      />
    );
  }

  if (variant === "mark") {
    return (
      <span className={cn("inline-flex", className)}>
        <GlassesMark size={size} />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-semibold tracking-tight",
        className
      )}
    >
      <GlassesMark size={size} />
      <span className="truncate">Apna</span>
    </span>
  );
}

export default ApnaLogo;
