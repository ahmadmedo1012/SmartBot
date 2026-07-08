import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge,
  ReactFlowProvider, Panel,
  Handle, Position, useReactFlow,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchFlows, createFlow, updateFlow, deleteFlow, toggleFlow, fetchFlow } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import {
  Plus, Save, Power, Trash2, ArrowLeft, GripVertical,
  Sparkles, MessageSquare, GitFork, Clock, Flag,
  Wrench, Search, AlertCircle, Layers, X,
} from "lucide-react"

// ── Helpers ──
function genId() {
  return `node_${(crypto.randomUUID?.()?.slice(0, 8) || Math.random().toString(36).slice(2, 10))}`
}

function cleanNodes(nodes) {
  return nodes.map(n => ({ id: n.id, type: n.type, position: n.position, data: n.data }))
}

function cleanEdges(edges) {
  return edges.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle }))
}

// ── Node Type Definitions ──
const NODE_TYPES = {
  TRIGGER: {
    label: "مشغل", icon: Sparkles, color: "#22c55e",
    defaults: { trigger_type: "keyword", keywords: [], match_mode: "any" },
  },
  MESSAGE: {
    label: "رسالة", icon: MessageSquare, color: "#3b82f6",
    defaults: { text: "", image_url: "", buttons: [] },
  },
  CONDITION: {
    label: "شرط", icon: GitFork, color: "#f59e0b",
    defaults: { field: "intent", operator: "equals", value: "", true_label: "نعم", false_label: "لا" },
  },
  ACTION: {
    label: "إجراء", icon: Wrench, color: "#8b5cf6",
    defaults: { action_type: "tag_add", value: "" },
  },
  DELAY: {
    label: "انتظار", icon: Clock, color: "#f97316",
    defaults: { amount: 5, unit: "minutes" },
  },
  GOAL: {
    label: "هدف", icon: Flag, color: "#22c55e",
    defaults: { goal_type: "complete" },
  },
}

// ── Custom Node Components ──
function NodeWrap({ children, selected, color, icon: Icon, label, handles }) {
  return (
    <div
      className={cn(
        "rounded-xl border-2 bg-card shadow-md transition-shadow min-w-[180px] max-w-[260px]",
        selected ? "border-primary shadow-lg" : "border-border/50"
      )}
    >
      <div
        className="flex items-center gap-1.5 px-3 py-2 rounded-t-[10px] text-white text-[11px] font-bold"
        style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
      >
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="px-3 py-2 text-[11px] text-foreground space-y-1 relative">
        {children}
      </div>
      {handles}
    </div>
  )
}

function TriggerNode({ data, selected }) {
  const kw = data.keywords?.slice(0, 3) || []
  return (
    <NodeWrap data={data} selected={selected} color="#22c55e" icon={Sparkles} label="مشغل"
      handles={<Handle type="source" position={Position.Bottom} style={{ background: "#22c55e", width: 8, height: 8, border: "2px solid #fff" }} />}
    >
      <div className="flex items-center gap-1 flex-wrap">
        <Badge variant="outline" className="text-[9px] px-1 py-0">{data.trigger_type}</Badge>
      </div>
      {kw.length > 0 && <p className="truncate text-[10px]">{kw.join("، ")}</p>}
      {kw.length === 0 && <p className="text-[10px] text-muted-foreground/40">بدون كلمات مفتاحية</p>}
    </NodeWrap>
  )
}

function MessageNode({ data, selected }) {
  const preview = data.text ? (data.text.length > 60 ? data.text.slice(0, 60) + "..." : data.text) : ""
  return (
    <NodeWrap data={data} selected={selected} color="#3b82f6" icon={MessageSquare} label="رسالة"
      handles={<><Handle type="target" position={Position.Top} style={{ background: "#3b82f6", width: 8, height: 8, border: "2px solid #fff" }} /><Handle type="source" position={Position.Bottom} style={{ background: "#3b82f6", width: 8, height: 8, border: "2px solid #fff" }} /></>}
    >
      {preview ? <p className="text-[10px] leading-relaxed">{preview}</p> : <p className="text-[10px] text-muted-foreground/40">نص الرسالة...</p>}
      {data.image_url && <Badge variant="outline" className="text-[9px] px-1 py-0">🖼 صورة</Badge>}
    </NodeWrap>
  )
}

