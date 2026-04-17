// src/server.ts

import express, { Request, Response } from "express";
import { SERVER, HELIUS } from "./core/config";

const app = express();

app.use(express.json());

// Helius webhook endpoint
app.post("/webhook/helius", (req: Request, res: Response) => {
  const secret = req.headers["authorization"];
  if (secret !== HELIUS.webhookSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Handle Helius webhook
  console.log("📡 Helius webhook received:", req.body);

  // Process the webhook data (e.g., new transactions)
  // You can integrate with your scanner or execution logic here

  res.json({ status: "ok" });
});

// Health check
app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Mini app endpoint (placeholder)
app.get("/mini-app", (req: Request, res: Response) => {
  res.json({ message: "CATALYST APEX TRADER Mini App" });
});

export function startServer(): void {
  app.listen(SERVER.webhookPort, () => {
    console.log(`🌐 Webhook server listening on port ${SERVER.webhookPort}`);
  });
}