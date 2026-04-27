// const dbName = process.env.DB_NAME; // "OpsMindAI"
// const collectionName = process.env.COLLECTION_NAME; // "sop-agent"

// // Access the database and collection
// const db = client.db(dbName);
// const collection = db.collection(collectionName);

// // Initialize Vector Search [cite: 36, 57]
// const vectorStore = new MongoDBAtlasVectorSearch(embeddings, {
//   collection: collection,
//   indexName: "vector_index", // Ensure this matches the name in Atlas UI
// });