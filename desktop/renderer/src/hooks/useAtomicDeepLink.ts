import React from "react";
import { getDesktopApiOrNull } from "@ipc/desktopApi";

export type AtomicDeepLinkAuthParams = {
  jwt: string;
  email: string;
  userId: string;
  isNewUser: boolean;
};

export type AtomicStripeSuccessParams = {
  sessionId: string | null;
};

/**
 * Subscribes to atomicbot-hermes:// deep links delivered by the main process.
 *
 * The backend emits three URL shapes (see atomic-bot-backend/docs/DESKTOP_INTEGRATION.md);
 * we override the default `atomicbot://` scheme to `atomicbot-hermes://` via
 * `?scheme=atomicbot-hermes` on the OAuth/topup initiator URLs:
 *  - atomicbot-hermes://auth?token=&email=&userId=&isNewUser=
 *  - atomicbot-hermes://stripe-success?session_id=cs_...
 *  - atomicbot-hermes://stripe-cancel
 */
export function useAtomicDeepLink(handlers: {
  onAuth?: (params: AtomicDeepLinkAuthParams) => void;
  onAuthError?: () => void;
  onStripeSuccess?: (params: AtomicStripeSuccessParams) => void;
  onStripeCancel?: () => void;
}): void {
  const handlersRef = React.useRef(handlers);
  handlersRef.current = handlers;

  React.useEffect(() => {
    const api = getDesktopApiOrNull();
    if (!api?.onAtomicDeepLink) return;

    const unsub = api.onAtomicDeepLink((payload) => {
      // macOS hands us the URL with `host = "auth"` and `pathname = ""`,
      // while some Linux desktop environments fire it as `host = ""` and
      // `pathname = "/auth"`. Accept both shapes.
      const hostOrPath = payload.host || payload.pathname.replace(/^\//, "");

      if (hostOrPath === "auth") {
        const { token, email, userId, isNewUser } = payload.params;
        if (token && userId) {
          handlersRef.current.onAuth?.({
            jwt: token,
            email: email ? decodeURIComponent(email) : "",
            userId,
            isNewUser: isNewUser === "true",
          });
        } else {
          handlersRef.current.onAuthError?.();
        }
        return;
      }

      if (hostOrPath === "stripe-success") {
        handlersRef.current.onStripeSuccess?.({
          sessionId: payload.params.session_id ?? null,
        });
        return;
      }

      if (hostOrPath === "stripe-cancel") {
        handlersRef.current.onStripeCancel?.();
      }
    });

    return unsub;
  }, []);
}
