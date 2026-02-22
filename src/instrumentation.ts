export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    process.on("uncaughtException", (err) => {
      console.error("[INSTRUMENTATION] Uncaught:", err.stack);
    });
    process.on("unhandledRejection", (err) => {
      console.error("[INSTRUMENTATION] Unhandled rejection:", err);
    });
    console.log("[INSTRUMENTATION] Node.js runtime registered successfully");
  }
}
