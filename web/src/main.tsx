import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import Display from './Display';
import { DialogProvider } from './Dialog';
import './index.css';

// ?display=1 opens the kiosk view for the wall touch screen (no router needed).
const isDisplay = new URLSearchParams(window.location.search).has('display');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DialogProvider>
      {isDisplay ? (
        <Display />
      ) : (
        <BrowserRouter>
          <App />
        </BrowserRouter>
      )}
    </DialogProvider>
  </React.StrictMode>,
);
