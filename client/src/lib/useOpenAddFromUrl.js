import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/* Opens a record page's "Add" form when the URL carries ?new=1, used by
   the dashboard's Quick Actions (e.g. "Add Animal" → /animals?new=1) and the
   calendar ("Add task" on a day → /tasks?new=1&due=2026-10-24, passed to
   openAdd as { due }). The flags are removed afterwards so a refresh or Back
   doesn't reopen it. */
export function useOpenAddFromUrl(openAdd) {
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get('new') !== '1') return;
    openAdd({ due: params.get('due') || '' });
    params.delete('new');
    params.delete('due');
    setParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
