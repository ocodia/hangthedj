import { AppShell } from "@/app/app-shell";
import "@/styles/global.css";

// Bootstrap the application
async function main(): Promise<void> {
  const shell = new AppShell();
  await shell.init();
}

main().catch((err) => {
  console.error("[HangTheDJ] Fatal startup error:", err);
  const app = document.getElementById("app");
  if (app) {
    app.innerHTML =
      '<div style="color:white;padding:2rem;font-family:sans-serif">Failed to start HangTheDJ. Check the console for details.</div>';
  }
});
