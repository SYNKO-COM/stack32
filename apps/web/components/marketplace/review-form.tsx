"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
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

const REVIEW_PAGE_SIZE = 4;

/** Horizontal review strip with prev/next when there are more than one page. */
export function ReviewCarousel({
  reviews,
  agentLabel,
  dense = false,
}: {
  reviews: AgentReviewRow[];
  /** Optional agent name shown on overview (aggregated) cards. */
  agentLabel?: (review: AgentReviewRow) => string | undefined;
  /** Tighter grid for half-width columns (e.g. public landing). */
  dense?: boolean;
}) {
  const { t } = useTranslation("common");
  const [page, setPage] = useState(0);

  if (reviews.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("review.empty")}</p>;
  }

  const pageCount = Math.max(1, Math.ceil(reviews.length / REVIEW_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = reviews.slice(
    safePage * REVIEW_PAGE_SIZE,
    safePage * REVIEW_PAGE_SIZE + REVIEW_PAGE_SIZE,
  );
  const canPrev = safePage > 0;
  const canNext = safePage < pageCount - 1;

  return (
    <div className="relative">
      <div className="flex items-stretch gap-2">
        {canPrev || canNext ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 self-center rounded-full"
            disabled={!canPrev}
            aria-label={t("dashboard.prevReviews")}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
        <ul
          className={
            dense
              ? "grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2"
              : "grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4"
          }
        >          {slice.map((review) => {
            const label = agentLabel?.(review);
            return (
              <li
                key={review.id}
                className="flex min-h-[5.5rem] flex-col rounded-xl bg-foreground/[0.03] px-3 py-2"
              >
                <p className="truncate text-xs text-muted-foreground">
                  {review.authorName} · {"★".repeat(review.rating)}
                </p>
                {label ? (
                  <p className="mt-0.5 truncate text-[11px] font-medium text-muted-foreground/80">
                    {label}
                  </p>
                ) : null}
                {review.body ? (
                  <p className="mt-1 line-clamp-3 text-sm leading-snug">{review.body}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
        {canPrev || canNext ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 self-center rounded-full"
            disabled={!canNext}
            aria-label={t("dashboard.nextReviews")}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      {pageCount > 1 ? (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          {safePage + 1} / {pageCount}
        </p>
      ) : null}
    </div>
  );
}
