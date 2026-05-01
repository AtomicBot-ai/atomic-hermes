import React from "react";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  fetchAtomicBalance,
  restoreAtomicAuth,
  verifyAtomicAuth,
} from "@store/slices/atomicAuthSlice";

/**
 * App-level bootstrap for the Atomic auth slice. Runs once: restores the
 * persisted JWT from the main process, then verifies it and fetches the
 * current balance. Called from the root <App /> component.
 */
export function useAtomicAuthBootstrap(): void {
  const dispatch = useAppDispatch();
  const restoreLoaded = useAppSelector((state) => state.atomicAuth.restoreLoaded);
  const jwt = useAppSelector((state) => state.atomicAuth.jwt);

  React.useEffect(() => {
    void dispatch(restoreAtomicAuth());
  }, [dispatch]);

  React.useEffect(() => {
    if (!restoreLoaded || !jwt) return;
    void dispatch(verifyAtomicAuth());
    void dispatch(fetchAtomicBalance({}));
  }, [restoreLoaded, jwt, dispatch]);
}
