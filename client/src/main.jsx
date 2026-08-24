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
function ThemedClerkProvider({ children }) {
  const { scheme } = useTheme();
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} appearance={{ baseTheme: scheme === 'dark' ? dark : undefined }}>
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
