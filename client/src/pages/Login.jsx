import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SignIn, SignUp, useAuth } from '@clerk/clerk-react';

const hideFooterAction = { elements: { footerAction: { display: 'none' } } };

export default function Login() {
  const { isLoaded, isSignedIn } = useAuth();
  const [showSignUp, setShowSignUp] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoaded && isSignedIn) navigate('/dashboard', { replace: true });
  }, [isLoaded, isSignedIn, navigate]);

  return (
    <div className="auth-page">
      <div className="auth-brand">
        <div className="auth-brand-icon"><i className="fas fa-leaf"></i></div>
        <h1>LivestockPro</h1>
        <p>Streamline your farm operations. Track animals, health, breeding, feeding, production, and finances — all in one place.</p>
      </div>

      <div className="auth-form-section">
        <div className="auth-form-wrapper">
          <h2>Welcome</h2>
          <p className="subtitle">Sign in to your farm management dashboard</p>

          {!isLoaded ? null : (
            <>
              <div style={{ display: showSignUp ? 'none' : 'block' }}>
                <SignIn routing="virtual" appearance={hideFooterAction} />
              </div>
              <div style={{ display: showSignUp ? 'block' : 'none' }}>
                <SignUp routing="virtual" appearance={hideFooterAction} />
              </div>
              <p className="subtitle" style={{ marginTop: 16, textAlign: 'center' }}>
                {showSignUp ? 'Already have an account? ' : "Don't have an account? "}
                <a href="#" onClick={(e) => { e.preventDefault(); setShowSignUp((v) => !v); }}>
                  {showSignUp ? 'Sign in' : 'Sign up'}
                </a>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
