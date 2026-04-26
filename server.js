const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { MongoClient } = require('mongodb');
const { MongoDBAtlasVectorSearch } = require("@langchain/mongodb");
const { GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { PDFLoader } = require("@langchain/community/document_loaders/fs/pdf");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");

const app = express();
app.use(express.json());

// Configure Multer for PDF storage [cite: 62]
const upload = multer({ dest: 'uploads/' });

// Database Configuration [cite: 17, 36]
const client = new MongoClient(process.env.MONGODB_ATLAS_URI,{
 tls: true,
  tlsAllowInvalidCertificates: true, // Overrides the SSL Alert 80
  connectTimeoutMS: 5000,
  family: 4 // Forces IPv4
  
});
const dbName = process.env.DB_NAME || "OpsMindAI";
const collectionName = process.env.COLLECTION_NAME || "sop-agent";

// AI Engine Setup: Gemini 1.5 Flash [cite: 21, 33]
const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: process.env.GOOGLE_GENAI_API_KEY,
  model: "embedding-001",
});

const model = new ChatGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENAI_API_KEY,
  model: "gemini-1.5-flash",
  streaming: true,
});

/**
 * WEEK 1: Knowledge Ingestion
 * Parses PDF, chunks text (1000 chars/100 overlap), and stores in Atlas [cite: 62]
 */
app.post('/api/ingest', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const loader = new PDFLoader(req.file.path);
    const docs = await loader.load();

    // Mandatory chunking strategy [cite: 62]
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 100,
    });

    const splitDocs = await splitter.splitDocuments(docs);
    const collection = client.db(dbName).collection(collectionName);

    // Store in MongoDB Atlas Vector Search [cite: 36, 62]
    await MongoDBAtlasVectorSearch.fromDocuments(splitDocs, embeddings, {
      collection,
      indexName: "vector_index", 
    });

    // Cleanup uploaded file
    fs.unlinkSync(req.file.path);

    res.status(200).json({ message: "Knowledge base updated successfully." });
  } catch (err) {
    console.error("Ingestion Error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * WEEK 3 & 4: Retrieval & Streaming Engine
 * Retrieves top 3-5 relevant chunks and streams response via SSE [cite: 40, 57]
 */
app.post('/api/ask', async (req, res) => {
  const { query } = req.body;
  
  // Set headers for Server-Sent Events (SSE) [cite: 40]
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const collection = client.db(dbName).collection(collectionName);
    const vectorStore = new MongoDBAtlasVectorSearch(embeddings, { collection, indexName: "vector_index" });

    // Retrieve top relevant chunks [cite: 57]
    const retrievedDocs = await vectorStore.similaritySearch(query, 4);

    // Format context with metadata for precise Source Citation 
    const context = retrievedDocs.map(d => {
      const sourceName = d.metadata.source || "SOP Document";
      const pageNum = d.metadata.loc?.pageNumber || "Unknown";
      return `[FILE: ${sourceName}, PAGE: ${pageNum}] CONTENT: ${d.pageContent}`;
    }).join("\n\n");

    // Strict System Prompt to prevent Hallucinations [cite: 55, 66]
    const systemPrompt = `
      You are OpsMind AI, a corporate knowledge agent. 
      Use the provided SOP context to answer the user's question.
      
      RULES:
      1. Use ONLY the provided context.
      2. If the answer is not in the context, explicitly state: "I don't know." 
      3. For every claim, cite the File and Page number from the context.
      
      CONTEXT:
      ${context}
    `;

    const stream = await model.stream([
      ["system", systemPrompt],
      ["human", query]
    ]);

    // Stream tokens to frontend for the mandatory "Typing Effect" [cite: 41]
    for await (const chunk of stream) {
      res.write(`data: ${JSON.stringify({ text: chunk.content })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error("Stream Error:", err);
    res.write(`data: ${JSON.stringify({ error: "Intelligence processing failed." })}\n\n`);
    res.end();
  }
});

// Start Orchestrator
client.connect().then(() => {
  const port = process.env.PORT || 5000;
  app.listen(port, () => {
    console.log(`Zaalima AI Orchestrator running on port ${port}`);
    console.log(`Connected to MongoDB: ${dbName}`);
  });
});



