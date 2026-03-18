"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import {
  MessageCircleQuestion, X, Send, Minus,
  HelpCircle, Bug, BookOpen, MessageSquare, Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ChatMessage {
  id: string;
  senderId: string;
  senderRole: "client" | "consultant";
  content: string;
  createdAt: string;
  readAt: string | null;
}

interface GlobalHelpWidgetProps {
  userRole: string;
  assessmentId?: string;
}

const CONSULTANT_ROLES = ["consultant", "solution_architect", "platform_admin", "partner_lead"];

const STARTERS = [
  { icon: HelpCircle, label: "Question about this page", category: "question" as const },
  { icon: BookOpen, label: "I'm stuck on a step", category: "stuck" as const },
  { icon: Bug, label: "Report an issue", category: "bug" as const },
  { icon: MessageSquare, label: "General question", category: "general" as const },
];

export function GlobalHelpWidget({ userRole, assessmentId }: GlobalHelpWidgetProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showStarters, setShowStarters] = useState(true);
  const [resolved, setResolved] = useState(false);
  const [rating, setRating] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isConsultant = CONSULTANT_ROLES.includes(userRole);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Poll for new messages when session active
  useEffect(() => {
    if (!isOpen || !sessionId || isMinimized || resolved) return;

    let cancelled = false;
    const fetchMessages = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch(`/api/help/sessions/${sessionId}/messages`);
        if (res.ok && !cancelled) {
          const json = await res.json();
          setMessages(json.data ?? []);
        }
      } catch {
        // Silent fail
      }
    };

    void fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void fetchMessages();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isOpen, sessionId, isMinimized, resolved]);

  const startSession = useCallback(async (category: string, firstMessage: string) => {
    setLoading(true);
    setSendError(null);
    try {
      const res = await fetch("/api/help/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assessmentId,
          currentPage: pathname,
          category,
          message: firstMessage,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        setSessionId(json.data.sessionId);
        setShowStarters(false);
        // Fetch messages
        const msgRes = await fetch(`/api/help/sessions/${json.data.sessionId}/messages`);
        if (msgRes.ok) {
          const msgJson = await msgRes.json();
          setMessages(msgJson.data ?? []);
        }
      } else {
        setSendError("Failed to start help session");
      }
    } catch {
      setSendError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [assessmentId, pathname]);

  const sendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !sessionId) return;

    const content = message.trim();
    setMessage("");
    setLoading(true);
    setSendError(null);

    // Optimistic update
    const optimisticMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      senderId: "me",
      senderRole: isConsultant ? "consultant" : "client",
      content,
      createdAt: new Date().toISOString(),
      readAt: null,
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const res = await fetch(`/api/help/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
        setSendError("Failed to send. Please try again.");
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      setSendError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [message, sessionId, isConsultant]);

  const handleResolve = useCallback(async () => {
    if (!sessionId) return;
    try {
      await fetch(`/api/help/sessions/${sessionId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve" }),
      });
      setResolved(true);
    } catch {
      // Silent
    }
  }, [sessionId]);

  const handleRate = useCallback(async (stars: number) => {
    if (!sessionId) return;
    setRating(stars);
    try {
      await fetch(`/api/help/sessions/${sessionId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rate", rating: stars }),
      });
      setTimeout(() => {
        setIsOpen(false);
        setSessionId(null);
        setMessages([]);
        setShowStarters(true);
        setResolved(false);
        setRating(0);
      }, 1500);
    } catch {
      // Silent
    }
  }, [sessionId]);

  const handleStarterClick = (category: string, label: string) => {
    startSession(category, label);
  };

  // Consultants: hide trigger button (they use /admin/help queue instead)
  if (!isOpen && isConsultant) return null;

  if (!isOpen) {
    return (
      <button
        onClick={() => { setIsOpen(true); setIsMinimized(false); }}
        className="fixed bottom-6 right-6 lg:bottom-8 lg:right-8 z-50 p-3.5 bg-primary text-primary-foreground rounded-full shadow-lg hover:shadow-xl hover:bg-primary/90 transition-all focus-visible:outline-ring"
        aria-label="Ask for Help"
      >
        <MessageCircleQuestion className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div
      className={`fixed right-4 lg:right-8 z-50 flex flex-col bg-card border shadow-xl transition-all duration-300 ${
        isMinimized
          ? "bottom-0 w-72 h-12 rounded-t-lg"
          : "bottom-20 lg:bottom-24 w-80 sm:w-[350px] h-[500px] max-h-[calc(100vh-120px)] rounded-xl"
      }`}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b bg-primary text-primary-foreground cursor-pointer rounded-t-xl"
        onClick={() => setIsMinimized(!isMinimized)}
      >
        <div className="flex items-center gap-2">
          <MessageCircleQuestion className="w-4 h-4" />
          <span className="text-sm font-semibold">Help & Support</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="w-6 h-6 text-primary-foreground hover:bg-primary-foreground/20 hover:text-white"
            onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }}
          >
            <Minus className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="w-6 h-6 text-primary-foreground hover:bg-primary-foreground/20 hover:text-white"
            onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Body */}
      {!isMinimized && (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/20">
            {/* Conversation starters */}
            {showStarters && !sessionId && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground text-center">How can we help?</p>
                <p className="text-xs text-muted-foreground text-center">
                  Choose a topic or type your question below.
                </p>
                <div className="space-y-2">
                  {STARTERS.map((s) => (
                    <button
                      key={s.category}
                      onClick={() => handleStarterClick(s.category, s.label)}
                      disabled={loading}
                      className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left disabled:opacity-50"
                    >
                      <s.icon className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-sm text-foreground">{s.label}</span>
                    </button>
                  ))}
                </div>
                {pathname && (
                  <p className="text-[10px] text-muted-foreground text-center">
                    Context: {pathname}
                  </p>
                )}
              </div>
            )}

            {/* Messages */}
            {messages.map((msg) => {
              const isMe = (isConsultant && msg.senderRole === "consultant") ||
                           (!isConsultant && msg.senderRole === "client");
              return (
                <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    isMe
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted border"
                  }`}>
                    <p>{msg.content}</p>
                    <span className={`text-[10px] mt-1 block ${isMe ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Resolved + CSAT */}
            {resolved && (
              <div className="text-center space-y-3 py-4">
                <p className="text-sm font-medium text-foreground">Session resolved</p>
                {!rating && (
                  <>
                    <p className="text-xs text-muted-foreground">How was your experience?</p>
                    <div className="flex justify-center gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          onClick={() => handleRate(n)}
                          className="p-1 hover:scale-110 transition-transform"
                        >
                          <Star className={`w-6 h-6 ${n <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`} />
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {rating > 0 && (
                  <p className="text-xs text-green-600 font-medium">Thank you for your feedback!</p>
                )}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Footer */}
          {!resolved && (
            <div className="p-3 border-t bg-card">
              {sendError && (
                <p className="text-xs text-red-500 mb-2">{sendError}</p>
              )}
              {sessionId ? (
                <div className="space-y-2">
                  <form onSubmit={sendMessage} className="flex items-center gap-2">
                    <Input
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Type your message..."
                      className="flex-1"
                      disabled={loading}
                    />
                    <Button type="submit" size="icon" disabled={!message.trim() || loading}>
                      <Send className="w-4 h-4" />
                    </Button>
                  </form>
                  {isConsultant && (
                    <button
                      onClick={handleResolve}
                      className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Mark as resolved
                    </button>
                  )}
                </div>
              ) : !showStarters ? (
                <form onSubmit={(e) => { e.preventDefault(); if (message.trim()) startSession("general", message.trim()); }} className="flex items-center gap-2">
                  <Input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type your question..."
                    className="flex-1"
                    disabled={loading}
                    autoFocus
                  />
                  <Button type="submit" size="icon" disabled={!message.trim() || loading}>
                    <Send className="w-4 h-4" />
                  </Button>
                </form>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  );
}
