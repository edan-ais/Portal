import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ToastDock } from './components/ToastDock';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

const toastRoot = document.createElement('div');
toastRoot.id = 'toast-root';
document.body.appendChild(toastRoot);

createRoot(toastRoot).render(
  <StrictMode>
    <ToastDock />
  </StrictMode>
);
