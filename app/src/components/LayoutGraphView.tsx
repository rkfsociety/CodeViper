import { useEffect, useRef } from 'react'
import type cytoscape from 'cytoscape'
import type { Core, ElementDefinition, LayoutOptions } from 'cytoscape'
import type { DiagramEdge, DiagramNode } from '../types'
import styles from './LayoutGraphView.module.css'

export type GraphLayoutKind = 'dagre' | 'dataflow'

interface Props {
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  layout: GraphLayoutKind
}

function runDataflowStarLayout(cy: Core): void {
  const externals = cy.nodes('[external]').toArray()
  const modules = cy.nodes(':![external]').toArray()

  const ringRadius = 220 + modules.length * 6
  const hubRadius = Math.min(72, ringRadius * 0.22)

  const extOrder = new Map<string, number>()
  for (const [index, node] of externals.entries()) {
    extOrder.set(node.id(), index)
  }

  const grouped = new Map<string, typeof modules>()
  for (const node of modules) {
    const linkedExt = node
      .connectedEdges()
      .map((edge) => {
        if (edge.source().data('external')) return edge.source().id()
        if (edge.target().data('external')) return edge.target().id()
        return 'OTHER'
      })
      .sort((left, right) => (extOrder.get(left) ?? 99) - (extOrder.get(right) ?? 99))[0]

    const bucket = linkedExt ?? 'OTHER'
    const list = grouped.get(bucket) ?? []
    list.push(node)
    grouped.set(bucket, list)
  }

  const buckets = [...grouped.entries()].sort(
    (left, right) => (extOrder.get(left[0]) ?? 99) - (extOrder.get(right[0]) ?? 99)
  )

  let cursor = 0
  const gap = modules.length > 0 ? (2 * Math.PI) / modules.length : 0
  for (const [, bucket] of buckets) {
    bucket.sort((left, right) =>
      String(left.data('label')).localeCompare(String(right.data('label')), 'ru')
    )
    for (const node of bucket) {
      const angle = cursor * gap - Math.PI / 2
      node.position({
        x: Math.cos(angle) * ringRadius,
        y: Math.sin(angle) * ringRadius
      })
      cursor += 1
    }
  }

  for (const [index, node] of externals.entries()) {
    const angle = (2 * Math.PI * index) / Math.max(externals.length, 1) - Math.PI / 2
    node.position({
      x: Math.cos(angle) * hubRadius,
      y: Math.sin(angle) * hubRadius
    })
  }
}

function buildGraphStyle(layout: GraphLayoutKind): cytoscape.StylesheetJson {
  const edgeCurve = layout === 'dataflow' ? 'straight' : 'bezier'

  return [
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
        'font-weight': 'bold',
        'text-max-width': '120px'
      }
    },
    {
      selector: 'edge',
      style: {
        width: 1.5,
        'line-color': '#94a3b8',
        'target-arrow-color': '#94a3b8',
        'target-arrow-shape': 'triangle',
        'curve-style': edgeCurve,
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
  ]
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

function layoutOptions(kind: GraphLayoutKind): LayoutOptions | null {
  if (kind === 'dataflow') return null

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
          style: buildGraphStyle(layout),
          minZoom: 0.08,
          maxZoom: 4,
          wheelSensitivity: 0.18,
          boxSelectionEnabled: false
        })

        cyRef.current = cy
        const fit = () => {
          cy.fit(undefined, 48)
        }

        if (layout === 'dataflow') {
          runDataflowStarLayout(cy)
          fit()
        } else {
          const options = layoutOptions(layout)
          if (!options) return
          const layoutRun = cy.layout(options)
          layoutRun.on('layoutstop', fit)
          layoutRun.run()
        }
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
