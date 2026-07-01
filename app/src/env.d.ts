declare const __APP_VERSION__: string

declare module '*.css' {
  const classes: { readonly [key: string]: string }
  export default classes
}

declare module '*.module.css' {
  const classes: { readonly [key: string]: string }
  export default classes
}

declare module '*.png' {
  const url: string
  export default url
}

declare module 'highlight.js/styles/*.css' {
  const href: string
  export default href
}

declare module 'mermaid' {
  interface MermaidConfig {
    startOnLoad?: boolean
    theme?: string
    securityLevel?: string
    fontFamily?: string
  }

  interface MermaidApi {
    initialize(config: MermaidConfig): void
    render(id: string, text: string): Promise<{ svg: string }>
  }

  const mermaid: MermaidApi
  export default mermaid
}
