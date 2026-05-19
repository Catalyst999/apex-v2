const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseServiceKey) {
  throw new Error('SUPABASE_SERVICE_KEY is required. Set SUPABASE_SERVICE_KEY for backend Supabase access.');
}

console.warn('[Supabase] Using SERVICE_KEY in src/core/db/supabase.ts');

export const supabase = createClient(supabaseUrl, supabaseServiceKey);