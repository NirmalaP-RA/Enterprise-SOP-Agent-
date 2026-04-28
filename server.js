const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
require('dotenv').config();

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { MongoClient } = require('mongodb');

// LangChain & Google AI Imports
const { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const { MongoDBAtlasVectorSearch } = require("@langchain/mongodb");
const { PDFLoader } = require("@langchain/community/document_loaders/fs/pdf");

const app = express();
app.use(express.json());

// Configure Multer for PDF storage
const upload = multer({ dest: 'uploads/' });

// Database Configuration
const client = new MongoClient(process.env.MONGODB_ATLAS_URI, {
    tls: true,
    tlsAllowInvalidCertificates: true,
    connectTimeoutMS: 5000,
    family: 4 
});

const dbName = process.env.DB_NAME || "OpsMindAI";
const collectionName = process.env.COLLECTION_NAME || "sop-agent";

// AI Engine Setup
const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GOOGLE_GENAI_API_KEY,
    model: "gemini-embedding-001", // Fixed: Use 'model' key for stability
});

const model = new ChatGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENAI_API_KEY,
    modelName: "gemini-2.5-flash", // Use the 1.5 stable name
    // apiVersion: "v1beta",           // Back to v1beta for better model compatibility
    maxOutputTokens: 2048,
    streaming: true,
});

/**
 * UPLOAD ROUTE: /api/uploads
 * Processes PDF -> Chunks -> Embeddings -> MongoDB Atlas
 */
app.post('/api/uploads', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });

        console.log(`--- Starting Upload: ${req.file.originalname} ---`);

        // 1. Load and Split PDF
        const loader = new PDFLoader(req.file.path);
        const docs = await loader.load();
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 100,
        });
        const chunks = await splitter.splitDocuments(docs);

        // 2. Manual Embedding Generation (The Fix)
        console.log(`Generating embeddings for ${chunks.length} chunks...`);
        
        const docsWithEmbeddings = [];
        
        for (const chunk of chunks) {
            // We call the embedding API directly for each chunk to verify data
            const vector = await embeddings.embedQuery(chunk.pageContent);
            
            if (!vector || vector.length === 0) {
                throw new Error("CRITICAL: Google returned an empty array. Check API Key/Model.");
            }
            
            docsWithEmbeddings.push({
                text: chunk.pageContent,
                embedding: vector, // This ensures the 'embedding' field is populated with numbers
                metadata: {
                    ...chunk.metadata,
                    source: req.file.originalname,
                    createdAt: new Date()
                }
            });
        }

        // 3. Save to MongoDB
        const collection = client.db(dbName).collection(collectionName);
        
        // Optional: Clear old data if you want a fresh start
        // await collection.deleteMany({}); 

        await collection.insertMany(docsWithEmbeddings);

        // Cleanup temp file
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

        console.log("--- Upload Success: Vectors stored in Atlas ---");
        res.status(200).json({ message: "Success! 768-dimension vectors stored." });

    } catch (error) {
        console.error("UPLOAD ERROR DETAILS:", error.message);
        res.status(500).json({ error: "Failed to process PDF", details: error.message });
    }
});

/**
 * QUERY ROUTE: /api/ask
 * Handles RAG retrieval and streaming response
 */
app.post('/api/ask', async (req, res) => {
    const { query } = req.body;
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        const collection = client.db(dbName).collection(collectionName);
        const vectorStore = new MongoDBAtlasVectorSearch(embeddings, { 
            collection, 
            indexName: "vector_index" 
        });

        // Similarity search
        const retrievedDocs = await vectorStore.similaritySearch(query, 4);

        const context = retrievedDocs.map(d => {
            const sourceName = d.metadata.source || "SOP Document";
            const pageNum = d.metadata.loc?.pageNumber || "Unknown";
            return `[FILE: ${sourceName}, PAGE: ${pageNum}] CONTENT: ${d.pageContent}`;
        }).join("\n\n");

        // const systemPrompt = `
        //     You are OpsMind AI, a corporate knowledge agent. 
        //     Use the provided SOP context to answer the user's question.
        //     Only use the provided context. If unsure, say "I don't know."
        //     CONTEXT:
        //     ${context}
        // `;
        const combinedPrompt = `
        INSTRUCTIONS: You are OpsMind AI, a corporate knowledge agent. 
        Use the provided SOP context to answer the user's question.
        Only use the provided context. If unsure, say "I don't know."

        CONTEXT:
        ${context}

        USER QUESTION: 
        ${query}
    `;

        const stream = await model.stream([
            // ["system", systemPrompt],
            // ["human", query],
            ["human", combinedPrompt]
        ]);

        for await (const chunk of stream) {
            res.write(`data: ${JSON.stringify({ text: chunk.content })}\n\n`);
        }

        res.write('data: [DONE]\n\n');
        res.end();
    } catch (err) {
        console.error("ASK ERROR:", err);
        res.write(`data: ${JSON.stringify({ error: "Processing failed." })}\n\n`);
        res.end();
    }
});

// Database connection and Server Start
client.connect().then(() => {
    const port = process.env.PORT || 5001; // Matches your frontend fetch port
    app.listen(port, () => {
        console.log(`Server running on port ${port}`);
        console.log(`Connected to MongoDB: ${dbName}`);
    });
}).catch(err => {
    console.error("Failed to connect to MongoDB", err);
});