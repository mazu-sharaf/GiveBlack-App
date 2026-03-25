import { env } from "../config/env.js";

interface PushMessage {
  to: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function sendExpoPush(message: PushMessage): Promise<void> {
  if (!env.EXPO_ACCESS_TOKEN) {
    throw new Error("Expo push is not configured");
  }

  const chunks = chunkArray(message.to, 100);
  for (const chunk of chunks) {
    const payload = chunk.map((token) => ({
      to: token,
      sound: "default",
      title: message.title,
      body: message.body,
      data: message.data ?? {}
    }));

    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}`
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Expo push failed: ${res.status} ${body}`);
    }
  }
}

function chunkArray<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) {
    out.push(list.slice(i, i + size));
  }
  return out;
}
