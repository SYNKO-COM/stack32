"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/hooks/use-translation";
import { company, PLACEHOLDER } from "@/lib/company";

type Topic = { title: string; description: string };

export default function ContactPage() {
  const { t } = useTranslation("marketing");
  const [sent, setSent] = useState(false);

  const topics = t("contact.topics.items", { returnObjects: true }) as Topic[];
  const contactEmail =
    company.contactEmail === PLACEHOLDER ? null : company.contactEmail;

  return (
    <div className="mx-auto max-w-5xl px-6 pt-36 pb-24">
      <div className="mx-auto mb-12 max-w-2xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {t("contact.title")}
        </h1>
        <p className="mt-4 text-muted-foreground">{t("contact.subtitle")}</p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground/90">
          {t("contact.intro")}
        </p>
      </div>

      <section className="mb-14">
        <h2 className="mb-6 text-center text-lg font-semibold tracking-tight">
          {t("contact.topics.title")}
        </h2>
        <div className="grid gap-6 sm:grid-cols-3">
          {topics.map((topic) => (
            <div key={topic.title} className="border-t border-brand/30 pt-4">
              <h3 className="font-medium">{topic.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{topic.description}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
        {sent ? (
          <div className="rounded-3xl border border-border/70 p-8 text-center" role="status">
            <p className="text-foreground/90">{t("contact.form.success")}</p>
          </div>
        ) : (
          <form
            className="space-y-4 rounded-3xl border border-border/70 p-7"
            onSubmit={(e) => {
              e.preventDefault();
              // TODO(phase-7): wire to a real support inbox / ticketing system.
              setSent(true);
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
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
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-subject">{t("contact.form.subject")}</Label>
              <Input
                id="contact-subject"
                required
                placeholder={t("contact.form.subjectPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-message">{t("contact.form.message")}</Label>
              <Textarea
                id="contact-message"
                required
                rows={6}
                placeholder={t("contact.form.messagePlaceholder")}
              />
            </div>
            <Button type="submit" className="w-full rounded-xl">
              {t("contact.form.submit")}
            </Button>
            <p className="text-xs text-muted-foreground/70">{t("contact.form.mockNotice")}</p>
          </form>
        )}

        <aside className="space-y-8 text-sm">
          <div>
            <h2 className="font-medium">{t("contact.aside.responseTitle")}</h2>
            <p className="mt-1.5 text-muted-foreground">{t("contact.aside.responseBody")}</p>
          </div>
          <div>
            <h2 className="font-medium">{t("contact.aside.companyTitle")}</h2>
            <p className="mt-1.5 text-muted-foreground">
              {company.legalCompanyName}
              {contactEmail ? (
                <>
                  {" — "}
                  <a
                    href={`mailto:${contactEmail}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {contactEmail}
                  </a>
                </>
              ) : null}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
