import { NextRequest, NextResponse } from 'next/server';
import { INJECTIVE_MAINNET, INJECTIVE_TESTNET } from '@/types/chain';

interface MonadscanTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  timeStamp: string;
  blockNumber: string;
  isError: string;
  gasUsed?: string;
  gasPrice?: string;
}

/**
 * API Route to proxy the Monadscan (Etherscan-compatible) txlist API and
 * reshape it into the Blockscout-ish `{ items: [...] }` payload the client
 * (getTxHistory.ts) already parses, so that code didn't need to change too.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const address = searchParams.get('address');
  const network = searchParams.get('network');

  if (!address) {
    return NextResponse.json(
      { error: 'Address parameter is required' },
      { status: 400 }
    );
  }

  try {
    const activeChain = network === 'testnet' ? INJECTIVE_TESTNET : INJECTIVE_MAINNET;
    const apiKey = process.env.MONADSCAN_API_KEY;
    const params = new URLSearchParams({
      module: 'account',
      action: 'txlist',
      address,
      startblock: '0',
      endblock: '99999999',
      page: '1',
      offset: '50',
      sort: 'desc',
      ...(apiKey ? { apikey: apiKey } : {}),
    });
    const apiUrl = `${activeChain.explorerApiUrl}?${params.toString()}`;

    const [response, latestBlockResponse] = await Promise.all([
      fetch(apiUrl, { headers: { Accept: 'application/json' } }),
      fetch(activeChain.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
      }).catch(() => null),
    ]);

    if (!response.ok) {
      return NextResponse.json({ items: [], next_page_params: null });
    }

    const data = (await response.json()) as { status?: string; result?: MonadscanTx[] | string };

    let currentBlock: number | null = null;
    if (latestBlockResponse?.ok) {
      try {
        const latestBlockPayload = (await latestBlockResponse.json()) as { result?: unknown };
        if (typeof latestBlockPayload.result === 'string') {
          const parsedBlock = Number.parseInt(latestBlockPayload.result, 16);
          if (Number.isSafeInteger(parsedBlock)) currentBlock = parsedBlock;
        }
      } catch {
        currentBlock = null;
      }
    }

    const result = Array.isArray(data.result) ? data.result : [];
    const items = result.map((tx) => ({
      hash: tx.hash,
      from: { hash: tx.from },
      to: tx.to ? { hash: tx.to } : null,
      value: tx.value,
      timestamp: new Date(Number(tx.timeStamp) * 1000).toISOString(),
      block_number: Number(tx.blockNumber),
      status: tx.isError === '0' ? 'ok' : 'error',
      gas_used: tx.gasUsed,
      gas_price: tx.gasPrice,
    }));

    return NextResponse.json({ items, next_page_params: null, current_block: currentBlock });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    );
  }
}
