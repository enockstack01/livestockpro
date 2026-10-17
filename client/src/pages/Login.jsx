import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SignIn, SignUp, useAuth } from '@clerk/clerk-react';
import { useTranslation } from 'react-i18next';
import AuthBrand from '../components/AuthBrand.jsx';

// ClerkProvider's global `appearance` (main.jsx) carries the brand colours and
// font. Here the page's own title replaces Clerk's header (which would read
// "Sign in to Livestockpro"), and the page renders its own sign in / sign up
// toggle below, so Clerk's footer link is hidden too.
const appearance = { elements: { header: { display: 'none' }, footerAction: { display: 'none' }, card: { padding: '28px 24px' } } };

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
      <AuthBrand />

      <div className="auth-form-section">
        <div className="auth-form-wrapper">
          <h1 className="auth-title">{showSignUp ? t('auth.signUpTitle') : t('auth.signInTitle')}</h1>
          <p className="subtitle">{showSignUp ? t('auth.signUpSubtitle') : t('login.welcomeSubtitle')}</p>

          {!isLoaded ? null : (
            <>
              {/* Hash routing (not virtual) so Google's redirect back to
                  /#/sso-callback is picked up and finished here: an existing
                  account is signed in, a new one is created automatically, and
                  either way the user lands on the dashboard. Only one form is
                  mounted at a time so the callback has a single owner. */}
              {showSignUp ? (
                <SignUp routing="hash" appearance={appearance} forceRedirectUrl="/dashboard" signInForceRedirectUrl="/dashboard" />
              ) : (
                <SignIn routing="hash" appearance={appearance} forceRedirectUrl="/dashboard" signUpForceRedirectUrl="/dashboard" />
              )}
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
