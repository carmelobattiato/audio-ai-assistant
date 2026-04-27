
import React from 'react';
import { loggingService } from '../services/loggingService';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /** 'global' mostra una pagina di recovery completa; 'inline' mostra un banner compatto */
  variant?: 'global' | 'inline';
  label?: string;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    loggingService.error('REACT_ERROR', error.message, {
      stack: error.stack,
      componentStack: info.componentStack,
      boundary: this.props.label ?? 'unknown',
    } as Record<string, unknown>);
  }

  private handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    if (this.props.variant === 'inline') {
      return (
        <div style={{
          padding: '12px 16px', margin: '8px', borderRadius: '8px',
          background: '#1a0a0a', border: '1px solid #7f1d1d', color: '#fca5a5',
          fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <span style={{ flex: 1 }}>
            {this.props.label ? `[${this.props.label}] ` : ''}Errore nel componente.{' '}
            <span style={{ color: '#94a3b8' }}>{this.state.errorMessage}</span>
          </span>
          <button
            onClick={this.handleReset}
            style={{
              padding: '3px 10px', borderRadius: '4px', border: 'none',
              background: '#7f1d1d', color: '#fca5a5', cursor: 'pointer', fontSize: '0.75rem',
            }}
          >
            Riprova
          </button>
        </div>
      );
    }

    return (
      <div style={{
        minHeight: '100vh', background: '#0f1117', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: '2rem',
      }}>
        <div style={{
          maxWidth: '480px', width: '100%', background: '#1e2130',
          border: '1px solid #450a0a', borderRadius: '12px', padding: '2rem', textAlign: 'center',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ color: '#f87171', fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Qualcosa è andato storto
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.82rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
            {this.state.errorMessage || 'Errore imprevisto nel rendering dell\'applicazione.'}
          </p>
          <p style={{ color: '#475569', fontSize: '0.72rem', marginBottom: '1.5rem' }}>
            L'errore è stato registrato. I dati della sessione in IndexedDB sono al sicuro.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button
              onClick={this.handleReset}
              style={{
                padding: '8px 20px', borderRadius: '6px', border: 'none',
                background: '#1d4ed8', color: '#fff', cursor: 'pointer', fontSize: '0.85rem',
              }}
            >
              Riprova
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 20px', borderRadius: '6px', border: '1px solid #334155',
                background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '0.85rem',
              }}
            >
              Ricarica pagina
            </button>
          </div>
        </div>
      </div>
    );
  }
}
