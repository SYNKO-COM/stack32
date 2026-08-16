"use client";

import HCaptcha from "@hcaptcha/react-hcaptcha";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
} from "react";

import { publicEnv } from "@/lib/env";

export type HCaptchaGateHandle = {
  /** Resolve a fresh token, or `undefined` when captcha is not configured. */
  getToken: () => Promise<string | undefined>;
  reset: () => void;
};

/**
 * Invisible hCaptcha (Pro passive / low-friction).
 * Renders nothing when `NEXT_PUBLIC_HCAPTCHA_SITEKEY` is unset (local/mock).
 */
export const HCaptchaGate = forwardRef<HCaptchaGateHandle>(
  function HCaptchaGate(_props, ref) {
    const captchaRef = useRef<HCaptcha>(null);
    const sitekey = publicEnv.NEXT_PUBLIC_HCAPTCHA_SITEKEY;

    const reset = useCallback(() => {
      captchaRef.current?.resetCaptcha();
    }, []);

    const getToken = useCallback(async (): Promise<string | undefined> => {
      if (!sitekey) return undefined;
      const widget = captchaRef.current;
      if (!widget) {
        throw new Error("hCaptcha widget not ready");
      }
      // Invisible: execute only on submit (no checkbox for most users).
      const result = await widget.execute({ async: true });
      const token = result?.response?.trim();
      if (!token) {
        throw new Error("hCaptcha did not return a token");
      }
      return token;
    }, [sitekey]);

    useImperativeHandle(ref, () => ({ getToken, reset }), [getToken, reset]);

    if (!sitekey) return null;

    return (
      <div className="sr-only" aria-hidden="true">
        <HCaptcha ref={captchaRef} sitekey={sitekey} size="invisible" />
      </div>
    );
  },
);
