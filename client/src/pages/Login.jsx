import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SignIn, SignUp, useAuth } from '@clerk/clerk-react';
import { useTranslation } from 'react-i18next';

// ClerkProvider's global `appearance` (see main.jsx) already sets the base
// dark/light theme to match the app; this just hides the built-in "Sign up"/
// "Sign in" footer link since the page already renders its own toggle below.
const appearance = { elements: { footerAction: { display: 'none' } } };

export default function Login() {
  const { t } = useTranslation();
  const { isLoaded, isSignedIn } = useAuth();
  const [showSignUp, setShowSignUp] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoaded && isSignedIn) navigate('/dashboard', { replace: true });
  }, [isLoaded, isSignedIn, navigate]);

  return (
    <div className="auth-page">
      <div className="auth-brand">
        <div className="auth-brand-icon"><i className="fas fa-cow"></i></div>
        <h1>{t('auth.brandName')}</h1>
        <p>{t('login.tagline')}</p>
      </div>

      <div className="auth-form-section">
        <div className="auth-form-wrapper">
          <h2>{t('login.welcomeTitle')}</h2>
          <p className="subtitle">{t('login.welcomeSubtitle')}</p>

          {!isLoaded ? null : (
            <>
              <div style={{ display: showSignUp ? 'none' : 'block' }}>
                <SignIn routing="virtual" appearance={appearance} />
              </div>
              <div style={{ display: showSignUp ? 'block' : 'none' }}>
                <SignUp routing="virtual" appearance={appearance} />
              </div>
              <p className="subtitle" style={{ marginTop: 16, textAlign: 'center' }}>
                {showSignUp ? t('auth.alreadyHaveAccount') : t('auth.dontHaveAccount')}
                <a href="#" onClick={(e) => { e.preventDefault(); setShowSignUp((v) => !v); }}>
                  {showSignUp ? t('auth.signIn') : t('auth.signUp')}
                </a>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
