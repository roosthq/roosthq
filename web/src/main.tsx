import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { DialogProvider } from './Dialog';
import './index.css';

// The kiosk and the web app are separate bundles: the Pi never downloads or
// parses the admin pages, and phones never get the kiosk screen.
const App = lazy(() => import('./App'));
const Display = lazy(() => import('./Display'));

// ?display=1 opens the kiosk view for the wall touch screen (no router needed).
const isDisplay = new URLSearchParams(window.location.search).has('display');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DialogProvider>
      <Suspense fallback={null}>
        {isDisplay ? (
          <Display />
        ) : (
          <BrowserRouter>
            <App />
          </BrowserRouter>
        )}
      </Suspense>
    </DialogProvider>
  </React.StrictMode>,
);
