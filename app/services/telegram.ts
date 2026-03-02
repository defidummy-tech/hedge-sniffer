// ═══ Telegram Notifications ═══
// Fire-and-forget alerts to Telegram bot.
// Silent no-op if TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set.

var BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
var CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

/**
 * Send an alert to Telegram.
 * @param emoji  - Leading emoji (e.g. "🟢")
 * @param title  - Bold headline (e.g. "OPEN ACE-PERP SHORT")
 * @param lines  - Array of detail lines (e.g. ["Size: $40", "Price: $0.14"])
 *
 * Usage: sendAlert("🟢", "OPEN ACE SHORT", ["Size: $40", ...]).catch(function(){});
 */
export async function sendAlert(emoji: string, title: string, lines: string[]): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return; // silently skip if not configured

  var text = emoji + " <b>" + escapeHtml(title) + "</b>\n" +
    lines.map(function(l) { return escapeHtml(l); }).join("\n");

  try {
    await fetch("https://api.telegram.org/bot" + BOT_TOKEN + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
  } catch (e) {
    // Swallow — Telegram failures must never block trading
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
