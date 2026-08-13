"use client";

import { ArrowUp, Check, FileText, ImageIcon, Mic, Paperclip, Square, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";

const ACCEPTED =
  "image/*,.pdf,.txt,.md,.csv,.json,.py,.ts,.tsx,.js,.jsx,.html,.css,.yml,.yaml";
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 5;

export type ComposerAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  /** Plain text extracted for the model (text files) or a short image note. */
  modelText: string;
  previewUrl?: string;
  kind: "image" | "file";
};

interface PromptComposerProps {
  onSubmit: (value: string, attachments?: ComposerAttachment[]) => void;
  onStop?: () => void;
  placeholder?: string;
  animatedPlaceholders?: string[];
  disabled?: boolean;
  busy?: boolean;
  autoFocus?: boolean;
  size?: "hero" | "compact";
  className?: string;
  initialValue?: string;
  /** Listen for drag/drop on the whole window (homepage / chat page). */
  enablePageDrop?: boolean;
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
        setText(current.slice(0, charRef.current));
        if (charRef.current >= current.length) {
          deletingRef.current = true;
          return 2200;
        }
        return 45;
      }

      charRef.current = Math.max(0, charRef.current - 2);
      setText(current.slice(0, charRef.current));
      if (charRef.current === 0) {
        deletingRef.current = false;
        indexRef.current += 1;
        return 400;
      }
      return 18;
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

async function fileToAttachment(file: File): Promise<ComposerAttachment | null> {
  if (file.size > MAX_FILE_BYTES) return null;
  const id = `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`;
  const mime = file.type || "application/octet-stream";
  const isImage = mime.startsWith("image/");
  if (isImage) {
    const previewUrl = URL.createObjectURL(file);
    return {
      id,
      name: file.name,
      mimeType: mime,
      size: file.size,
      kind: "image",
      previewUrl,
      modelText: `[Attached image: ${file.name} (${mime}, ${file.size} bytes)]`,
    };
  }
  // Text-like files — read content for the model
  const textLike =
    mime.startsWith("text/") ||
    /\.(txt|md|csv|json|py|ts|tsx|js|jsx|html|css|ya?ml|toml|xml)$/i.test(file.name);
  if (textLike) {
    const text = (await file.text()).slice(0, 40_000);
    return {
      id,
      name: file.name,
      mimeType: mime,
      size: file.size,
      kind: "file",
      modelText: `[Attached file: ${file.name}]\n\`\`\`\n${text}\n\`\`\``,
    };
  }
  if (mime === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return {
      id,
      name: file.name,
      mimeType: mime || "application/pdf",
      size: file.size,
      kind: "file",
      modelText: `[Attached PDF: ${file.name} (${file.size} bytes) — content not extracted yet; use knowledge upload for deep PDF reading.]`,
    };
  }
  return {
    id,
    name: file.name,
    mimeType: mime,
    size: file.size,
    kind: "file",
    modelText: `[Attached file: ${file.name} (${mime}, ${file.size} bytes)]`,
  };
}

