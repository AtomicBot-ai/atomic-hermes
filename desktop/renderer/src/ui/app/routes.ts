export const routes = {
  loading: "/loading",
  error: "/error",
  setup: "/setup",
  chat: "/chat",
  settings: "/settings",
} as const;

export function isBootstrapPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === routes.loading ||
    pathname === routes.error ||
    pathname === routes.setup
  );
}
