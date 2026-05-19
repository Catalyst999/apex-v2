import { signalIngestionHub } from '../src/services/ingestion/signal-ingestion-hub';

async function runBatch(count: number) {
  const nowSec = Math.floor(Date.now() / 1000);

  for (let i = 0; i < count; i++) {
    const sources = ['dexscreener','pumpfun','lowcap-lore','fake-volume','onchain','monitor'];
    const source = sources[i % sources.length] as any;

    // Build a payload matching the expected shape per source
    let payload: any = null;

    if (source === 'dexscreener') {
      payload = {
        chainId: 'solana',
        pairAddress: `FAKE_PAIR_${i}`,
        baseToken: { address: `FAKE_MINT_${i}`, name: `FakeToken${i}`, symbol: `FT${i}` },
        quoteToken: { symbol: 'USDC' },
        priceUsd: '0.01',
        fdv: 5000,
        marketCap: 8000 + i,
        priceChange: { m5: 0, h1: 0, h6: 0, h24: 2 },
        txns: { m5: { buys: 5 + (i%10), sells: 1 }, h1: { buys: 10, sells: 2 } },
        volume: { m5: 500 + (i%200), h1: 1200 + (i%500), h24: 3000 + (i%1000) },
        liquidity: { usd: 5000 + (i%500) },
        pairCreatedAt: nowSec - 60,
        deployer: 'FAKE_DEPLOYER',
        holders: { count: 5 + (i%20), topPercent: 0.05 }
      };
    } else if (source === 'pumpfun') {
      payload = {
        tokenAddress: `FAKE_MINT_${i}`,
        deployer: 'FAKE_DEPLOYER',
        graduatedAt: nowSec - 30,
        bondingCurveAge: 10,
        holderCount: 12 + (i%10),
        volumeOnCurve: 200 + (i%400),
        signature: `SIG_${i}`
      };
    } else if (source === 'lowcap-lore') {
      const fakePair = {
        chainId: 'solana',
        pairAddress: `FAKE_PAIR_${i}`,
        baseToken: { address: `FAKE_MINT_${i}`, name: `FakeToken${i}`, symbol: `FT${i}` },
        quoteToken: { symbol: 'USDC' },
        priceUsd: '0.01',
        fdv: 5000,
        marketCap: 8000 + i,
        priceChange: { m5: 0, h1: 0, h6: 0, h24: 2 },
        txns: { m5: { buys: 5 + (i%10), sells: 1 }, h1: { buys: 10, sells: 2 } },
        volume: { m5: 500 + (i%200), h1: 1200 + (i%500), h24: 3000 + (i%1000) },
        liquidity: { usd: 5000 + (i%500) },
        pairCreatedAt: nowSec - 60,
        deployer: 'FAKE_DEPLOYER',
        holders: { count: 5 + (i%20), topPercent: 0.05 }
      };
      payload = {
        pair: fakePair,
        lore: {
          score: 60 + (i%30),
          tier: 1,
          hasStrongLore: (i%10) > 2,
          narrativeName: 'meme-rotation',
          loreFactors: ['short name'],
          skipBundleCheck: false,
          suggestedSize: 'micro'
        },
        isPreBonding: true,
        ageMinutes: 1,
        mcap: fakePair.marketCap,
        reason: 'Stress test lowcap lore play',
        confidence: 60 + (i%40)
      };
    } else if (source === 'fake-volume') {
      const fakePair = {
        chainId: 'solana',
        pairAddress: `FAKE_PAIR_${i}`,
        baseToken: { address: `FAKE_MINT_${i}`, name: `FakeToken${i}`, symbol: `FT${i}` },
        quoteToken: { symbol: 'USDC' },
        priceUsd: '0.01',
        fdv: 5000,
        marketCap: 8000 + i,
        priceChange: { m5: 0, h1: 0, h6: 0, h24: 2 },
        txns: { m5: { buys: 5 + (i%10), sells: 1 }, h1: { buys: 10, sells: 2 } },
        volume: { m5: 500 + (i%200), h1: 1200 + (i%500), h24: 3000 + (i%1000) },
        liquidity: { usd: 5000 + (i%500) },
        pairCreatedAt: nowSec - 60,
        deployer: 'FAKE_DEPLOYER',
        holders: { count: 5 + (i%20), topPercent: 0.05 }
      };
      payload = {
        pair: fakePair,
        result: {
          isFake: (i%5) === 0,
          reason: 'Stress test anomaly',
          confidence: 80,
          volMcapRatio: 0.01,
          liqMcapRatio: 0.1,
          flags: ['synthetic volume']
        }
      };
    } else if (source === 'onchain') {
      payload = {
        tokenAddress: `FAKE_MINT_${i}`,
        signalType: 'NEW_POOL',
        confidence: 40 + (i%40),
        poolCreatedAt: nowSec - 60,
        deployer: 'FAKE_DEPLOYER',
        initialSolLiq: 5,
        uniqueBuyers: 3 + (i%5),
        repeatBuyers: 1,
        avgBuySize: 10,
        buyingVelocity: 2,
        reason: 'onchain test'
      };
    } else if (source === 'monitor') {
      payload = {
        signature: `SIG_MON_${i}`,
        program: 'pumpfun',
        timestamp: nowSec
      };
    }

    if (!payload) continue;

    signalIngestionHub.ingestSignal(payload, source).catch((e)=>{
      console.error('ingest error', e?.message || e);
    });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const count = parseInt(args[0] || '100', 10);
  console.log(`Starting stress test: ${count} signals`);
  await runBatch(count);
  console.log('Stress test dispatched');
}

main().catch((e)=>{ console.error(e); process.exit(1); });
