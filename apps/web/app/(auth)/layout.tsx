import Link from "next/link";

import { AnimatedBackground } from "@/components/shared/animated-background";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { ThemeToggle } from "@/components/shared/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <AnimatedBackground variant="soft" />
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1 sm:top-5 sm:right-5">
        <ThemeToggle />
        <LanguageSwitcher />
      </div>
      <main className="relative z-10 flex flex-1 items-center justify-center p-2 sm:p-4 md:p-5">
        {children}
      </main>
      <footer className="relative z-10 pb-4 text-center text-xs text-muted-foreground/60">
        <Link href="/legal" className="hover:text-foreground">
          Stack32
        </Link>
      </footer>
    </div>
  );
}
