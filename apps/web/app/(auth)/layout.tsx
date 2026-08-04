import Link from "next/link";

import { AnimatedBackground } from "@/components/shared/animated-background";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <AnimatedBackground variant="soft" />
      <header className="flex items-center justify-between px-6 py-5">
        <Logo href="/" />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <LanguageSwitcher />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="glass-strong w-full max-w-md rounded-[28px] p-8">{children}</div>
      </main>
      <footer className="pb-6 text-center text-xs text-muted-foreground/60">
        <Link href="/legal" className="hover:text-foreground">
          Stack32
        </Link>
      </footer>
    </div>
  );
}
