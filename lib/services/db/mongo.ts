import { MongoClient } from 'mongodb'

let client: MongoClient | null = null
let db: any = null
let connectPromise: Promise<any> | null = null

/**
 * Singleton MongoDB connection with retry support
 */
export async function connectToMongo() {
  if (db) return db

  if (!connectPromise) {
    connectPromise = (async () => {
      const url = process.env.MONGO_URL
      const dbName = process.env.DB_NAME
      
      if (!url) throw new Error('MONGO_URL not set')
      if (!dbName) throw new Error('DB_NAME not set')

      console.log('Connecting to MongoDB...')
      client = new MongoClient(url, { serverSelectionTimeoutMS: 10000 })
      await client.connect()
      db = client.db(dbName)
      console.log('MongoDB connected')
      return db
    })().catch((err) => {
      // Reset so future calls can retry
      connectPromise = null
      client = null
      throw err
    })
  }

  return connectPromise
}

/**
 * Close MongoDB connection
 */
export async function closeMongoConnection() {
  if (client) {
    await client.close()
    client = null
    db = null
    connectPromise = null
  }
}

/**
 * Get database instance
 */
export function getDb() {
  if (!db) {
    throw new Error('Database not connected. Call connectToMongo first.')
  }
  return db
}
