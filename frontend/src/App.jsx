import { useState, useCallback } from 'react'
import FileUpload from './components/FileUpload'
import DataPreview from './components/DataPreview'
import GraphView from './components/GraphView'
import ChatPanel from './components/ChatPanel'
import ColumnSelector from './components/ColumnSelector'
import './App.css'

export default function App() {
  const [uploadResult, setUploadResult] = useState(null)
  const [rawData, setRawData] = useState([])
  const [relColumns, setRelColumns] = useState([])
  const [graphData, setGraphData] = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [chatHistory, setChatHistory] = useState([])
  const [loading, setLoading] = useState({ graph: false, chat: false })
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

  const handleUpload = useCallback(async (data) => {
    setUploadResult(data)
    setRawData(data.rawData || [])
    setGraphData(null)
    setSelectedNode(null)
    setChatHistory([])
    setError(null)
    const cols = data.suggestedRelColumns || []
    setRelColumns(cols)
    buildGraph(data.rawData || [], cols)
  }, [buildGraph])

  const handleRebuild = useCallback(() => {
    setChatHistory([])
    buildGraph(rawData, relColumns)
  }, [buildGraph, rawData, relColumns])

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
            <ColumnSelector
              columns={uploadResult.columns}
              schema={uploadResult.schema}
              selected={relColumns}
              onChange={setRelColumns}
              onRebuild={handleRebuild}
              loading={loading.graph}
            />

            <div className="workspace">
              <div className="graph-panel">
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

                {selectedNode && (
                  <div className="node-inspector">
                    <button className="close-btn" onClick={() => setSelectedNode(null)}>×</button>
                    <h3>Node {selectedNode.id}</h3>
                    <table>
                      <tbody>
                        {Object.entries(selectedNode)
                          .filter(([k]) => !['id', 'x', 'y', 'vx', 'vy', 'fx', 'fy', 'index'].includes(k))
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
