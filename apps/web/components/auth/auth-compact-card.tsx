import { cn } from "@/lib/utils";

/** Compact glass card for secondary auth screens (forgot / verify / reset). */
export function AuthCompactCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("glass-strong w-full max-w-md rounded-[28px] p-8", className)}>
      {children}
    </div>
  );
}
