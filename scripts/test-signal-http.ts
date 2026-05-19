import axios from 'axios';

const source = process.argv[2] || 'lowcap-lore';
const serverUrl = process.env.SERVER_URL || 'http://localhost:3000';
const url = `${serverUrl}/api/test/simulate-signal`;
const nowSec = Math.floor(Date.now() / 1000);

function buildFakePair(index: number) {
  return {
    chainId: 'solana',
    pairAddress: `FAKE_PAIR_${index}`,
    baseToken: { address: `FAKE_MINT_${index}`, name: `FakeToken${index}`, symbol: `FT${index}` },
    quoteToken: { symbol: 'USDC' },
    priceUsd: '0.01',
    fdv: 5000,
    marketCap: 8000 + index,
    priceChange: { m5: 0, h1: 0, h6: 0, h24: 2 },
    txns: { m5: { buys: 5 + (index % 10), sells: 1 }, h1: { buys: 10, sells: 2 } },
    volume: { m5: 500 + (index % 200), h1: 1200 + (index % 500), h24: 3000 + (index % 1000) },
    liquidity: { usd: 5000 + (index % 500) },
    pairCreatedAt: nowSec - 60,
    deployer: 'FAKE_DEPLOYER',
    holders: { count: 5 + (index % 20), topPercent: 0.05 }
  };
}

function makeSignal(sourceName: string) {
  const index = Math.floor(Math.random() * 1000);
  const fakePair = buildFakePair(index);

  switch (sourceName) {
    case 'dexscreener':
      return { source: 'dexscreener', signal: fakePair };
    case 'pumpfun':
      return {
        source: 'pumpfun',
        signal: {
          tokenAddress: `FAKE_MINT_${index}`,
          deployer: 'FAKE_DEPLOYER',
          graduatedAt: nowSec - 30,
          bondingCurveAge: 10,
          holderCount: 12 + (index % 10),
          volumeOnCurve: 200 + (index % 400),
          signature: `SIG_${index}`,
        },
      };
    case 'lowcap-lore':
      return {
        source: 'lowcap-lore',
        signal: {
          pair: fakePair,
          lore: {
            score: 70,
            tier: 1,
            hasStrongLore: true,
            narrativeName: 'meme-rotation',
            loreFactors: ['short name'],
            skipBundleCheck: false,
            suggestedSize: 'micro',
          },
          isPreBonding: true,
          ageMinutes: 1,
          mcap: fakePair.marketCap,
          reason: 'HTTP local test',
          confidence: 78,
        },
      };
    case 'fake-volume':
      return {
        source: 'fake-volume',
        signal: {
          pair: fakePair,
          result: {
            isFake: true,
            reason: 'Stress test anomaly',
            confidence: 80,
            volMcapRatio: 0.01,
            liqMcapRatio: 0.1,
            flags: ['synthetic volume'],
          },
        },
      };
    case 'onchain':
      return {
        source: 'onchain',
        signal: {
          tokenAddress: `FAKE_MINT_${index}`,
          signalType: 'NEW_POOL',
          confidence: 55,
          poolCreatedAt: nowSec - 60,
          deployer: 'FAKE_DEPLOYER',
          initialSolLiq: 5,
          uniqueBuyers: 3 + (index % 5),
          repeatBuyers: 1,
          avgBuySize: 10,
          buyingVelocity: 2,
          reason: 'HTTP onchain test',
        },
      };
    case 'monitor':
      return {
        source: 'monitor',
        signal: {
          signature: `SIG_MON_${index}`,
          program: 'pumpfun',
          timestamp: nowSec,
        },
      };
    default:
      return {
        source: sourceName,
        signal: {
          message: 'fallback test signal',
          timestamp: nowSec,
        },
      };
  }
}

async function main() {
  console.log(`Sending ${source} payload to ${url}`);
  const payload = makeSignal(source);

  try {
    const response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    console.log('Response:', response.data);
  } catch (error: any) {
    console.error('HTTP test failed:', error.message || error);
    if (error.code === 'ECONNREFUSED') {
      console.error('  -> Backend not reachable. Start the server with `npm run dev` and retry.');
    }
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Body:', error.response.data);
    }
    process.exit(1);
  }
}

main();
