'use client';

import { useRouter } from 'next/navigation';
import { useWallet } from '@/contexts/WalletContext';
import { QRCodeSVG } from 'qrcode.react';
import { ACTIVE_NETWORK } from '@/config/network';
import { useState } from 'react';
import LoadingSpinner from '@/components/LoadingSpinner';
import { getInjectiveAddress } from '@injectivelabs/sdk-ts';

type AddressType = 'evm' | 'cosmos';

export default function ReceivePage() {
  const router = useRouter();
  const { isUnlocked, address, isCheckingSession } = useWallet();
  const [copied, setCopied] = useState(false);
  const [addressType, setAddressType] = useState<AddressType>('evm');

  // Convert EVM address to Cosmos (Bech32) format for Monad
  // Uses official Injective SDK for proper address conversion
  const getCosmosAddress = (evmAddr: string): string => {
    if (!evmAddr) return '';
    try {
      // getInjectiveAddress converts 0x... to inj1... format
      return getInjectiveAddress(evmAddr);
    } catch (error) {
      console.error('Failed to convert address:', error);
      return '';
    }
  };

  const displayAddress = addressType === 'evm' ? (address || '') : getCosmosAddress(address || '');

  const handleCopy = () => {
    if (displayAddress) {
      navigator.clipboard.writeText(displayAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isCheckingSession) {
    return <LoadingSpinner progress={44} statusLabel="Checking wallet session" />;
  }

  if (!isUnlocked || !address) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-red-400 mb-6">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold mb-2">Wallet Locked</h2>
        <p className="text-gray-400 mb-8">Please unlock your wallet to view your receive address.</p>
        <button 
          onClick={() => router.push('/welcome')}
          className="px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold transition-all"
        >
          Go to Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 md:pb-8 bg-black">
      {/* Header - OKX Style */}
      <div className="bg-gradient-to-b from-white/5 to-transparent border-b border-white/5 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <polyline points="15 18 9 12 15 6" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <div>
                <h1 className="text-xl font-bold text-white">Receive</h1>
                <p className="text-gray-400 text-xs">Get your wallet address</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-4 py-8 relative z-10">
      <div className="flex flex-col items-center gap-8">
        {/* QR Code Section */}
        <div className="relative group">
          <div className="absolute -inset-4 bg-blue-500/10 rounded-[3rem] blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500"></div>
          <div className="relative p-8 rounded-[2.5rem] bg-white border border-white/10 shadow-2xl overflow-hidden">
            <QRCodeSVG
              value={displayAddress}
              size={240}
              level="H"
              bgColor="#FFFFFF"
              fgColor="#000000"
              includeMargin={false}
            />
          </div>
        </div>

        {/* Address Type Slider - Smooth Toggle */}
        <div className="w-full max-w-md">
          <div className="relative bg-black/40 backdrop-blur-sm rounded-2xl p-2 border border-white/10">
            {/* Sliding Background */}
            <div 
              className={`absolute top-2 bottom-2 w-[calc(50%-0.5rem)] bg-white rounded-xl transition-all duration-300 ease-in-out ${
                addressType === 'evm' ? 'left-2' : 'left-[calc(50%+0.25rem)]'
              }`}
              style={{ 
                boxShadow: '0 4px 12px rgba(255, 255, 255, 0.15)',
              }}
            />
            
            {/* Toggle Buttons */}
            <div className="relative flex gap-2">
              <button
                onClick={() => setAddressType('evm')}
                className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all duration-300 ease-in-out transform flex items-center justify-center gap-2 ${
                  addressType === 'evm' 
                    ? 'text-black scale-105' 
                    : 'text-gray-400 hover:text-white hover:scale-102'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                EVM Address
              </button>
              <button
                onClick={() => setAddressType('cosmos')}
                className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all duration-300 ease-in-out transform flex items-center justify-center gap-2 ${
                  addressType === 'cosmos' 
                    ? 'text-black scale-105' 
                    : 'text-gray-400 hover:text-white hover:scale-102'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Cosmos Address
              </button>
            </div>
          </div>
        </div>

        <div className="w-full space-y-6">
          <div className="text-center">
            <p className="text-gray-400 text-sm mb-4">
              Your Monad {addressType === 'evm' ? 'EVM' : 'Cosmos'} Address
            </p>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 font-mono text-xs overflow-hidden relative group flex items-center gap-3">
              <div className="overflow-x-auto scrollbar-hide flex-1">
                <span className="text-white whitespace-nowrap">
                  <span className="font-bold underline underline-offset-2">{displayAddress.slice(0, 6)}</span>
                  <span>{displayAddress.slice(6, -6)}</span>
                  <span className="font-bold underline underline-offset-2">{displayAddress.slice(-6)}</span>
                </span>
              </div>
              <button 
                onClick={handleCopy}
                className={`flex-shrink-0 p-2.5 rounded-xl font-bold transition-all transform active:scale-95 ${
                  copied ? 'bg-green-500/20 text-green-400' : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
                title={copied ? "Copied!" : "Copy Address"}
              >
                {copied ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Info Messages */}
          <div className="space-y-3">
            {/* Success Message */}
            <div className="flex gap-3 items-start p-4 rounded-xl bg-green-500/5 border border-green-500/10">
              <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center mt-0.5">
                <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-gray-300 text-sm leading-relaxed flex-1">
                {addressType === 'evm' 
                  ? 'All kinds of Monad Activities'
                  : 'Withdraw from Binance and OKX'
                }
              </p>
            </div>

            {/* Warning Message */}
            <div className="flex gap-3 items-start p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/10">
              <div className="flex-shrink-0 w-5 h-5 rounded-full bg-yellow-500/20 flex items-center justify-center mt-0.5">
                <svg className="w-3.5 h-3.5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01M12 3c4.97 0 9 4.03 9 9s-4.03 9-9 9-9-4.03-9-9 4.03-9 9-9z" />
                </svg>
              </div>
              <p className="text-gray-300 text-sm leading-relaxed flex-1">
                {addressType === 'evm' 
                  ? 'Receive Monad Assets only'
                  : 'Swap Assets through Injective Bridge'
                }
              </p>
              {addressType === 'cosmos' && (
                <a
                  href={ACTIVE_NETWORK.bridgeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 text-yellow-400 hover:text-yellow-300 transition-colors"
                  title="Visit Injective Bridge"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {};
