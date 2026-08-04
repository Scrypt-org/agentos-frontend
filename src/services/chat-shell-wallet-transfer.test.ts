import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function readShell(): Promise<string> {
  return readFile(
    new URL('../../app/components/InjPassChatShell.tsx', import.meta.url),
    'utf8',
  );
}

describe('chat shell wallet transfer panel', () => {
  it('offers the same asset list as the Send page', async () => {
    const source = await readShell();

    // Wallet > Assets > Send must not drift back to an INJ-only form; both
    // surfaces read the supported assets from one registry.
    expect(source).toContain("from '@/services/send-assets'");
    expect(source).toContain('const transferMode = getSendTransferMode(asset)');
    expect(source).toContain('SEND_ASSETS.map((option) => {');
    expect(source).toContain('const changeAsset = (nextAsset: SendAsset)');
  });

  it('picks the asset from a dropdown, not a second row of segmented tabs', async () => {
    const source = await readShell();

    // A tab strip here sat directly above the EVM/Cosmos one and read as a
    // duplicate of it.
    expect(source).toContain('aria-haspopup="listbox"');
    expect(source).toContain('aria-expanded={assetMenuOpen}');
    expect(source).toContain('role="option"');
    // Dismissing the menu must not require hitting the trigger again.
    expect(source).toContain('onClick={() => setAssetMenuOpen(false)}');
  });

  it('routes USDC through the gas sponsor rather than a browser-paid transaction', async () => {
    const source = await readShell();

    expect(source).toMatch(
      /prepareSponsoredUsdcTransfer\([\s\S]*?signTypedDataJson\(signingKey, preparedUsdc\.typedData\)[\s\S]*?submitSponsoredUsdcTransfer\(preparedUsdc\.transferId, signature\)[\s\S]*?pollSponsoredUsdcTransfer\(queued\.id\)/,
    );
    // Only a CONFIRMED transfer with a hash counts as sent.
    expect(source).toContain("if (settled.status !== 'CONFIRMED' || !settled.txHash)");
  });

  it('states the sponsored fee the way the Send page does', async () => {
    const source = await readShell();

    expect(source).toMatch(
      /transferMode === 'sponsored' && \([\s\S]*?copy\.gasSponsor[\s\S]*?text-emerald-500[^>]*>0 INJ</,
    );
    // A self-paid gas quote must never appear next to a sponsored transfer.
    expect(source).toContain("{transferMode !== 'sponsored' && (");
  });

  it('clears a stale quote whenever the transfer inputs change', async () => {
    const source = await readShell();

    // A gas estimate for the old numbers, or a sponsor authorization signed
    // over them, must never survive into the send.
    expect(source).toContain('setPreparedUsdc(null);');
    expect(source).toMatch(
      /const resetQuote = \(\) => \{\s*setReviewing\(false\);\s*setGasEstimate\(null\);\s*setPreparedUsdc\(null\);\s*setError\(''\);/,
    );
    expect(source).toContain('setRecipient(event.target.value); resetQuote();');
    expect(source).toContain('setAmount(event.target.value); resetQuote();');
  });

  it('pairs ERC-20 calls with the chain their token address came from', async () => {
    const source = await readShell();

    // A testnet token address called over the mainnet RPC would hit an empty
    // account and "succeed" without moving anything.
    expect(source).toMatch(/encodeErc20Transfer\([\s\S]*?DEFAULT_CHAIN,/);
  });
});
