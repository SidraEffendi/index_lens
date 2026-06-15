# IndexLens

A browser-based tool for exploring datasets through graph and semantic indexes. Upload a CSV or JSON file, visualise how your rows relate to each other as an interactive graph, cluster them by semantic similarity, and query the data in plain English via an AI chatbot.

Live: **https://indexlens.vercel.app**

---

## What it does

### 1. Upload a dataset
Drop a CSV or JSON file onto the upload zone. The backend parses it, infers the schema, and shows a 10-row preview. Datasets up to 200 rows are supported.

### 2. Graph Index
The backend analyses the dataset and builds a graph using NetworkX. Each row becomes a node. Rows that share the same value in a categorical column (e.g. same City, same Department) are connected by an edge.

The graph is rendered as an interactive D3 force-directed diagram. You can:
- Zoom and pan
- Drag nodes to rearrange the layout
- Click any node to inspect its full row data
- Change which columns define the edges and rebuild the graph instantly

### 3. Semantic Index
Each row is converted into a text document (column name + value pairs), vectorised with TF-IDF, reduced to two dimensions with PCA, and clustered with K-means. The result is a scatter plot where rows that are semantically similar appear close together.

You can change which columns feed into the vectorisation, adjust the number of clusters (2–10), and rebuild.

### 4. AI chatbot
A chat panel lets you query the graph in natural language. It is powered by Groq (Llama 3.3 70B). The backend passes the graph structure as context — node properties, edge labels, hub nodes, connected components — so the model can answer questions like:

- "Which nodes are most connected?"
- "Who is connected to Alice?"
- "Find the shortest path between Grace and Bob."
- "How many nodes are in Engineering?"
- "Show me all New York records."

When no API key is configured the chatbot falls back to a built-in rule-based graph traversal engine that answers the same questions without any external calls.

### 5. Persistent storage
Uploaded datasets are stored in Supabase. Subsequent graph and semantic builds fetch the data by UUID rather than re-sending it in every request, keeping payloads small.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + D3.js v7 + Vite |
| Backend | Python 3.12 + FastAPI + Mangum |
| Graph engine | NetworkX |
| Semantic index | scikit-learn (TF-IDF, PCA, K-means) |
| AI / LLM | Groq API — Llama 3.3 70B |
| Storage | Supabase (PostgreSQL) |
| Deployment | Vercel (frontend + Python serverless) |

---

## Running locally

### Prerequisites
- Python 3.12+
- Node.js 18+
- A Groq API key (free at [console.groq.com](https://console.groq.com))
- Optional: Supabase project for persistent storage

### 1. Backend

```bash
cd api
pip install -r requirements.txt

# Create .env
echo "GROQ_API_KEY=gsk_..." > .env
# Optional:
echo "SUPABASE_URL=https://xxxx.supabase.co" >> .env
echo "SUPABASE_ANON_KEY=sb_publishable_..." >> .env

python -m uvicorn index:app --port 8000 --reload
```

### 2. Frontend

```bash
cd frontend
npm install

# Create .env.local (only needed if using Supabase)
echo "VITE_SUPABASE_URL=https://xxxx.supabase.co" > .env.local
echo "VITE_SUPABASE_ANON_KEY=sb_publishable_..." >> .env.local

npm run dev
```

Open **http://localhost:5173**. The Vite dev server proxies `/api/*` to the backend at port 8000.

---

## Project structure

```
index_lens/
├── api/
│   ├── index.py          # FastAPI app — all endpoints
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx                     # Main layout and state
│   │   ├── App.css
│   │   └── components/
│   │       ├── FileUpload.jsx          # Drag-and-drop upload
│   │       ├── GraphView.jsx           # D3 force-directed graph
│   │       ├── SemanticView.jsx        # D3 scatter plot
│   │       ├── ChatPanel.jsx           # AI chat interface
│   │       ├── ColumnSelector.jsx      # Column checkbox picker
│   │       └── DataPreview.jsx         # Row preview table
│   ├── package.json
│   └── vite.config.js
├── backend/
│   └── main.py           # Local dev server (stateful version)
├── vercel.json
└── supabase_schema.sql   # Table + RLS policy definitions
```

## API endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/upload` | Parse CSV/JSON, store in Supabase, return schema + preview |
| `POST` | `/api/graph/build` | Build NetworkX graph from dataset, return nodes + edges |
| `POST` | `/api/semantic/build` | TF-IDF + PCA + K-means, return 2D points + cluster labels |
| `POST` | `/api/chat` | Send graph context to Groq LLM, return answer |

---

## Branches

| Branch | What it adds |
|---|---|
| `main` | Full working app — graph, semantic, chat, Supabase storage |
| `groq-chat` | Switches the LLM provider from Anthropic to Groq |
| `semantic-indexing` | Adds the Semantic Index tab alongside the Graph Index |
| `supabase-backend` | Adds Supabase persistent storage for uploaded datasets |

---

## Supabase setup

If you want dataset persistence, run the following in your Supabase SQL editor:

```sql
create table datasets (
  id                    uuid default gen_random_uuid() primary key,
  name                  text,
  rows                  integer,
  columns               jsonb,
  schema                jsonb,
  suggested_rel_columns jsonb,
  raw_data              jsonb,
  created_at            timestamptz default now()
);

alter table datasets enable row level security;
create policy "public insert" on datasets for insert with check (true);
create policy "public select" on datasets for select using (true);

grant select, insert on public.datasets to anon;
grant select, insert on public.datasets to authenticated;
```

Without Supabase configured the app works in stateless mode — raw data is passed in each request instead of fetched by ID.
