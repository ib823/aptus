"use client";

import { useState } from "react";

interface WorkshopQRCodeProps {
  qrCodeUrl: string | null;
  sessionCode: string;
}

export function WorkshopQRCode({ qrCodeUrl, sessionCode }: WorkshopQRCodeProps) {
  const [copied, setCopied] = useState(false);

  const joinLink = `/workshops/join?code=${sessionCode}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${joinLink}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  return (
    <div className="flex flex-col items-center gap-3 p-4">
      {qrCodeUrl ? (
        <img
          src={qrCodeUrl}
          alt={`QR code for session ${sessionCode}`}
          className="w-48 h-48 rounded border"
        />
      ) : (
        <div className="w-48 h-48 bg-muted rounded border flex items-center justify-center text-sm text-muted-foreground">
          Start session to generate QR
        </div>
      )}

      <div className="text-center">
        <p className="text-2xl font-mono font-bold tracking-widest">{sessionCode}</p>
        <p className="text-xs text-muted-foreground mt-1">Session Code</p>
      </div>

      <button
        onClick={handleCopy}
        className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
      >
        {copied ? "Copied!" : "Copy Join Link"}
      </button>
    </div>
  );
}
