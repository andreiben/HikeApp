// notifyUser.ts
// Sends developer phone notifications via ntfy.sh
// Set NTFY_TOPIC env var to your ntfy.sh topic (e.g. "hikeapp-andrei-2026")

const NTFY_TOPIC = process.env.NTFY_TOPIC ?? "";

export async function notifyUser(
  title: string,
  message: string,
  priority: "default" | "high" | "urgent" = "default"
): Promise<void> {
  if (!NTFY_TOPIC) return; // silently skip if not configured
  try {
    await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
      method: "POST",
      headers: {
        "Title": title,
        "Priority": priority,
        "Content-Type": "text/plain",
      },
      body: message,
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // non-fatal — never let notification failure break the app
  }
}
