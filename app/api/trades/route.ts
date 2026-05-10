// mini-app/app/api/trades/route.ts

import { createClient } from "@supabase/supabase-js";
import { NextResponse }  from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("trades")
      .select("*, pairs(name, ticker)")
      .order("opened_at", { ascending: false })
      .limit(100);

    if (error) throw error;
    return NextResponse.json({ trades: data ?? [] });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}