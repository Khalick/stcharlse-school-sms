import fs from 'fs';
import path from 'path';
import postgres from 'postgres';

// Load .env file dynamically if it exists
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envLines = fs.readFileSync(envPath, 'utf-8').split('\n');
    envLines.forEach(line => {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        if (key && !key.startsWith('#')) {
          process.env[key] = value.replace(/^['"]|['"]$/g, '');
        }
      }
    });
  }
} catch (e) {
  console.warn('Failed to load .env file:', e);
}

// Sanitize the connection string by removing quotes, spaces, and carriage returns
const connectionString = (process.env.DATABASE_URL || '')
  .trim()
  .replace(/^['"]|['"]$/g, '');

if (connectionString) {
  try {
    // Basic verification and safe logging of the hostname (without password)
    const sanitizedUri = connectionString.includes('@') 
      ? connectionString 
      : 'postgresql://' + connectionString;
    const parsed = new URL(sanitizedUri);
    console.log(`📡 Database target: host="${parsed.hostname}" port=${parsed.port || '5432'} path="${parsed.pathname}"`);
  } catch (err) {
    console.warn('⚠️ Unable to parse DATABASE_URL structure:', err);
  }
}

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
