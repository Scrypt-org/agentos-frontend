import { describe, expect, it } from 'vitest';
import { decodeFunctionData } from 'viem';

import {
  ERC20_TRANSFER_ABI,
  encodeErc20Transfer,
  parseErc20Amount,
} from './erc20-transfer';

const RECIPIENT = '0x1111111111111111111111111111111111111111' as const;

describe('parseErc20Amount', () => {
  it('converts a decimal amount into base units', () => {
    expect(parseErc20Amount('1', 6)).toBe(1_000_000n);
    expect(parseErc20Amount('0.5', 6)).toBe(500_000n);
    expect(parseErc20Amount(' 12.345678 ', 6)).toBe(12_345_678n);
  });

  it('rejects more precision than the token has', () => {
    // parseUnits would silently round this, moving a different amount than the
    // one the user typed.
    expect(() => parseErc20Amount('1.2345678', 6)).toThrow(/decimal places/);
  });

  it('rejects zero, negatives, and non-numeric input', () => {
    expect(() => parseErc20Amount('0', 6)).toThrow(/greater than zero/);
    expect(() => parseErc20Amount('0.0000001', 6)).toThrow(/decimal places/);
    expect(() => parseErc20Amount('-1', 6)).toThrow(/positive number/);
    expect(() => parseErc20Amount('', 6)).toThrow(/positive number/);
    expect(() => parseErc20Amount('1.', 6)).toThrow(/positive number/);
    expect(() => parseErc20Amount('abc', 6)).toThrow(/positive number/);
  });
});

describe('encodeErc20Transfer', () => {
  it('encodes a transfer call the token contract can decode', () => {
    const data = encodeErc20Transfer(RECIPIENT, 250_000n);
    const decoded = decodeFunctionData({ abi: ERC20_TRANSFER_ABI, data });

    expect(decoded.functionName).toBe('transfer');
    expect(decoded.args).toEqual([RECIPIENT, 250_000n]);
  });

  it('starts with the standard transfer selector', () => {
    expect(encodeErc20Transfer(RECIPIENT, 1n).startsWith('0xa9059cbb')).toBe(true);
  });
});
