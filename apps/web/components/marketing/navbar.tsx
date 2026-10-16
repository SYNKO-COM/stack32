"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useCurrentUser } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";
import { useUiStore } from "@/store/ui-store";

const NAV_LINKS = [
  { href: "/features", key: "product" },
  { href: "/pricing", key: "pricing" },
  { href: "/faq", key: "faq" },
  { href: "/contact", key: "contact" },
] as const;

export function Navbar() {
  const { t } = useTranslation("common");
  const router = useRouter();
  const openDialog = useUiStore((s) => s.openDialog);
  const { data: user } = useCurrentUser();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-40">
      <nav
        aria-label={t("a11y.mainNavigation")}
        className="mx-3 mt-3 flex max-w-6xl items-center justify-between gap-3 rounded-full px-3 py-2 backdrop-blur-xl sm:mx-5 md:mx-auto md:mt-4 md:px-6"
      >
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon-lg"
                className="lg:hidden"
                aria-label={t("a11y.openMenu")}
              >
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="glass-strong w-[min(22rem,calc(100vw-1rem))] overflow-y-auto border-border">
              <SheetHeader>
                <SheetTitle>
                  <Logo href="/" />
                </SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-1 px-4">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex min-h-11 items-center rounded-xl px-3 py-2.5 text-base text-foreground/85 hover:bg-foreground/5"
                    onClick={() => setMenuOpen(false)}
                  >
                    {t(`nav.${link.key}`)}
                  </Link>
                ))}
              </div>
              <div className="mt-auto space-y-4 border-t border-border px-4 pt-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <div className="flex items-center gap-3">
                  <ThemeToggle size="lg" />
                  <LanguageSwitcher size="lg" />
                </div>
                {!user ? (
                  <Button
                    variant="outline"
                    className="h-11 w-full rounded-xl"
                    onClick={() => {
                      setMenuOpen(false);
                      openDialog("auth", { authMode: "login" });
                    }}
                  >
                    {t("actions.signIn")}
                  </Button>
                ) : null}
              </div>
            </SheetContent>
          </Sheet>
          <Logo href="/" />
        </div>

        <div className="glass hidden items-center gap-1 rounded-full px-2 py-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-3.5 py-1.5 text-sm text-foreground/75 transition-colors hover:bg-foreground/5 hover:text-foreground"
            >
              {t(`nav.${link.key}`)}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <ThemeToggle className="hidden sm:inline-flex" />
          <LanguageSwitcher className="hidden sm:inline-flex" />
          {user ? (
            <Button
              variant="ghost"
                size="icon-lg"
              className="rounded-full"
              aria-label={t("a11y.userMenu")}
              onClick={() => router.push("/agents")}
            >
              <Avatar className="size-7">
                <AvatarFallback className="bg-brand/30 text-xs">
                  {(user.name ?? user.email).slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="hidden lg:inline-flex"
                onClick={() => openDialog("auth", { authMode: "login" })}
              >
                {t("actions.signIn")}
              </Button>
              <Button
                size="sm"
                className="h-10 rounded-full px-3 sm:h-8"
                onClick={() => openDialog("auth", { authMode: "signup" })}
              >
                {t("actions.getStarted")}
              </Button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
