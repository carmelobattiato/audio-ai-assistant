
import React from 'react';
import ReactDOM from 'react-dom/client';
import { NewHome } from './pages/NewHome';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SettingsProvider } from './contexts/SettingsContext';
import { UIStateProvider } from './contexts/UIStateContext';
import { SessionProvider } from './contexts/SessionContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary variant="global" label="App">
      <SettingsProvider>
        <UIStateProvider>
          <SessionProvider>
            <NewHome />
          </SessionProvider>
        </UIStateProvider>
      </SettingsProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
