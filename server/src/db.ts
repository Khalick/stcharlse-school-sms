import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required to connect to Supabase PostgreSQL!');
}

// Initialize postgres client targeting Supabase
export const sql = postgres(connectionString, {
  ssl: 'require',
  max: 10
});

// Compatibility helper & schema migration runner
export async function initDb(): Promise<void> {
  try {
    console.log('🔗 Connected to Supabase PostgreSQL database.');
    // Add approved column if it doesn't exist
    await sql`ALTER TABLE teachers ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT FALSE`;
    console.log('✅ Database schema verified and updated.');
  } catch (error) {
    console.error('❌ Error executing database migrations:', error);
  }
}

