import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type { SkillSummary, HubSkillItem } from "../../services/skills-api";

export type HubCacheState = {
  items: HubSkillItem[];
  totalPages: number;
  lastFetchKey: string | null;
};

export type CustomSkillsCacheState = {
  items: SkillSummary[];
  loaded: boolean;
};

export type SkillsSliceState = {
  hub: HubCacheState;
  custom: CustomSkillsCacheState;
};

const initialState: SkillsSliceState = {
  hub: { items: [], totalPages: 0, lastFetchKey: null },
  custom: { items: [], loaded: false },
};

const skillsSlice = createSlice({
  name: "skills",
  initialState,
  reducers: {
    setHubSkills(
      state,
      action: PayloadAction<{ items: HubSkillItem[]; totalPages: number; fetchKey: string }>,
    ) {
      state.hub.items = action.payload.items;
      state.hub.totalPages = action.payload.totalPages;
      state.hub.lastFetchKey = action.payload.fetchKey;
    },
    appendHubSkills(state, action: PayloadAction<{ items: HubSkillItem[]; totalPages: number }>) {
      state.hub.items = [...state.hub.items, ...action.payload.items];
      state.hub.totalPages = action.payload.totalPages;
    },
    clearHub(state) {
      state.hub.items = [];
      state.hub.totalPages = 0;
      state.hub.lastFetchKey = null;
    },
    setCustomSkills(state, action: PayloadAction<SkillSummary[]>) {
      state.custom.items = action.payload;
      state.custom.loaded = true;
    },
    addCustomSkill(state, action: PayloadAction<SkillSummary>) {
      const skill = action.payload;
      const idx = state.custom.items.findIndex((s) => s.dirName === skill.dirName);
      if (idx >= 0) {
        state.custom.items[idx] = skill;
      } else {
        state.custom.items.push(skill);
      }
    },
    removeCustomSkill(state, action: PayloadAction<string>) {
      state.custom.items = state.custom.items.filter((s) => s.dirName !== action.payload);
    },
  },
});

export const skillsActions = skillsSlice.actions;
export const skillsReducer = skillsSlice.reducer;
