// mini-app/app/page.tsx
"use client";

import { useEffect, useState } from "react";
import { createClient }        from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── Types ────────────────────────────────────────────────────────────────────

interface Signal {
  id:         string;
  address:    string;
  name:       string;
  ticker:     string;
  strategy:   string;
  score:      number;
  narrative:  string;
  detected_at: string;
}

interface Trade {
  id:           string;
  pair_id:      string;
  strategy:     string;
  entry_price:  number;
  exit_price:   number | null;
  amount_usd:   number;
  status:       string;
  pnl_usd:      number | null;
  moonbag_active: boolean;
  opened_at:    string;
  closed_at:    string | null;
  pairs?:       { name: string; ticker: string; };
}

// ─── Tab types ────────────────────────────────────────────────────────────────

type Tab = "signals" | "positions" | "history" | "settings";

// ─── Main component ───────────────────────────────────────────────────────────

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("signals");
  const [signals,   setSignals]   = useState<Signal[]>([]);
  const [trades,    setTrades]    = useState<Trade[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    fetchData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [signalsRes, tradesRes] = await Promise.all([
        supabase.from("pairs").select("*").order("detected_at", { ascending: false }).limit(50),
        supabase.from("trades").select("*, pairs(name, ticker)").order("opened_at", { ascending: false }).limit(100),
      ]);
      if (signalsRes.data)  setSignals(signalsRes.data);
      if (tradesRes.data)   setTrades(tradesRes.data);
    } catch (err) {
      console.error("Fetch error:", err);
    }
    setLoading(false);
  }

  const openTrades   = trades.filter((t) => t.status === "open");
  const closedTrades = trades.filter((t) => t.status === "closed");
  const totalPnl     = closedTrades.reduce((sum, t) => sum + (t.pnl_usd ?? 0), 0);
  const wins         = closedTrades.filter((t) => (t.pnl_usd ?? 0) > 0).length;
  const winRate      = closedTrades.length > 0 ? ((wins / closedTrades.length) * 100).toFixed(0) : "0";

  return (
    <main style={{ fontFamily: "monospace", background: "#0a0a0a", minHeight: "100vh", color: "#fff", maxWidth: 480, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ padding: "16px", borderBottom: "1px solid #1a1a1a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: "bold", color: "#fff" }}>⚡ CATALYST APEX TRADER</div>
          <div style={{ fontSize: 11, color: "#666" }}>v2.1 — Live Dashboard</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, color: totalPnl >= 0 ? "#22c55e" : "#ef4444" }}>
            {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
          </div>
          <div style={{ fontSize: 11, color: "#666" }}>WR: {winRate}%</div>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ display: "flex", padding: "10px 16px", gap: 12, borderBottom: "1px solid #1a1a1a", fontSize: 11 }}>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ color: "#888" }}>SIGNALS</div>
          <div style={{ color: "#fff", fontWeight: "bold" }}>{signals.length}</div>
        </div>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ color: "#888" }}>OPEN</div>
          <div style={{ color: "#f59e0b", fontWeight: "bold" }}>{openTrades.length}</div>
        </div>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ color: "#888" }}>CLOSED</div>
          <div style={{ color: "#fff", fontWeight: "bold" }}>{closedTrades.length}</div>
        </div>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ color: "#888" }}>WINS</div>
          <div style={{ color: "#22c55e", fontWeight: "bold" }}>{wins}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #1a1a1a" }}>
        {(["signals", "positions", "history", "settings"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1, padding: "10px 0", fontSize: 11, fontFamily: "monospace",
              background: "none", border: "none", cursor: "pointer",
              color:       activeTab === tab ? "#fff" : "#555",
              borderBottom: activeTab === tab ? "2px solid #f59e0b" : "2px solid transparent",
              textTransform: "uppercase",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: "12px 16px", overflowY: "auto", maxHeight: "calc(100vh - 160px)" }}>
        {loading && <div style={{ color: "#555", textAlign: "center", paddingTop: 40 }}>Loading...</div>}

        {/* Signals tab */}
        {!loading && activeTab === "signals" && (
          <div>
            {signals.length === 0 && <div style={{ color: "#555", textAlign: "center", paddingTop: 40 }}>No signals yet</div>}
            {signals.map((s) => (
              <div key={s.id} style={{ borderBottom: "1px solid #1a1a1a", paddingBottom: 12, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <div>
                    <span style={{ color: "#fff", fontWeight: "bold", fontSize: 13 }}>{s.ticker}</span>
                    <span style={{ color: "#666", fontSize: 11, marginLeft: 6 }}>{s.name}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{
                      fontSize: 10, padding: "2px 6px", borderRadius: 4,
                      background: s.strategy === "outlier" ? "#7c3aed22" : "#0ea5e922",
                      color:      s.strategy === "outlier" ? "#a855f7"    : "#38bdf8",
                    }}>
                      {s.strategy?.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 12, color: s.score >= 70 ? "#22c55e" : s.score >= 55 ? "#f59e0b" : "#ef4444" }}>
                      {s.score}/100
                    </span>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
                  🌊 {s.narrative} &nbsp;·&nbsp; {new Date(s.detected_at).toLocaleTimeString()}
                </div>
                <div style={{ fontSize: 10, color: "#444", wordBreak: "break-all" }}>
                  <a href={`https://dexscreener.com/solana/${s.address}`} target="_blank" rel="noreferrer"
                     style={{ color: "#555", textDecoration: "none" }}>
                    {s.address.slice(0, 20)}...
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Positions tab */}
        {!loading && activeTab === "positions" && (
          <div>
            {openTrades.length === 0 && <div style={{ color: "#555", textAlign: "center", paddingTop: 40 }}>No open positions</div>}
            {openTrades.map((t) => (
              <div key={t.id} style={{ borderBottom: "1px solid #1a1a1a", paddingBottom: 12, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <div>
                    <span style={{ color: "#fff", fontWeight: "bold", fontSize: 13 }}>{t.pairs?.ticker ?? "?"}</span>
                    <span style={{ color: "#666", fontSize: 11, marginLeft: 6 }}>{t.pairs?.name ?? ""}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {t.moonbag_active && (
                      <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#f59e0b22", color: "#f59e0b" }}>MOONBAG</span>
                    )}
                    <span style={{ fontSize: 11, color: "#22c55e" }}>OPEN</span>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "#888" }}>
                  Entry: ${t.entry_price?.toFixed(8) ?? "?"} &nbsp;·&nbsp; Size: ${t.amount_usd} &nbsp;·&nbsp; {t.strategy?.toUpperCase()}
                </div>
                <div style={{ fontSize: 11, color: "#666" }}>
                  {new Date(t.opened_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* History tab */}
        {!loading && activeTab === "history" && (
          <div>
            {closedTrades.length === 0 && <div style={{ color: "#555", textAlign: "center", paddingTop: 40 }}>No closed trades yet</div>}
            {closedTrades.map((t) => {
              const pnl      = t.pnl_usd ?? 0;
              const pnlColor = pnl > 0 ? "#22c55e" : pnl < 0 ? "#ef4444" : "#888";
              return (
                <div key={t.id} style={{ borderBottom: "1px solid #1a1a1a", paddingBottom: 12, marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <div>
                      <span style={{ color: "#fff", fontWeight: "bold", fontSize: 13 }}>{t.pairs?.ticker ?? "?"}</span>
                      <span style={{ color: "#666", fontSize: 11, marginLeft: 6 }}>{t.strategy?.toUpperCase()}</span>
                    </div>
                    <span style={{ fontSize: 13, color: pnlColor, fontWeight: "bold" }}>
                      {pnl > 0 ? "+" : ""}${pnl.toFixed(2)}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#888" }}>
                    Entry: ${t.entry_price?.toFixed(8) ?? "?"} → Exit: ${t.exit_price?.toFixed(8) ?? "?"}
                  </div>
                  <div style={{ fontSize: 11, color: "#666" }}>
                    {new Date(t.closed_at ?? t.opened_at).toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Settings tab */}
        {!loading && activeTab === "settings" && (
          <div style={{ paddingTop: 8 }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>BOT STATUS</div>
              <div style={{ fontSize: 13, color: "#22c55e" }}>● Running on Railway</div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>QUICK LINKS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { label: "DexScreener",  url: "https://dexscreener.com" },
                  { label: "Rugcheck",     url: "https://rugcheck.xyz" },
                  { label: "Bubblemaps",   url: "https://app.bubblemaps.io" },
                  { label: "Solscan",      url: "https://solscan.io" },
                ].map((link) => (
                  <a
                    key={link.label}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "block", padding: "10px 12px", borderRadius: 8,
                      background: "#111", color: "#aaa", textDecoration: "none",
                      fontSize: 13, border: "1px solid #222",
                    }}
                  >
                    {link.label} →
                  </a>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>BUILD</div>
              <div style={{ fontSize: 11, color: "#444" }}>Catalyst Apex Trader v2.1</div>
              <div style={{ fontSize: 11, color: "#444" }}>Built by Catalyst × Claude</div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
