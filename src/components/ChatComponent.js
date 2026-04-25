
import React, { useState, useEffect, useRef } from 'react';

/**
 * Project 1: OpsMind AI - Frontend Orchestrator
 * Features: SSE Streaming, Auto-Scroll, Source Citation Rendering
 */
function ChatComponent() {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef(null);

  // Auto-scroll to bottom as messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleAsk = async () => {
    if (!query.trim()) return;
    setIsTyping(true);

    const userMsg = { role: 'user', text: query };
    setMessages(prev => [...prev, userMsg, { role: 'assistant', text: "" }]);

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ') && !line.includes('[DONE]')) {
            try {
              const data = JSON.parse(line.substring(6));
              aiText += data.text;
              
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { 
                  role: 'assistant', 
                  text: aiText 
                };
                return updated;
              });
            } catch (e) {
              console.error("Stream parse error:", e);
            }
          }
        }
      }
    } catch (error) {
      console.error("Streaming error:", error);
    } finally {
      setIsTyping(false);
      setQuery("");
    }
  };

  return (
    <div className="opsmind-container" style={{ maxWidth: '700px', margin: '20px auto', fontFamily: 'sans-serif' }}>
      <header style={{ borderBottom: '2px solid #007bff', marginBottom: '20px' }}>
        <h2>OpsMind AI <span style={{ fontSize: '0.5em', color: '#666' }}>Corporate SOP Agent</span></h2>
      </header>

      <div 
        ref={scrollRef}
        className="messages-window" 
        style={{ height: '400px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '8px', padding: '15px', backgroundColor: '#f9f9f9' }}
      >
        {messages.length === 0 && <p style={{ color: '#999', textAlign: 'center' }}>Ask a question about the SOP documents...</p>}
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: '15px', textAlign: m.role === 'user' ? 'right' : 'left' }}>
            <div style={{ 
              display: 'inline-block', 
              padding: '10px 15px', 
              borderRadius: '15px', 
              backgroundColor: m.role === 'user' ? '#007bff' : '#fff',
              color: m.role === 'user' ? '#fff' : '#333',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              maxWidth: '80% '
            }}>
              <strong>{m.role === 'user' ? 'You' : 'OpsMind'}:</strong> 
              <p style={{ margin: '5px 0 0' }}>{m.text}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="input-area" style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
        <input 
          style={{ flexGrow: 1, padding: '12px', borderRadius: '5px', border: '1px solid #ccc' }}
          value={query} 
          onChange={(e) => setQuery(e.target.value)} 
          onKeyPress={(e) => e.key === 'Enter' && handleAsk()}
          placeholder="Type your policy question..." 
          disabled={isTyping}
        />
        <button 
          onClick={handleAsk} 
          disabled={isTyping}
          style={{ padding: '10px 20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
        >
          {isTyping ? "..." : "Ask Agent"}
        </button>
      </div>
    </div>
  );
}

export default ChatComponent;




