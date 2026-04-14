import { useState, useCallback } from "react";

const LS_KEY = "terminal-sidebar-visible";

function readFromStorage(): boolean {
  try {
    const v = localStorage.getItem(LS_KEY);
    return v !== "0";
  } catch {
    return true;
  }
}

/**
 * Controls whether the Terminal link is shown in the sidebar.
 * Persisted in localStorage.
 */
export function useTerminalSidebarVisible(): [boolean, (v: boolean) => void] {
  const [visible, setVisibleState] = useState(readFromStorage);

  const setVisible = useCallback((v: boolean) => {
    setVisibleState(v);
    try {
      localStorage.setItem(LS_KEY, v ? "1" : "0");
    } catch {
      // ignore
    }
  }, []);

  return [visible, setVisible];
}
