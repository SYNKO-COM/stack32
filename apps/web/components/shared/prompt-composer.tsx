"use client";

import { ArrowUp, Mic, Paperclip, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";

interface PromptComposerProps {
  onSubmit: (value: string) => void;
  onStop?: () => void;
  /** Static placeholder (i18n'd by the caller). Ignored when animatedPlaceholders is set. */
  placeholder?: string;
  /** Rotating example prompts (typewriter effect). */
  animatedPlaceholders?: string[];
  disabled?: boolean;
  busy?: boolean;
  autoFocus?: boolean;
  size?: "hero" | "compact";
  className?: string;
  initialValue?: string;
}

function useTypewriter(examples: string[] | undefined, enabled: boolean): string {
  const [text, setText] = useState("");
  const indexRef = useRef(0);
  const charRef = useRef(0);
  const deletingRef = useRef(false);

  useEffect(() => {
    if (!examples || examples.length === 0 || !enabled) return;
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      const timeout = setTimeout(() => setText(examples[0]), 0);
      return () => clearTimeout(timeout);
    }

    const tick = () => {
      const current = examples[indexRef.current % examples.length];
      if (!deletingRef.current) {
        charRef.current += 1;
        if (charRef.current >= current.length) {
          deletingRef.current = true;
          setText(current);
          return 2200;
        }
      } else {
        charRef.current -= 2;
        if (charRef.current <= 0) {
          charRef.current = 0;
          deletingRef.current = false;
          indexRef.current += 1;
          return 400;
        }
      }
      setText(current.slice(0, Math.max(0, charRef.current)));
      return deletingRef.current ? 18 : 45;
    };

    let timeout: ReturnType<typeof setTimeout>;
    const loop = () => {
      const next = tick();
      timeout = setTimeout(loop, next);
    };
    timeout = setTimeout(loop, 300);
    return () => clearTimeout(timeout);
  }, [examples, enabled]);

  return text;
}

export function PromptComposer({
  onSubmit,
  onStop,
  placeholder,
  animatedPlaceholders,
  disabled = false,
  busy = false,
  autoFocus = false,
  size = "compact",
  className,
  initialValue = "",
}: PromptComposerProps) {
  const { t } = useTranslation("common");
  const [value, setValue] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const animated = useTypewriter(animatedPlaceholders, value.length === 0);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, size === "hero" ? 200 : 160)}px`;
  }, [value, size]);

  const canSend = value.trim().length > 0 && !disabled && !busy;

  const submit = () => {
    if (!canSend) return;
    onSubmit(value.trim());
    setValue("");
  };

  return (
    <div
      className={cn(
        "glass-strong shadow-glow-sm rounded-[28px] p-3 transition-shadow focus-within:shadow-glow",
        size === "hero" ? "p-4" : "p-3",
        className,
      )}
    >
      <label htmlFor="prompt-composer-input" className="sr-only">
        {t("composer.label")}
      </label>
      <textarea
        id="prompt-composer-input"
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={animatedPlaceholders ? animated : placeholder}
        disabled={disabled}
        rows={size === "hero" ? 2 : 1}
        className={cn(
          "w-full resize-none bg-transparent px-2 pt-1 text-foreground placeholder:text-muted-foreground/70 focus:outline-none",
          size === "hero" ? "min-h-16 text-base" : "min-h-10 text-sm",
        )}
      />
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="rounded-full text-muted-foreground"
            aria-label={t("composer.attach")}
            title={t("composer.attach")}
          >
            <Paperclip aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="rounded-full text-muted-foreground"
            aria-label={t("composer.voice")}
            title={t("composer.voice")}
          >
            <Mic aria-hidden="true" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {busy && onStop ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onStop}
              className="gap-1.5 rounded-full"
            >
              <Square className="size-3.5" aria-hidden="true" />
              {t("composer.stop")}
            </Button>
          ) : null}
          <Button
            type="button"
            size={size === "hero" ? "default" : "sm"}
            onClick={submit}
            disabled={!canSend}
            className="gap-1.5 rounded-full"
            aria-label={t("composer.send")}
          >
            {busy ? t("composer.sending") : t("composer.build")}
            <ArrowUp className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}
