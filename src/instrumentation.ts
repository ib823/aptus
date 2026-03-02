export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    process.on("uncaughtException", (err) => {
      console.error("[abeam] uncaught exception:", err.stack ?? err.message);
    });
    process.on("unhandledRejection", (reason) => {
      console.error("[abeam] unhandled rejection:", reason);
    });
  }
}
