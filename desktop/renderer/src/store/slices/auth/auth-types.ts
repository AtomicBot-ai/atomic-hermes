import type { AppDispatch, RootState } from "../../store";
import type { HermesSetupMode } from "../mode-persistence";

export type AtomicAuthToken = {
  jwt: string;
  email: string;
  userId: string;
};

/** Snapshot saved when leaving atomic-payg mode (JWT + gateway routing). */
export type AtomicPaygBackup = {
  auth: AtomicAuthToken;
  savedAt: string;
};

/** Snapshot saved when leaving self-managed (provider + model + base URL). */
export type SelfManagedBackup = {
  activeProvider: string;
  activeModel: string;
  baseUrl: string;
  savedAt: string;
};

/** Snapshot saved when leaving local-model mode. */
export type LocalModelBackup = {
  activeModelId: string;
  savedAt: string;
};

export type SwitchContext = {
  dispatch: AppDispatch;
  getState: () => RootState;
  port: number;
};

export type ModeSetupResult = {
  hasBackup?: boolean;
  restoredAuth?: AtomicAuthToken | null;
  /** When true, orchestrator dispatches `applyPaygKey` after mode + auth are finalized. */
  needsApplyPaygKey?: boolean;
};

export interface ModeHandler {
  saveBackup(ctx: SwitchContext): Promise<void>;
  teardown(ctx: SwitchContext): Promise<void>;
  setup(ctx: SwitchContext): Promise<ModeSetupResult>;
}

export type SwitchModeParams = {
  port: number;
  target: HermesSetupMode;
};
