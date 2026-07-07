import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { CrashBoundary } from './components/CrashPanel';
import { installClientErrorReporting } from './lib/client-log';
import './styles.css';

installClientErrorReporting();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CrashBoundary>
      <App />
    </CrashBoundary>
  </React.StrictMode>,
);