export function formatPromptWithAttachments(
  value: string,
  attachments: ComposerAttachment[],
): string {
  if (!attachments.length) return value.trim();
  const blocks = attachments.map((a) => a.modelText).join("\n\n");
  return `${value.trim()}\n\n${blocks}`.trim();
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
  enablePageDrop = true,
}: PromptComposerProps) {
  const { t } = useTranslation("common");
  const [value, setValue] = useState(initialValue);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const dragDepthRef = useRef(0);
  const inputId = useId();
  const animated = useTypewriter(animatedPlaceholders, value.length === 0 && !recording);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, size === "hero" ? 240 : 160)}px`;
  }, [value, size]);

  useEffect(() => {
    return () => {
      for (const a of attachments) {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup on unmount only
  }, []);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    const next: ComposerAttachment[] = [];
    for (const file of list.slice(0, MAX_FILES)) {
      const att = await fileToAttachment(file);
      if (att) next.push(att);
    }
    if (!next.length) return;
    setAttachments((prev) => {
      const merged = [...prev, ...next].slice(0, MAX_FILES);
      return merged;
    });
  }, []);

  useEffect(() => {
    if (!enablePageDrop) return;
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault();
      dragDepthRef.current += 1;
      setDragging(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setDragging(false);
    };
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    };
    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      dragDepthRef.current = 0;
      setDragging(false);
      void addFiles(e.dataTransfer.files);
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [enablePageDrop, addFiles]);

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  };

  const canSend =
    (value.trim().length > 0 || attachments.length > 0) &&
    !disabled &&
    !busy &&
    !recording &&
    !transcribing;

  const submit = () => {
    if (!canSend) return;
    const payload = formatPromptWithAttachments(value, attachments);
    onSubmit(payload, attachments);
    setValue("");
    for (const a of attachments) {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    }
    setAttachments([]);
  };

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const startRecording = async () => {
    setVoiceError(null);
    if (busy || disabled || recording || transcribing) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setVoiceError(t("composer.micDenied"));
      stopTracks();
    }
  };

  const cancelRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    stopTracks();
    setRecording(false);
    setTranscribing(false);
  };

  const finishRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setRecording(false);
      return;
    }
    setTranscribing(true);
    recorder.onstop = () => {
      void (async () => {
        try {
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });
          chunksRef.current = [];
          stopTracks();
          mediaRecorderRef.current = null;
          setRecording(false);
          const buffer = await blob.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = "";
          for (let i = 0; i < bytes.length; i += 1) {
            binary += String.fromCharCode(bytes[i]!);
          }
          const base64 = btoa(binary);
          const { transcribeAudioAction } = await import("@/lib/actions/transcribe");
          const result = await transcribeAudioAction({
            audioBase64: base64,
            mimeType: blob.type || "audio/webm",
          });
          const text = (result.text || "").trim();
          if (text) {
            setValue((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
          } else {
            setVoiceError(t("composer.transcribeEmpty"));
          }
        } catch {
          setVoiceError(t("composer.transcribeError"));
        } finally {
          setTranscribing(false);
        }
      })();
    };
    recorder.stop();
  };

  return (
    <div className={cn("relative", className)}>
      {dragging ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[28px] border-2 border-dashed border-brand bg-brand/10 backdrop-blur-sm">
          <p className="text-sm font-medium text-brand">{t("composer.dropHint")}</p>
        </div>
      ) : null}

      <div
        className={cn(
          "glass-strong shadow-glow-sm rounded-[28px] transition-shadow focus-within:shadow-glow",
          size === "hero" ? "rounded-[32px] p-5 sm:p-6" : "p-3",
          recording && "ring-1 ring-brand/50",
        )}
      >
        {attachments.length > 0 ? (
          <ul className="mb-2 flex flex-wrap gap-2 px-1">
            {attachments.map((att) => (
              <li
                key={att.id}
                className="flex max-w-full items-center gap-2 rounded-full border border-border/60 bg-foreground/[0.04] py-1 pr-1 pl-2 text-xs"
              >
                {att.kind === "image" && att.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
                  <img
                    src={att.previewUrl}
                    alt=""
                    className="size-6 rounded-full object-cover"
                  />
                ) : att.kind === "image" ? (
                  <ImageIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <FileText className="size-3.5 text-muted-foreground" aria-hidden="true" />
                )}
                <span className="max-w-[10rem] truncate">{att.name}</span>
                <button
                  type="button"
                  className="rounded-full p-1 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                  onClick={() => removeAttachment(att.id)}
                  aria-label={t("composer.removeAttachment")}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <label htmlFor={inputId} className="sr-only">
          {t("composer.label")}
        </label>
        <textarea
          id={inputId}
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (recording) finishRecording();
              else submit();
            }
          }}
          placeholder={
            recording
              ? t("composer.recording")
              : transcribing
                ? t("composer.transcribing")
                : animatedPlaceholders
                  ? animated
                  : placeholder
          }
          disabled={disabled || busy || recording || transcribing}
          rows={size === "hero" ? 3 : 1}
          className={cn(
            "w-full resize-none bg-transparent text-foreground placeholder:text-muted-foreground/70 focus:outline-none",
            size === "hero"
              ? "min-h-20 px-2.5 pt-1.5 text-lg leading-relaxed"
              : "min-h-10 px-2 pt-1 text-sm",
          )}
        />

        {voiceError ? (
          <p className="mt-1 px-2 text-xs text-destructive">{voiceError}</p>
        ) : null}

        <div
          className={cn(
            "flex items-center justify-between gap-2",
            size === "hero" ? "mt-3" : "mt-1",
          )}
        >
          <div className="flex items-center gap-1">
            {!recording && !transcribing ? (
              <Button
                type="button"
                variant="ghost"
                size={size === "hero" ? "icon" : "icon-sm"}
                className="rounded-full text-muted-foreground"
                aria-label={t("composer.attach")}
                title={t("composer.attach")}
                disabled={busy || disabled}
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip aria-hidden="true" />
              </Button>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={ACCEPTED}
              multiple
              onChange={(e) => {
                if (e.target.files) void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            {recording || transcribing ? (
              <Button
                type="button"
                variant="ghost"
                size={size === "hero" ? "icon" : "icon-sm"}
                className="rounded-full text-brand"
                aria-label={t("composer.stopRecording")}
                title={t("composer.stopRecording")}
                disabled={transcribing}
                onClick={cancelRecording}
              >
                <Square className="size-3.5 fill-current" aria-hidden="true" />
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size={size === "hero" ? "icon" : "icon-sm"}
                className="rounded-full text-muted-foreground"
                aria-label={t("composer.voice")}
                title={t("composer.voice")}
                disabled={busy || disabled}
                onClick={() => void startRecording()}
              >
                <Mic aria-hidden="true" />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {busy && onStop && !recording && !transcribing ? (
              <Button
                type="button"
                size={size === "hero" ? "icon" : "icon-sm"}
                variant="secondary"
                onClick={onStop}
                className="rounded-md"
                aria-label={t("composer.stop")}
                title={t("composer.stop")}
              >
                <Square className="size-3.5 fill-current" aria-hidden="true" />
              </Button>
            ) : recording || transcribing ? (
              <Button
                type="button"
                size={size === "hero" ? "default" : "sm"}
                onClick={finishRecording}
                disabled={transcribing}
                className={cn(
                  "gap-1.5 rounded-full",
                  size === "hero" && "h-11 px-5 text-base",
                )}
                aria-label={t("composer.confirmRecording")}
                aria-busy={transcribing}
              >
                {transcribing ? (
                  t("composer.transcribing")
                ) : (
                  <Check className={size === "hero" ? "size-5" : "size-4"} aria-hidden="true" />
                )}
              </Button>
            ) : (
              <Button
                type="button"
                size={size === "hero" ? "default" : "sm"}
                onClick={submit}
                disabled={!canSend}
                className={cn(
                  "gap-1.5 rounded-full",
                  size === "hero" && "h-11 px-5 text-base",
                )}
                aria-label={t("composer.send")}
              >
                {t("composer.build")}
                <ArrowUp className={size === "hero" ? "size-5" : "size-4"} aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
