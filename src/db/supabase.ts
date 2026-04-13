import { createClient } from "@supabase/supabase-js";
import { SUPABASE } from "../core/config";

export const supabase = createClient(SUPABASE.url, SUPABASE.anonKey);