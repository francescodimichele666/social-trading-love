import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { DEMO } from './api';
import { AuthProvider } from './auth';
import App from './App';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/manrope';
import './styles.css';

// Nell'anteprima gli indirizzi stanno dopo il # così la pagina funziona ovunque sia pubblicata.
const Router = DEMO ? HashRouter : BrowserRouter;
// Alcune pagine di anteprima bloccano le finestre di conferma: nell'anteprima si conferma sempre.
if (DEMO) window.confirm = () => true;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <AuthProvider>
        <App />
      </AuthProvider>
    </Router>
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD && !DEMO) navigator.serviceWorker.register('/sw.js').catch(() => {});
