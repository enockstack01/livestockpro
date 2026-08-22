import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App.jsx';
import { ToastProvider } from './lib/toast.jsx';
import './style.css';

const PUBLISHABLE_KEY = 'pk_live_Y2xlcmsubGl2ZXN0b2NrcHJvLmFncmljb2RlcnMuY29tJA';

ReactDOM.createRoot(document.getElementById('root')).render(
  <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
    <ToastProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ToastProvider>
  </ClerkProvider>
);
