/**
 * Price service for fetching real-time cryptocurrency prices
 */

import { NETWORK_CONFIG } from '@/config/network';

export interface TokenPrice {
  usd: number;
  usd24hChange?: number;
  lastUpdated?: number;
}

// Cache to avoid too many requests
const priceCache: Map<string, { price: TokenPrice; timestamp: number }> = new Map();
const CACHE_DURATION = 60000; // 1 minute

/**
 * Fetch INJ price from CoinGecko API
 */
export async function getInjPrice(): Promise<number> {
  const cacheKey = 'inj-usd';
  const cached = priceCache.get(cacheKey);
  
  // Return cached price if it's still fresh
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.price.usd;
  }

  try {
    // Using CoinGecko public API (no API key required)
    const response = await fetch(
      `${NETWORK_CONFIG.coingeckoApi}/simple/price?ids=injective-protocol&vs_currencies=usd&include_24hr_change=true`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch price: ${response.status}`);
    }

    const data = await response.json();
    const price = data['injective-protocol']?.usd;

    if (!price) {
      throw new Error('Price data not available');
    }

    // Cache the result
    priceCache.set(cacheKey, {
      price: {
        usd: price,
        usd24hChange: data['injective-protocol']?.usd_24h_change,
        lastUpdated: Date.now(),
      },
      timestamp: Date.now(),
    });

    return price;
  } catch (error) {
    console.error('Failed to fetch INJ price:', error);
    
    // Return cached price if available, even if expired
    if (cached) {
      console.warn('Using expired cached price');
      return cached.price.usd;
    }
    
    // Fallback to a reasonable default (current approximate INJ price)
    console.warn('Using fallback price');
    return 25; // Fallback price
  }
}

/**
 * Get token price with detailed information
 */
export async function getTokenPrice(tokenId: string = 'injective-protocol'): Promise<TokenPrice> {
  const cacheKey = `${tokenId}-usd`;
  const cached = priceCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.price;
  }

  try {
    const response = await fetch(
      `${NETWORK_CONFIG.coingeckoApi}/simple/price?ids=${tokenId}&vs_currencies=usd&include_24hr_change=true`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch price: ${response.status}`);
    }

    const data = await response.json();
    const tokenData = data[tokenId];

    if (!tokenData) {
      throw new Error('Token price data not available');
    }

    const priceData: TokenPrice = {
      usd: tokenData.usd,
      usd24hChange: tokenData.usd_24h_change,
      lastUpdated: Date.now(),
    };

    priceCache.set(cacheKey, {
      price: priceData,
      timestamp: Date.now(),
    });

    return priceData;
  } catch (error) {
    console.error(`Failed to fetch ${tokenId} price:`, error);
    
    if (cached) {
      return cached.price;
    }
    
    return {
      usd: 25,
      lastUpdated: Date.now(),
    };
  }
}

/**
 * Get several token prices in a SINGLE CoinGecko request (comma-separated ids),
 * instead of one HTTP round-trip per token. Shares the same 60s cache as
 * getTokenPrice(): fresh ids are served from cache and only the stale ones are
 * fetched. Returns a map keyed by tokenId.
 */
export async function getTokenPrices(
  tokenIds: string[],
): Promise<Record<string, TokenPrice>> {
  const now = Date.now();
  const result: Record<string, TokenPrice> = {};
  const missing: string[] = [];

  for (const id of tokenIds) {
    const cached = priceCache.get(`${id}-usd`);
    if (cached && now - cached.timestamp < CACHE_DURATION) {
      result[id] = cached.price;
    } else {
      missing.push(id);
    }
  }

  if (missing.length === 0) {
    return result;
  }

  try {
    const response = await fetch(
      `${NETWORK_CONFIG.coingeckoApi}/simple/price?ids=${missing.join(',')}&vs_currencies=usd&include_24hr_change=true`,
      { headers: { Accept: 'application/json' } },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch prices: ${response.status}`);
    }

    const data = await response.json();

    for (const id of missing) {
      const tokenData = data[id];
      if (tokenData) {
        const priceData: TokenPrice = {
          usd: tokenData.usd,
          usd24hChange: tokenData.usd_24h_change,
          lastUpdated: now,
        };
        priceCache.set(`${id}-usd`, { price: priceData, timestamp: now });
        result[id] = priceData;
      } else {
        // Keep any stale cache, else a neutral default.
        result[id] = priceCache.get(`${id}-usd`)?.price ?? { usd: 0, lastUpdated: now };
      }
    }
  } catch (error) {
    console.error('Failed to fetch batched prices:', error);
    for (const id of missing) {
      result[id] = priceCache.get(`${id}-usd`)?.price ?? { usd: 0, lastUpdated: now };
    }
  }

  return result;
}

/**
 * Clear the price cache
 */
export function clearPriceCache(): void {
  priceCache.clear();
}
