"use client";

import { getPasswordIssues, type PasswordIssue } from "@/lib/auth/password";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";

const CHECKLIST: { issue: PasswordIssue; key: string }[] = [
  { issue: "tooShort", key: "auth:password.reqLength" },
  { issue: "missingUpper", key: "auth:password.reqUpper" },
  { issue: "missingLower", key: "auth:password.reqLower" },
  { issue: "missingDigit", key: "auth:password.reqDigit" },
  { issue: "missingSymbol", key: "auth:password.reqSymbol" },
];

export function PasswordRequirements({ password }: { password: string }) {
  const { t } = useTranslation(["auth"]);
  const issues = getPasswordIssues(password);

  return (
    <ul className="space-y-0.5 text-xs" aria-live="polite">
      {CHECKLIST.map(({ issue, key }) => {
        const met = !issues.includes(issue);
        return (
          <li
            key={issue}
            className={cn(
              "transition-colors",
              met ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/80",
            )}
          >
            {t(key)}
          </li>
        );
      })}
    </ul>
  );
}
