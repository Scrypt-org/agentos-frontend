import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function readPage(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, import.meta.url), 'utf8');
}

describe('transaction authorization consumers', () => {
  it('continues Send with the callback key when the current context key is null', async () => {
    const source = await readPage('../../app/send/page.tsx');

    expect(source).toMatch(/const handleSend = async \(authorizedKey: Uint8Array \| null = privateKey\) => \{/);
    expect(source).toMatch(/if \(!recipient \|\| !amount \|\| !authorizedKey\) return;/);
    expect(source).toMatch(/sendTransaction\(\s*authorizedKey,/s);
    expect(source).toMatch(
      /const handleAuthSuccess = \(authorizedKey: Uint8Array\) => \{\s*setShowAuthModal\(false\);\s*handleSend\(authorizedKey\);\s*\};/s,
    );
  });

  it('continues Swap with the callback key when the current context key is null', async () => {
    const source = await readPage('../../app/swap/page.tsx');

    expect(source).toMatch(/const handleSwap = async \(authorizedKey: Uint8Array \| null = privateKey\) => \{/);
    expect(source).toMatch(/if \(!address \|\| !authorizedKey\) \{/);
    expect(source).toMatch(/privateKeyToHex\(authorizedKey\)/);
    expect(source).toMatch(
      /const handleAuthSuccess = \(authorizedKey: Uint8Array\) => \{\s*setShowAuthModal\(false\);\s*handleSwap\(authorizedKey\);\s*\};/s,
    );
  });
});
