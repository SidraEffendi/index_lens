from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import networkx as nx
import json
import io
import os
from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if GROQ_API_KEY:
    from groq import Groq
    client = Groq()
else:
    client = None

app = FastAPI(title="IndexLens API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

state: dict = {"df": None, "graph": None}


@app.post("/api/upload")
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
            raise HTTPException(status_code=400, detail="Only CSV and JSON files are supported")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {e}")

    if df.empty:
        raise HTTPException(status_code=400, detail="Dataset is empty")

    df = df.head(200).reset_index(drop=True)
    state["df"] = df
    state["graph"] = None

    schema = {col: str(dtype) for col, dtype in df.dtypes.items()}
    preview = json.loads(df.head(10).fillna("").to_json(orient="records"))

    # Suggest rel columns (auto-detected) so the frontend can pre-check them
    suggested = []
    for col in df.columns:
        series = df[col].dropna().astype(str)
        n_unique = series.nunique()
        unique_ratio = n_unique / max(len(series), 1)
        if 2 <= n_unique <= max(2, len(df) * 0.5) and unique_ratio <= 0.6:
            suggested.append(col)

    return {
        "rows": len(df),
        "columns": list(df.columns),
        "schema": schema,
        "preview": preview,
        "suggestedRelColumns": suggested,
    }


class GraphBuildRequest(BaseModel):
    relColumns: list[str] | None = None  # None = use auto-detection


@app.post("/api/graph/build")
async def build_graph(body: GraphBuildRequest = GraphBuildRequest()):
    if state["df"] is None:
        raise HTTPException(status_code=400, detail="No dataset uploaded. Please upload a file first.")

    df = state["df"]
    G = nx.Graph()

    for idx in range(len(df)):
        row = df.iloc[idx]
        props = {col: str(val) if pd.notna(val) else "" for col, val in row.items()}
        G.add_node(idx, **props)

    if body.relColumns is not None:
        rel_cols = [c for c in body.relColumns if c in df.columns]
    else:
        rel_cols = []
        for col in df.columns:
            series = df[col].dropna().astype(str)
            n_unique = series.nunique()
            unique_ratio = n_unique / max(len(series), 1)
            if 2 <= n_unique <= max(2, len(df) * 0.5) and unique_ratio <= 0.6:
                rel_cols.append(col)

    for col in rel_cols:
        groups = df.groupby(df[col].fillna("__null__").astype(str)).groups
        for val, idx_list in groups.items():
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

    state["graph"] = G

    nodes = [{"id": nid, **attrs} for nid, attrs in G.nodes(data=True)]
    edges = [
        {"source": u, "target": v, "label": data.get("label", "")}
        for u, v, data in G.edges(data=True)
    ]

    return {
        "nodes": nodes,
        "edges": edges,
        "nodeCount": G.number_of_nodes(),
        "edgeCount": G.number_of_edges(),
        "relColumns": rel_cols,
    }


def _label(G, nid, df) -> str:
    attrs = dict(G.nodes[nid])
    first_col = list(df.columns)[0]
    return attrs.get(first_col, str(nid))


def graph_query_fallback(message: str, G, df) -> str:
    msg = message.lower()
    cols = list(df.columns)
    name_col = cols[0]

    # Most connected / hubs
    if any(w in msg for w in ["most connected", "hub", "highest degree", "most edge", "central"]):
        top = sorted(G.degree(), key=lambda x: x[1], reverse=True)[:5]
        lines = [f"  • {_label(G, nid, df)} (node {nid}): {deg} connections" for nid, deg in top]
        return "Most connected nodes:\n" + "\n".join(lines)

    # Shortest path between two named values
    if "path" in msg or "between" in msg or "shortest" in msg:
        mentioned = []
        for nid in G.nodes():
            for col in cols:
                val = str(G.nodes[nid].get(col, "")).lower()
                if val and val in msg:
                    mentioned.append(nid)
                    break
        mentioned = list(dict.fromkeys(mentioned))
        if len(mentioned) >= 2:
            a, b = mentioned[0], mentioned[1]
            try:
                path = nx.shortest_path(G, a, b)
                names = [f"{_label(G, n, df)} (node {n})" for n in path]
                return f"Shortest path ({len(path)-1} hops): " + " → ".join(names)
            except nx.NetworkXNoPath:
                return f"No path found between {_label(G, a, df)} and {_label(G, b, df)}."

    # Neighbours of a named node
    if any(w in msg for w in ["connect", "neighbor", "neighbour", "linked", "related to"]):
        for nid in G.nodes():
            for col in cols:
                val = str(G.nodes[nid].get(col, "")).lower()
                if val and val in msg:
                    neighbours = list(G.neighbors(nid))
                    names = [f"{_label(G, n, df)}" for n in neighbours]
                    edge_labels = [G[nid][n].get("label", "") for n in neighbours]
                    lines = [f"  • {n} (via {e})" for n, e in zip(names, edge_labels)]
                    return (
                        f"{_label(G, nid, df)} (node {nid}) has {len(neighbours)} connection(s):\n"
                        + "\n".join(lines)
                    )

    # Connected components (check before generic "how many")
    if any(w in msg for w in ["component", "cluster", "island", "group", "isolated"]):
        comps = list(nx.connected_components(G))
        lines = [
            f"  • Component {i+1}: {len(c)} node(s) — "
            + ", ".join(_label(G, n, df) for n in list(c)[:4])
            + (" …" if len(c) > 4 else "")
            for i, c in enumerate(sorted(comps, key=len, reverse=True))
        ]
        return f"{len(comps)} connected component(s):\n" + "\n".join(lines)

    # Filter by a specific value mentioned in the query (also handles "how many X")
    for col in cols:
        for val in df[col].dropna().unique():
            if str(val).lower() in msg:
                matching = df[df[col].astype(str) == str(val)].index.tolist()
                names = [_label(G, idx, df) for idx in matching]
                return (
                    f"{len(matching)} node(s) with {col} = '{val}':\n"
                    + "\n".join(f"  • {n} (node {i})" for n, i in zip(names, matching))
                )

    # Count by column
    if any(w in msg for w in ["how many", "count", "number of"]):
        for col in cols:
            if col.lower() in msg:
                counts = df[col].value_counts()
                lines = [f"  • {val}: {cnt}" for val, cnt in counts.items()]
                return f"Counts by {col}:\n" + "\n".join(lines)
        return f"Dataset has {len(df)} rows and {G.number_of_nodes()} nodes with {G.number_of_edges()} edges."

    # Summary fallback
    degrees = dict(G.degree())
    avg = sum(degrees.values()) / max(len(degrees), 1)
    comps = nx.number_connected_components(G)
    return (
        f"Graph summary: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges, "
        f"{comps} component(s), avg degree {avg:.1f}.\n"
        f"Columns: {', '.join(cols)}.\n\n"
        "Try asking:\n"
        "  • Which nodes are most connected?\n"
        "  • Who is connected to [name]?\n"
        "  • Shortest path between [A] and [B]?\n"
        "  • How many nodes are in [City/Department/etc]?\n"
        "  • Show me all [value] nodes"
    )


class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []


@app.post("/api/chat")
async def chat(body: ChatRequest):
    if state["graph"] is None or state["df"] is None:
        raise HTTPException(status_code=400, detail="Please upload a dataset and build the graph first.")

    G = state["graph"]
    df = state["df"]

    # Demo mode: use built-in graph traversal when no API key is configured
    if client is None:
        answer = graph_query_fallback(body.message, G, df)
        return {"response": answer, "mode": "demo"}

    sample_nodes = [dict(G.nodes[nid]) for nid in list(G.nodes())[:10]]
    degrees = dict(G.degree())
    top_hubs = sorted(degrees.items(), key=lambda x: x[1], reverse=True)[:5]
    hub_details = [{"id": nid, "degree": deg, **dict(G.nodes[nid])} for nid, deg in top_hubs]
    components = list(nx.connected_components(G))

    graph_context = f"""Dataset: {len(df)} rows, {len(df.columns)} columns: {", ".join(df.columns)}
Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges, {len(components)} connected component(s)
Edges connect rows sharing values in: {", ".join(state.get("rel_cols", []))}
Top connected nodes (hubs): {json.dumps(hub_details, indent=2)}
Sample nodes: {json.dumps(sample_nodes, indent=2)}"""

    messages = [{"role": h["role"], "content": h["content"]} for h in body.history]
    messages.append({"role": "user", "content": body.message})

    system_prompt = (
        "You are a data analyst assistant helping users explore a dataset through a graph index.\n"
        "Nodes are rows; edges connect rows that share values in categorical columns.\n\n"
        f"{graph_context}\n\n"
        "Answer questions concisely. Reference specific node IDs and their properties when helpful."
    )

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        max_tokens=1024,
        messages=[{"role": "system", "content": system_prompt}] + messages,
    )

    return {"response": response.choices[0].message.content}
