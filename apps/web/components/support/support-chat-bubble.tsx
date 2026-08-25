"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Download,
  FileText,
  HelpCircle,
  Mic,
  Paperclip,
  Send,
  Square,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { create } from "zustand";
import type { RealtimeChannel, SupabaseClient, User } from "@supabase/supabase-js";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/*
 * Live support chat with the Stack32 team.
 *
 * The launcher is the "?" button next to the logo in the app sidebar
 * (SupportChatTrigger); the panel itself mounts once in providers. The user
 * writes through their own session (RLS: they only ever see their own
 * conversation); the team answers from the admin console. Realtime keeps both
 * sides in sync. Attachments live in the private support-attachments bucket
 * under {user_id}/{conversation_id}/.
 */

type SupportMessage = {
  id: string;
  sender: "user" | "admin";
  admin_label: string | null;
  body: string | null;
  attachment_path: string | null;
  attachment_mime: string | null;
  attachment_name: string | null;
  created_at: string;
};

type ConversationMeta = {
  id: string;
  user_unread_count: number;
};

const MESSAGE_COLUMNS =
  "id, sender, admin_label, body, attachment_path, attachment_mime, attachment_name, created_at";
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Shared UI state so the sidebar trigger and the panel stay in sync. */
interface SupportChatState {
  open: boolean;
  unread: number;
  setOpen: (open: boolean) => void;
  setUnread: (unread: number) => void;
}

export const useSupportChatStore = create<SupportChatState>((set) => ({
  open: false,
  unread: 0,
  setOpen: (open) => set({ open }),
  setUnread: (unread) => set({ unread }),
}));

function getUntypedClient(): SupabaseClient | null {
  return createSupabaseBrowserClient() as unknown as SupabaseClient | null;
}

