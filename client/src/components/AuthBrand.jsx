import { useTranslation } from 'react-i18next';

/* The brand panel beside the sign-in, sign-up and account request forms,
   built to the Agricoders brand guide: a solid Pine surface (no gradient or
   glow), the LivestockPro app icon, the product name in white, the product
   tagline, what the app does as white glyphs in solid Leaf circles, and the
   Agricoders mark inside a white disc (the navy logo never sits straight on
   green) with the "LivestockPro · by Agricoders" endorsement. On phones it
   shrinks to a band above the form so the brand is never lost. */
const POINTS = [
  { icon: 'cow', key: 'herd' },
  { icon: 'stethoscope', key: 'health' },
  { icon: 'wand-magic-sparkles', key: 'ai' }
];

export default function AuthBrand() {
  const { t } = useTranslation();
  return (
    <aside className="auth-brand">
      <div className="auth-brand-main">
        <img className="auth-app-icon" src="/icon-192.png" alt="" width="88" height="88" />
        <div className="auth-brand-name">{t('auth.brandName')}</div>
        <p className="auth-brand-tagline">{t('brand.tagline')}</p>
        <ul className="auth-points">
          {POINTS.map((p) => (
            <li key={p.key}>
              <span className="auth-point-icon"><i className={`fas fa-${p.icon}`}></i></span>
              <span>{t(`auth.points.${p.key}`)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="auth-endorse">
        <span className="auth-disc"><img src="/agricoders-logo.png" alt="Agricoders" width="40" height="40" /></span>
        <span>{t('brand.byline')}</span>
      </div>
    </aside>
  );
}
