"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function WorkshopJoinPage() {
  const router = useRouter();
  const [sessionCode, setSessionCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = useCallback(async () => {
    if (!sessionCode.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/workshops/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionCode: sessionCode.trim().toUpperCase() }),
      });
      if (res.ok) {
        const json = await res.json() as { data: { sessionId: string } };
        router.push(`/workshops/${json.data.sessionId}`);
      } else {
        const err = await res.json() as { error?: { message?: string } };
        setError(err.error?.message ?? "Failed to join workshop");
      }
    } catch {
      setError("Failed to join workshop");
    } finally {
      setSubmitting(false);
    }
  }, [sessionCode, router]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Join Workshop</CardTitle>
          <CardDescription>
            Enter the 6-character session code to join a workshop.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            type="text"
            value={sessionCode}
            onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
            placeholder="Enter session code..."
            maxLength={6}
            className="w-full border rounded-lg px-4 py-3 text-center text-2xl font-mono tracking-widest bg-background"
            onKeyDown={(e) => { if (e.key === "Enter") void handleJoin(); }}
          />
          {error && (
            <p className="text-sm text-red-600 text-center">{error}</p>
          )}
          <Button
            className="w-full"
            size="lg"
            onClick={() => void handleJoin()}
            disabled={submitting || sessionCode.trim().length < 6}
          >
            {submitting ? "Joining..." : "Join Workshop"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
