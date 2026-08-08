'use client';

import { useRouter } from 'next/navigation';
import { useWallet } from '@/contexts/WalletContext';
import { useState, useEffect } from 'react';
import { getTxHistory } from '@/wallet/chain';
import { INJECTIVE_MAINNET } from '@/types/chain';
import { ACTIVE_NETWORK } from '@/config/network';
import LoadingSpinner from '@/components/LoadingSpinner';

type TransactionType = 'send' | 'receive' | 'swap';
type TransactionStatus = 'completed' | 'pending' | 'failed';

interface Transaction {
  id: string;
  type: TransactionType;
  amount: string;
  token: string;
  address: string;
  timestamp: Date;
  status: TransactionStatus;
  txHash?: string;
}

export default function HistoryPage() {
  const router = useRouter();
  const { isUnlocked, isCheckingSession, address } = useWallet();
  const [activeFilter, setActiveFilter] = useState<'all' | TransactionType>('all');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch transaction history from blockchain
  useEffect(() => {
    if (!address || !isUnlocked) {
      setIsLoading(false);
      return;
    }

    const fetchTransactions = async () => {
      try {
        setIsLoading(true);

        const evmTxHistory = await getTxHistory(address, 50).catch((err) => {
          console.error('Failed to fetch EVM transactions:', err);
          return [];
        });

        // Router address for detecting swap transactions
        const ROUTER_ADDRESS = '0xC7247df0e97353D676d78f1cc55D3CE39eE32bE1'.toLowerCase();
        
        // Transform EVM transactions to our UI format
        const evmTransactions: Transaction[] = evmTxHistory.map((tx) => {
          // Check if this is a swap transaction (sent to Router contract)
          const isSwapTx = tx.to?.toLowerCase() === ROUTER_ADDRESS;
          
          // Determine transaction type
          const isSent = tx.from.toLowerCase() === address.toLowerCase();
          let type: TransactionType;
          if (isSwapTx) {
            type = 'swap';
          } else {
            type = isSent ? 'send' : 'receive';
          }
          
          // Convert value from wei to INJ (with 3 decimal places)
          const amount = (Number(tx.value) / (10 ** 18)).toFixed(3);

          // Format address for display (shortened)
          const targetAddress = type === 'send' || type === 'swap' 
            ? (tx.to || 'Contract Creation') 
            : tx.from;
          const displayAddress = targetAddress.startsWith('0x') && targetAddress.length > 10
            ? `${targetAddress.slice(0, 6)}...${targetAddress.slice(-4)}`
            : targetAddress;

          return {
            id: `evm-${tx.hash}`,
            type,
            amount,
            token: 'INJ',
            address: displayAddress,
            timestamp: new Date(tx.timestamp * 1000),
            status: tx.status === 'success' ? 'completed' : tx.status === 'failed' ? 'failed' : 'pending',
            txHash: tx.hash,
          };
        });

        setTransactions(evmTransactions);
      } catch (error) {
        console.error('Failed to fetch transaction history:', error);
        setTransactions([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTransactions();
  }, [address, isUnlocked]);

  const filteredTransactions = activeFilter === 'all' 
    ? transactions 
    : transactions.filter(tx => tx.type === activeFilter);

  const getTypeIcon = (type: TransactionType) => {
    switch (type) {
      case 'send':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <line x1="12" y1="19" x2="12" y2="5" strokeWidth={2} strokeLinecap="round" />
            <polyline points="5 12 12 5 19 12" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case 'receive':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <line x1="12" y1="5" x2="12" y2="19" strokeWidth={2} strokeLinecap="round" />
            <polyline points="19 12 12 19 5 12" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case 'swap':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <polyline points="16 3 21 3 21 8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            <line x1="4" y1="20" x2="21" y2="3" strokeWidth={2} strokeLinecap="round" />
          </svg>
        );
    }
  };

  const getStatusColor = (status: TransactionStatus) => {
    switch (status) {
      case 'completed':
        return 'text-green-400';
      case 'pending':
        return 'text-yellow-400';
      case 'failed':
        return 'text-red-400';
    }
  };

  const formatDate = (date: Date) => {
    // Format as fixed date and time: "Feb 8, 2026 14:30"
    const options: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    };
    return date.toLocaleString('en-US', options);
  };

  if (isCheckingSession || isLoading) {
    return (
      <LoadingSpinner
        progress={isCheckingSession ? 42 : 82}
        statusLabel={isCheckingSession ? 'Checking wallet session' : 'Loading recent activity'}
      />
    );
  }

  if (!isUnlocked) {
    router.push('/');
    return null;
  }

  return (
    <div className="min-h-screen bg-black text-white pb-24 md:pb-8">
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
              <div className="flex items-center gap-3">
                <div>
                  <h1 className="text-xl font-bold text-white">Transaction History</h1>
                  <p className="text-gray-400 text-xs">View all your transactions</p>
                </div>
                {/* Mainnet Badge */}
                <span className="px-3 py-1 rounded-lg text-xs font-bold bg-green-500/20 text-green-300 border border-green-500/30">
                  MAINNET
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* Filters */}
        <div className="mb-6">
          <div className="relative p-1 bg-white/5 rounded-xl inline-flex">
            {/* Sliding Background */}
            <div
              className={`absolute top-1 bottom-1 bg-white rounded-lg transition-all duration-300 ease-out ${
                activeFilter === 'all' ? 'left-1 w-[calc(25%-0.25rem)]' :
                activeFilter === 'send' ? 'left-[calc(25%+0.25rem)] w-[calc(25%-0.25rem)]' :
                activeFilter === 'receive' ? 'left-[calc(50%+0.5rem)] w-[calc(25%-0.25rem)]' :
                'left-[calc(75%+0.75rem)] w-[calc(25%-0.25rem)]'
              }`}
            />

            {/* Filter Buttons */}
            <button
              onClick={() => setActiveFilter('all')}
              className={`relative z-10 px-6 py-2 rounded-lg text-sm font-bold transition-colors ${
                activeFilter === 'all' ? 'text-black' : 'text-gray-400 hover:text-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setActiveFilter('send')}
              className={`relative z-10 px-6 py-2 rounded-lg text-sm font-bold transition-colors ${
                activeFilter === 'send' ? 'text-black' : 'text-gray-400 hover:text-white'
              }`}
            >
              Send
            </button>
            <button
              onClick={() => setActiveFilter('receive')}
              className={`relative z-10 px-6 py-2 rounded-lg text-sm font-bold transition-colors ${
                activeFilter === 'receive' ? 'text-black' : 'text-gray-400 hover:text-white'
              }`}
            >
              Receive
            </button>
            <button
              onClick={() => setActiveFilter('swap')}
              className={`relative z-10 px-6 py-2 rounded-lg text-sm font-bold transition-colors ${
                activeFilter === 'swap' ? 'text-black' : 'text-gray-400 hover:text-white'
              }`}
            >
              Swap
            </button>
          </div>
        </div>

        {/* Transactions List */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-sm">
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" strokeWidth={2} strokeLinecap="round" />
                  <polyline points="12 6 12 12 16 14" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-xl font-bold mb-2">No transactions yet</p>
              <p className="text-sm">Your transaction history will appear here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer group"
                  onClick={() => {
                    if (tx.txHash) {
                      window.open(`${ACTIVE_NETWORK.explorerUrl}/tx/${tx.txHash}`, '_blank');
                    }
                  }}
                >
                  {/* Icon */}
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    tx.type === 'send' ? 'bg-red-500/20 text-red-400' :
                    tx.type === 'receive' ? 'bg-green-500/20 text-green-400' :
                    'bg-blue-500/20 text-blue-400'
                  }`}>
                    {getTypeIcon(tx.type)}
                  </div>

                  {/* Transaction Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold capitalize">{tx.type}</span>
                    </div>
                    <div className="text-sm text-gray-400 font-mono">{tx.address}</div>
                  </div>

                  {/* Amount & Status */}
                  <div className="text-right">
                    <div className="font-bold font-mono mb-1">
                      {tx.type === 'send' ? '-' : '+'}{tx.amount} {tx.token}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <span className={`text-xs font-semibold ${getStatusColor(tx.status)}`}>
                        {tx.status}
                      </span>
                      <span className="text-xs text-gray-500">•</span>
                      <span className="text-xs text-gray-500">{formatDate(tx.timestamp)}</span>
                    </div>
                  </div>

                  {/* Arrow */}
                  <svg className="w-4 h-4 text-gray-600 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <polyline points="9 18 15 12 9 6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
