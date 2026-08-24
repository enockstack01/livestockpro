import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App.jsx';
import { ToastProvider } from './lib/toast.jsx';
import { LanguageProvider } from './i18n/LanguageProvider.jsx';
import './i18n';
import './style.css';

const PUBLISHABLE_KEY = 'pk_test_YWJvdmUteWV0aS03MC5jbGVyay5hY2NvdW50cy5kZXYk';

ReactDOM.createRoot(document.getElementById('root')).render(
  <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
    <LanguageProvider>
      <ToastProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ToastProvider>
    </LanguageProvider>
  </ClerkProvider>
);
