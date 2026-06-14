from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from pydantic import BaseModel
import pandas as pd
import networkx as nx
import json
import io
import os

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if GROQ_API_KEY:
    from groq import Groq
    groq_client = Groq()
else:
    groq_client = None

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY")
if SUPABASE_URL and SUPABASE_KEY:
    from supabase import create_client
    db = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    db = None

app = FastAPI(title="IndexLens API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _suggest_rel_cols(df: pd.DataFrame) -> list[str]:
    cols = []
    for col in df.columns:
        series = df[col].dropna().astype(str)
        n_unique = series.nunique()
        if 2 <= n_unique <= max(2, len(df) * 0.5) and n_unique / max(len(series), 1) <= 0.6:
            cols.append(col)
    return cols


def _build_nx(rows: list[dict], rel_cols: list[str]):
    df = pd.DataFrame(rows)
    G = nx.Graph()
    for idx in range(len(df)):
        row = df.iloc[idx]
        G.add_node(idx, **{col: str(val) if pd.notna(val) else "" for col, val in row.items()})
    for col in rel_cols:
        if col not in df.columns:
            continue
        for val, idx_list in df.groupby(df[col].fillna("__null__").astype(str)).groups.items():
            if val == "__null__":
                continue
            idx_list = list(idx_list)
            for i in range(len(idx_list)):
                for j in range(i + 1, len(idx_list)):
                    u, v = int(idx_list[i]), int(idx_list[j])
                    if G.has_edge(u, v):
                        shared = G[u][v].get("shared", [])
                        if col not in shared:
                            shared.append(col)
                        G[u][v]["shared"] = shared
                        G[u][v]["label"] = ", ".join(shared)
                    else:
                        G.add_edge(u, v, shared=[col], label=col)
    return G


def _label(G, nid, first_col):
    return G.nodes[nid].get(first_col, str(nid))


def _graph_from_payload(nodes, edges):
    G = nx.Graph()
    for n in nodes:
        nid = n["id"]
        G.add_node(nid, **{k: v for k, v in n.items() if k != "id"})
    for e in edges:
        G.add_edge(e["source"], e["target"], label=e.get("label", ""))
    return G


def graph_query_fallback(message: str, nodes: list, edges: list, columns: list) -> str:
    msg = message.lower()
    G = _graph_from_payload(nodes, edges)
    first_col = columns[0] if columns else "id"

    if any(w in msg for w in ["most connected", "hub", "highest degree", "central"]):
        top = sorted(G.degree(), key=lambda x: x[1], reverse=True)[:5]
        lines = [f"  • {_label(G, nid, first_col)} (node {nid}): {deg} connections" for nid, deg in top]
        return "Most connected nodes:\n" + "\n".join(lines)

    if any(w in msg for w in ["path", "between", "shortest"]):
        mentioned = []
        for nid in G.nodes():
            for col in columns:
                val = str(G.nodes[nid].get(col, "")).lower()
                if val and val in msg:
                    mentioned.append(nid)
                    break
        mentioned = list(dict.fromkeys(mentioned))
        if len(mentioned) >= 2:
            a, b = mentioned[0], mentioned[1]
            try:
                path = nx.shortest_path(G, a, b)
                names = [f"{_label(G, n, first_col)} (node {n})" for n in path]
                return f"Shortest path ({len(path)-1} hops): " + " → ".join(names)
            except nx.NetworkXNoPath:
                return f"No path found between {_label(G, a, first_col)} and {_label(G, b, first_col)}."

    if any(w in msg for w in ["connect", "neighbor", "neighbour", "linked", "related to"]):
        for nid in G.nodes():
            for col in columns:
                val = str(G.nodes[nid].get(col, "")).lower()
                if val and val in msg:
                    nbrs = list(G.neighbors(nid))
                    lines = [f"  • {_label(G, n, first_col)} (via {G[nid][n].get('label','')})" for n in nbrs]
                    return f"{_label(G, nid, first_col)} has {len(nbrs)} connection(s):\n" + "\n".join(lines)

    if any(w in msg for w in ["component", "cluster", "island", "group", "isolated"]):
        comps = list(nx.connected_components(G))
        lines = [
            f"  • Component {i+1}: {len(c)} node(s) — "
            + ", ".join(_label(G, n, first_col) for n in list(c)[:4])
            + (" …" if len(c) > 4 else "")
            for i, c in enumerate(sorted(comps, key=len, reverse=True))
        ]
        return f"{len(comps)} connected component(s):\n" + "\n".join(lines)

    for col in columns:
        for n in nodes:
            val = str(n.get(col, "")).lower()
            if val and val in msg:
                matching = [x for x in nodes if str(x.get(col, "")).lower() == val]
                names = [x.get(first_col, str(x["id"])) for x in matching]
                return (
                    f"{len(matching)} node(s) with {col} = '{n.get(col)}':\n"
                    + "\n".join(f"  • {nm} (node {x['id']})" for nm, x in zip(names, matching))
                )

    if any(w in msg for w in ["how many", "count", "number of"]):
        for col in columns:
            if col.lower() in msg:
                vals = {}
                for n in nodes:
                    v = str(n.get(col, ""))
                    vals[v] = vals.get(v, 0) + 1
                lines = [f"  • {v}: {c}" for v, c in sorted(vals.items(), key=lambda x: -x[1])]
                return f"Counts by {col}:\n" + "\n".join(lines)
        return f"Dataset has {len(nodes)} nodes and {len(edges)} edges."

    avg = sum(d for _, d in G.degree()) / max(len(nodes), 1)
    return (
        f"Graph: {len(nodes)} nodes, {len(edges)} edges, avg degree {avg:.1f}.\n"
        f"Columns: {', '.join(columns)}.\n\n"
        "Try asking:\n"
        "  • Which nodes are most connected?\n"
        "  • Who is connected to [name]?\n"
        "  • Shortest path between [A] and [B]?\n"
        "  • How many nodes are in [value]?\n"
        "  • Show me all [value] nodes"
    )


# ── Supabase helpers ──────────────────────────────────────────────────────────

def _db_store(record: dict) -> str | None:
    if db is None:
        return None
    try:
        result = db.table("datasets").insert(record).execute()
        return result.data[0]["id"]
    except Exception as e:
        print(f"[supabase] insert failed: {e}")
        return None


def _db_fetch(dataset_id: str) -> list[dict]:
    if db is None or not dataset_id:
        return []
    try:
        result = db.table("datasets").select("raw_data").eq("id", dataset_id).single().execute()
        return result.data.get("raw_data", [])
    except Exception as e:
        print(f"[supabase] fetch failed: {e}")
        return []


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    content = await file.read()
    filename = file.filename or ""
    try:
        if filename.lower().endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif filename.lower().endswith(".json"):
            data = json.loads(content)
            df = pd.DataFrame(data if isinstance(data, list) else [data])
        else:
            raise HTTPException(400, "Only CSV and JSON files are supported")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Failed to parse file: {e}")

    if df.empty:
        raise HTTPException(400, "Dataset is empty")

    df = df.head(200).reset_index(drop=True)
    raw_data = json.loads(df.fillna("").to_json(orient="records"))
    schema = {col: str(dtype) for col, dtype in df.dtypes.items()}
    suggested = _suggest_rel_cols(df)

    dataset_id = _db_store({
        "name": filename,
        "rows": len(df),
        "columns": list(df.columns),
        "schema": schema,
        "suggested_rel_columns": suggested,
        "raw_data": raw_data,
    })

    return {
        "datasetId": dataset_id,
        "rows": len(df),
        "columns": list(df.columns),
        "schema": schema,
        "preview": json.loads(df.head(10).fillna("").to_json(orient="records")),
        "suggestedRelColumns": suggested,
        # rawData included when Supabase is unavailable or insert failed
        "rawData": raw_data if dataset_id is None else [],
    }


class GraphBuildRequest(BaseModel):
    datasetId: str | None = None
    rawData: list[dict] = []
    relColumns: list[str] = []


@app.post("/graph/build")
async def build_graph(body: GraphBuildRequest):
    raw_data = body.rawData or _db_fetch(body.datasetId or "")
    if not raw_data:
        raise HTTPException(400, "No data — provide datasetId or rawData")
    G = _build_nx(raw_data, body.relColumns)
    nodes = [{"id": nid, **attrs} for nid, attrs in G.nodes(data=True)]
    edges = [{"source": u, "target": v, "label": d.get("label", "")} for u, v, d in G.edges(data=True)]
    return {
        "nodes": nodes,
        "edges": edges,
        "nodeCount": G.number_of_nodes(),
        "edgeCount": G.number_of_edges(),
        "relColumns": body.relColumns,
    }


class SemanticBuildRequest(BaseModel):
    datasetId: str | None = None
    rawData: list[dict] = []
    textColumns: list[str] = []
    nClusters: int = 3


@app.post("/semantic/build")
async def semantic_build(body: SemanticBuildRequest):
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.decomposition import PCA
    from sklearn.cluster import KMeans
    import numpy as np

    raw_data = body.rawData or _db_fetch(body.datasetId or "")
    if not raw_data:
        raise HTTPException(400, "No data — provide datasetId or rawData")

    df = pd.DataFrame(raw_data)
    text_cols = [c for c in body.textColumns if c in df.columns]
    if not text_cols:
        text_cols = [c for c in df.columns if df[c].dtype == object]
    if not text_cols:
        text_cols = list(df.columns)

    texts = (
        df[text_cols].fillna("").astype(str)
        .apply(lambda row: " ".join(f"{col} {val}" for col, val in row.items()), axis=1)
        .tolist()
    )

    try:
        X = TfidfVectorizer(max_features=500).fit_transform(texts).toarray()
    except ValueError:
        X = np.zeros((len(texts), 2))

    n = len(texts)
    X_2d = PCA(n_components=2, random_state=42).fit_transform(X) if (X.shape[1] >= 2 and n >= 2) else np.zeros((n, 2))
    k = max(1, min(body.nClusters, n))
    labels = KMeans(n_clusters=k, random_state=42, n_init=10).fit_predict(X).tolist() if k > 1 else [0] * n

    points = [
        {"id": i, "x": float(X_2d[i, 0]), "y": float(X_2d[i, 1]), "cluster": int(labels[i]),
         **{col: str(val) for col, val in row.items()}}
        for i, row in enumerate(raw_data)
    ]
    return {"points": points, "nClusters": k, "textColumns": text_cols}


class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []
    nodes: list[dict] = []
    edges: list[dict] = []
    columns: list[str] = []
    relColumns: list[str] = []


@app.post("/chat")
async def chat(body: ChatRequest):
    if not body.nodes:
        raise HTTPException(400, "Please build the graph first.")

    if groq_client is None:
        return {"response": graph_query_fallback(body.message, body.nodes, body.edges, body.columns), "mode": "demo"}

    top_hubs = sorted(
        [{"id": n["id"], **{k: v for k, v in n.items() if k != "id"}} for n in body.nodes],
        key=lambda x: sum(1 for e in body.edges if e["source"] == x["id"] or e["target"] == x["id"]),
        reverse=True,
    )[:5]
    comps = nx.number_connected_components(_graph_from_payload(body.nodes, body.edges))

    graph_context = (
        f"Dataset: {len(body.nodes)} rows, columns: {', '.join(body.columns)}\n"
        f"Graph: {len(body.nodes)} nodes, {len(body.edges)} edges, {comps} component(s)\n"
        f"Edges link rows sharing values in: {', '.join(body.relColumns)}\n"
        f"Top connected nodes: {json.dumps(top_hubs, indent=2)}\n"
        f"Sample nodes: {json.dumps(body.nodes[:10], indent=2)}"
    )

    system_prompt = (
        "You are a data analyst assistant helping users explore a dataset through a graph index.\n"
        "Nodes are rows; edges connect rows that share values in categorical columns.\n\n"
        f"{graph_context}\n\n"
        "Answer questions concisely. Reference specific node IDs and properties when helpful."
    )

    messages = [{"role": h["role"], "content": h["content"]} for h in body.history]
    messages.append({"role": "user", "content": body.message})

    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        max_tokens=1024,
        messages=[{"role": "system", "content": system_prompt}] + messages,
    )
    return {"response": response.choices[0].message.content}


# Vercel Python runtime entry point
handler = Mangum(app, lifespan="off")
