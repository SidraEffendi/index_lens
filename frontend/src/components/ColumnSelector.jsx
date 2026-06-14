export default function ColumnSelector({ columns, schema, selected, onChange, onRebuild, loading }) {
  const toggle = (col) => {
    const next = selected.includes(col)
      ? selected.filter((c) => c !== col)
      : [...selected, col]
    onChange(next)
  }

  return (
    <div className="col-selector">
      <div className="col-selector-header">
        <span className="col-selector-label">Link nodes by:</span>
        <span className="col-selector-hint">edges connect rows that share the same value in checked columns</span>
      </div>
      <div className="col-selector-cols">
        {columns.map((col) => {
          const dtype = schema[col] || ''
          const isChecked = selected.includes(col)
          return (
            <label key={col} className={`col-chip ${isChecked ? 'checked' : ''}`}>
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggle(col)}
                disabled={loading}
              />
              <span className="col-name">{col}</span>
              <span className="col-type">{dtype}</span>
            </label>
          )
        })}
      </div>
      <button
        className="rebuild-btn"
        onClick={onRebuild}
        disabled={loading || selected.length === 0}
      >
        {loading ? 'Building…' : 'Rebuild Graph'}
      </button>
    </div>
  )
}
