import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL || '';

// Initialize postgres client targeting Supabase safely
export const sql = connectionString 
  ? postgres(connectionString, {
      ssl: 'require',
      max: 10
    })
  : (() => {
      console.warn('⚠️ WARNING: DATABASE_URL is not set. Database queries will fail!');
      return (() => {
        throw new Error('DATABASE_URL environment variable is not defined!');
      }) as any;
    })();

// Compatibility helper & schema migration runner
export async function initDb(): Promise<void> {
  if (!connectionString) {
    console.error('❌ Error: DATABASE_URL is not defined. Skipping database migration.');
    return;
  }
  try {
    console.log('🔗 Connected to Supabase PostgreSQL database.');
    // Add approved column if it doesn't exist
    await sql`ALTER TABLE teachers ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT FALSE`;
    console.log('✅ Database schema verified and updated.');
  } catch (error) {
    console.error('❌ Error executing database migrations:', error);
  }
}
