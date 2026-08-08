import { NextRequest, NextResponse } from 'next/server';

/**
 * API Route to proxy Injective LCD API requests for Cosmos transactions
 * This avoids CORS issues when calling LCD from the browser
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const address = searchParams.get('address');
  const limit = parseInt(searchParams.get('limit') || '50', 10);

  if (!address) {
    return NextResponse.json(
      { error: 'Address parameter is required' },
      { status: 400 }
    );
  }

  try {
    // Monad Testnet LCD endpoint
    // Using the transactions endpoint with pagination
    // Query for both send and receive transactions, and swap transactions
    // Note: Use 'query' parameter instead of 'events' for Cosmos SDK v0.47+
    // For recipient transactions: query=transfer.recipient='address'
    // For sender transactions: query=transfer.sender='address'
    // We need to make separate queries and combine results, or use OR logic
    const recipientUrl = `https://sentry.lcd.injective.network:443/cosmos/tx/v1beta1/txs?query=transfer.recipient='${address}'&pagination.limit=${limit}&order_by=ORDER_BY_DESC`;
    const senderUrl = `https://sentry.lcd.injective.network:443/cosmos/tx/v1beta1/txs?query=transfer.sender='${address}'&pagination.limit=${limit}&order_by=ORDER_BY_DESC`;
    
    console.log(`[API] Fetching Cosmos transactions (recipient): ${recipientUrl}`);
    console.log(`[API] Fetching Cosmos transactions (sender): ${senderUrl}`);
    
    // Fetch both recipient and sender transactions in parallel
    const [recipientResponse, senderResponse] = await Promise.all([
      fetch(recipientUrl, {
        headers: {
          'Accept': 'application/json',
        },
      }).catch(() => null),
      fetch(senderUrl, {
        headers: {
          'Accept': 'application/json',
        },
      }).catch(() => null),
    ]);

    const allTxs: any[] = [];
    const seenHashes = new Set<string>();

    // Helper function to combine txs and tx_responses arrays
    const combineTxData = (data: any) => {
      const txs = data.txs || [];
      const txResponses = data.tx_responses || [];
      const combined: any[] = [];
      
      // Match txs with tx_responses by index
      for (let i = 0; i < Math.max(txs.length, txResponses.length); i++) {
        const tx = txs[i];
        const txResponse = txResponses[i];
        
        if (tx && txResponse) {
          const hash = txResponse.txhash;
          if (hash && !seenHashes.has(hash)) {
            seenHashes.add(hash);
            combined.push({
              tx: tx,
              tx_response: txResponse
            });
          }
        }
      }
      
      return combined;
    };

    // Process recipient transactions
    if (recipientResponse?.ok) {
      const contentType = recipientResponse.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        const data = await recipientResponse.json();
        const combined = combineTxData(data);
        allTxs.push(...combined);
      }
    }

    // Process sender transactions
    if (senderResponse?.ok) {
      const contentType = senderResponse.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        const data = await senderResponse.json();
        const combined = combineTxData(data);
        allTxs.push(...combined);
      }
    }

    // Sort by timestamp (newest first) and limit
    allTxs.sort((a, b) => {
      const timeA = new Date(a.tx_response?.timestamp || 0).getTime();
      const timeB = new Date(b.tx_response?.timestamp || 0).getTime();
      return timeB - timeA;
    });

    return NextResponse.json({
      txs: allTxs.slice(0, limit),
      pagination: null
    });
  } catch (error) {
    console.error('Error fetching Cosmos transactions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Cosmos transactions' },
      { status: 500 }
    );
  }
}

