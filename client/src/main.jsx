import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import { dark } from '@clerk/themes';
import App from './App.jsx';
import { ToastProvider } from './lib/toast.jsx';
import { LanguageProvider } from './i18n/LanguageProvider.jsx';
import { ThemeProvider, useTheme } from './theme/ThemeProvider.jsx';
import './i18n';
import './style.css';

const PUBLISHABLE_KEY = 'pk_test_YWJvdmUteWV0aS03MC5jbGVyay5hY2NvdW50cy5kZXYk';

/* ClerkProvider needs to sit inside ThemeProvider (not the other way around)
   so its global `appearance` can react to the current theme — this is what
   themes Clerk-hosted UI that isn't a page-level component we render
   ourselves, like the openUserProfile() modal from Settings.jsx. */
/* Clerk's widgets in the Agricoders brand: Forest primary, Ink text, Slate
   helper text, Alert Red errors, Calibri, and solid buttons (Clerk's default
   primary button carries a gradient and glow, which the brand does not use). */
function clerkAppearance(scheme) {
  const isDark = scheme === 'dark';
  return {
    baseTheme: isDark ? dark : undefined,
    variables: {
      colorPrimary: isDark ? '#2E7D32' : '#1B5E20',
      colorText: isDark ? '#F1F3F1' : '#1C2B1E',
      colorTextSecondary: isDark ? '#A9B2AA' : '#5B6B5D',
      colorDanger: '#C62828',
      colorSuccess: '#2E7D32',
      colorWarning: '#F9A825',
      colorBackground: isDark ? '#1E1E1E' : '#FFFFFF',
      colorInputText: isDark ? '#F1F3F1' : '#1C2B1E',
      fontFamily: 'Calibri, Carlito, Arial, sans-serif',
      fontSize: '15px',
      borderRadius: '8px'
    },
    elements: {
      formButtonPrimary: { background: isDark ? '#2E7D32' : '#1B5E20', backgroundImage: 'none', boxShadow: 'none', border: 'none', '&::before': { display: 'none' }, '&::after': { display: 'none' }, fontWeight: 700, textTransform: 'none', fontSize: '15px', minHeight: '44px', '&:hover': { backgroundColor: '#14532D' }, '&:focus': { boxShadow: '0 0 0 3px rgba(46,125,50,0.35)' } },
      socialButtonsBlockButton: { minHeight: '44px', borderColor: isDark ? '#2E3A31' : '#DFE2DF', boxShadow: 'none' },
      formFieldInput: { minHeight: '44px', borderColor: isDark ? '#2E3A31' : '#DFE2DF', boxShadow: 'none' },
      cardBox: { boxShadow: 'none', border: '1px solid ' + (isDark ? '#2E3A31' : '#DFE2DF') },
      card: { boxShadow: 'none', border: 'none' },
      footer: { backgroundImage: 'none', background: isDark ? '#1E1E1E' : '#FFFFFF' },
      footerActionLink: { color: '#2E7D32', fontWeight: 700 },
      formFieldAction: { color: '#2E7D32' },
      identityPreviewEditButton: { color: '#2E7D32' },
      dividerLine: { background: isDark ? '#2E3A31' : '#DFE2DF' }
    }
  };
}

function ThemedClerkProvider({ children }) {
  const { scheme } = useTheme();
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} appearance={clerkAppearance(scheme)} signInUrl="/" signUpUrl="/">
      {children}
    </ClerkProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ThemeProvider>
    <ThemedClerkProvider>
      <LanguageProvider>
        <ToastProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ToastProvider>
      </LanguageProvider>
    </ThemedClerkProvider>
  </ThemeProvider>
);
