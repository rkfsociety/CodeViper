import { useEffect, useRef } from 'react'
import type cytoscape from 'cytoscape'
import type { Core, ElementDefinition, LayoutOptions } from 'cytoscape'
import type { DiagramEdge, DiagramNode } from '../types'
import styles from './LayoutGraphView.module.css'

export type GraphLayoutKind = 'dagre' | 'concentric'

interface Props {
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  layout: GraphLayoutKind
}

function buildElements(nodes: DiagramNode[], edges: DiagramEdge[]): ElementDefinition[] {
  const elements: ElementDefinition[] = nodes.map((node) => ({
    data: {
      id: node.id,
      label: node.label,
      external: node.external ?? false
    }
  }))

  for (const [index, edge] of edges.entries()) {
    elements.push({
      data: {
        id: `e-${index}`,
        source: edge.source,
        target: edge.target,
        label: edge.label ?? ''
      }
    })
  }

  return elements
}

function layoutOptions(kind: GraphLayoutKind): LayoutOptions {
  if (kind === 'concentric') {
    return {
      name: 'concentric',
      animate: false,
      minNodeSpacing: 48,
      concentric: (node) => (node.data('external') ? 10 : 1),
      levelWidth: () => 1
    }
  }

  return {
    name: 'dagre',
    animate: false,
    rankDir: 'TB',
    ranker: 'network-simplex',
    nodeSep: 44,
    rankSep: 72,
    edgeSep: 24
  } as LayoutOptions
}

const GRAPH_STYLE = [
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      'text-valign': 'center',
      'text-halign': 'center',
      'font-family': 'var(--font-mono, ui-monospace, monospace)',
      'font-size': '10px',
      color: '#e6edf3',
      'text-wrap': 'wrap',
      'text-max-width': '180px',
      'background-color': '#1f2937',
      'border-color': '#64748b',
      'border-width': 1,
      shape: 'round-rectangle',
      padding: '10px',
      width: 'label',
      height: 'label'
    }
  },
  {
    selector: 'node[external]',
    style: {
      'background-color': '#334155',
      'border-color': '#94a3b8',
      shape: 'ellipse',
      'font-size': '12px',
      'font-weight': 'bold'
    }
  },
  {
    selector: 'edge',
    style: {
      width: 1.5,
      'line-color': '#94a3b8',
      'target-arrow-color': '#94a3b8',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      label: 'data(label)',
      'font-size': '9px',
      color: '#cbd5e1',
      'text-background-color': '#0d1117',
      'text-background-opacity': 0.85,
      'text-background-padding': '2px',
      'text-rotation': 'autorotate'
    }
  },
  {
    selector: 'edge[label = ""]',
    style: {
      label: ''
    }
  }
] satisfies cytoscape.StylesheetJson

export function LayoutGraphView({ nodes, edges, layout }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)

  useEffect(() => {
    let destroyed = false
    const host = hostRef.current
    if (!host || nodes.length === 0) return

    void Promise.all([import('cytoscape'), import('cytoscape-dagre')]).then(
      ([cyModule, dagreModule]) => {
        if (destroyed || !hostRef.current) return

        const cytoscape = cyModule.default
        cytoscape.use(dagreModule.default)

        cyRef.current?.destroy()

        const cy = cytoscape({
          container: hostRef.current,
          elements: buildElements(nodes, edges),
          style: GRAPH_STYLE,
          minZoom: 0.08,
          maxZoom: 4,
          wheelSensitivity: 0.18,
          boxSelectionEnabled: false
        })

        cyRef.current = cy
        const layoutRun = cy.layout(layoutOptions(layout))
        layoutRun.on('layoutstop', () => {
          cy.fit(undefined, 48)
        })
        layoutRun.run()
      }
    )

    return () => {
      destroyed = true
      cyRef.current?.destroy()
      cyRef.current = null
    }
  }, [nodes, edges, layout])

  const fitGraph = () => {
    cyRef.current?.fit(undefined, 48)
  }

  const resetGraph = () => {
    const cy = cyRef.current
    if (!cy) return
    cy.zoom(1)
    cy.pan({ x: 0, y: 0 })
    cy.fit(undefined, 48)
  }

  return (
    <div className={styles.host}>
      <div className={styles.controls}>
        <button type="button" className={styles.controlBtn} onClick={fitGraph}>
          Вписать
        </button>
        <button type="button" className={styles.controlBtn} onClick={resetGraph}>
          Сброс
        </button>
      </div>
      <div className={styles.hint}>Колесо — масштаб · перетаскивание — перемещение</div>
      <div ref={hostRef} className={styles.canvas} />
    </div>
  )
}
