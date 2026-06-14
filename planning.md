# IndexPilot — graph-based indexing prototype

## Overview

A simple browser-based prototype that lets users upload a dataset (CSV or JSON), visualise it as a graph index (nodes and edges), and query it via an AI chatbot. Focused exclusively on graph-based indexing.

---

## Goal

Build a working proof of concept that demonstrates how relational data can be structured as a graph index, and let users explore and query that graph through a conversational interface.

---

## Core user journey

### 1. Upload dataset
User uploads a CSV or JSON file. The system parses it, infers the schema, and displays a short data preview so the user can confirm it loaded correctly.

### 2. Build the graph index
The backend analyses the dataset, identifies entity columns and relationships, and constructs a graph using NetworkX. Each row becomes a node; shared values across columns become edges.

### 3. Visualise the graph
The frontend renders the graph as an interactive node-edge diagram using D3.js. Users can zoom, pan, and click nodes to inspect their data.

### 4. Query via chatbot
User types a natural language query — e.g. "which nodes are connected to resource X?" or "find all records related to housing". The AI chatbot interprets the query, traverses the graph, and returns results with a plain-English explanation.

---

## Scope

### In scope
- File upload: CSV and JSON only
- Schema inference and data preview
- Graph construction from uploaded data (NetworkX)
- Interactive graph visualisation (D3 force layout)
- AI chatbot that queries the graph in natural language
- Basic graph traversal: find connected nodes, filter by property, find shortest path

### Out of scope
- Any indexing strategy other than graph-based
- User accounts, saved sessions, or data persistence
- Production graph database integration (e.g. Neo4j, Amazon Neptune)
- Real-time performance benchmarking

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React + D3.js |
| Backend | Python + FastAPI |
| Graph engine | NetworkX |
| AI / LLM | Claude API |Grok API
| File parsing | pandas |

---

## Architecture

```
User browser (React)
    │
    ├── File upload → POST /api/upload
    │       └── pandas parses file, infers schema, returns preview
    │
    ├── Build graph → POST /api/graph/build
    │       └── NetworkX constructs node-edge graph from dataset
    │               └── Returns graph JSON (nodes + edges) → D3 renders
    │
    └── Chat query → POST /api/chat
            └── FastAPI sends graph context + query → Claude API
                    └── Returns traversal results + explanation
```

---

## Build plan

### Phase 1 — Upload and preview (week 1)
- FastAPI project scaffold
- `/api/upload` endpoint: parse CSV/JSON with pandas, return schema + 10-row preview
- React file upload UI with data preview table

### Phase 2 — Graph construction (week 1–2)
- `/api/graph/build` endpoint: infer entities and relationships from schema, build NetworkX graph
- Return nodes and edges as JSON
- D3 force-directed graph in React — zoom, pan, click-to-inspect

### Phase 3 — Chat interface (week 2–3)
- Claude API integration
- System prompt includes graph summary (node count, edge count, entity types, sample nodes)
- `/api/chat` endpoint: receives user query + graph context, returns answer
- Chat UI in React with conversation history

### Phase 4 — Polish (week 3)
- Error handling: bad file format, empty dataset, disconnected graph
- Loading and empty states in UI
- README with local setup instructions

---

## Key risks

| Risk | Mitigation |
|---|---|
| Graph becomes too large to render clearly | Cap at 200 nodes for POC; cluster dense subgraphs |
| Schema inference misses relationships | Allow user to manually select which columns define edges |
| LLM answers are too vague without graph context | Pass structured graph summary + relevant subgraph in every prompt |
