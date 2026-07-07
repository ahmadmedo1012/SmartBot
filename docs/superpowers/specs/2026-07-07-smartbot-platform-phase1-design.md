# SmartBot Platform - Phase 1 Design
## Visual Flow Builder + Sequences + Broadcast (ManyChat Rival)

**Date:** 2026-07-07
**Status:** Approved

## 1. Architecture Overview

Built on existing SmartBot codebase (FastAPI + React 19 + Tailwind 4).
Each engine is an independent package communicating via DB and FBClient.

```
┌─────────────────────────────────────────────────┐
│                   Runner (API)                    │
│  /api/flows/*  /api/sequences/*  /api/broadcast/*│
└──────┬────────────┬──────────────┬───────────────┘
       │            │              │
┌──────▼───┐ ┌─────▼──────┐ ┌─────▼────────┐
│FlowEngine │ │SeqEngine   │ │BcastEngine   │
│(flow_exec)│ │(drip_camp) │ │(mass_send)   │
└──────┬───┘ └─────┬──────┘ └─────┬────────┘
       │            │              │
       └────────────┴──────────────┘
                    │
           ┌───────▼────────┐
           │   FBClient     │
           │(FB/IG/WA msgs) │
           └───────┬────────┘
                   │
           ┌───────▼────────┐
           │  Graph API     │
           │  v22.0         │
           └────────────────┘
```

## 2. New Models (10)

- **Subscriber** — universal contact record (FB user ID, platform, tags, stats)
- **Tag** + **SubscriberTag** — M:N labeling
- **Flow** — JSON graph: nodes[] + edges[]
- **FlowExecution** — per-subscriber execution trace
- **Sequence** + **SequenceStep** — time-based drip steps
- **SequenceSubscription** — subscriber enrollment
- **Broadcast** + **BroadcastRecipient** — mass message tracking

## 3. Engines

### FlowEngine
- `load_flow(id)` → parse JSON graph
- `find_matching_flows(trigger_type, text)` → filter active flows
- `execute_flow(id, context)` → traverse graph recursively
- `_traverse(node_id, nodes, edges, ctx)` → recursive walk with depth limit (50)
- Node types: TRIGGER, MESSAGE, CONDITION, ACTION, DELAY, GOAL, SEQUENCE

### SequenceEngine  
- Scheduler: runs every 60s, queries `SequenceSubscription WHERE status=active AND step due`
- `subscribe(sub_id, seq_id)` → enroll
- `advance(sub_id, seq_id)` → next step
- Uses FBClient for delivery

### BroadcastEngine
- `create_broadcast(name, template, segment_filters)` → save
- `estimate_audience(filters)` → count matching subscribers
- `send_broadcast(id)` → async fan-out (max 10 concurrent)
- Segment: tag_contains, tag_not_contains, platform, last_interaction, date

## 4. Frontend Pages

| Page | Tech | Description |
|------|------|-------------|
| flows.jsx | @xyflow/react | Visual canvas, node palette, properties panel |
| sequences.jsx | shadcn/ui | Step editor, timeline, stats |
| broadcast.jsx | shadcn/ui | Composer, segment builder, history |
| subscribers.jsx | shadcn/ui | Table, tag manager, segment builder |

## 5. Implementation Order

All files written in parallel by 4 Opus 4.8 agents:
1. Agent A: Models + FBClient extension (base)
2. Agent B: FlowEngine + SubscriberEngine (depends on A)
3. Agent C: SequenceEngine + BroadcastEngine (depends on A)
4. Agent D: Runner API endpoints (depends on B+C)
5. Agents E/F/G: Frontend pages (parallel, depends on API contract)