/** "?" launcher for the sidebar header — badge included. */
export function SupportChatTrigger() {
  const { t } = useTranslation("common");
  const open = useSupportChatStore((s) => s.open);
  const unread = useSupportChatStore((s) => s.unread);
  const setOpen = useSupportChatStore((s) => s.setOpen);

  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-label={t("supportChat.open")}
      title={t("supportChat.open")}
      className="relative flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground"
    >
      <HelpCircle className="size-5" />
      {unread > 0 ? (
        <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </button>
  );
}

export function SupportChatBubble() {
  const { t } = useTranslation("common");
  const [user, setUser] = useState<User | null>(null);
  const open = useSupportChatStore((s) => s.open);
  const setOpen = useSupportChatStore((s) => s.setOpen);
  const setUnread = useSupportChatStore((s) => s.setUnread);
  const [conversation, setConversation] = useState<ConversationMeta | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordCancelledRef = useRef(false);

  // Track the auth session; the chat only exists for signed-in users.
  useEffect(() => {
    const supabase = getUntypedClient();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load (or lazily learn about) the user's conversation + unread badge.
  const refreshConversation = useCallback(async () => {
    const supabase = getUntypedClient();
    if (!supabase || !user) return null;
    const { data } = await supabase
      .from("support_conversations")
      .select("id, user_unread_count")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const meta = (data as ConversationMeta | null) ?? null;
    setConversation(meta);
    return meta;
  }, [user]);

  useEffect(() => {
    if (!user) {
      setConversation(null);
      setMessages([]);
      return;
    }
    void refreshConversation();
  }, [user, refreshConversation]);

  // Mirror the unread counter into the shared store for the sidebar badge.
  useEffect(() => {
    setUnread(conversation?.user_unread_count ?? 0);
  }, [conversation?.user_unread_count, setUnread]);

  const loadMessages = useCallback(async (conversationId: string) => {
    const supabase = getUntypedClient();
    if (!supabase) return;
    const { data } = await supabase
      .from("support_messages")
      .select(MESSAGE_COLUMNS)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (data) setMessages(data as SupportMessage[]);
  }, []);

  const markRead = useCallback(async (conversationId: string) => {
    const supabase = getUntypedClient();
    if (!supabase) return;
    await supabase.rpc("support_mark_read", { p_conversation_id: conversationId });
    setConversation((c) => (c ? { ...c, user_unread_count: 0 } : c));
  }, []);

  // Signed URLs for attachments (private bucket; RLS scopes to own folder).
  useEffect(() => {
    const supabase = getUntypedClient();
    if (!supabase) return;
    const missing = messages.filter(
      (m) => m.attachment_path && !attachmentUrls[m.id],
    );
    if (missing.length === 0) return;
    let cancelled = false;
    void Promise.all(
      missing.map(async (m) => {
        const { data } = await supabase.storage
          .from("support-attachments")
          .createSignedUrl(m.attachment_path as string, 3600);
        return [m.id, data?.signedUrl ?? ""] as const;
      }),
    ).then((pairs) => {
      if (cancelled) return;
      setAttachmentUrls((current) => {
        const next = { ...current };
        for (const [id, url] of pairs) if (url) next[id] = url;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [messages, attachmentUrls]);

  // openRef lets the realtime callback know whether the panel is visible.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // Realtime: inserts + admin deletions on my conversation, unread updates.
  useEffect(() => {
    const supabase = getUntypedClient();
    if (!supabase || !user || !conversation) return;

    const channel = supabase
      .channel(`support:${conversation.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const message = payload.new as SupportMessage;
          setMessages((current) =>
            current.some((m) => m.id === message.id)
              ? current
              : [...current, message],
          );
          if (message.sender === "admin") {
            if (openRef.current) {
              void markRead(conversation.id);
            } else {
              setConversation((c) =>
                c ? { ...c, user_unread_count: c.user_unread_count + 1 } : c,
              );
            }
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "support_messages" },
        (payload) => {
          const deletedId = (payload.old as { id?: string }).id;
          if (deletedId) {
            setMessages((current) => current.filter((m) => m.id !== deletedId));
          }
        },
      )
      .subscribe();
    channelRef.current = channel;
    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [user, conversation?.id, markRead]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !conversation) return;
    void loadMessages(conversation.id);
    void markRead(conversation.id);
  }, [open, conversation?.id, loadMessages, markRead]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  // Recording timer.
  useEffect(() => {
    if (!recording) return;
    setRecordSeconds(0);
    const interval = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [recording]);

  const ensureConversation = useCallback(async (): Promise<ConversationMeta | null> => {
    const supabase = getUntypedClient();
    if (!supabase || !user) return null;
    if (conversation) return conversation;
    const { data, error } = await supabase
      .from("support_conversations")
      .insert({ user_id: user.id })
      .select("id, user_unread_count")
      .single();
    if (error || !data) return null;
    const meta = data as ConversationMeta;
    setConversation(meta);
    return meta;
  }, [conversation, user]);

  async function sendText() {
    const supabase = getUntypedClient();
    const body = draft.trim();
    if (!supabase || !user || !body || sending) return;
    setSending(true);
    setFailed(false);
    try {
      const conv = await ensureConversation();
      if (!conv) throw new Error("no conversation");
      const { error } = await supabase.from("support_messages").insert({
        conversation_id: conv.id,
        sender: "user",
        author_id: user.id,
        body,
      });
      if (error) throw error;
      setDraft("");
      await loadMessages(conv.id);
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  }

  const sendAttachment = useCallback(
    async (file: Blob, name: string, mime: string) => {
      const supabase = getUntypedClient();
      if (!supabase || !user || sending) return;
      if (file.size === 0 || file.size > MAX_ATTACHMENT_BYTES) {
        setFailed(true);
        return;
      }
      setSending(true);
      setFailed(false);
      try {
        const conv = await ensureConversation();
        if (!conv) throw new Error("no conversation");
        const ext = name.includes(".")
          ? name.slice(name.lastIndexOf(".") + 1).toLowerCase().slice(0, 8)
          : mime.split("/")[1]?.slice(0, 8) || "bin";
        const path = `${user.id}/${conv.id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("support-attachments")
          .upload(path, file, { contentType: mime });
        if (uploadError) throw uploadError;
        const { error } = await supabase.from("support_messages").insert({
          conversation_id: conv.id,
          sender: "user",
          author_id: user.id,
          body: null,
          attachment_path: path,
          attachment_mime: mime,
          attachment_name: name,
          attachment_size: file.size,
        });
        if (error) throw error;
        await loadMessages(conv.id);
      } catch {
        setFailed(true);
      } finally {
        setSending(false);
      }
    },
    [ensureConversation, loadMessages, sending, user],
  );

  function onFilePicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void sendAttachment(file, file.name, file.type || "application/octet-stream");
  }

  async function startRecording() {
    if (recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(
        (candidate) => MediaRecorder.isTypeSupported(candidate),
      );
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      recordCancelledRef.current = false;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        if (recordCancelledRef.current) return;
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunks, { type });
        const ext = type.includes("mp4") ? "m4a" : "webm";
        void sendAttachment(blob, `audio-message.${ext}`, type);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setFailed(true);
    }
  }

  function stopRecording(cancel: boolean) {
    recordCancelledRef.current = cancel;
    recorderRef.current?.stop();
    recorderRef.current = null;
  }

  // Signed out (or Supabase not configured): no panel at all.
  if (!user || !open) return null;

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6">
      <div className="flex h-[28rem] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-gradient-to-r from-brand-from to-brand-to px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-white">{t("supportChat.title")}</p>
            <p className="text-xs text-white/80">{t("supportChat.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t("supportChat.close")}
            className="rounded-full p-1.5 text-white/90 transition hover:bg-white/15"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
          {messages.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {t("supportChat.empty")}
            </p>
          ) : (
            messages.map((m) => {
              const url = m.attachment_path ? attachmentUrls[m.id] : null;
              const isImage = m.attachment_mime?.startsWith("image/");
              const isAudio = m.attachment_mime?.startsWith("audio/");
              return (
                <div
                  key={m.id}
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
                    m.sender === "user"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground",
                  )}
                >
                  {m.attachment_path ? (
                    isImage && url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt={m.attachment_name ?? t("supportChat.photo")}
                        className="max-h-56 w-full rounded-lg object-contain"
                      />
                    ) : isAudio && url ? (
                      <audio controls src={url} className="h-10 w-56 max-w-full" />
                    ) : (
                      <a
                        href={url ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        download={m.attachment_name ?? undefined}
                        className="flex items-center gap-2 underline-offset-2 hover:underline"
                      >
                        <FileText className="size-4 shrink-0" />
                        <span className="truncate">
                          {m.attachment_name ?? t("supportChat.file")}
                        </span>
                        <Download className="size-3.5 shrink-0" />
                      </a>
                    )
                  ) : null}
                  {m.body ? <span>{m.body}</span> : null}
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {failed ? (
          <p className="px-4 pb-1 text-xs text-destructive">{t("supportChat.error")}</p>
        ) : null}

        {recording ? (
          <div className="flex items-center gap-3 border-t border-border px-4 py-3">
            <span className="flex items-center gap-2 text-sm text-destructive">
              <span className="size-2.5 animate-pulse rounded-full bg-destructive" />
              {t("supportChat.recording")} {Math.floor(recordSeconds / 60)}:
              {String(recordSeconds % 60).padStart(2, "0")}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => stopRecording(true)}
                className="rounded-full px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-secondary"
              >
                {t("supportChat.cancel")}
              </button>
              <button
                type="button"
                onClick={() => stopRecording(false)}
                aria-label={t("supportChat.sendAudio")}
                className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:brightness-110"
              >
                <Square className="size-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-end gap-1.5 border-t border-border px-3 py-2.5">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={onFilePicked}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              aria-label={t("supportChat.attach")}
              title={t("supportChat.attach")}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-40"
            >
              <Paperclip className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => void startRecording()}
              disabled={sending}
              aria-label={t("supportChat.record")}
              title={t("supportChat.record")}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-40"
            >
              <Mic className="size-4" />
            </button>
            <textarea
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendText();
                }
              }}
              placeholder={t("supportChat.placeholder")}
              className="max-h-24 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
            />
            <button
              type="button"
              onClick={() => void sendText()}
              disabled={sending || !draft.trim()}
              aria-label={t("supportChat.send")}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:brightness-110 disabled:opacity-40"
            >
              <Send className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
