
import React, { useState, useEffect, useRef } from 'react';

function ChatComponent() {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isUploading, setIsUploading] = useState(false); // New state for uploads
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // --- NEW: File Upload Logic ---
  const handleFileUpload = async (file) => {
    if (!file) return;
    setIsUploading(true);
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/uploads', {
        method: 'POST',
        body: formData,
      });
      if (response.ok) {
        alert("✅ SOP Document uploaded and indexed successfully!");
      } else {
        alert("❌ Upload failed. Check backend logs.");
      }
    } catch (error) {
      console.error("Upload error:", error);
    } finally {
      setIsUploading(false);
    }
  };

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
      let accumulatedText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ') && !line.includes('[DONE]')) {
            try {
              const data = JSON.parse(line.substring(6));
              accumulatedText += data.text;
              const currentBatch = accumulatedText; 

              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { 
                  role: 'assistant', 
                  text: currentBatch 
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
      <header style={{ borderBottom: '2px solid #007bff', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>OpsMind AI <span style={{ fontSize: '0.5em', color: '#666' }}>SOP Agent</span></h2>
        
        {/* --- NEW: Upload Button --- */}
        <div style={{ fontSize: '0.8em' }}>
          <label style={{ 
            cursor: 'pointer', 
            backgroundColor: '#28a745', 
            color: 'white', 
            padding: '5px 10px', 
            borderRadius: '4px' 
          }}>
            {isUploading ? "Uploading..." : "Upload SOP PDF"}
            <input 
              type="file" 
              accept=".pdf" 
              hidden 
              onChange={(e) => handleFileUpload(e.target.files[0])}
              disabled={isUploading}
            />
          </label>
        </div>
      </header>

      <div 
        ref={scrollRef}
        className="messages-window" 
        style={{ height: '400px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '8px', padding: '15px', backgroundColor: '#f9f9f9' }}
      >
        {messages.length === 0 && <p style={{ color: '#999', textAlign: 'center' }}>Upload a PDF and ask a question...</p>}
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
              <p style={{ margin: '5px 0 0', whiteSpace: 'pre-wrap' }}>{m.text}</p>
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

