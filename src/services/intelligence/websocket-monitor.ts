import { Connection, PublicKey } from '@solana/web3.js';
import { enrichmentQueue } from '../../core/enrichment-queue';

const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';
const connection = new Connection(SOLANA_RPC, 'confirmed');

const PROGRAMS = [
  { name: 'raydium', id: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8' },
  { name: 'pumpfun', id: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P' },
  { name: 'pump_migration', id: '39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg' },
];

export async function startWebsocketMonitoring(): Promise<void> {
  console.log('[WS] Starting WebSocket monitoring...');

  for (const program of PROGRAMS) {
    connection.onLogs(
      new PublicKey(program.id),
      async (logs) => {
        console.log(`[WS] New ${program.name} tx: ${logs.signature.slice(0, 8)}...`);
        
        await enrichmentQueue.add('enrich', {
          signature: logs.signature,
          program: program.name as 'raydium' | 'pumpfun' | 'pump_migration',
          timestamp: Date.now(),
        });
      },
      'confirmed'
    );

    console.log(`[WS] Monitoring ${program.name}`);
  }
}