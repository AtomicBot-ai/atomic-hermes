import React from "react";
import { searchHub, installSkill, uninstallSkill } from "../../../../services/skills-api";
import type { HubSkillItem } from "../../../../services/skills-api";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { skillsActions } from "@store/slices/skillsSlice";

const DEBOUNCE_MS = 350;
const PAGE_SIZE = 30;

export function useHubSkills(port: number) {
  const dispatch = useAppDispatch();
  const cached = useAppSelector((s) => s.skills.hub);

  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<HubSkillItem[]>(cached.items);
  const [hasMore, setHasMore] = React.useState(false);
  const offsetRef = React.useRef(0);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchKeyRef = React.useRef("");

  const fetchPage = React.useCallback(
    async (q: string, offset: number, append: boolean) => {
      const key = `${q}__${offset}`;
      if (!append) {
        fetchKeyRef.current = q;
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);
      try {
        const res = await searchHub(port, q, PAGE_SIZE, offset);
        if (fetchKeyRef.current !== q) return;
        const fetched = res.results || [];
        if (append) {
          setItems((prev) => [...prev, ...fetched]);
        } else {
          setItems(fetched);
          dispatch(skillsActions.setHubSkills({ items: fetched, totalPages: 1, fetchKey: q }));
        }
        setHasMore(res.hasMore ?? false);
        offsetRef.current = offset + fetched.length;
      } catch (e) {
        if (fetchKeyRef.current !== q) return;
        setError(e instanceof Error ? e.message : "Search failed");
      } finally {
        if (fetchKeyRef.current === q) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [port, dispatch],
  );

  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    offsetRef.current = 0;
    debounceRef.current = setTimeout(() => {
      void fetchPage(query, 0, false);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchPage]);

  const loadMore = React.useCallback(() => {
    if (loadingMore || loading || !hasMore) return;
    void fetchPage(query, offsetRef.current, true);
  }, [query, loadingMore, loading, hasMore, fetchPage]);

  const install = React.useCallback(
    async (identifier: string) => {
      await installSkill(port, identifier);
      setItems((prev) =>
        prev.map((s) =>
          (s.identifier === identifier || s.slug === identifier || s.name === identifier)
            ? { ...s, installed: true }
            : s,
        ),
      );
    },
    [port],
  );

  const remove = React.useCallback(
    async (name: string) => {
      await uninstallSkill(port, name);
      setItems((prev) =>
        prev.map((s) => (s.name === name ? { ...s, installed: false } : s)),
      );
    },
    [port],
  );

  return {
    items,
    loading,
    loadingMore,
    error,
    query,
    setQuery,
    hasMore,
    loadMore,
    install,
    remove,
  };
}
