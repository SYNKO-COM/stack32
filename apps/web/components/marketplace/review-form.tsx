"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import { upsertAgentReviewAction, type AgentReviewRow } from "@/lib/actions/marketplace";

export function ReviewForm({
  agentId,
  existing,
  onSaved,
}: {
  agentId: string;
  existing?: AgentReviewRow | null;
  onSaved?: () => void;
}) {
  const { t } = useTranslation("common");
  const [rating, setRating] = useState(existing?.rating ?? 5);
  const [body, setBody] = useState(existing?.body ?? "");
  const [saving, setSaving] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setSaving(true);
        void upsertAgentReviewAction({ agentId, rating, body })
          .then(() => onSaved?.())
          .finally(() => setSaving(false));
      }}
    >
      <p className="text-sm font-medium">{t("review.yours")}</p>
      <div className="flex gap-1" role="group" aria-label={t("review.rating")}>
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            className={value <= rating ? "text-brand" : "text-muted-foreground/40"}
            onClick={() => setRating(value)}
            aria-label={`${value}`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("review.placeholder")}
        className="min-h-20 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
        maxLength={2000}
      />
      <Button type="submit" size="sm" className="rounded-full" disabled={saving}>
        {t("review.submit")}
      </Button>
    </form>
  );
}

export function ReviewList({ reviews }: { reviews: AgentReviewRow[] }) {
  const { t } = useTranslation("common");
  if (reviews.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("review.empty")}</p>;
  }
  return (
    <ul className="space-y-3">
      {reviews.map((review) => (
        <li key={review.id} className="rounded-xl bg-foreground/[0.03] px-3 py-2">
          <p className="text-xs text-muted-foreground">
            {review.authorName} · {"★".repeat(review.rating)}
          </p>
          {review.body ? <p className="mt-1 text-sm">{review.body}</p> : null}
        </li>
      ))}
    </ul>
  );
}
