import { createContext, useContext, useEffect, useRef, useState } from 'react';

const TopbarSearchContext = createContext(null);

export function TopbarSearchProvider({ children }) {
  const [config, setConfig] = useState(null); // { placeholder, onChange }
  const [value, setValue] = useState('');
  return (
    <TopbarSearchContext.Provider value={{ config, setConfig, value, setValue }}>
      {children}
    </TopbarSearchContext.Provider>
  );
}

/* Call from a page to put a search box in the shared topbar, matching the
   original per-page "Search animals...", "Search feeding records..." inputs. */
export function useTopbarSearch(placeholder, onChange) {
  const ctx = useContext(TopbarSearchContext);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!ctx) return;
    ctx.setValue('');
    ctx.setConfig({ placeholder, onChange: (v) => onChangeRef.current(v) });
    return () => ctx.setConfig(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeholder]);
}

export function useTopbarSearchBox() {
  const ctx = useContext(TopbarSearchContext);
  if (!ctx) throw new Error('useTopbarSearchBox must be used within a TopbarSearchProvider');
  return ctx;
}
