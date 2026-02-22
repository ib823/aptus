export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    process.on("uncaughtException", (err) => {
      console.error("[aptus] uncaught exception:", err.stack ?? err.message);
    });
    process.on("unhandledRejection", (reason) => {
      console.error("[aptus] unhandled rejection:", reason);
    });
  }
}
