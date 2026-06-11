// Dev-only preview entry — see preview-arcade.html.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './cowork/styles/tailwind.css';
import './cowork/styles/globals.css';
import './styles.css';
import App from './App';

document.body.dataset.theme = 'dark';
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
