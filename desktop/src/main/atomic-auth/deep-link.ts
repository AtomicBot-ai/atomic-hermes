import type { BrowserWindow } from "electron";

export type DeepLinkPayload = {
  host: string;
  pathname: string;
  params: Record<string, string>;
};

export function parseDeepLinkUrl(url: string): DeepLinkPayload | null {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.host,
      pathname: parsed.pathname,
      params: Object.fromEntries(parsed.searchParams.entries()),
    };
  } catch {
    return null;
  }
}

export const DEEP_LINK_IPC_CHANNEL = "atomic:deep-link";

export function handleDeepLink(url: string, win: BrowserWindow | null): void {
  const payload = parseDeepLinkUrl(url);
  if (!payload) {
    console.warn("[main/deep-link] failed to parse URL:", url);
    return;
  }
  if (win && !win.isDestroyed()) {
    win.webContents.send(DEEP_LINK_IPC_CHANNEL, payload);
  }
}
