import { NextRequest, NextResponse } from 'next/server';
import { INJECTIVE_MAINNET, INJECTIVE_TESTNET } from '@/types/chain';

/**
 * API Route to proxy Blockscout API requests
 * This avoids CORS issues when calling Blockscout from the browser
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
    // Fetch from Blockscout API server-side - MAINNET
    // Note: Blockscout API is on a separate domain from the explorer frontend
    const apiUrl = `${activeChain.explorerApiUrl}/api/v2/addresses/${address}/transactions`;
    
    console.log(`[API] Fetching transactions from: ${apiUrl}`);
    
    const [response, latestBlockResponse] = await Promise.all([
      fetch(apiUrl, {
        headers: {
          'Accept': 'application/json',
        },
      }),
      fetch(activeChain.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
      }).catch(() => null),
    ]);

    console.log(`[API] Response status: ${response.status}`);

    if (!response.ok) {
      // Check if it's a 404 - might mean no transactions yet
      if (response.status === 404) {
        // Return empty transactions list instead of error
        return NextResponse.json({
          items: [],
          next_page_params: null
        });
      }
      
      return NextResponse.json(
        { error: `Blockscout API returned ${response.status}` },
        { status: response.status }
      );
    }

    const contentType = response.headers.get('content-type');
    
    // Check if response is HTML (error page) instead of JSON
    if (contentType?.includes('text/html')) {
      console.log('[API] Received HTML instead of JSON - probably no transactions');
      return NextResponse.json({
        items: [],
        next_page_params: null
      });
    }

    const data = await response.json();
    let currentBlock: number | null = null;
    if (latestBlockResponse?.ok) {
      try {
        const latestBlockPayload = await latestBlockResponse.json() as { result?: unknown };
        if (typeof latestBlockPayload.result === 'string') {
          const parsedBlock = Number.parseInt(latestBlockPayload.result, 16);
          if (Number.isSafeInteger(parsedBlock)) currentBlock = parsedBlock;
        }
      } catch {
        currentBlock = null;
      }
    }

    return NextResponse.json({ ...data, current_block: currentBlock });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    );
  }
}
