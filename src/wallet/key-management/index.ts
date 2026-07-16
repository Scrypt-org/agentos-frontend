export { deriveSecp256k1, fromHex, toHex, isValidAddress, isValidPrivateKeyHex } from './deriveSecp256k1';
// Legacy Passkey derivation remains unlock-only for backward compatibility.
// New Passkey wallets must be created through createPrfWallet.
export { unlockByPasskey } from './createByPasskey';
export { createByNFC, unlockByNFC, readNFCTag, isNFCSupported } from './createByNFC';
export { importPrivateKey, validatePrivateKey } from './importPrivateKey';
export { recoverWalletAddress, recoverFullWallet } from './recoverByPasskey';
export { createPrfWallet, unlockPrfWallet, recoverWallet, hkdfToSecp256k1, PrfUnsupportedError } from './prf';
export { unlockWalletKey, PasswordRequiredError } from './unlockWalletKey';
export { completeLocalWalletSetup, importMnemonicWallet, prepareLocalWalletSetup } from './createMnemonicVaultWallet';
export { unlockLocalMnemonicWallet, getLocalWalletMnemonic, LocalVaultMissingError } from './unlockLocalMnemonicWallet';
export { detectPrfSupport, browserPrfCapability } from './detectPrf';
export { createByPassword } from './createByPassword';
export { revealWalletMnemonic, markMnemonicBackedUp } from './mnemonicBackup';
export type { CreatePrfWalletResult, RecoverWalletResult } from './prf';
export type { CreateByPasswordResult } from './createByPassword';
export type { CreateByNFCResult } from './createByNFC';
export type { ImportResult } from './importPrivateKey';
export type { RecoverByPasskeyResult } from './recoverByPasskey';
export type { CreateMnemonicVaultResult, PreparedMnemonicWallet } from './createMnemonicVaultWallet';
export type { PrfDetection, PrfRecommendation } from './detectPrf';
