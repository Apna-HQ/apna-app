import React from 'react';
import ReactDOM from 'react-dom/client';
import { ApnaProvider } from './apna-provider';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ApnaProvider appId="my-apna-mini-app">
      <App />
    </ApnaProvider>
  </React.StrictMode>,
);
