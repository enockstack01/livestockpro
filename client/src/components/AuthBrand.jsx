import { useTranslation } from 'react-i18next';

/* The brand panel beside the sign-in, sign-up and account request forms,
   built to the Agricoders brand guide: a solid Pine surface (no gradient or
   glow), the LivestockPro app icon, the product name in white and the
   product tagline. On phones it shrinks to a band above the form so the
   brand is never lost. */
export default function AuthBrand() {
  const { t } = useTranslation();
  return (
    <aside className="auth-brand">
      <div className="auth-brand-main">
        <img className="auth-app-icon" src="/icon-192.png" alt="" width="88" height="88" />
        <div className="auth-brand-name">{t('auth.brandName')}</div>
        <p className="auth-brand-tagline">{t('brand.tagline')}</p>
      </div>
    </aside>
  );
}
