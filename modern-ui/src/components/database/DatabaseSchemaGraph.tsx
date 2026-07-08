import { memo, useEffect, useMemo } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  MarkerType,
  type Node,
  type Edge,
  type NodeTypes,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { cn } from '@/lib/utils'

import type { DbSchemaColumn, DbSchemaForeignKey, DbSchemaTable } from '@/lib/db-schema-types'

type SchemaTableNodeData = {
  label: string
  columns: (DbSchemaColumn & { isFk: boolean })[]
}

function SchemaTableNode({ data }: NodeProps<Node<SchemaTableNodeData>>) {
  return (
    <div className="rounded-lg border border-border bg-popover shadow-md min-w-[200px] max-w-[260px] text-xs">
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-2 !bg-blue-500" />
      <div className="px-2 py-1.5 font-semibold border-b border-border bg-muted/60 text-foreground truncate">
        {data.label}
      </div>
      <div className="max-h-[280px] overflow-y-auto">
        {data.columns.map((c) => (
          <div
            key={c.name}
            className={cn(
              'px-2 py-0.5 flex justify-between gap-2 border-b border-border/30 last:border-0 font-mono',
              c.isFk && 'bg-amber-500/10'
            )}
          >
            <span className="truncate flex items-center gap-1">
              {c.isFk && <span className="text-[9px] text-amber-600 dark:text-amber-400 shrink-0">FK</span>}
              {c.name}
            </span>
            <span className="text-muted-foreground shrink-0 text-[10px] text-right max-w-[100px] truncate">
              {c.key === 'PRI' ? 'PK · ' : ''}
              {c.type}
            </span>
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-2 !bg-blue-500" />
    </div>
  )
}

const nodeTypes: NodeTypes = {
  schemaTable: memo(SchemaTableNode),
}

function layoutGrid(tables: DbSchemaTable[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  const n = tables.length
  const perRow = Math.max(1, Math.ceil(Math.sqrt(n)))
  const cellW = 280
  const cellH = 360
  tables.forEach((t, i) => {
    const col = i % perRow
    const row = Math.floor(i / perRow)
    positions.set(t.name, { x: col * cellW, y: row * cellH })
  })
  return positions
}

function buildFkColumnSet(fks: DbSchemaForeignKey[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const fk of fks) {
    if (!map.has(fk.childTable)) map.set(fk.childTable, new Set())
    const s = map.get(fk.childTable)!
    for (const c of fk.childColumns) s.add(c)
  }
  return map
}

function SchemaFlowInner({ tables, foreignKeys }: { tables: DbSchemaTable[]; foreignKeys: DbSchemaForeignKey[] }) {
  const colorMode = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  const fkCols = useMemo(() => buildFkColumnSet(foreignKeys), [foreignKeys])

  const { initialNodes, initialEdges } = useMemo(() => {
    const pos = layoutGrid(tables)
    const nodes: Node[] = tables.map((t) => {
      const fkSet = fkCols.get(t.name) ?? new Set<string>()
      return {
        id: t.name,
        type: 'schemaTable',
        position: pos.get(t.name) || { x: 0, y: 0 },
        data: {
          label: t.name,
          columns: t.columns.map((c) => ({ ...c, isFk: fkSet.has(c.name) })),
        },
      }
    })

    const edges: Edge[] = foreignKeys.map((fk, i) => ({
      id: `${fk.constraintName}-${fk.childTable}-${fk.parentTable}-${i}`,
      source: fk.childTable,
      target: fk.parentTable,
      label: fk.childColumns.join(', '),
      type: 'smoothstep',
      animated: false,
      style: { stroke: 'rgb(59, 130, 246)', strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'rgb(59, 130, 246)', width: 18, height: 18 },
      labelStyle: { fontSize: 9, fill: 'hsl(var(--muted-foreground))' },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 4,
      labelBgStyle: { fill: 'hsl(var(--popover))', stroke: 'hsl(var(--border))', strokeWidth: 1 },
    }))

    return { initialNodes: nodes, initialEdges: edges }
  }, [tables, foreignKeys, fkCols])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  useEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [initialNodes, initialEdges, setNodes, setEdges])

  return (
    <ReactFlow
      className="h-full w-full bg-muted/20"
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      colorMode={colorMode}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      onInit={(rf) => {
        queueMicrotask(() => rf.fitView({ padding: 0.15, duration: 0 }))
      }}
      minZoom={0.1}
      maxZoom={2.5}
      proOptions={{ hideAttribution: true }}
      panOnDrag
      zoomOnScroll
      zoomOnPinch
      zoomOnDoubleClick
      preventScrolling
      nodesDraggable
      nodesConnectable={false}
      elementsSelectable={false}
      selectNodesOnDrag={false}
    >
      <Background gap={20} size={1} className="!bg-muted/30" />
      <Controls className="!bg-popover !border-border !shadow-md [&_button]:!border-border [&_button:hover]:!bg-muted" />
      <MiniMap
        className="!bg-popover !border-border rounded-md"
        maskColor="hsl(var(--background) / 0.7)"
        nodeStrokeWidth={2}
        zoomable
        pannable
      />
    </ReactFlow>
  )
}

export function DatabaseSchemaGraph({ tables, foreignKeys }: { tables: DbSchemaTable[]; foreignKeys: DbSchemaForeignKey[] }) {
  if (tables.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground min-h-[320px]">
        No tables found in this database.
      </div>
    )
  }

  return (
    <div className="relative h-full min-h-[400px] w-full flex-1 rounded-lg border border-border/50 bg-muted/20 overflow-hidden [&_.react-flow__attribution]:hidden">
      <ReactFlowProvider>
        <div className="absolute inset-0 min-h-[320px]">
          <SchemaFlowInner tables={tables} foreignKeys={foreignKeys} />
        </div>
      </ReactFlowProvider>
    </div>
  )
}
