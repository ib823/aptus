function isBenignClientDisconnect(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as Error & { code?: unknown }).code;
  return code === "ECONNRESET" && error.message.toLowerCase() === "aborted";
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    process.on("uncaughtException", (err) => {
      if (isBenignClientDisconnect(err)) {
        return;
      }
      console.error("[abeam] uncaught exception:", err.stack ?? err.message);
    });
    process.on("unhandledRejection", (reason) => {
      if (isBenignClientDisconnect(reason)) {
        return;
      }
      console.error("[abeam] unhandled rejection:", reason);
    });
  }
}
