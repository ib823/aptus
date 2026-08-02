"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  MessageCircleQuestion, Send, CheckCircle,
  User, MapPin, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface HelpSessionSummary {
  id: string;
  clientName: string;
  clientEmail: string;
  assessmentId: string | null;
  currentPage: string | null;
  category: string;
  status: string;
  lastMessage: string | null;
  lastMessageRole: string | null;
  lastMessageAt: string | null;
  unread: boolean;
  createdAt: string;
}

interface ChatMessage {
  id: string;
  senderId: string;
  senderRole: string;
  content: string;
  createdAt: string;
  readAt: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  question: "Question",
  stuck: "Stuck",
  bug: "Bug Report",
  general: "General",
};

export default function AdminHelpPage() {
  const [sessions, setSessions] = useState<HelpSessionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch sessions
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/help/sessions");
      if (res.ok) {
        const json = await res.json();
        setSessions(json.data ?? []);
      }
    } catch {
      // Silent
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 10000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  // Fetch messages for selected session
  const fetchMessages = useCallback(async (sid: string) => {
    try {
      const res = await fetch(`/api/help/sessions/${sid}/messages`);
      if (res.ok) {
        const json = await res.json();
        setMessages(json.data ?? []);
      }
    } catch {
      // Silent
    }
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    fetchMessages(selectedId);
    const interval = setInterval(() => fetchMessages(selectedId), 5000);
    return () => clearInterval(interval);
  }, [selectedId, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !selectedId) return;

    const content = message.trim();
    setMessage("");
    setLoading(true);

    try {
      const res = await fetch(`/api/help/sessions/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        fetchMessages(selectedId);
        fetchSessions();
      } else {
        toast.error("Failed to send message");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  }, [message, selectedId, fetchMessages, fetchSessions]);

  const handleResolve = useCallback(async () => {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/help/sessions/${selectedId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve" }),
      });
      if (res.ok) {
        toast.success("Session resolved");
        fetchSessions();
        setSelectedId(null);
        setMessages([]);
      }
    } catch {
      toast.error("Failed to resolve");
    }
  }, [selectedId, fetchSessions]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchSessions();
    if (selectedId) await fetchMessages(selectedId);
    setRefreshing(false);
  }, [fetchSessions, fetchMessages, selectedId]);

  const selectedSession = sessions.find((s) => s.id === selectedId);

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold text-foreground tracking-tight mb-1">Help Queue</h1>
          <p className="text-base text-muted-foreground">
            {sessions.filter((s) => s.status === "open").length} open ·{" "}
            {sessions.filter((s) => s.status === "active").length} active
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" style={{ minHeight: "500px" }}>
        {/* Session List */}
        <div className="lg:col-span-1 border rounded-lg bg-card overflow-hidden">
          <div className="p-3 border-b bg-muted/30">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sessions</p>
          </div>
          <div className="divide-y max-h-[600px] overflow-y-auto">
            {sessions.length === 0 ? (
              /*
                AN EMPTY QUEUE THAT SAYS WHY IT IS EMPTY.
                "No active help sessions" reads as "nobody needs you right now".
                The truth is that nobody CAN need you here: GlobalHelpWidget was
                the only thing that could open a session, and it is mounted
                nowhere since the portal moved to the new shell. An operator
                refreshing an unreachable queue is the same defect this codebase
                fixes everywhere else — an absence presented as an all-clear.
              */
              <div className="p-8 text-center">
                <MessageCircleQuestion className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No help sessions — and none can be started</p>
                <p className="mt-2 text-xs text-muted-foreground/80 leading-relaxed">
                  The client-side help widget was removed when the portal moved to the new shell, and
                  nothing else in the product opens a session. This queue stays empty until an entry
                  point ships again. Users who click <span className="font-medium">Help &amp; docs</span> reach
                  the Console manual instead.
                </p>
              </div>
            ) : (
              sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`w-full text-left p-3 hover:bg-muted/50 transition-colors ${
                    selectedId === s.id ? "bg-primary/5 border-l-2 border-l-primary" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {s.unread && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                        <p className="text-sm font-medium text-foreground truncate">{s.clientName}</p>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {s.lastMessage ?? "No messages"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        s.status === "open" ? "bg-amber-100 text-amber-700" :
                        s.status === "active" ? "bg-green-100 text-green-700" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {s.status}
                      </span>
                      {s.lastMessageAt && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {timeAgo(s.lastMessageAt)}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Chat Panel */}
        <div className="lg:col-span-2 border rounded-lg bg-card flex flex-col overflow-hidden">
          {selectedSession ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b bg-muted/30">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <p className="text-sm font-semibold text-foreground">{selectedSession.clientName}</p>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        selectedSession.status === "open" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
                      }`}>
                        {selectedSession.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-muted-foreground">{selectedSession.clientEmail}</span>
                      {selectedSession.currentPage && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3" />
                          {selectedSession.currentPage}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {CATEGORY_LABELS[selectedSession.category] ?? selectedSession.category}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedSession.status !== "resolved" && (
                      <Button variant="outline" size="sm" onClick={handleResolve}>
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Resolve
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg) => {
                  const isConsultant = msg.senderRole === "consultant";
                  return (
                    <div key={msg.id} className={`flex ${isConsultant ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                        isConsultant
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted border"
                      }`}>
                        <p>{msg.content}</p>
                        <span className={`text-[10px] mt-1 block ${isConsultant ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              {selectedSession.status !== "resolved" && (
                <div className="p-3 border-t">
                  <form onSubmit={handleSend} className="flex items-center gap-2">
                    <Input
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Type your reply..."
                      className="flex-1"
                      disabled={loading}
                      autoFocus
                    />
                    <Button type="submit" size="icon" disabled={!message.trim() || loading}>
                      <Send className="w-4 h-4" />
                    </Button>
                  </form>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageCircleQuestion className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Select a session to start responding</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
