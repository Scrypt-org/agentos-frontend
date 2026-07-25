import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function readPage(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, import.meta.url), 'utf8');
}

describe('transaction authorization consumers', () => {
  it('continues Send with the callback key when the current context key is null', async () => {
    const source = await readPage('../../app/send/page.tsx');

    expect(source).toContain("import { resolveTransactionKey } from '@/services/transaction-key';");
    expect(source).toMatch(
      /const handleSend = async \(authorizedKey\?: Uint8Array\) => \{\s*const transactionKey = resolveTransactionKey\(authorizedKey, privateKey\);/s,
    );
    expect(source).toMatch(/if \(!recipient \|\| !amount \|\| !transactionKey\) return;/);
    expect(source).toMatch(/sendTransaction\(\s*transactionKey,/s);
    expect(source).toMatch(
      /const handleAuthSuccess = async \(authorizedKey: Uint8Array\) => \{\s*setShowAuthModal\(false\);\s*if \(asset === 'INJ'\) \{\s*await handleSend\(authorizedKey\);\s*return;\s*\}\s*await handleSponsoredUsdcAuthorization\(authorizedKey\);\s*\};/s,
    );
    expect(source).toMatch(
      /signTypedDataJson\(authorizedKey, prepared\.typedData\)/,
    );
    expect(source).not.toMatch(
      /signTypedDataJson\(privateKey, prepared\.typedData\)/,
    );
  });

  it('continues Swap with the callback key when the current context key is null', async () => {
    const source = await readPage('../../app/swap/page.tsx');

    expect(source).toContain("import { resolveTransactionKey } from '@/services/transaction-key';");
    expect(source).toMatch(
      /const handleSwap = async \(authorizedKey\?: Uint8Array\) => \{\s*const transactionKey = resolveTransactionKey\(authorizedKey, privateKey\);/s,
    );
    expect(source).toMatch(/if \(!address \|\| !transactionKey\) \{/);
    expect(source).toMatch(/privateKeyToHex\(transactionKey\)/);
    expect(source).toMatch(
      /const handleAuthSuccess = \(authorizedKey: Uint8Array\) => \{\s*setShowAuthModal\(false\);\s*handleSwap\(authorizedKey\);\s*\};/s,
    );
  });
});
