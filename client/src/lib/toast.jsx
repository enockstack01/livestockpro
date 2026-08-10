import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(null);

const ICONS = {
  success: 'fa-check-circle',
  error: 'fa-exclamation-circle',
  warning: 'fa-exclamation-triangle',
  info: 'fa-info-circle'
};

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const [visible, setVisible] = useState(false);
  const timers = useRef([]);

  const showToast = useCallback((message, type = 'success') => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setToast({ message, type });
    setVisible(false);
    requestAnimationFrame(() => setVisible(true));
    timers.current.push(setTimeout(() => setVisible(false), 4000));
    timers.current.push(setTimeout(() => setToast(null), 4300));
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast && (
        <div className={`toast toast-${toast.type}${visible ? ' show' : ''}`}>
          <i className={`fas ${ICONS[toast.type] || ICONS.info}`}></i>
          <span>{toast.message}</span>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