function ConditionNode({ data, selected }) {
  return (
    <NodeWrap data={data} selected={selected} color="#f59e0b" icon={GitFork} label="شرط"
      handles={<>
        <Handle type="target" position={Position.Top} style={{ background: "#f59e0b", width: 8, height: 8, border: "2px solid #fff" }} />
        <Handle type="source" position={Position.Bottom} id="true" style={{ left: "70%", background: "#22c55e", width: 8, height: 8, border: "2px solid #fff" }} />
        <Handle type="source" position={Position.Bottom} id="false" style={{ left: "30%", background: "#ef4444", width: 8, height: 8, border: "2px solid #fff" }} />
      </>}
    >
      <p className="text-[10px] font-medium">{data.field || "intent"} {data.operator || "equals"} {data.value || "..."}</p>
      <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
        <span className="text-red-500">✗ {data.false_label || "لا"}</span>
        <span className="text-green-500">✓ {data.true_label || "نعم"}</span>
      </div>
    </NodeWrap>
  )
}

function ActionNode({ data, selected }) {
  return (
    <NodeWrap data={data} selected={selected} color="#8b5cf6" icon={Wrench} label="إجراء"
      handles={<><Handle type="target" position={Position.Top} style={{ background: "#8b5cf6", width: 8, height: 8, border: "2px solid #fff" }} /><Handle type="source" position={Position.Bottom} style={{ background: "#8b5cf6", width: 8, height: 8, border: "2px solid #fff" }} /></>}
    >
      <Badge variant="outline" className="text-[9px] px-1 py-0 mb-1">{data.action_type || "tag_add"}</Badge>
      {data.value && <p className="truncate text-[10px]">{data.value}</p>}
      {!data.value && <p className="text-[10px] text-muted-foreground/40">القيمة...</p>}
    </NodeWrap>
  )
}

function DelayNode({ data, selected }) {
  return (
    <NodeWrap data={data} selected={selected} color="#f97316" icon={Clock} label="انتظار"
      handles={<><Handle type="target" position={Position.Top} style={{ background: "#f97316", width: 8, height: 8, border: "2px solid #fff" }} /><Handle type="source" position={Position.Bottom} style={{ background: "#f97316", width: 8, height: 8, border: "2px solid #fff" }} /></>}
    >
      <p className="text-[10px] font-medium">{data.amount || 5} {data.unit || "minutes"}</p>
    </NodeWrap>
  )
}

function GoalNode({ data, selected }) {
  return (
    <NodeWrap data={data} selected={selected} color="#22c55e" icon={Flag} label="هدف"
      handles={<Handle type="target" position={Position.Top} style={{ background: "#22c55e", width: 8, height: 8, border: "2px solid #fff" }} />}
    >
      <Badge variant="outline" className="text-[9px] px-1 py-0">{data.goal_type === "complete" ? "✅ إكمال" : "⏹️ إلغاء"}</Badge>
    </NodeWrap>
  )
}

const customNodeTypes = {
  TRIGGER: TriggerNode, MESSAGE: MessageNode, CONDITION: ConditionNode,
  ACTION: ActionNode, DELAY: DelayNode, GOAL: GoalNode,
}

