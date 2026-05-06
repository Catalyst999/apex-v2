"use strict";
// mini-app/app/page.tsx
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Home;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const supabase_js_1 = require("@supabase/supabase-js");
const supabase = (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
// ─── Main component ───────────────────────────────────────────────────────────
function Home() {
    const [activeTab, setActiveTab] = (0, react_1.useState)("signals");
    const [signals, setSignals] = (0, react_1.useState)([]);
    const [trades, setTrades] = (0, react_1.useState)([]);
    const [loading, setLoading] = (0, react_1.useState)(true);
    (0, react_1.useEffect)(() => {
        fetchData();
        // Refresh every 30 seconds
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, []);
    async function fetchData() {
        setLoading(true);
        try {
            const [signalsRes, tradesRes] = await Promise.all([
                supabase.from("pairs").select("*").order("detected_at", { ascending: false }).limit(50),
                supabase.from("trades").select("*, pairs(name, ticker)").order("opened_at", { ascending: false }).limit(100),
            ]);
            if (signalsRes.data)
                setSignals(signalsRes.data);
            if (tradesRes.data)
                setTrades(tradesRes.data);
        }
        catch (err) {
            console.error("Fetch error:", err);
        }
        setLoading(false);
    }
    const openTrades = trades.filter((t) => t.status === "open");
    const closedTrades = trades.filter((t) => t.status === "closed");
    const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl_usd ?? 0), 0);
    const wins = closedTrades.filter((t) => (t.pnl_usd ?? 0) > 0).length;
    const winRate = closedTrades.length > 0 ? ((wins / closedTrades.length) * 100).toFixed(0) : "0";
    return ((0, jsx_runtime_1.jsxs)("main", { style: { fontFamily: "monospace", background: "#0a0a0a", minHeight: "100vh", color: "#fff", maxWidth: 480, margin: "0 auto" }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { padding: "16px", borderBottom: "1px solid #1a1a1a", display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("div", { style: { fontSize: 14, fontWeight: "bold", color: "#fff" }, children: "\u26A1 CATALYST APEX TRADER" }), (0, jsx_runtime_1.jsx)("div", { style: { fontSize: 11, color: "#666" }, children: "v2.1 \u2014 Live Dashboard" })] }), (0, jsx_runtime_1.jsxs)("div", { style: { textAlign: "right" }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { fontSize: 13, color: totalPnl >= 0 ? "#22c55e" : "#ef4444" }, children: [totalPnl >= 0 ? "+" : "", "$", totalPnl.toFixed(2)] }), (0, jsx_runtime_1.jsxs)("div", { style: { fontSize: 11, color: "#666" }, children: ["WR: ", winRate, "%"] })] })] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: "flex", padding: "10px 16px", gap: 12, borderBottom: "1px solid #1a1a1a", fontSize: 11 }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { flex: 1, textAlign: "center" }, children: [(0, jsx_runtime_1.jsx)("div", { style: { color: "#888" }, children: "SIGNALS" }), (0, jsx_runtime_1.jsx)("div", { style: { color: "#fff", fontWeight: "bold" }, children: signals.length })] }), (0, jsx_runtime_1.jsxs)("div", { style: { flex: 1, textAlign: "center" }, children: [(0, jsx_runtime_1.jsx)("div", { style: { color: "#888" }, children: "OPEN" }), (0, jsx_runtime_1.jsx)("div", { style: { color: "#f59e0b", fontWeight: "bold" }, children: openTrades.length })] }), (0, jsx_runtime_1.jsxs)("div", { style: { flex: 1, textAlign: "center" }, children: [(0, jsx_runtime_1.jsx)("div", { style: { color: "#888" }, children: "CLOSED" }), (0, jsx_runtime_1.jsx)("div", { style: { color: "#fff", fontWeight: "bold" }, children: closedTrades.length })] }), (0, jsx_runtime_1.jsxs)("div", { style: { flex: 1, textAlign: "center" }, children: [(0, jsx_runtime_1.jsx)("div", { style: { color: "#888" }, children: "WINS" }), (0, jsx_runtime_1.jsx)("div", { style: { color: "#22c55e", fontWeight: "bold" }, children: wins })] })] }), (0, jsx_runtime_1.jsx)("div", { style: { display: "flex", borderBottom: "1px solid #1a1a1a" }, children: ["signals", "positions", "history", "settings"].map((tab) => ((0, jsx_runtime_1.jsx)("button", { onClick: () => setActiveTab(tab), style: {
                        flex: 1, padding: "10px 0", fontSize: 11, fontFamily: "monospace",
                        background: "none", border: "none", cursor: "pointer",
                        color: activeTab === tab ? "#fff" : "#555",
                        borderBottom: activeTab === tab ? "2px solid #f59e0b" : "2px solid transparent",
                        textTransform: "uppercase",
                    }, children: tab }, tab))) }), (0, jsx_runtime_1.jsxs)("div", { style: { padding: "12px 16px", overflowY: "auto", maxHeight: "calc(100vh - 160px)" }, children: [loading && (0, jsx_runtime_1.jsx)("div", { style: { color: "#555", textAlign: "center", paddingTop: 40 }, children: "Loading..." }), !loading && activeTab === "signals" && ((0, jsx_runtime_1.jsxs)("div", { children: [signals.length === 0 && (0, jsx_runtime_1.jsx)("div", { style: { color: "#555", textAlign: "center", paddingTop: 40 }, children: "No signals yet" }), signals.map((s) => ((0, jsx_runtime_1.jsxs)("div", { style: { borderBottom: "1px solid #1a1a1a", paddingBottom: 12, marginBottom: 12 }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 4 }, children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("span", { style: { color: "#fff", fontWeight: "bold", fontSize: 13 }, children: s.ticker }), (0, jsx_runtime_1.jsx)("span", { style: { color: "#666", fontSize: 11, marginLeft: 6 }, children: s.name })] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: "flex", gap: 6, alignItems: "center" }, children: [(0, jsx_runtime_1.jsx)("span", { style: {
                                                            fontSize: 10, padding: "2px 6px", borderRadius: 4,
                                                            background: s.strategy === "outlier" ? "#7c3aed22" : "#0ea5e922",
                                                            color: s.strategy === "outlier" ? "#a855f7" : "#38bdf8",
                                                        }, children: s.strategy?.toUpperCase() }), (0, jsx_runtime_1.jsxs)("span", { style: { fontSize: 12, color: s.score >= 70 ? "#22c55e" : s.score >= 55 ? "#f59e0b" : "#ef4444" }, children: [s.score, "/100"] })] })] }), (0, jsx_runtime_1.jsxs)("div", { style: { fontSize: 11, color: "#888", marginBottom: 4 }, children: ["\uD83C\uDF0A ", s.narrative, " \u00A0\u00B7\u00A0 ", new Date(s.detected_at).toLocaleTimeString()] }), (0, jsx_runtime_1.jsx)("div", { style: { fontSize: 10, color: "#444", wordBreak: "break-all" }, children: (0, jsx_runtime_1.jsxs)("a", { href: `https://dexscreener.com/solana/${s.address}`, target: "_blank", rel: "noreferrer", style: { color: "#555", textDecoration: "none" }, children: [s.address.slice(0, 20), "..."] }) })] }, s.id)))] })), !loading && activeTab === "positions" && ((0, jsx_runtime_1.jsxs)("div", { children: [openTrades.length === 0 && (0, jsx_runtime_1.jsx)("div", { style: { color: "#555", textAlign: "center", paddingTop: 40 }, children: "No open positions" }), openTrades.map((t) => ((0, jsx_runtime_1.jsxs)("div", { style: { borderBottom: "1px solid #1a1a1a", paddingBottom: 12, marginBottom: 12 }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 4 }, children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("span", { style: { color: "#fff", fontWeight: "bold", fontSize: 13 }, children: t.pairs?.ticker ?? "?" }), (0, jsx_runtime_1.jsx)("span", { style: { color: "#666", fontSize: 11, marginLeft: 6 }, children: t.pairs?.name ?? "" })] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: "flex", gap: 6, alignItems: "center" }, children: [t.moonbag_active && ((0, jsx_runtime_1.jsx)("span", { style: { fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#f59e0b22", color: "#f59e0b" }, children: "MOONBAG" })), (0, jsx_runtime_1.jsx)("span", { style: { fontSize: 11, color: "#22c55e" }, children: "OPEN" })] })] }), (0, jsx_runtime_1.jsxs)("div", { style: { fontSize: 11, color: "#888" }, children: ["Entry: $", t.entry_price?.toFixed(8) ?? "?", " \u00A0\u00B7\u00A0 Size: $", t.amount_usd, " \u00A0\u00B7\u00A0 ", t.strategy?.toUpperCase()] }), (0, jsx_runtime_1.jsx)("div", { style: { fontSize: 11, color: "#666" }, children: new Date(t.opened_at).toLocaleString() })] }, t.id)))] })), !loading && activeTab === "history" && ((0, jsx_runtime_1.jsxs)("div", { children: [closedTrades.length === 0 && (0, jsx_runtime_1.jsx)("div", { style: { color: "#555", textAlign: "center", paddingTop: 40 }, children: "No closed trades yet" }), closedTrades.map((t) => {
                                const pnl = t.pnl_usd ?? 0;
                                const pnlColor = pnl > 0 ? "#22c55e" : pnl < 0 ? "#ef4444" : "#888";
                                return ((0, jsx_runtime_1.jsxs)("div", { style: { borderBottom: "1px solid #1a1a1a", paddingBottom: 12, marginBottom: 12 }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 4 }, children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("span", { style: { color: "#fff", fontWeight: "bold", fontSize: 13 }, children: t.pairs?.ticker ?? "?" }), (0, jsx_runtime_1.jsx)("span", { style: { color: "#666", fontSize: 11, marginLeft: 6 }, children: t.strategy?.toUpperCase() })] }), (0, jsx_runtime_1.jsxs)("span", { style: { fontSize: 13, color: pnlColor, fontWeight: "bold" }, children: [pnl > 0 ? "+" : "", "$", pnl.toFixed(2)] })] }), (0, jsx_runtime_1.jsxs)("div", { style: { fontSize: 11, color: "#888" }, children: ["Entry: $", t.entry_price?.toFixed(8) ?? "?", " \u2192 Exit: $", t.exit_price?.toFixed(8) ?? "?"] }), (0, jsx_runtime_1.jsx)("div", { style: { fontSize: 11, color: "#666" }, children: new Date(t.closed_at ?? t.opened_at).toLocaleString() })] }, t.id));
                            })] })), !loading && activeTab === "settings" && ((0, jsx_runtime_1.jsxs)("div", { style: { paddingTop: 8 }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { marginBottom: 20 }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontSize: 12, color: "#888", marginBottom: 8 }, children: "BOT STATUS" }), (0, jsx_runtime_1.jsx)("div", { style: { fontSize: 13, color: "#22c55e" }, children: "\u25CF Running on Railway" })] }), (0, jsx_runtime_1.jsxs)("div", { style: { marginBottom: 20 }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontSize: 12, color: "#888", marginBottom: 8 }, children: "QUICK LINKS" }), (0, jsx_runtime_1.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [
                                            { label: "DexScreener", url: "https://dexscreener.com" },
                                            { label: "Rugcheck", url: "https://rugcheck.xyz" },
                                            { label: "Bubblemaps", url: "https://app.bubblemaps.io" },
                                            { label: "Solscan", url: "https://solscan.io" },
                                        ].map((link) => ((0, jsx_runtime_1.jsxs)("a", { href: link.url, target: "_blank", rel: "noreferrer", style: {
                                                display: "block", padding: "10px 12px", borderRadius: 8,
                                                background: "#111", color: "#aaa", textDecoration: "none",
                                                fontSize: 13, border: "1px solid #222",
                                            }, children: [link.label, " \u2192"] }, link.label))) })] }), (0, jsx_runtime_1.jsxs)("div", { style: { marginBottom: 20 }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontSize: 12, color: "#888", marginBottom: 8 }, children: "BUILD" }), (0, jsx_runtime_1.jsx)("div", { style: { fontSize: 11, color: "#444" }, children: "Catalyst Apex Trader v2.1" }), (0, jsx_runtime_1.jsx)("div", { style: { fontSize: 11, color: "#444" }, children: "Built by Catalyst \u00D7 Claude" })] })] }))] })] }));
}
