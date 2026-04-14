import React from "react";
import { TextInput } from "@shared/kit";
import { useHubSkills } from "./useHubSkills";
import { HubGrid } from "./HubGrid";
import s from "./HubTab.module.css";

type Props = {
  port: number;
  onInstalled?: () => void;
};

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
      </div>

      {hub.error && (
        <div className={s.error}>{hub.error}</div>
      )}

      <HubGrid
        items={hub.items}
        loading={hub.loading}
        loadingMore={hub.loadingMore}
        hasMore={hub.hasMore}
        onLoadMore={hub.loadMore}
        onInstall={hub.install}
        onRemove={hub.remove}
        onInstalled={onInstalled}
      />
    </div>
  );
}
