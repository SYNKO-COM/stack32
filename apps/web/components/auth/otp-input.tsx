"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";

import { Input } from "@/components/ui/input";
import { AUTH_OTP_LENGTH } from "@/lib/auth/password";
import { cn } from "@/lib/utils";

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  "aria-label"?: string;
}

export function OtpInput({
  value,
  onChange,
  length = AUTH_OTP_LENGTH,
  disabled = false,
  autoFocus = true,
  "aria-label": ariaLabel = "One-time code",
}: OtpInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  const setDigit = (index: number, digit: string) => {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join("").slice(0, length));
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    onChange(pasted);
    const focusAt = Math.min(pasted.length, length - 1);
    refs.current[focusAt]?.focus();
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      refs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowRight" && index < length - 1) {
      e.preventDefault();
      refs.current[index + 1]?.focus();
    }
  };

  return (
    <div className="flex justify-center gap-2" role="group" aria-label={ariaLabel}>
      {digits.map((digit, index) => (
        <Input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={1}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          value={digit}
          aria-label={`${ariaLabel} digit ${index + 1}`}
          className={cn(
            "h-12 w-11 rounded-xl text-center text-lg font-semibold tracking-widest sm:h-14 sm:w-12",
          )}
          onPaste={handlePaste}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, "");
            if (!raw) {
              setDigit(index, "");
              return;
            }
            const char = raw.slice(-1);
            setDigit(index, char);
            if (index < length - 1) refs.current[index + 1]?.focus();
          }}
        />
      ))}
    </div>
  );
}
