import { useCallback, useEffect, useState } from 'react';

export interface Page<T> {
  items: T[];
  hasMore: boolean;
}

// Shared "Load more" pattern for every history/ledger-style list in the app.
// fetchPage(skip) should return the same page shape the server pagination
// helper produces ({items, hasMore}). Refetches page 0 whenever `deps`
// changes (e.g. switching which person's history you're looking at).
export function usePaginatedList<T>(fetchPage: (skip: number) => Promise<Page<T>>, deps: unknown[] = []) {
  const [items, setItems] = useState<T[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const page = await fetchPage(0);
      setItems(page.items);
      setHasMore(page.hasMore);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    reload();
  }, [reload]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(items.length);
      setItems((prev) => [...prev, ...page.items]);
      setHasMore(page.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  return { items, hasMore, loading, loadingMore, loadMore, reload, setItems };
}
