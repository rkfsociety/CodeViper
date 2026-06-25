import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            gap: '16px',
            fontFamily: 'sans-serif',
            color: 'var(--text, #ccc)',
            background: 'var(--bg, #1a1a1a)'
          }}
        >
          <h2 style={{ margin: 0 }}>Произошла ошибка</h2>
          <pre
            style={{
              maxWidth: '600px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: '13px',
              opacity: 0.7
            }}
          >
            {this.state.error?.message}
          </pre>
          <button
            onClick={this.handleReload}
            style={{
              padding: '8px 20px',
              borderRadius: '6px',
              border: 'none',
              background: 'var(--accent, #4f8ef7)',
              color: '#fff',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            Перезагрузить
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
