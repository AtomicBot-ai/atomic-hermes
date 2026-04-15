import { getDesktopApiOrNull } from "@ipc/desktopApi";

/**
 * Open a URL in the system browser via the desktop bridge,
 * falling back to window.open when running outside Electron.
 */
export function openExternal(url: string): void {
  const api = getDesktopApiOrNull();
  if (api?.openExternal) {
    void api.openExternal(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
