import { AnimatedBackground } from "@/components/shared/animated-background";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <AnimatedBackground variant="soft" />
      <header className="relative z-10 flex items-center justify-between px-4 py-4 sm:px-6">
        <Logo href="/" size="lg" />
        <div className="flex items-center gap-1.5">
          <ThemeToggle size="lg" />
          <LanguageSwitcher size="lg" />
        </div>
      </header>
      <main className="relative z-10 flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
