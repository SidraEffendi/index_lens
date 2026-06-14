import { useState, useRef, useEffect } from 'react'

export default function ChatPanel({ history, onSend, loading, disabled }) {
  const [input, setInput] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, loading])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!input.trim() || loading || disabled) return
    onSend(input.trim())
    setInput('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) handleSubmit(e)
  }

  return (
    <div className="chat-container">
      <div className="messages">
        {history.length === 0 && (
          <div className="chat-empty">
            {disabled
              ? 'Waiting for graph to be ready…'
              : 'Ask questions about your data — e.g. "Which nodes are most connected?" or "Find all records related to [value]"'}
          </div>
        )}
        {history.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <div className="message-content">{msg.content}</div>
          </div>
        ))}
        {loading && (
          <div className="message assistant">
            <div className="message-content typing">Thinking…</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="chat-form">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Build the graph first…' : 'Ask about your data…'}
          disabled={disabled || loading}
        />
        <button type="submit" disabled={disabled || loading || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}
