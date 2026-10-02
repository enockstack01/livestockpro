import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { computeHerdProfile } from '../../../../shared/dashboardFeed';
import GlanceTiles from './GlanceTiles.jsx';

/* Herd Profile — the first section of the dashboard, laid out like the
   CropManager Farm Profile and identical to the mobile app's
   (mobile/src/screens/dashboard/HerdProfileCard.js): branded farm banner,
   species chips, herd-health ring + legend, "Farm at a glance" tiles, and
   the herd by species (or by breed once a species is picked). */

function HealthRing({ segments, total, pct, label, size = 170 }) {
  const stroke = Math.round(size * 0.11);
  const r = (size - stroke) / 2 - 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const visible = segments.filter((s) => s.value > 0 && total > 0);
  const gap = visible.length > 1 ? 3 : 0;
  let offset = 0;
  const arcs = visible.map((s) => {
    const len = Math.max(0, (s.value / total) * circ - gap);
    const arc = { ...s, dash: `${len} ${circ - len}`, offset: -offset };
    offset += (s.value / total) * circ;
    return arc;
  });
  return (
    <div className="herd-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={c} cy={c} r={r} stroke="var(--bg)" strokeWidth={stroke} fill="none" />
        {arcs.map((a) => (
          <circle key={a.key} cx={c} cy={c} r={r} stroke={a.color} strokeWidth={stroke} strokeDasharray={a.dash} strokeDashoffset={a.offset} strokeLinecap={gap ? 'butt' : 'round'} fill="none" />
        ))}
      </svg>
      <div className="herd-ring-label">
        <span className="herd-ring-pct" style={{ fontSize: Math.round(size * 0.2) }}>{pct}%</span>
        <span className="herd-ring-sub">{label}</span>
      </div>
    </div>
  );
}

export default function HerdProfile({ animals, profile, glance, onOpen }) {
  const { t } = useTranslation();
  const [species, setSpecies] = useState('');
  const p = useMemo(() => computeHerdProfile(animals, species), [animals, species]);
  const enumLabel = (group, v) => t(`enums.${group}.${v}`, { defaultValue: v });
  const groupLabel = (name) => (p.groupBy === 'species' ? enumLabel('species', name) : name);
  const shown = p.byGroup.slice(0, 8);
  const ringTotal = p.segments.reduce((s, x) => s + x.value, 0);

  return (
    <section className="herd-profile" aria-label={t('herdProfile.eyebrow')}>
      <div className="herd-profile-banner">
        <div className="herd-profile-eyebrow"><i className="fas fa-cow" /> {t('herdProfile.eyebrow')}</div>
        <div className="herd-profile-head">
          <div className="herd-profile-title">
            <h2>{profile?.farm_name || t('herdProfile.myFarm')}</h2>
            <p>{profile?.location || t('herdProfile.noLocation')}</p>
          </div>
          <div className="herd-profile-count">
            <strong>{p.living.toLocaleString()}</strong>
            <span>{species ? `${enumLabel('species', species)} · ` : ''}{t('herdProfile.livingHerd')}</span>
          </div>
        </div>
      </div>

      {p.speciesList.length > 1 && (
        <div className="herd-profile-chips" role="tablist" aria-label={t('tables.animals.fields.species')}>
          {['', ...p.speciesList].map((s) => (
            <button key={s || 'all'} type="button" role="tab" aria-selected={s === species} className={`herd-profile-chip${s === species ? ' active' : ''}`} onClick={() => setSpecies(s)}>
              {s ? enumLabel('species', s) : t('herdProfile.allSpecies')}
            </button>
          ))}
        </div>
      )}

      <div className="herd-profile-body">
        {p.living > 0 ? (
          <div className="herd-profile-health">
            <HealthRing segments={p.segments} total={ringTotal} pct={p.healthyPct} label={t('herdProfile.healthy')} />
            <ul className="herd-profile-legend">
              {p.segments.map((s) => (
                <li key={s.key} className={s.value > 0 ? '' : 'muted'}>
                  <span className="dot" style={{ background: s.color }} />
                  <span className="label">{enumLabel('animalHealthStatus', s.key)}</span>
                  <b>{s.value}</b>
                </li>
              ))}
              {p.deceased > 0 && (
                <li className="muted">
                  <span className="dot" style={{ background: 'var(--text-light)' }} />
                  <span className="label">{enumLabel('animalHealthStatus', 'Deceased')}</span>
                  <b>{p.deceased}</b>
                </li>
              )}
            </ul>
          </div>
        ) : (
          <p className="herd-profile-empty">{t('herdProfile.empty')}</p>
        )}

        <div>
          <div className="herd-profile-section">{t('herdProfile.atAGlance')}</div>
          <GlanceTiles g={glance} onOpen={onOpen} />
        </div>

        {shown.length > 0 && (
          <div>
            <div className="herd-profile-section">{p.groupBy === 'species' ? t('herdProfile.bySpecies') : t('herdProfile.byBreed')}</div>
            <div className="herd-profile-groups">
              {shown.map((g) => (
                <div key={g.name} className="herd-profile-group">
                  <div className="herd-profile-group-row">
                    <span className="name">{groupLabel(g.name)}</span>
                    <span className="sub">{t('herdProfile.healthyOf', { healthy: g.healthy, count: g.count })}</span>
                    <b>{g.count}</b>
                  </div>
                  <div className="herd-profile-bar">
                    <span style={{ width: `${Math.max(4, (g.count / p.maxGroup) * 100)}%` }} />
                  </div>
                </div>
              ))}
              {p.byGroup.length > shown.length && <div className="herd-profile-more">{t('herdProfile.more', { count: p.byGroup.length - shown.length })}</div>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
