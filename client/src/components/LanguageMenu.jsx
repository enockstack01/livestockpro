import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../i18n/LanguageProvider.jsx';

/* Globe button in the top bar with the current language code; the menu lists
   every interface language by its own name (as in Crop Manager). */
export default function LanguageMenu() {
  const { t } = useTranslation();
  const { language, setLanguage, languages } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const code = String(language || 'en').slice(0, 2);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div className="lang-wrapper" ref={ref}>
      <button
        type="button"
        className="topbar-btn topbar-lang"
        title={t('settings.language')}
        aria-label={t('settings.language')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <i className="fas fa-globe"></i>
        <span className="lang-code">{code.toUpperCase()}</span>
      </button>
      <div className={`lang-menu${open ? ' show' : ''}`} role="menu">
        {languages.map((l) => (
          <button
            key={l.code}
            type="button"
            role="menuitemradio"
            aria-checked={code === l.code}
            className={`lang-option${code === l.code ? ' active' : ''}`}
            onClick={() => { setLanguage(l.code); setOpen(false); }}
          >
            <span>{l.nativeLabel}</span>
            {code === l.code ? <i className="fas fa-check"></i> : <small>{l.code.toUpperCase()}</small>}
          </button>
        ))}
      </div>
    </div>
  );
}
