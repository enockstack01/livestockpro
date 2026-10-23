import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '../lib/api.js';
import Modal from '../components/Modal.jsx';
import { CALENDAR_KINDS, KIND, buildCalendarEvents, eventsByDay, isoDay, monthGrid, weekdayNames } from '../../../shared/calendarEvents.js';

const TABLES = ['tasks', 'health_records', 'breeding_records', 'feeding_records'];
const MAX_CHIPS = 3;
const STORAGE_KEY = 'lp_calendar_kinds';

function loadKinds() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (Array.isArray(saved)) return new Set(saved.filter((k) => KIND[k]));
  } catch { /* storage unavailable */ }
  return new Set(CALENDAR_KINDS.map((k) => k.key));
}

/* A month calendar like Google Calendar: every task, health check and
   follow up, breeding date, expected and actual birth, and feeding on its
   day, coloured by kind. Click a day for its full list or to add a task. */
export default function Calendar() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [kinds, setKinds] = useState(loadKinds);
  const [openDay, setOpenDay] = useState(null);

  useEffect(() => {
    Promise.all(TABLES.map((k) => api.list(k))).then((rs) => setData(Object.fromEntries(TABLES.map((k, i) => [k, rs[i].data || []]))));
  }, [api]);

  const events = useMemo(() => (data ? buildCalendarEvents(data, t) : []), [data, t]);
  const byDay = useMemo(() => eventsByDay(events, kinds), [events, kinds]);
  const cells = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);
  const weekdays = useMemo(() => weekdayNames(i18n.language), [i18n.language]);
  const counts = useMemo(() => {
    const c = {};
    events.forEach((ev) => { c[ev.kind] = (c[ev.kind] || 0) + 1; });
    return c;
  }, [events]);

  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' });
  const move = (delta) => setCursor((c) => { const d = new Date(c.y, c.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const goToday = () => { const d = new Date(); setCursor({ y: d.getFullYear(), m: d.getMonth() }); };

  function toggleKind(key) {
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...next])); } catch { /* storage unavailable */ }
      return next;
    });
  }

  const todayIso = isoDay(new Date());
  const upcoming = useMemo(() => {
    const end = isoDay(new Date(Date.now() + 30 * 86400000));
    return events.filter((ev) => kinds.has(ev.kind) && !ev.done && ev.date >= todayIso && ev.date <= end).slice(0, 12);
  }, [events, kinds, todayIso]);
  const fmtDay = (iso, opts) => new Date(`${iso}T00:00:00`).toLocaleDateString(i18n.language, opts);

  return (
    <>
      <div className="page-header">
        <div><h1>{t('calendar.title')}</h1><p>{t('calendar.subtitle')}</p></div>
        <button className="btn btn-primary" onClick={() => navigate(`/tasks?new=1&due=${todayIso}`)}><i className="fas fa-plus"></i> {t('tasksPage.addTask')}</button>
      </div>

      <div className="card cal-card">
        <div className="cal-toolbar">
          <div className="cal-nav">
            <button className="btn btn-secondary btn-sm" onClick={goToday}>{t('calendar.today')}</button>
            <button className="btn-icon" onClick={() => move(-1)} aria-label={t('calendar.previous')}><i className="fas fa-chevron-left"></i></button>
            <button className="btn-icon" onClick={() => move(1)} aria-label={t('calendar.next')}><i className="fas fa-chevron-right"></i></button>
            <h2 className="cal-month">{monthLabel}</h2>
          </div>
          <div className="cal-legend" role="group" aria-label={t('calendar.show')}>
            {CALENDAR_KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                className={`cal-legend-item${kinds.has(k.key) ? ' on' : ''}`}
                aria-pressed={kinds.has(k.key)}
                onClick={() => toggleKind(k.key)}
              >
                <span className="cal-dot" style={{ background: k.color }}></span>
                {t(`calendar.kinds.${k.key}`)}
                {counts[k.key] ? <small>{counts[k.key]}</small> : null}
              </button>
            ))}
          </div>
        </div>

        {!data ? (
          <div className="empty-state"><i className="fas fa-spinner fa-spin"></i><p>{t('common.loading')}</p></div>
        ) : (
          <div className="cal-grid" role="grid" aria-label={monthLabel}>
            {weekdays.map((w) => <div key={w} className="cal-weekday" role="columnheader">{w}</div>)}
            {cells.map((c) => {
              const list = byDay[c.date] || [];
              return (
                <div
                  key={c.date}
                  role="gridcell"
                  tabIndex={0}
                  className={`cal-cell${c.inMonth ? '' : ' out'}${c.today ? ' today' : ''}${c.date < todayIso ? ' past' : ''}`}
                  onClick={() => setOpenDay(c.date)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenDay(c.date); } }}
                  aria-label={`${fmtDay(c.date, { dateStyle: 'full' })}: ${t('calendar.eventsCount', { count: list.length })}`}
                >
                  <span className="cal-day">{c.day}</span>
                  <div className="cal-chips">
                    {list.slice(0, MAX_CHIPS).map((ev) => (
                      <span key={ev.id} className={`cal-chip${ev.done ? ' done' : ''}`} style={{ background: KIND[ev.kind].color, color: KIND[ev.kind].ink }} title={`${ev.title}${ev.sub ? ` · ${ev.sub}` : ''}`}>
                        <i className={`fas fa-${KIND[ev.kind].icon}`}></i> {ev.title}
                      </span>
                    ))}
                    {list.length > MAX_CHIPS ? <span className="cal-more">{t('calendar.more', { count: list.length - MAX_CHIPS })}</span> : null}
                    {list.length ? <span className="cal-dots" aria-hidden="true">{list.slice(0, 4).map((ev) => <span key={ev.id} style={{ background: KIND[ev.kind].color }}></span>)}</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card mt-24">
        <div className="card-header"><h3><i className="fas fa-calendar-week" style={{ marginRight: 8, color: 'var(--leaf)' }}></i>{t('calendar.upcoming')}</h3></div>
        <div className="card-body" style={{ padding: 0 }}>
          {upcoming.length === 0 ? <div className="empty-state" style={{ padding: 24 }}><p>{t('calendar.nothingUpcoming')}</p></div> : (
            <ul className="cal-agenda">
              {upcoming.map((ev) => (
                <li key={ev.id}>
                  <span className="cal-agenda-date"><strong>{fmtDay(ev.date, { day: 'numeric' })}</strong>{fmtDay(ev.date, { month: 'short' })}</span>
                  <span className="cal-agenda-icon" style={{ background: KIND[ev.kind].color, color: KIND[ev.kind].ink }}><i className={`fas fa-${KIND[ev.kind].icon}`}></i></span>
                  <Link to={ev.path} className="cal-agenda-text"><strong>{ev.title}</strong>{ev.sub ? <small>{ev.sub}</small> : null}</Link>
                  <span className="cal-agenda-kind">{t(`calendar.kinds.${ev.kind}`)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Modal
        open={Boolean(openDay)}
        onClose={() => setOpenDay(null)}
        maxWidth="560px"
        title={openDay ? fmtDay(openDay, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''}
        footer={<><button className="btn btn-secondary" onClick={() => setOpenDay(null)}>{t('common.close')}</button><button className="btn btn-primary" onClick={() => navigate(`/tasks?new=1&due=${openDay}`)}><i className="fas fa-plus"></i> {t('calendar.addTaskOnDay')}</button></>}
      >
        {openDay && (byDay[openDay] || []).length ? (
          <ul className="cal-day-list">
            {byDay[openDay].map((ev) => (
              <li key={ev.id}>
                <span className="cal-agenda-icon" style={{ background: KIND[ev.kind].color, color: KIND[ev.kind].ink }}><i className={`fas fa-${KIND[ev.kind].icon}`}></i></span>
                <div>
                  <Link to={ev.path} onClick={() => setOpenDay(null)}><strong>{ev.title}</strong></Link>
                  <small>{t(`calendar.kinds.${ev.kind}`)}{ev.sub ? ` · ${ev.sub}` : ''}</small>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="text-muted">{t('calendar.nothingThisDay')}</p>}
      </Modal>
    </>
  );
}
