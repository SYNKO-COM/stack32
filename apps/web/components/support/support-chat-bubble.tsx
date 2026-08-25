"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { RealtimeChannel, SupabaseClient, User } from "@supabase/supabase-js";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/*
 * Live support chat with the Stack32 team.
 *
 * The user writes through their own session (RLS: they only ever see their
 * own conversation); the team answers from the admin console. Realtime keeps
 * both sides in sync. The support tables are newer than the generated
 * database types, hence the untyped client below.
 */

type SupportMessage = {
  id: string;
  sender: "user" | "admin";
  admin_label: string | null;
  body: string;
  created_at: string;
};

type ConversationMeta = {
  id: string;
  user_unread_count: number;
};

function getUntypedClient(): SupabaseClient | null {
  return createSupabaseBrowserClient() as unknown as SupabaseClient | null;
}

export function SupportChatBubble() {
  const { t } = useTranslation("common");
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [conversation, setConversation] = useState<ConversationMeta | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Track the auth session; the bubble only exists for signed-in users.
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

  const loadMessages = useCallback(async (conversationId: string) => {
    const supabase = getUntypedClient();
    if (!supabase) return;
    const { data } = await supabase
      .from("support_messages")
      .select("id, sender, admin_label, body, created_at")
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

  // Realtime: messages of my conversation + unread counter updates.
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
      .subscribe();
    channelRef.current = channel;
    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [user, conversation?.id, markRead]); // eslint-disable-line react-hooks/exhaustive-deps

  // openRef lets the realtime callback know whether the panel is visible.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!open || !conversation) return;
    void loadMessages(conversation.id);
    void markRead(conversation.id);
  }, [open, conversation?.id, loadMessages, markRead]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function send() {
    const supabase = getUntypedClient();
    const body = draft.trim();
    if (!supabase || !user || !body || sending) return;
    setSending(true);
    setFailed(false);
    try {
      let conv = conversation;
      if (!conv) {
        const { data, error } = await supabase
          .from("support_conversations")
          .insert({ user_id: user.id })
          .select("id, user_unread_count")
          .single();
        if (error || !data) throw error ?? new Error("no conversation");
        conv = data as ConversationMeta;
        setConversation(conv);
      }
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

  // Signed out (or Supabase not configured): no bubble at all.
  if (!user) return null;

  const unread = conversation?.user_unread_count ?? 0;

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6">
      {open ? (
        <div className="flex h-[28rem] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between gap-2 border-b border-border bg-gradient-to-r from-brand-from to-brand-to px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">
                {t("supportChat.title")}
              </p>
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
              messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
                    m.sender === "user"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground",
                  )}
                >
                  {m.body}
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {failed ? (
            <p className="px-4 pb-1 text-xs text-destructive">
              {t("supportChat.error")}
            </p>
          ) : null}

          <div className="flex items-end gap-2 border-t border-border px-3 py-2.5">
            <textarea
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={t("supportChat.placeholder")}
              className="max-h-24 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || !draft.trim()}
              aria-label={t("supportChat.send")}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:brightness-110 disabled:opacity-40"
            >
              <Send className="size-4" />
            </button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("supportChat.open")}
        className="relative flex size-13 items-center justify-center rounded-full bg-gradient-to-r from-brand-from to-brand-to text-white shadow-lg transition hover:scale-105"
      >
        <MessageCircle className="size-6" />
        {!open && unread > 0 ? (
          <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
    </div>
  );
}
