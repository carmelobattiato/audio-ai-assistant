
import React from 'react';
import ReactDOM from 'react-dom/client';
import { NewHome } from './pages/NewHome';
import { ErrorBoundary } from './components/ErrorBoundary';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary variant="global" label="App">
      <NewHome />
    </ErrorBoundary>
  </React.StrictMode>
);
