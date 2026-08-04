"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/hooks/use-translation";
import { company, PLACEHOLDER } from "@/lib/company";

export default function ContactPage() {
  const { t } = useTranslation("marketing");
  const [sent, setSent] = useState(false);

  const contactEmail = company.contactEmail === PLACEHOLDER ? null : company.contactEmail;

  return (
    <div className="mx-auto max-w-2xl px-6 pt-36 pb-24">
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {t("contact.title")}
        </h1>
        <p className="mt-4 text-muted-foreground">{t("contact.subtitle")}</p>
      </div>

      {sent ? (
        <div className="glass rounded-3xl p-8 text-center" role="status">
          <p className="text-foreground/90">{t("contact.form.success")}</p>
        </div>
      ) : (
        <form
          className="glass space-y-4 rounded-3xl p-7"
          onSubmit={(e) => {
            e.preventDefault();
            // TODO(phase-7): wire to a real support inbox / ticketing system.
            setSent(true);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="contact-name">{t("contact.form.name")}</Label>
            <Input
              id="contact-name"
              required
              placeholder={t("contact.form.namePlaceholder")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact-email">{t("contact.form.email")}</Label>
            <Input
              id="contact-email"
              type="email"
              required
              placeholder={t("contact.form.emailPlaceholder")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact-message">{t("contact.form.message")}</Label>
            <Textarea
              id="contact-message"
              required
              rows={5}
              placeholder={t("contact.form.messagePlaceholder")}
            />
          </div>
          <Button type="submit" className="w-full rounded-xl">
            {t("contact.form.submit")}
          </Button>
          <p className="text-xs text-muted-foreground/70">{t("contact.form.mockNotice")}</p>
        </form>
      )}

      <div className="mt-10 grid gap-6 text-sm sm:grid-cols-2">
        <div>
          <h2 className="font-medium">{t("contact.companyTitle")}</h2>
          <p className="mt-1.5 text-muted-foreground">
            {company.legalCompanyName} — {company.registeredAddress}
          </p>
        </div>
        {contactEmail ? (
          <div>
            <h2 className="font-medium">{t("contact.emailTitle")}</h2>
            <p className="mt-1.5 text-muted-foreground">{contactEmail}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
