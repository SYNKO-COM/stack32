"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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

  return (
    <header className="fixed inset-x-0 top-0 z-40">
      <nav
        aria-label={t("a11y.mainNavigation")}
        className="mx-auto mt-4 flex max-w-6xl items-center justify-between gap-4 rounded-full px-4 py-2 backdrop-blur-xl md:px-6"
      >
        <div className="flex items-center gap-3">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="md:hidden"
                aria-label={t("a11y.openMenu")}
              >
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="glass-strong border-border">
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
                    className="rounded-xl px-3 py-2.5 text-sm text-foreground/85 hover:bg-foreground/5"
                  >
                    {t(`nav.${link.key}`)}
                  </Link>
                ))}
              </div>
            </SheetContent>
          </Sheet>
          <Logo href="/" />
        </div>

        <div className="glass hidden items-center gap-1 rounded-full px-2 py-1 md:flex">
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
          <ThemeToggle />
          <LanguageSwitcher />
          {user ? (
            <Button
              variant="ghost"
              size="icon-sm"
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
                className="hidden sm:inline-flex"
                onClick={() => openDialog("auth", { authMode: "login" })}
              >
                {t("actions.signIn")}
              </Button>
              <Button
                size="sm"
                className="rounded-full"
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
