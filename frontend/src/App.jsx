import { useState, useCallback } from 'react'
import FileUpload from './components/FileUpload'
import DataPreview from './components/DataPreview'
import GraphView from './components/GraphView'
import SemanticView from './components/SemanticView'
import ChatPanel from './components/ChatPanel'
import ColumnSelector from './components/ColumnSelector'
import './App.css'

export default function App() {
  const [uploadResult, setUploadResult] = useState(null)
  const [rawData, setRawData] = useState([])

  // Graph state
  const [relColumns, setRelColumns] = useState([])
  const [graphData, setGraphData] = useState(null)

  // Semantic state
  const [semanticColumns, setSemanticColumns] = useState([])
  const [nClusters, setNClusters] = useState(3)
  const [semanticData, setSemanticData] = useState(null)

  // UI state
  const [activeTab, setActiveTab] = useState('graph')
  const [selectedNode, setSelectedNode] = useState(null)
  const [chatHistory, setChatHistory] = useState([])
  const [loading, setLoading] = useState({ graph: false, semantic: false, chat: false })
  const [error, setError] = useState(null)

  const buildGraph = useCallback(async (data, cols) => {
    setGraphData(null)
    setSelectedNode(null)
    setError(null)
    setLoading(l => ({ ...l, graph: true }))
    try {
      const res = await fetch('/api/graph/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawData: data, relColumns: cols }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail || 'Graph build failed')
      setGraphData(json)
    } catch (e) {
      setError(`Graph build failed: ${e.message}`)
    } finally {
      setLoading(l => ({ ...l, graph: false }))
    }
  }, [])

  const buildSemantic = useCallback(async (data, cols, k) => {
    setSemanticData(null)
    setSelectedNode(null)
    setError(null)
    setLoading(l => ({ ...l, semantic: true }))
    try {
      const res = await fetch('/api/semantic/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawData: data, textColumns: cols, nClusters: k }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail || 'Semantic build failed')
      setSemanticData(json)
    } catch (e) {
      setError(`Semantic build failed: ${e.message}`)
    } finally {
      setLoading(l => ({ ...l, semantic: false }))
    }
  }, [])

  const handleUpload = useCallback(async (data) => {
    setUploadResult(data)
    setRawData(data.rawData || [])
    setGraphData(null)
    setSemanticData(null)
    setSelectedNode(null)
    setChatHistory([])
    setError(null)

    const suggested = data.suggestedRelColumns || []
    setRelColumns(suggested)

    const strCols = data.columns.filter(c => data.schema[c] === 'str' || data.schema[c] === 'object')
    const semCols = strCols.length ? strCols : data.columns
    setSemanticColumns(semCols)

    buildGraph(data.rawData || [], suggested)
    buildSemantic(data.rawData || [], semCols, 3)
  }, [buildGraph, buildSemantic])

  const handleRebuildGraph = useCallback(() => {
    setChatHistory([])
    buildGraph(rawData, relColumns)
  }, [buildGraph, rawData, relColumns])

  const handleRebuildSemantic = useCallback(() => {
    buildSemantic(rawData, semanticColumns, nClusters)
  }, [buildSemantic, rawData, semanticColumns, nClusters])

  const handleChat = useCallback(async (message) => {
    const newHistory = [...chatHistory, { role: 'user', content: message }]
    setChatHistory(newHistory)
    setLoading(l => ({ ...l, chat: true }))
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          history: chatHistory,
          nodes: graphData?.nodes || [],
          edges: graphData?.edges || [],
          columns: uploadResult?.columns || [],
          relColumns: graphData?.relColumns || [],
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail || 'Chat failed')
      setChatHistory([...newHistory, { role: 'assistant', content: json.response }])
    } catch (e) {
      setChatHistory([...newHistory, { role: 'assistant', content: `Error: ${e.message}` }])
    } finally {
      setLoading(l => ({ ...l, chat: false }))
    }
  }, [chatHistory, graphData, uploadResult])

  const switchTab = (tab) => {
    setActiveTab(tab)
    setSelectedNode(null)
  }

  const isGraphTab = activeTab === 'graph'
  const isSemTab = activeTab === 'semantic'

  return (
    <div className="app">
      <header className="app-header">
        <h1>IndexLens</h1>
        <span className="header-sub">Graph-based dataset exploration</span>
      </header>

      <main className="app-main">
        <FileUpload onUpload={handleUpload} />

        {error && <div className="error-banner">{error}</div>}

        {uploadResult && (
          <>
            {/* Tab switcher */}
            <div className="tab-bar">
              <button
                className={`tab-btn ${isGraphTab ? 'active' : ''}`}
                onClick={() => switchTab('graph')}
              >
                Graph Index
                {graphData && !loading.graph && (
                  <span className="tab-count">{graphData.nodeCount}n · {graphData.edgeCount}e</span>
                )}
                {loading.graph && <span className="tab-count loading">…</span>}
              </button>
              <button
                className={`tab-btn ${isSemTab ? 'active' : ''}`}
                onClick={() => switchTab('semantic')}
              >
                Semantic Index
                {semanticData && !loading.semantic && (
                  <span className="tab-count">{semanticData.nClusters} clusters</span>
                )}
                {loading.semantic && <span className="tab-count loading">…</span>}
              </button>
            </div>

            {/* Graph tab */}
            {isGraphTab && (
              <ColumnSelector
                columns={uploadResult.columns}
                schema={uploadResult.schema}
                selected={relColumns}
                onChange={setRelColumns}
                onRebuild={handleRebuildGraph}
                loading={loading.graph}
                label="Link nodes by:"
                hint="edges connect rows sharing the same value"
              />
            )}

            {/* Semantic tab controls */}
            {isSemTab && (
              <div className="col-selector">
                <div className="col-selector-header">
                  <span className="col-selector-label">Vectorize by:</span>
                  <span className="col-selector-hint">columns used to compute text similarity</span>
                </div>
                <div className="col-selector-cols">
                  {uploadResult.columns.map((col) => (
                    <label key={col} className={`col-chip ${semanticColumns.includes(col) ? 'checked' : ''}`}>
                      <input
                        type="checkbox"
                        checked={semanticColumns.includes(col)}
                        disabled={loading.semantic}
                        onChange={() =>
                          setSemanticColumns(prev =>
                            prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
                          )
                        }
                      />
                      <span className="col-name">{col}</span>
                      <span className="col-type">{uploadResult.schema[col]}</span>
                    </label>
                  ))}
                </div>
                <div className="cluster-control">
                  <label className="col-selector-label">Clusters</label>
                  <input
                    type="number"
                    min="2"
                    max="10"
                    value={nClusters}
                    onChange={e => setNClusters(Number(e.target.value))}
                    disabled={loading.semantic}
                    className="cluster-input"
                  />
                </div>
                <button
                  className="rebuild-btn"
                  onClick={handleRebuildSemantic}
                  disabled={loading.semantic || semanticColumns.length === 0}
                >
                  {loading.semantic ? 'Computing…' : 'Rebuild Semantic'}
                </button>
              </div>
            )}

            <div className="workspace">
              <div className="graph-panel">
                {isGraphTab && (
                  <>
                    <div className="panel-title">
                      <h2>Graph Index</h2>
                      {loading.graph && <span className="badge loading-badge">Building…</span>}
                      {graphData && !loading.graph && (
                        <span className="badge info-badge">
                          {graphData.nodeCount} nodes · {graphData.edgeCount} edges
                        </span>
                      )}
                    </div>
                    {graphData && !loading.graph && graphData.relColumns.length > 0 && (
                      <p className="rel-cols">Linked by: {graphData.relColumns.join(', ')}</p>
                    )}
                    <GraphView
                      data={graphData}
                      onNodeClick={setSelectedNode}
                      loading={loading.graph}
                    />
                  </>
                )}

                {isSemTab && (
                  <>
                    <div className="panel-title">
                      <h2>Semantic Index</h2>
                      {loading.semantic && <span className="badge loading-badge">Computing…</span>}
                      {semanticData && !loading.semantic && (
                        <span className="badge info-badge">
                          {semanticData.points.length} points · {semanticData.nClusters} clusters
                        </span>
                      )}
                    </div>
                    {semanticData && !loading.semantic && (
                      <p className="rel-cols">
                        Vectorized from: {semanticData.textColumns.join(', ')} · TF-IDF + PCA + K-means
                      </p>
                    )}
                    <SemanticView
                      data={semanticData}
                      onPointClick={setSelectedNode}
                      loading={loading.semantic}
                    />

                    {/* Cluster legend */}
                    {semanticData && !loading.semantic && (
                      <div className="cluster-legend">
                        {[...Array(semanticData.nClusters)].map((_, i) => {
                          const colors = ['#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f','#edc948','#b07aa1','#ff9da7','#9c755f','#bab0ac']
                          const pts = semanticData.points.filter(p => p.cluster === i)
                          return (
                            <span key={i} className="cluster-chip" style={{ borderColor: colors[i] }}>
                              <span className="cluster-dot" style={{ background: colors[i] }} />
                              Cluster {i + 1} <span className="cluster-n">({pts.length})</span>
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}

                {selectedNode && (
                  <div className="node-inspector">
                    <button className="close-btn" onClick={() => setSelectedNode(null)}>×</button>
                    <h3>{isSemTab ? `Point ${selectedNode.id}` : `Node ${selectedNode.id}`}</h3>
                    {isSemTab && (
                      <p className="inspector-cluster">
                        Cluster {(selectedNode.cluster ?? 0) + 1}
                      </p>
                    )}
                    <table>
                      <tbody>
                        {Object.entries(selectedNode)
                          .filter(([k]) => !['id','x','y','vx','vy','fx','fy','index','cluster'].includes(k))
                          .map(([k, v]) => (
                            <tr key={k}>
                              <td className="key">{k}</td>
                              <td className="val">{v}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="chat-panel-wrapper">
                <div className="panel-title">
                  <h2>Query Graph</h2>
                </div>
                <ChatPanel
                  history={chatHistory}
                  onSend={handleChat}
                  loading={loading.chat}
                  disabled={!graphData || loading.graph}
                />
              </div>
            </div>

            <div className="preview-section">
              <div className="panel-title">
                <h2>Data Preview</h2>
                <span className="badge info-badge">
                  {uploadResult.rows} rows · {uploadResult.columns.length} columns
                </span>
              </div>
              <DataPreview data={uploadResult} />
            </div>
          </>
        )}
      </main>
    </div>
  )
}
