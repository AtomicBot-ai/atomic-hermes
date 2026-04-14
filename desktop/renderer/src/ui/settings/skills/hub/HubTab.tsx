import React from "react";
import { TextInput, SelectDropdown } from "@shared/kit";
import { useHubSkills } from "./useHubSkills";
import { HubGrid } from "./HubGrid";
import s from "./HubTab.module.css";

type Props = {
  port: number;
  onInstalled?: () => void;
};

const SORT_OPTIONS: Array<{ value: "downloads" | "stars" | "name"; label: string }> = [
  { value: "downloads", label: "Most downloaded" },
  { value: "stars", label: "Most starred" },
  { value: "name", label: "Alphabetical" },
];

export function HubTab({ port, onInstalled }: Props) {
  const hub = useHubSkills(port);

  return (
    <div className={s.root}>
      <div className={s.filters}>
        <div className={s.searchCol}>
          <TextInput
            value={hub.query}
            onChange={hub.setQuery}
            placeholder="Search HermesHub skills…"
            isSearch
          />
        </div>
        <div className={s.sortCol}>
          <SelectDropdown
            value={hub.sort}
            onChange={hub.setSort}
            options={SORT_OPTIONS}
          />
        </div>
      </div>

      {hub.error && (
        <div className={s.error}>{hub.error}</div>
      )}

      <HubGrid
        items={hub.items}
        loading={hub.loading}
        hasMore={hub.hasMore}
        onLoadMore={hub.loadMore}
        onInstall={hub.install}
        onRemove={hub.remove}
        onInstalled={onInstalled}
      />
    </div>
  );
}
