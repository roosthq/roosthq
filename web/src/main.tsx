import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import Display from './Display';
import './index.css';

// Simple route split: ?display=1 opens the kiosk view for the wall touch screen.
const isDisplay = new URLSearchParams(window.location.search).has('display');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isDisplay ? <Display /> : <App />}</React.StrictMode>,
);
