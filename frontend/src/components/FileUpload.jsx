import { useRef, useState } from 'react'

export default function FileUpload({ onUpload }) {
  const inputRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [fileName, setFileName] = useState(null)
  const [error, setError] = useState(null)
  const [dragging, setDragging] = useState(false)

  const handleFile = async (file) => {
    if (!file) return
    setError(null)
    setLoading(true)
    setFileName(file.name)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Upload failed')
      onUpload(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  return (
    <div
      className={`upload-zone ${dragging ? 'dragging' : ''} ${loading ? 'loading' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !loading && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.json"
        style={{ display: 'none' }}
        onChange={(e) => handleFile(e.target.files[0])}
      />
      <div className="upload-icon">↑</div>
      {loading ? (
        <p>Uploading <strong>{fileName}</strong>…</p>
      ) : (
        <>
          <p>Drop a <strong>CSV</strong> or <strong>JSON</strong> file here, or click to browse</p>
          {fileName && !error && <p className="upload-filename">Loaded: {fileName}</p>}
        </>
      )}
      {error && <p className="upload-error">{error}</p>}
    </div>
  )
}
