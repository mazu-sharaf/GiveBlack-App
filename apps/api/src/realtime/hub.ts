import type WebSocket from "ws";

type ChannelName = "donation_updates" | "campaign_updates" | "admin_alerts" | "wallet_updates";
type Payload = Record<string, unknown>;

interface Client {
  userId: string;
  role: string;
  socket: WebSocket;
  channels: Set<ChannelName>;
}

const clients = new Set<Client>();

export function registerClient(client: Client): void {
  clients.add(client);
  if (typeof client.socket.on === "function") {
    client.socket.on("close", () => {
      clients.delete(client);
    });
  } else {
    (client.socket as unknown as EventTarget).addEventListener?.("close", () => {
      clients.delete(client);
    });
  }
}

export function broadcastChannel(channel: ChannelName, event: string, payload: Payload): void {
  const msg = JSON.stringify({ channel, event, payload, ts: new Date().toISOString() });
  for (const client of clients) {
    if (!client.channels.has(channel)) continue;
    if (client.socket.readyState !== 1) continue;
    client.socket.send(msg);
  }
}

export function parseChannels(raw: unknown): Set<ChannelName> {
  if (!Array.isArray(raw)) return new Set();
  const out = new Set<ChannelName>();
  for (const item of raw) {
    if (
      item === "donation_updates" ||
      item === "campaign_updates" ||
      item === "admin_alerts" ||
      item === "wallet_updates"
    ) {
      out.add(item);
    }
  }
  return out;
}

export function filterAllowedChannels(role: string, requested: Set<ChannelName>): Set<ChannelName> {
  const allowed = new Set<ChannelName>();
  for (const ch of requested) {
    if (ch === "admin_alerts" && role !== "admin" && role !== "super_admin") continue;
    if (ch === "wallet_updates" && role === "public") continue;
    if (ch === "donation_updates" && role === "public") continue;
    allowed.add(ch);
  }
  return allowed;
}
