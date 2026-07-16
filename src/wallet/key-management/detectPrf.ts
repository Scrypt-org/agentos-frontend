export type PrfRecommendation = 'supported' | 'likely' | 'unlikely' | 'unknown';

export interface PrfDetection {
  recommendation: PrfRecommendation;
  capabilityPrf: boolean | null;
  reason: string;
}

export async function browserPrfCapability(): Promise<boolean | null> {
  if (typeof window === 'undefined' || typeof PublicKeyCredential === 'undefined') return null;
  const credentialApi = PublicKeyCredential as unknown as {
    getClientCapabilities?: () => Promise<Record<string, boolean>>;
  };
  if (typeof credentialApi.getClientCapabilities !== 'function') return null;
  try {
    const capabilities = await credentialApi.getClientCapabilities();
    if (capabilities.prf === true) return true;
    if (capabilities.prf === false) return false;
  } catch {
    return null;
  }
  return null;
}

export async function detectPrfSupport(): Promise<PrfDetection> {
  const capabilityPrf = await browserPrfCapability();
  if (capabilityPrf === true) {
    return { recommendation: 'supported', capabilityPrf, reason: 'capability-prf-true' };
  }
  if (capabilityPrf === false) {
    return { recommendation: 'unlikely', capabilityPrf, reason: 'capability-prf-false' };
  }

  if (typeof navigator === 'undefined') {
    return { recommendation: 'unknown', capabilityPrf, reason: 'server' };
  }
  const modernChromium = /(?:Chrome|Edg)\/(\d+)/.exec(navigator.userAgent);
  const likely = modernChromium && Number(modernChromium[1]) >= 116;
  return {
    recommendation: likely ? 'likely' : 'unknown',
    capabilityPrf,
    reason: likely ? 'modern-chromium' : 'capability-unavailable',
  };
}
