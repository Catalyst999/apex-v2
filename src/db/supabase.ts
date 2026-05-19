const { createClient } = require('@supabase/supabase-js');
const { SUPABASE } = require('../core/config');

const supabaseKey = SUPABASE.SERVICE_KEY;
const usingDeprecatedKey = !!process.env.SUPABASE_API_KEY && !process.env.SUPABASE_SERVICE_KEY;

if (!supabaseKey) {
  throw new Error('SUPABASE_SERVICE_KEY is required. Set SUPABASE_SERVICE_KEY for backend Supabase access.');
}

console.warn('[Supabase] URL=', SUPABASE.URL);
console.warn('[Supabase] Using SERVICE_KEY for backend Supabase access');
if (usingDeprecatedKey) {
  console.warn('[Supabase] Warning: SUPABASE_API_KEY is deprecated and being used as a fallback for SUPABASE_SERVICE_KEY.');
}
console.warn('[Supabase] Key preview=', supabaseKey.slice(0, 10) + '...');

export const supabase = createClient(SUPABASE.URL, supabaseKey);