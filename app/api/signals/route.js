"use strict";
// mini-app/app/api/signals/route.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const supabase_js_1 = require("@supabase/supabase-js");
const server_1 = require("next/server");
const supabase = (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function GET() {
    try {
        const { data, error } = await supabase
            .from("pairs")
            .select("*")
            .order("detected_at", { ascending: false })
            .limit(50);
        if (error)
            throw error;
        return server_1.NextResponse.json({ signals: data ?? [] });
    }
    catch (err) {
        return server_1.NextResponse.json({ error: err.message }, { status: 500 });
    }
}
