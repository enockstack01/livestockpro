import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApi } from '../lib/api.js';
import { useTopbarSearchBox } from '../lib/topbarSearch.jsx';
import { SEARCH_TABLES, searchRecords, searchLink, sectionForPath } from '../../../shared/globalSearch';

const CACHE_MS = 60 * 1000;

/* The top bar search box, on every page. On a records page it filters that
   page as you type (the page registers through useTopbarSearch); everywhere
   it also lists matching records from every section of the farm, each
   group linking to its page already filtered. Organization and admin
   accounts have no farm records, so they only get the page filter. */
export default function GlobalSearch({ farmData }) {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { config, value, setValue } = useTopbarSearchBox();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [active, setActive] = useState(-1);
  const loadedAt = useRef(0);
  const loading = useRef(false);
  const ref = useRef(null);
  const current = sectionForPath(pathname);

  async function ensureData() {
    if (!farmData || loading.current || Date.now() - loadedAt.current < CACHE_MS) return;
    loading.current = true;
    const results = await Promise.all(SEARCH_TABLES.map((k) => api.list(k)));
    setData(Object.fromEntries(SEARCH_TABLES.map((k, i) => [k, results[i].data || []])));
    loadedAt.current = Date.now();
    loading.current = false;
  }

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  useEffect(() => { setOpen(false); }, [pathname]);

  const groups = farmData && data ? searchRecords(data, value, t, { exclude: config ? current && current.key : null }) : [];
  const links = groups.map((g) => ({ to: searchLink(g, value), g }));
  const showDrop = open && farmData && value.trim().length >= 2;

  function change(v) {
    setValue(v);
    if (config) config.onChange(v);
    setOpen(true);
    setActive(-1);
    ensureData();
  }

  function go(to) {
    setOpen(false);
    navigate(to);
  }

  function onKey(e) {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!showDrop || !links.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(links.length - 1, a + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(-1, a - 1)); }
    if (e.key === 'Enter' && !config) { e.preventDefault(); go(links[Math.max(0, active)].to); }
    if (e.key === 'Enter' && config && active >= 0) { e.preventDefault(); go(links[active].to); }
  }

  const placeholder = config ? config.placeholder : farmData ? t('search.placeholder') : null;
  if (!placeholder) return null;

  return (
    <div className="search-box global-search" ref={ref}>
      <i className="fas fa-search"></i>
      <input
        type="search"
        placeholder={placeholder}
        value={value}
        aria-label={placeholder}
        aria-expanded={showDrop}
        aria-controls="global-search-results"
        onFocus={() => { setOpen(true); ensureData(); }}
        onChange={(e) => change(e.target.value)}
        onKeyDown={onKey}
      />
      {value ? <button type="button" className="search-clear" aria-label={t('search.clear')} onClick={() => change('')}><i className="fas fa-xmark"></i></button> : null}
      {showDrop ? (
        <div className="search-results" id="global-search-results" role="listbox">
          {config && current ? <div className="search-hint"><i className="fas fa-filter"></i> {t('search.filteringPage', { section: t(current.labelKey) })}</div> : null}
          {!data ? (
            <div className="search-empty"><i className="fas fa-spinner fa-spin"></i> {t('common.loading')}</div>
          ) : !groups.length ? (
            <div className="search-empty">{config ? t('search.noneElsewhere') : t('search.none', { query: value.trim() })}</div>
          ) : groups.map((g, gi) => (
            <div className="search-group" key={g.key}>
              <button type="button" className={`search-group-head${active === gi ? ' active' : ''}`} onClick={() => go(searchLink(g, value))} role="option" aria-selected={active === gi}>
                <span className="search-group-icon"><i className={`fas fa-${g.icon}`}></i></span>
                <strong>{t(g.labelKey)}</strong>
                <span className="search-count">{t('search.viewAll', { count: g.total })}</span>
              </button>
              {g.items.map((it) => (
                <button type="button" key={it.id} className="search-item" onClick={() => go(searchLink(g, it.title.split(' · ')[0]))}>
                  <span className="search-item-title">{it.title}</span>
                  {it.sub ? <span className="search-item-sub">{it.sub}</span> : null}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