// ── Node Palette ──
function NodePalette({ canEdit }) {
  const onDragStart = useCallback((e, nodeType) => {
    e.dataTransfer.setData("application/reactflow", nodeType)
    e.dataTransfer.effectAllowed = "move"
  }, [])

  if (!canEdit) return null

  return (
    <div className="w-44 shrink-0 border-l glass overflow-y-auto p-3 space-y-1 hidden md:block">
      <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">العناصر</h3>
      {Object.entries(NODE_TYPES).map(([type, def]) => {
        const Icon = def.icon
        return (
          <div
            key={type}
            draggable
            onDragStart={(e) => onDragStart(e, type)}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs cursor-grab active:cursor-grabbing hover:bg-accent/60 transition-colors select-none"
          >
            <div className="size-6 rounded flex items-center justify-center" style={{ background: `${def.color}18` }}>
              <Icon className="size-3" style={{ color: def.color }} />
            </div>
            <span className="font-medium text-[11px]">{def.label}</span>
          </div>
        )
      })}
      <p className="text-[9px] text-muted-foreground/50 mt-4 leading-relaxed">اسحب العنصر إلى اللوحة</p>
    </div>
  )
}

// ── Properties Panel ──
function PropertiesPanel({ node, onUpdate, canEdit }) {
  if (!node) {
    return (
      <div className="w-60 shrink-0 border-r bg-card/30 p-4 hidden md:flex items-center justify-center">
        <p className="text-[11px] text-muted-foreground/50 text-center">اختر عقدة<br />لتعديل الخصائص</p>
      </div>
    )
  }

  const type = node.type
  const data = node.data

  if (!canEdit) {
    return (
      <div className="w-60 shrink-0 border-r bg-card/30 p-4 hidden md:block">
        <h4 className="text-xs font-semibold mb-3">{NODE_TYPES[type]?.label || type}</h4>
        <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
      </div>
    )
  }

  const update = (key, val) => onUpdate(node.id, { [key]: val })

  const renderField = (label, comp) => (
    <div className="space-y-1">
      <label className="text-[10px] font-medium text-muted-foreground block">{label}</label>
      {comp}
    </div>
  )

  return (
    <div className="w-60 shrink-0 border-r bg-card/30 overflow-y-auto p-3 space-y-3 hidden md:block">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-xs font-semibold">{NODE_TYPES[type]?.label || type}</h4>
        <Badge variant="outline" className="text-[9px] px-1 py-0">{type}</Badge>
      </div>

      {type === "TRIGGER" && (
        <>
          {renderField("نوع المشغل",
            <Select value={data.trigger_type} onValueChange={v => update("trigger_type", v)}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="keyword">كلمة مفتاحية</SelectItem>
                <SelectItem value="post_comment">تعليق على منشور</SelectItem>
                <SelectItem value="page_visit">زيارة الصفحة</SelectItem>
                <SelectItem value="scheduled">مجدول</SelectItem>
              </SelectContent>
            </Select>
          )}
          {data.trigger_type === "keyword" && renderField("الكلمات المفتاحية (مفصولة بفاصلة)",
            <Input className="h-7 text-xs" value={(data.keywords || []).join("، ")}
              onChange={e => update("keywords", e.target.value.split(/[،,]/).map(s => s.trim()).filter(Boolean))}
              placeholder="كلمة1، كلمة2" />
          )}
          {data.trigger_type === "keyword" && renderField("وضع المطابقة",
            <Select value={data.match_mode} onValueChange={v => update("match_mode", v)}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">أي كلمة</SelectItem>
                <SelectItem value="all">جميع الكلمات</SelectItem>
                <SelectItem value="exact">تام</SelectItem>
              </SelectContent>
            </Select>
          )}
        </>
      )}

      {type === "MESSAGE" && (
        <>
          {renderField("نص الرسالة",
            <Textarea className="min-h-[80px] text-xs" value={data.text || ""}
              onChange={e => update("text", e.target.value)}
              placeholder={"مرحباً {name}! 👋"} />
          )}
          {renderField("رابط الصورة (اختياري)",
            <Input className="h-7 text-xs" value={data.image_url || ""}
              onChange={e => update("image_url", e.target.value)}
              placeholder="https://..." />
          )}
          <p className="text-[9px] text-muted-foreground/60">المتغيرات: {'{name}'} {'{full_name}'}</p>
        </>
      )}

      {type === "CONDITION" && (
        <>
          {renderField("الحقل",
            <Select value={data.field} onValueChange={v => update("field", v)}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="intent">النية</SelectItem>
                <SelectItem value="text">النص</SelectItem>
                <SelectItem value="tag_has">الوسم</SelectItem>
              </SelectContent>
            </Select>
          )}
          {renderField("العامل",
            <Select value={data.operator} onValueChange={v => update("operator", v)}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="equals">يساوي</SelectItem>
                <SelectItem value="contains">يحتوي</SelectItem>
                <SelectItem value="matches">يطابق</SelectItem>
              </SelectContent>
            </Select>
          )}
          {renderField("القيمة",
            <Input className="h-7 text-xs" value={data.value || ""}
              onChange={e => update("value", e.target.value)}
              placeholder="قيمة المقارنة" />
          )}
          {renderField("تسمية نعم",
            <Input className="h-7 text-xs" value={data.true_label || "نعم"}
              onChange={e => update("true_label", e.target.value)} />
          )}
          {renderField("تسمية لا",
            <Input className="h-7 text-xs" value={data.false_label || "لا"}
              onChange={e => update("false_label", e.target.value)} />
          )}
        </>
      )}

      {type === "ACTION" && (
        <>
          {renderField("نوع الإجراء",
            <Select value={data.action_type} onValueChange={v => { update("action_type", v); update("value", "") }}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tag_add">إضافة وسم</SelectItem>
                <SelectItem value="tag_remove">إزالة وسم</SelectItem>
                <SelectItem value="webhook">Webhook</SelectItem>
                <SelectItem value="dm">رسالة خاصة</SelectItem>
                <SelectItem value="add_to_sequence">إضافة لتسلسل</SelectItem>
              </SelectContent>
            </Select>
          )}
          {renderField(
            data.action_type === "webhook" ? "رابط Webhook" :
            data.action_type === "dm" ? "نص الرسالة" :
            data.action_type === "add_to_sequence" ? "معرف التسلسل" : "اسم الوسم",
            <Input className="h-7 text-xs" value={data.value || ""}
              onChange={e => update("value", e.target.value)}
              placeholder={data.action_type === "webhook" ? "https://..." : "القيمة"} />
          )}
        </>
      )}

      {type === "DELAY" && (
        <>
          {renderField("المدة",
            <Input type="number" min={1} className="h-7 text-xs" value={data.amount || 5}
              onChange={e => update("amount", parseInt(e.target.value) || 5)} />
          )}
          {renderField("الوحدة",
            <Select value={data.unit} onValueChange={v => update("unit", v)}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="seconds">ثوانٍ</SelectItem>
                <SelectItem value="minutes">دقائق</SelectItem>
                <SelectItem value="hours">ساعات</SelectItem>
                <SelectItem value="days">أيام</SelectItem>
              </SelectContent>
            </Select>
          )}
        </>
      )}

      {type === "GOAL" && (
        <>
          {renderField("نوع الهدف",
            <Select value={data.goal_type} onValueChange={v => update("goal_type", v)}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="complete">✅ إكمال</SelectItem>
                <SelectItem value="abandon">⏹️ إلغاء</SelectItem>
              </SelectContent>
            </Select>
          )}
        </>
      )}
    </div>
  )
}

