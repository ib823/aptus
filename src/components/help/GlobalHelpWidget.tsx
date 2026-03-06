"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircleQuestion, X, Send, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ChatMessage {
  id: string;
  sender: "client" | "consultant";
  text: string;
  timestamp: string;
}

interface GlobalHelpWidgetProps {
  userRole: string;
  assessmentId?: string; // Optional: bind to assessment context if available
}

export function GlobalHelpWidget({ userRole, assessmentId }: GlobalHelpWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Load existing session on open
  useEffect(() => {
    if (isOpen && !sessionId) {
      const initSession = async () => {
        try {
          const res = await fetch("/api/help/conversation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assessmentId }),
          });
          if (res.ok) {
            const data = await res.json();
            setSessionId(data.sessionId);
            setMessages(data.responses || []);
          }
        } catch (e) {
          console.error("Failed to init help session", e);
        }
      };
      void initSession();
    }
  }, [isOpen, sessionId, assessmentId]);

  // Polling for updates (respects visibility)
  useEffect(() => {
    if (!isOpen || !sessionId || isMinimized) return;

    let cancelled = false;
    const fetchUpdates = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch(`/api/help/conversation?sessionId=${sessionId}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setMessages(data.responses || []);
        }
      } catch {
        // fail silently
      }
    };

    const interval = setInterval(fetchUpdates, 5000);
    
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void fetchUpdates();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isOpen, sessionId, isMinimized]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !sessionId) return;

    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      sender: userRole === "consultant" ? "consultant" : "client",
      text: message.trim(),
      timestamp: new Date().toISOString(),
    };

    // Optimistic update
    setMessages((prev) => [...prev, newMessage]);
    setMessage("");
    setLoading(true);

    try {
      await fetch("/api/help/conversation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: newMessage }),
      });
    } catch (e) {
      console.error("Message send failed", e);
    } finally {
      setLoading(false);
    }
  };

  // Only show the trigger button to non-consultants, unless they are already in an active session
  if (!isOpen && userRole === "consultant") return null;

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
          <span className="text-sm font-semibold">Live Support</span>
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
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-2 opacity-60">
                <MessageCircleQuestion className="w-8 h-8 mx-auto" />
                <p className="text-sm">Ask a question and an ABeam consultant will assist you.</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMe = (userRole === "consultant" && msg.sender === "consultant") || 
                             (userRole !== "consultant" && msg.sender === "client");
                
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      isMe 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-muted border'
                    }`}>
                      <p>{msg.text}</p>
                      <span className={`text-[10px] mt-1 block ${isMe ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Footer Input */}
          <div className="p-3 border-t bg-card">
            <form onSubmit={sendMessage} className="flex items-center gap-2">
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message..."
                className="flex-1"
                disabled={loading || !sessionId}
              />
              <Button type="submit" size="icon" disabled={!message.trim() || loading || !sessionId}>
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}