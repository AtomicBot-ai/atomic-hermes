import React from "react";
import { searchHub, installSkill, uninstallSkill } from "../../../../services/skills-api";
import type { HubSkillItem } from "../../../../services/skills-api";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { skillsActions } from "@store/slices/skillsSlice";

const DEBOUNCE_MS = 350;
const PAGE_SIZE = 20;

export function useHubSkills(port: number) {
  const dispatch = useAppDispatch();
  const cached = useAppSelector((s) => s.skills.hub);

  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<"downloads" | "stars" | "name">("downloads");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [items, setItems] = React.useState<HubSkillItem[]>(cached.items);
  const [hasMore, setHasMore] = React.useState(true);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchKeyRef = React.useRef("");

  const fetchPage = React.useCallback(
    async (q: string, sortBy: string, pageNum: number, append: boolean) => {
      const key = `${q}__${sortBy}`;
      fetchKeyRef.current = key;
      setLoading(true);
      setError(null);
      try {
        const limit = PAGE_SIZE;
        const res = await searchHub(port, q, limit * pageNum, sortBy);
        if (fetchKeyRef.current !== key) return;
        const newItems = res.results || [];
        if (append) {
          setItems((prev) => [...prev, ...newItems]);
          dispatch(skillsActions.appendHubSkills({ items: newItems, totalPages: 1 }));
        } else {
          setItems(newItems);
          dispatch(skillsActions.setHubSkills({ items: newItems, totalPages: 1, fetchKey: key }));
        }
        setHasMore(newItems.length >= limit);
      } catch (e) {
        if (fetchKeyRef.current !== key) return;
        setError(e instanceof Error ? e.message : "Search failed");
      } finally {
        if (fetchKeyRef.current === key) {
          setLoading(false);
        }
      }
    },
    [port, dispatch],
  );

  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      void fetchPage(query, sort, 1, false);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, sort, fetchPage]);

  const loadMore = React.useCallback(() => {
    if (loading || !hasMore) return;
    const next = page + 1;
    setPage(next);
    void fetchPage(query, sort, next, true);
  }, [loading, hasMore, page, query, sort, fetchPage]);

  const install = React.useCallback(
    async (identifier: string) => {
      await installSkill(port, identifier);
    },
    [port],
  );

  const remove = React.useCallback(
    async (name: string) => {
      await uninstallSkill(port, name);
    },
    [port],
  );

  return {
    items,
    loading,
    error,
    hasMore,
    query,
    setQuery,
    sort,
    setSort,
    loadMore,
    install,
    remove,
  };
}