// ── Canvas Area (requires ReactFlowProvider context) ──
function CanvasArea({ nodes, edges, onNodesChange, onEdgesChange, onConnect, setNodes, onNodeClick, onPaneClick, canEdit, reactFlowWrapper }) {
  const reactFlowInstance = useReactFlow()

  const onDrop = useCallback((event) => {
    event.preventDefault()
    const type = event.dataTransfer.getData("application/reactflow")
    if (!type || !NODE_TYPES[type]) return
    const bounds = reactFlowWrapper.current?.getBoundingClientRect()
    if (!bounds) return
    const position = reactFlowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    })
    const def = NODE_TYPES[type]
    setNodes((nds) => nds.concat({
      id: genId(),
      type,
      position,
      data: { ...def.defaults },
    }))
  }, [reactFlowInstance, setNodes, reactFlowWrapper])

  return (
    <div
      ref={reactFlowWrapper}
      className="w-full h-full"
      onDragOver={(e) => { if (canEdit) e.preventDefault() }}
      onDrop={canEdit ? onDrop : undefined}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={customNodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        snapToGrid
        snapGrid={[20, 20]}
        defaultEdgeOptions={{ type: "smoothstep", animated: true }}
        deleteKeyCode={canEdit ? ["Backspace", "Delete"] : null}
        multiSelectionKeyCode="Shift"
      >
        <Controls showInteractive={false} className="[&>button]:text-[10px] [&>button]:h-7 [&>button]:w-7" />
        <Background color="hsl(var(--border) / 0.3)" gap={20} />
        <MiniMap
          nodeStrokeColor="hsl(var(--border))"
          nodeColor="hsl(var(--card))"
          maskColor="hsl(var(--background) / 0.6)"
          style={{ background: "hsl(var(--card))" }}
          className="border border-border rounded-lg"
        />
        {nodes.length === 0 && (
          <Panel position="top-center">
            <div className="bg-card/80 backdrop-blur border border-border rounded-lg px-4 py-2 text-xs text-muted-foreground shadow-sm">
              {canEdit ? "اسحب العناصر من القائمة اليمنى لبدء بناء البوت" : "هذا البوت لا يحتوي على عناصر بعد"}
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  )
}

// ── Flow Editor ──
function FlowEditor({ flow: initialFlow, onBack, canEdit, queryClient }) {
  const reactFlowWrapper = useRef(null)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [initialLoad, setInitialLoad] = useState(true)

  const { data: flowDetail, isLoading } = useQuery({
    queryKey: ["flow", initialFlow.id],
    queryFn: () => fetchFlow(initialFlow.id),
    enabled: !!initialFlow.id && initialLoad,
  })

  // Set nodes/edges when flow data loads
  useEffect(() => {
    if (flowDetail) {
      const g = flowDetail.graph || flowDetail
      if (g.nodes && g.nodes.length > 0) {
        setNodes(g.nodes.map(n => ({ ...n, position: n.position || { x: 0, y: 0 } })))
      }
      if (g.edges) setEdges(g.edges)
      setInitialLoad(false)
    }
  }, [flowDetail])

  const selectedNode = useMemo(() => nodes.find(n => n.id === selectedNodeId), [nodes, selectedNodeId])

  const updateMut = useMutation({
    mutationFn: (data) => updateFlow(initialFlow.id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["flows"] }); queryClient.invalidateQueries({ queryKey: ["flow", initialFlow.id] }); toast.success("تم حفظ البوت") },
    onError: (e) => toast.error(e.message),
  })

  const toggleMut = useMutation({
    mutationFn: () => toggleFlow(initialFlow.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["flows"] }); queryClient.invalidateQueries({ queryKey: ["flow", initialFlow.id] }); toast.success("تم تحديث الحالة") },
    onError: (e) => toast.error(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteFlow(initialFlow.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["flows"] }); toast.success("تم حذف البوت"); onBack() },
    onError: (e) => toast.error(e.message),
  })

  const handleDelete = useCallback(() => {
    if (window.confirm("هل أنت متأكد من حذف هذا البوت؟")) deleteMut.mutate()
  }, [deleteMut])

  const onConnect = useCallback((params) => {
    setEdges((eds) => addEdge(params, eds))
  }, [setEdges])

  const updateNodeData = useCallback((nodeId, newData) => {
    setNodes((nds) => nds.map(n => (n.id === nodeId ? { ...n, data: { ...n.data, ...newData } } : n)))
  }, [setNodes])

  const handleSave = useCallback(() => {
    updateMut.mutate({
      name: flowDetail?.name || initialFlow.name,
      graph: { nodes: cleanNodes(nodes), edges: cleanEdges(edges) },
    })
  }, [nodes, edges, updateMut, flowDetail, initialFlow.name])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="space-y-4 text-center">
          <Skeleton className="h-6 w-48 mx-auto" />
          <Skeleton className="h-[400px] w-full max-w-3xl mx-auto rounded-xl" />
        </div>
      </div>
    )
  }

  const flowName = flowDetail?.name || initialFlow.name || ""
  const enabled = flowDetail?.enabled !== false

  return (
    <ReactFlowProvider>
      <div className="flex flex-col h-[calc(100vh-10rem)]" dir="ltr">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 py-2 border-b shrink-0" dir="rtl">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="size-8" onClick={onBack}>
              <ArrowLeft className="size-4" />
            </Button>
            <span className="text-sm font-semibold">{flowName}</span>
            <Badge variant={enabled ? "default" : "secondary"} className="text-[10px] px-1.5">
              {enabled ? "نشط" : "متوقف"}
            </Badge>
            {updateMut.isPending && <span className="text-[10px] text-muted-foreground">جاري الحفظ...</span>}
          </div>
          <div className="flex items-center gap-1">
            {canEdit && (
              <>
                <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={updateMut.isPending}>
                  <Save className="ml-1 size-3.5" /> حفظ
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => toggleMut.mutate()} disabled={toggleMut.isPending}>
                  <Power className="ml-1 size-3.5" /> {enabled ? "إيقاف" : "تشغيل"}
                </Button>
                <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={handleDelete} disabled={deleteMut.isPending}>
                  <Trash2 className="ml-1 size-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Main layout */}
        <div className="flex-1 flex overflow-hidden" dir="ltr">
          <NodePalette canEdit={canEdit} />
          <CanvasArea
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            setNodes={setNodes}
            onNodeClick={(_, n) => setSelectedNodeId(n.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            canEdit={canEdit}
            reactFlowWrapper={reactFlowWrapper}
          />
          <PropertiesPanel node={selectedNode} onUpdate={updateNodeData} canEdit={canEdit} />
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between px-4 py-1.5 border-t shrink-0 text-[10px] text-muted-foreground" dir="rtl">
          <span>{nodes.length} عقدة · {edges.length} رابط</span>
          {flowDetail?.updated_at && <span>آخر حفظ: {new Date(flowDetail.updated_at).toLocaleString("ar-SA")}</span>}
        </div>
      </div>
    </ReactFlowProvider>
  )
}

// ── Main Flows Component ──
export function Flows({ role }) {
  useEffect(() => { document.title = "البوت البصري | SmartBot" }, [])
  const canEdit = role === "admin" || role === "editor"
  const queryClient = useQueryClient()
  const [view, setView] = useState("list")
  const [search, setSearch] = useState("")
  const [editingFlow, setEditingFlow] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [flowName, setFlowName] = useState("")
  const [deleteTarget, setDeleteTarget] = useState(null)

  const { data: flows = [], isLoading, error, refetch } = useQuery({
    queryKey: ["flows"], queryFn: fetchFlows,
  })

  const filtered = useMemo(() => {
    if (!search) return flows
    const s = search.toLowerCase()
    return flows.filter((f) => (f.name || "").toLowerCase().includes(s))
  }, [flows, search])

  const createMut = useMutation({
    mutationFn: (name) => createFlow({ name }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["flows"] })
      setCreateOpen(false)
      toast.success("تم إنشاء البوت")
      const newId = res?.id || res?.flow_id
      if (newId) {
        setEditingFlow({ id: newId, name: flowName })
        setView("editor")
      }
      setFlowName("")
    },
    onError: (e) => toast.error(e.message),
  })

  const toggleMut = useMutation({
    mutationFn: (id) => toggleFlow(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["flows"] }); toast.success("تم تحديث الحالة") },
    onError: (e) => toast.error(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => deleteFlow(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["flows"] }); setDeleteTarget(null); toast.success("تم الحذف") },
    onError: (e) => toast.error(e.message),
  })

  // ── Editor View ──
  if (view === "editor" && editingFlow) {
    return (
      <FlowEditor
        flow={editingFlow}
        onBack={() => { setView("list"); setEditingFlow(null) }}
        canEdit={canEdit}
        queryClient={queryClient}
      />
    )
  }

  // ── List View ──
  return (
    <div className="content-container space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-gradient-premium text-2xl font-bold flex items-center gap-2">
            <Layers className="size-5 text-primary" /> البوت البصري
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {flows.length} بوت · {flows.filter((f) => f.enabled !== false).length} نشط
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => { setFlowName(""); setCreateOpen(true) }}>
            <Plus className="ml-2 h-4 w-4" /> إنشاء بوت جديد
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative w-full sm:max-w-xs">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="بحث في البوتات..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pr-9 h-9 text-sm min-h-[44px] sm:min-h-0"
        />
      </div>

      {/* Loading */}
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        /* Error */
        <div className="flex flex-col items-center py-16">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <p className="text-sm text-muted-foreground mb-4">{error?.message || "فشل تحميل البوتات"}</p>
          <Button variant="outline" onClick={refetch}>إعادة المحاولة</Button>
        </div>
      ) : filtered.length === 0 ? (
        /* Empty */
        <div className="flex flex-col items-center py-16">
          <Layers className="h-16 w-16 text-muted-foreground/20 mb-4" />
          <p className="text-sm text-foreground font-medium">
            {search ? "لا توجد نتائج" : "لا توجد بوتات بعد"}
          </p>
          <p className="text-xs text-muted-foreground mt-1 mb-6">
            {canEdit ? "أنشئ بوتاً بصرياً لبدء أتمتة المحادثات" : "البوتات ستظهر هنا"}
          </p>
          {canEdit && !search && (
            <Button variant="outline" onClick={() => { setFlowName(""); setCreateOpen(true) }}>
              <Plus className="ml-2 h-4 w-4" /> إنشاء بوت جديد
            </Button>
          )}
        </div>
      ) : (
        /* Flow Cards */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((flow) => (
            <Card
              key={flow.id}
              className="cursor-pointer hover:border-primary/50 transition-all group"
              onClick={() => { setEditingFlow(flow); setView("editor") }}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Layers className="size-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{flow.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {flow.graph?.nodes?.length || 0} عقدة · {flow.total_replies || 0} رد
                      </p>
                    </div>
                  </div>
                  <Badge variant={flow.enabled !== false ? "default" : "secondary"} className="text-[9px] px-1.5 py-0 shrink-0">
                    {flow.enabled !== false ? "نشط" : "متوقف"}
                  </Badge>
                </div>
                {flow.last_triggered_at && (
                  <p className="text-[10px] text-muted-foreground/60 mt-2">
                    آخر تفعيل: {new Date(flow.last_triggered_at).toLocaleDateString("ar-SA")}
                  </p>
                )}
                {canEdit && (
                  <div className="flex gap-1 mt-2 pt-2 border-t border-border/50 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="size-6"
                      onClick={(e) => { e.stopPropagation(); toggleMut.mutate(flow.id) }}>
                      <Power className={cn("size-3", flow.enabled !== false ? "text-success" : "text-muted-foreground")} />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-6 text-destructive/70 hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(flow) }}>
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="glass-heavy">
          <DialogHeader><DialogTitle>إنشاء بوت بصري جديد</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (flowName.trim()) createMut.mutate(flowName.trim()) }} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">اسم البوت</label>
              <Input value={flowName} onChange={(e) => setFlowName(e.target.value)} required placeholder="مثال: بوت خدمة العملاء" autoFocus />
            </div>
            <div className="flex gap-2 justify-end pt-3 border-t">
              <Button variant="outline" type="button" onClick={() => setCreateOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={createMut.isPending || !flowName.trim()}>
                {createMut.isPending ? "جاري..." : "إنشاء"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <DialogContent className="glass-heavy">
          <DialogHeader><DialogTitle>تأكيد حذف البوت</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            هل أنت متأكد من حذف <strong className="text-foreground">{deleteTarget?.name}</strong>؟ لا يمكن التراجع.
          </p>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={() => deleteMut.mutate(deleteTarget.id)} disabled={deleteMut.isPending}>
              {deleteMut.isPending ? "جاري..." : "حذف"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
