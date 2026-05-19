import { signalIngestionHub } from '../src/services/ingestion/signal-ingestion-hub';

async function run() {
  const nowSec = Math.floor(Date.now() / 1000);

  const fakePair: any = {
    chainId: 'solana',
    pairAddress: 'FAKE_PAIR_123',
    baseToken: { address: 'FAKE_MINT_123', name: 'FakeLore', symbol: 'FLRE' },
    quoteToken: { symbol: 'USDC' },
    priceUsd: '0.01',
    fdv: 5000,
    marketCap: 8000,
    priceChange: { m5: 0, h1: 0, h6: 0, h24: 2 },
    txns: { m5: { buys: 10, sells: 2 }, h1: { buys: 20, sells: 5 }, h6: { buys: 0, sells: 0 }, h24: { buys: 0, sells: 0 } },
    volume: { m5: 1200, h1: 3000, h24: 5000 },
    liquidity: { usd: 5000 },
    pairCreatedAt: nowSec - 60, // created 1 minute ago
    deployer: 'FAKE_DEPLOYER',
    holders: { count: 12, topPercent: 0.05 }
  };

  const lowcapPlay = {
    pair: fakePair,
    lore: {
      score: 70,
      tier: 1,
      hasStrongLore: true,
      narrativeName: 'meme-strong',
      loreFactors: ['short name', 'meme'],
      skipBundleCheck: false,
      suggestedSize: 'micro'
    },
    isPreBonding: true,
    ageMinutes: 1,
    mcap: fakePair.marketCap,
    reason: 'Test lowcap lore play',
    confidence: 78
  };

  console.log('→ Sending test lowcap-lore play to ingestion hub');
  await signalIngestionHub.ingestSignal(lowcapPlay, 'lowcap-lore');
  console.log('→ Test ingest complete');
}

run().catch((e) => { console.error('Test ingest failed', e); process.exit(1); });
