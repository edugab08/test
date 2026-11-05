import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@fontsource-variable/sora';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/unbounded';
import '@fontsource-variable/manrope';
import '@fontsource-variable/bricolage-grotesque/wdth.css';
import '@fontsource-variable/instrument-sans';
import '@fontsource-variable/fraunces/full.css';
import './index.css';
import { applyTheme, initialTheme } from './ui/theme';

applyTheme(initialTheme());

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
