'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/contexts/WalletContext';
import { useTheme } from '@/contexts/ThemeContext';
import { QRCodeSVG } from 'qrcode.react';
import { isNFCSupported, readNFCCard, writeNFCCard } from '@/services/nfc';

interface BonjourCard {
  uid: string;
  name: string;
  isActive: boolean;
  boundAt: Date;
  cardNumber: string; // Visa-style card number starting with 6
  cvv: string; // 3-digit CVV
}

export default function CardsPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const [isEmbedded] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('embed') === '1';
  });
  const { address, isCheckingSession } = useWallet();
  const [copied, setCopied] = useState(false);
  const [flippedCard, setFlippedCard] = useState<string | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  
  // Add New Card Modal states
  const [showAddCardModal, setShowAddCardModal] = useState(false);
  const [addCardStep, setAddCardStep] = useState<'nfc' | 'scanning' | 'passkey' | 'success'>('nfc');
  const [closingModal, setClosingModal] = useState(false);
  const [scannedCardUID, setScannedCardUID] = useState<string>('');
  const [nfcError, setNfcError] = useState<string>('');
  
  // Bound cards state
  const [boundCards, setBoundCards] = useState<BonjourCard[]>([]);
  const [cardsLoaded, setCardsLoaded] = useState(false);

  // Load cards from localStorage on mount
  const loadCards = () => {
    if (!address) return;
    const storageKey = `nfc_cards_${address}`;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Array<Omit<BonjourCard, 'boundAt'> & { boundAt: string }>;
        // Convert boundAt string back to Date
        const cards = parsed.map((card) => ({
          ...card,
          boundAt: new Date(card.boundAt),
        }));
        setBoundCards(cards);
      } catch (e) {
        console.error('Failed to load cards:', e);
      }
    }
    setCardsLoaded(true);
  };

  // Save cards to localStorage
  const saveCards = (cards: BonjourCard[]) => {
    if (!address) return;
    const storageKey = `nfc_cards_${address}`;
    localStorage.setItem(storageKey, JSON.stringify(cards));
  };

  // Load on mount and when address changes
  if (!cardsLoaded && address) {
    loadCards();
  }

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Generate random Visa-style card number starting with 6
  const generateCardNumber = () => {
    const digits = Array.from({ length: 15 }, () => Math.floor(Math.random() * 10));
    const cardNum = '6' + digits.join('');
    // Format as XXXX XXXX XXXX XXXX
    return cardNum.match(/.{1,4}/g)?.join(' ') || cardNum;
  };

  // Generate random 3-digit CVV
  const generateCVV = () => {
    return Math.floor(100 + Math.random() * 900).toString();
  };

  const toggleCardFlip = (uid: string) => {
    setFlippedCard(flippedCard === uid ? null : uid);
  };

  const handleShowAddress = () => {
    setFlippedCard(null);
    setShowQRModal(true);
  };

  const handleFreeze = (uid: string) => {
    const updatedCards = boundCards.map(card => 
      card.uid === uid ? { ...card, isActive: !card.isActive } : card
    );
    setBoundCards(updatedCards);
    saveCards(updatedCards);
    setFlippedCard(null);
  };

  const handleUnbind = async (uid: string) => {
    try {
      // Real Passkey authentication for unbind
      const { requestChallenge, arrayBufferToBase64, base64ToArrayBuffer } = await import('@/services/passkey');
      
      // 1. Request authentication challenge
      const { challenge, rpId } = await requestChallenge('authenticate');
      
      // 2. Authenticate with Passkey
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: base64ToArrayBuffer(challenge),
          rpId: rpId,
          timeout: 60000,
          userVerification: 'required',
        },
      }) as PublicKeyCredential | null;

      if (!credential || !credential.response) {
        alert('Passkey verification cancelled');
        return;
      }

      const response = credential.response as AuthenticatorAssertionResponse;
      
      // 3. Verify with backend
      const { verifyPasskey } = await import('@/services/passkey');
      const verifyResult = await verifyPasskey(challenge, {
        id: arrayBufferToBase64(credential.rawId), // Use rawId, not credential.id
        rawId: arrayBufferToBase64(credential.rawId),
        response: {
          clientDataJSON: arrayBufferToBase64(response.clientDataJSON),
          authenticatorData: arrayBufferToBase64(response.authenticatorData),
          signature: arrayBufferToBase64(response.signature),
          userHandle: response.userHandle ? arrayBufferToBase64(response.userHandle) : undefined,
        },
        type: credential.type,
      });

      if (!verifyResult.success) {
        alert('Passkey verification failed');
        return;
      }

      // Success - unbind the card
      if (confirm('Are you sure you want to unbind this card?')) {
        const updatedCards = boundCards.filter(card => card.uid !== uid);
        setBoundCards(updatedCards);
        saveCards(updatedCards);
        setFlippedCard(null);
      }
    } catch (error) {
      console.error('Passkey verification error:', error);
      alert('Failed to verify Passkey: ' + (error as Error).message);
    }
  };

  // Add New Card functions
  const openAddCardModal = () => {
    // Check NFC support first
    if (!isNFCSupported()) {
      alert('NFC is not supported on this device. Please use an Android device with Chrome browser.');
      return;
    }
    
    setShowAddCardModal(true);
    setAddCardStep('nfc');
    setClosingModal(false);
    setNfcError('');
  };

  const closeAddCardModal = () => {
    setClosingModal(true);
    setTimeout(() => {
      setShowAddCardModal(false);
      setClosingModal(false);
      setAddCardStep('nfc');
      setScannedCardUID('');
      setNfcError('');
    }, 300);
  };

  const handleNfcScan = async () => {
    setAddCardStep('scanning');
    setNfcError('');
    
    try {
      // Real NFC scan
      const cardData = await readNFCCard();
      console.log('[Cards] NFC card read:', cardData);
      
      // Check if card already bound
      const alreadyBound = boundCards.some(card => card.uid === cardData.uid);
      if (alreadyBound) {
        setNfcError('This card is already bound to your account');
        setAddCardStep('nfc');
        return;
      }
      
      // Success - move to passkey verification
      setScannedCardUID(cardData.uid);
      setAddCardStep('passkey');
    } catch (error) {
      console.error('[Cards] NFC scan error:', error);
      setNfcError((error as Error).message || 'Failed to scan card. Please try again.');
      setAddCardStep('nfc');
    }
  };

  const handlePasskeyVerification = async () => {
    try {
      // Real Passkey authentication
      const { requestChallenge, arrayBufferToBase64, base64ToArrayBuffer } = await import('@/services/passkey');
      
      // 1. Request authentication challenge
      const { challenge, rpId } = await requestChallenge('authenticate');
      
      // 2. Authenticate with Passkey
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: base64ToArrayBuffer(challenge),
          rpId: rpId,
          timeout: 60000,
          userVerification: 'required',
        },
      }) as PublicKeyCredential | null;

      if (!credential || !credential.response) {
        alert('Passkey verification cancelled');
        return;
      }

      const response = credential.response as AuthenticatorAssertionResponse;
      
      // 3. Verify with backend
      const { verifyPasskey } = await import('@/services/passkey');
      const verifyResult = await verifyPasskey(challenge, {
        id: arrayBufferToBase64(credential.rawId), // Use rawId, not credential.id
        rawId: arrayBufferToBase64(credential.rawId),
        response: {
          clientDataJSON: arrayBufferToBase64(response.clientDataJSON),
          authenticatorData: arrayBufferToBase64(response.authenticatorData),
          signature: arrayBufferToBase64(response.signature),
          userHandle: response.userHandle ? arrayBufferToBase64(response.userHandle) : undefined,
        },
        type: credential.type,
      });

      if (!verifyResult.success) {
        alert('Passkey verification failed');
        return;
      }

      // Success - generate card details and write to NFC
      const cardNumber = generateCardNumber();
      const cvv = generateCVV();
      
      // Write address and card data to NFC card
      try {
        await writeNFCCard({
          address: address || '',
          cardNumber,
          cvv,
          boundAt: new Date().toISOString(),
        });
        console.log('[Cards] Card data written to NFC successfully');
      } catch (writeError) {
        console.warn('[Cards] Failed to write to NFC card:', writeError);
        // Continue anyway - card still works without data written
      }
      
      // Add card to local state
      const newCard: BonjourCard = {
        uid: scannedCardUID,
        name: `Card ${boundCards.length + 1}`,
        isActive: true,
        boundAt: new Date(),
        cardNumber,
        cvv,
      };
      const updatedCards = [...boundCards, newCard];
      setBoundCards(updatedCards);
      saveCards(updatedCards);
      setAddCardStep('success');
      
      // Close modal after success
      setTimeout(() => {
        closeAddCardModal();
      }, 2000);
    } catch (error) {
      console.error('Passkey verification error:', error);
      alert('Failed to verify Passkey: ' + (error as Error).message);
    }
  };

  if (isCheckingSession) {
    return (
      <div className={`flex items-center justify-center ${isEmbedded ? 'h-full bg-black' : 'min-h-screen bg-black'}`}>
        <div className="h-8 w-8 rounded-full border-2 border-white/15 border-t-white animate-spin" />
      </div>
    );
  }

  const activeCards = boundCards.filter(card => card.isActive).length;
  const isLight = theme === 'light';
  const pageShellClass = isEmbedded
    ? (isLight
        ? 'bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),transparent_36%),linear-gradient(180deg,#f8fbff,#eef4ff)] text-slate-900'
        : 'bg-black text-white')
    : (isLight
        ? 'min-h-screen bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),transparent_36%),linear-gradient(180deg,#f8fbff,#eef4ff)] text-slate-900 pb-24 md:pb-8'
        : 'min-h-screen bg-black text-white pb-24 md:pb-8');
  const headerShellClass = isLight
    ? 'bg-gradient-to-b from-slate-100/90 to-transparent border-b border-slate-200/80 backdrop-blur-xl'
    : 'bg-gradient-to-b from-white/5 to-transparent border-b border-white/5 backdrop-blur-sm';
  const statsShellClass = isLight
    ? 'flex items-center gap-3 bg-white/80 border border-slate-200/80 rounded-xl px-4 py-2 shadow-[0_12px_30px_rgba(148,163,184,0.12)]'
    : 'flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-2';
  const embeddedStatsShellClass = isLight
    ? 'mb-5 flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 shadow-[0_12px_30px_rgba(148,163,184,0.12)]'
    : 'mb-5 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3';
  const addCardShellClass = isLight
    ? 'w-full mx-auto aspect-[1.586/1] rounded-3xl border-2 border-dashed border-slate-300 hover:border-slate-400 hover:bg-white/70 transition-all flex items-center justify-center cursor-pointer group'
    : 'w-full mx-auto aspect-[1.586/1] rounded-3xl border-2 border-dashed border-white/20 hover:border-white/40 hover:bg-white/5 transition-all flex items-center justify-center cursor-pointer group';
  const addCardIconClass = isLight
    ? 'w-16 h-16 rounded-full bg-slate-900/5 group-hover:bg-slate-900/10 flex items-center justify-center mx-auto mb-3 transition-all'
    : 'w-16 h-16 rounded-full bg-white/10 group-hover:bg-white/15 flex items-center justify-center mx-auto mb-3 transition-all';
  const sheetModalClass = isLight
    ? 'relative w-full max-w-2xl bg-[linear-gradient(180deg,#ffffff,#f6f9ff)] border-t border-slate-200/80 rounded-t-3xl'
    : 'relative w-full max-w-2xl bg-black border-t border-white/10 rounded-t-3xl';
  const dialogModalClass = isLight
    ? 'relative bg-[linear-gradient(180deg,#ffffff,#f6f9ff)] border border-slate-200/80 rounded-3xl p-8 max-w-md w-full'
    : 'relative bg-black border border-white/10 rounded-3xl p-8 max-w-md w-full';
  const aboutCardClass = isLight
    ? 'mt-8 bg-white/80 border border-slate-200/80 rounded-3xl p-6 shadow-[0_18px_40px_rgba(148,163,184,0.14)]'
    : 'mt-8 bg-white/5 border border-white/10 rounded-3xl p-6';

  return (
    <div className={pageShellClass}>
      {!isEmbedded && (
        <div className={headerShellClass}>
          <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.back()}
                  className={`${isLight ? 'bg-white/85 hover:bg-white border border-slate-200/80 shadow-sm' : 'bg-white/5 hover:bg-white/10 border border-white/10'} w-10 h-10 rounded-xl flex items-center justify-center transition-all`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <polyline points="15 18 9 12 15 6" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <div>
                  <h1 className="text-xl font-bold text-white">Cards</h1>
                  <p className="text-gray-400 text-xs">Manage your NFC cards</p>
                </div>
              </div>

              <div className={statsShellClass}>
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-400 text-xs">Total</span>
                  <span className="text-white font-bold text-sm">{boundCards.length}</span>
                </div>
                <div className="w-px h-4 bg-white/10"></div>
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-400 text-xs">Active</span>
                  <span className="text-green-400 font-bold text-sm">{activeCards}</span>
                </div>
                <div className="w-px h-4 bg-white/10"></div>
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-400 text-xs">Slots</span>
                  <span className="text-blue-400 font-bold text-sm">{5 - boundCards.length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className={`max-w-2xl mx-auto px-4 ${isEmbedded ? 'py-5' : 'py-6'}`}>
        {isEmbedded && (
          <div className={embeddedStatsShellClass}>
            <div className="flex items-center gap-1.5">
              <span className="text-gray-400 text-xs">Total</span>
              <span className="text-white font-bold text-sm">{boundCards.length}</span>
            </div>
            <div className="w-px h-4 bg-white/10"></div>
            <div className="flex items-center gap-1.5">
              <span className="text-gray-400 text-xs">Active</span>
              <span className="text-green-400 font-bold text-sm">{activeCards}</span>
            </div>
            <div className="w-px h-4 bg-white/10"></div>
            <div className="flex items-center gap-1.5">
              <span className="text-gray-400 text-xs">Slots</span>
              <span className="text-blue-400 font-bold text-sm">{5 - boundCards.length}</span>
            </div>
          </div>
        )}

        {/* Cards Stack - iOS Wallet Style with 3D Flip */}
        <div className="mb-6">
          {boundCards.map((card) => (
            <div
              key={card.uid}
              className="relative max-w-full mx-auto mb-6"
              style={{ perspective: '1500px' }}
            >
              {/* Card Container with 3D flip effect */}
              <div
                className="relative w-full aspect-[1.586/1] transition-all duration-700 cursor-pointer"
                style={{
                  transformStyle: 'preserve-3d',
                  transform: flippedCard === card.uid ? 'rotateY(180deg)' : 'rotateY(0deg)',
                }}
                onClick={() => toggleCardFlip(card.uid)}
              >
                {/* Card Front */}
                <div
                  className="absolute inset-0 rounded-[2.5rem] overflow-hidden"
                  style={{
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden',
                    background: card.isActive 
                      ? 'linear-gradient(135deg, #D4AF37 0%, #C9A961 25%, #B8944A 50%, #A67C38 75%, #8B6914 100%)'
                      : 'linear-gradient(135deg, rgba(180,160,100,0.3) 0%, rgba(140,120,80,0.2) 100%)',
                    boxShadow: card.isActive 
                      ? `
                        0 2px 4px rgba(0,0,0,0.1),
                        0 4px 8px rgba(0,0,0,0.15),
                        0 8px 16px rgba(0,0,0,0.2),
                        0 16px 32px rgba(0,0,0,0.25),
                        0 32px 64px rgba(0,0,0,0.3),
                        0 0 0 1px rgba(255,255,255,0.1) inset,
                        0 1px 2px rgba(255,255,255,0.4) inset,
                        0 0 0 3px rgba(212,175,55,0.4),
                        0 0 20px rgba(212,175,55,0.2)
                      `
                      : '0 10px 30px rgba(0,0,0,0.3), 0 0 0 2px rgba(255,255,255,0.1)',
                  }}
                >
                  {/* Brushed Metal Texture - Horizontal Lines */}
                  <div 
                    className="absolute inset-0 opacity-40 pointer-events-none"
                    style={{
                      backgroundImage: `
                        repeating-linear-gradient(
                          0deg,
                          rgba(255,255,255,0.05) 0px,
                          rgba(255,255,255,0.15) 1px,
                          rgba(0,0,0,0.05) 2px,
                          rgba(0,0,0,0.1) 3px,
                          rgba(255,255,255,0.05) 4px
                        )
                      `,
                    }}
                  ></div>
                  
                  {/* Premium metallic texture overlay */}
                  <div className="absolute inset-0 opacity-40 pointer-events-none" style={{
                    backgroundImage: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.4) 0%, transparent 50%), radial-gradient(circle at 70% 70%, rgba(255,255,255,0.2) 0%, transparent 50%)',
                  }}></div>
                  
                  {/* Animated shimmer effect for active cards */}
                  {card.isActive && (
                    <div 
                      className="absolute inset-0 opacity-20 pointer-events-none"
                      style={{
                        background: 'linear-gradient(110deg, transparent 40%, rgba(255,255,255,0.6) 50%, transparent 60%)',
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 4s ease-in-out infinite',
                      }}
                    ></div>
                  )}

                  {/* Inner Card Content with padding */}
                  <div className="relative h-full p-8 flex flex-col">
                    {/* Card Top - Chip & Status */}
                    <div className="flex items-start justify-between mb-auto">
                      {/* Premium EMV Chip */}
                      <div className={`relative w-14 h-11 rounded-lg overflow-hidden transition-all ${
                        card.isActive 
                          ? 'shadow-[0_4px_12px_rgba(139,105,20,0.6)]' 
                          : ''
                      }`}
                        style={{
                          background: card.isActive 
                            ? 'linear-gradient(135deg, #E5C76B 0%, #C9A961 50%, #8B6914 100%)'
                            : 'rgba(180,160,100,0.3)',
                        }}
                      >
                        {/* Chip contact grid */}
                        <div className="absolute inset-[3px] grid grid-cols-4 grid-rows-3 gap-[0.5px] rounded-md overflow-hidden bg-black/20">
                          {[...Array(12)].map((_, i) => (
                            <div key={i} className={card.isActive ? 'bg-amber-900/60' : 'bg-black/20'}></div>
                          ))}
                        </div>
                        {/* Chip metallic shine */}
                        <div className="absolute inset-0 bg-gradient-to-br from-white/50 via-transparent to-black/20"></div>
                      </div>
                      
                      {/* λ Pay Logo */}
                      <div className="flex items-center gap-2">
                        <span className="lambda-gradient text-2xl font-bold">λ</span>
                        <span className={`text-base font-extrabold tracking-tight ${card.isActive ? 'text-black' : 'text-white/50'}`} style={{ textShadow: card.isActive ? '0 2px 3px rgba(255,255,255,0.4)' : 'none' }}>
                          Pay
                        </span>
                      </div>
                    </div>

                    {/* Card Bottom - Premium Typography */}
                    <div className="relative mt-auto space-y-3">
                      <div className={`text-lg sm:text-xl font-bold tracking-tight ${card.isActive ? 'text-black/80' : 'text-white/50'}`} style={{ textShadow: card.isActive ? '0 1px 2px rgba(255,255,255,0.3)' : '0 1px 2px rgba(0,0,0,0.4)' }}>
                        {card.name}
                      </div>
                      <div className="flex items-end justify-between pt-1">
                        <div className={`text-sm sm:text-base font-bold tracking-[0.1em] ${card.isActive ? 'text-black/80' : 'text-white/40'}`} style={{ textShadow: card.isActive ? '0 1px 2px rgba(255,255,255,0.3)' : '0 1px 2px rgba(0,0,0,0.4)' }}>
                          {card.cardNumber}
                        </div>
                        <div className={`text-xs sm:text-sm font-bold ${card.isActive ? 'text-black/60' : 'text-white/30'}`} style={{ textShadow: card.isActive ? '0 1px 1px rgba(255,255,255,0.3)' : '0 1px 2px rgba(0,0,0,0.3)' }}>
                          {card.boundAt.toLocaleDateString('en-US', { month: '2-digit', year: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Subtle gradient shine from top */}
                  <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-white/[0.15] via-transparent to-transparent pointer-events-none"></div>
                  
                  {/* Tap to manage hint */}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                    <div className={`text-xs font-bold tracking-wide flex items-center gap-2 ${card.isActive ? 'text-black/50' : 'text-white/60'}`} style={{ textShadow: card.isActive ? '0 1px 1px rgba(255,255,255,0.3)' : '0 1px 2px rgba(0,0,0,0.5)' }}>
                      <span>Tap to manage</span>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Card Back - Management Options */}
                <div
                  className="absolute inset-0 rounded-[2.5rem] overflow-hidden"
                  style={{
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                    background: 'linear-gradient(135deg, #D4AF37 0%, #C9A961 25%, #B8944A 50%, #A67C38 75%, #8B6914 100%)',
                    boxShadow: `
                      0 2px 4px rgba(0,0,0,0.1),
                      0 4px 8px rgba(0,0,0,0.15),
                      0 8px 16px rgba(0,0,0,0.2),
                      0 16px 32px rgba(0,0,0,0.25),
                      0 32px 64px rgba(0,0,0,0.3),
                      0 0 0 1px rgba(255,255,255,0.1) inset,
                      0 1px 2px rgba(255,255,255,0.4) inset,
                      0 0 0 3px rgba(212,175,55,0.4),
                      0 0 20px rgba(212,175,55,0.2)
                    `,
                  }}
                >
                  {/* Brushed Metal Texture - Horizontal Lines */}
                  <div 
                    className="absolute inset-0 opacity-40 pointer-events-none"
                    style={{
                      backgroundImage: `
                        repeating-linear-gradient(
                          0deg,
                          rgba(255,255,255,0.05) 0px,
                          rgba(255,255,255,0.15) 1px,
                          rgba(0,0,0,0.05) 2px,
                          rgba(0,0,0,0.1) 3px,
                          rgba(255,255,255,0.05) 4px
                        )
                      `,
                    }}
                  ></div>
                  
                  {/* Premium metallic texture overlay */}
                  <div className="absolute inset-0 opacity-30 pointer-events-none" style={{
                    backgroundImage: 'radial-gradient(circle at 70% 30%, rgba(255,255,255,0.4) 0%, transparent 50%), radial-gradient(circle at 30% 70%, rgba(255,255,255,0.2) 0%, transparent 50%)',
                  }}></div>

                  <div className="relative h-full p-6 sm:p-8 flex flex-col items-center justify-center">
                    {/* CVV Section at top */}
                    <div className="absolute top-4 sm:top-6 right-4 sm:right-6">
                      <div className="text-right">
                        <p className="text-[9px] sm:text-[10px] font-bold tracking-wider text-black/50 mb-1" style={{ textShadow: '0 1px 1px rgba(255,255,255,0.3)' }}>CVV</p>
                        <div className="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg bg-black/20 border border-black/30">
                          <p className="text-xs sm:text-sm font-bold text-black" style={{ textShadow: '0 1px 1px rgba(255,255,255,0.3)' }}>{card.cvv}</p>
                        </div>
                      </div>
                    </div>

                    {/* Management Buttons - Circular in a Row */}
                    <div className="flex items-center justify-center gap-4 sm:gap-6 md:gap-8">
                      {/* Address Button */}
                      <div className="flex flex-col items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleShowAddress();
                          }}
                          className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full bg-black/20 hover:bg-black/30 border-2 border-black/40 text-black transition-all shadow-lg backdrop-blur-sm flex items-center justify-center"
                          title="Address"
                        >
                          <svg className="w-6 h-6 sm:w-7 sm:h-7 md:w-9 md:h-9" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                          </svg>
                        </button>
                        <span className="text-black font-bold text-[11px] sm:text-xs md:text-sm" style={{ textShadow: '0 1px 1px rgba(255,255,255,0.5)' }}>Address</span>
                      </div>

                      {/* Freeze/Unfreeze Button */}
                      <div className="flex flex-col items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFreeze(card.uid);
                          }}
                          className={`w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full transition-all shadow-lg backdrop-blur-sm flex items-center justify-center ${
                            card.isActive
                              ? 'bg-blue-900/30 hover:bg-blue-900/40 border-2 border-blue-900/50 text-blue-950'
                              : 'bg-green-900/30 hover:bg-green-900/40 border-2 border-green-900/50 text-green-950'
                          }`}
                          title={card.isActive ? 'Freeze Card' : 'Unfreeze Card'}
                        >
                          <svg className="w-6 h-6 sm:w-7 sm:h-7 md:w-9 md:h-9" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                            {card.isActive ? (
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                            )}
                          </svg>
                        </button>
                        <span className={`font-bold text-[11px] sm:text-xs md:text-sm ${card.isActive ? 'text-blue-950' : 'text-green-950'}`} style={{ textShadow: '0 1px 1px rgba(255,255,255,0.5)' }}>
                          {card.isActive ? 'Freeze' : 'Unfreeze'}
                        </span>
                      </div>

                      {/* Unbind Button */}
                      <div className="flex flex-col items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUnbind(card.uid);
                          }}
                          className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full bg-red-900/30 hover:bg-red-900/40 border-2 border-red-900/50 text-red-950 transition-all shadow-lg backdrop-blur-sm flex items-center justify-center"
                          title="Unbind Card"
                        >
                          <svg className="w-6 h-6 sm:w-7 sm:h-7 md:w-9 md:h-9" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        </button>
                        <span className="text-red-950 font-bold text-[11px] sm:text-xs md:text-sm" style={{ textShadow: '0 1px 1px rgba(255,255,255,0.5)' }}>Unbind</span>
                      </div>
                    </div>

                    {/* Back hint */}
                    <div className="mt-8 sm:mt-12 text-black/50 text-xs font-bold tracking-wide flex items-center gap-2" style={{ textShadow: '0 1px 1px rgba(255,255,255,0.5)' }}>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                      </svg>
                      <span>Tap to flip back</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Add New Card */}
        {boundCards.length < 5 && (
          <div 
            className={addCardShellClass}
            onClick={openAddCardModal}
          >
            <div className="text-center">
              <div className={addCardIconClass}>
                <svg className="w-8 h-8 text-gray-400 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <p className="text-white font-semibold mb-1">Add New Card</p>
              <p className="text-gray-400 text-sm">{5 - boundCards.length} slots remaining</p>
            </div>
          </div>
        )}

        {/* Add New Card Modal */}
        {showAddCardModal && (
          <div 
            className="fixed inset-0 z-50 flex items-end justify-center"
            onClick={closeAddCardModal}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
            
            {/* Modal Content */}
            <div 
              className={`${sheetModalClass} ${
                closingModal ? 'animate-slide-down' : 'animate-slide-up'
              }`}
              onClick={(e) => e.stopPropagation()}
              style={{
                boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
              }}
            >
              {/* Handle Bar */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 bg-white/20 rounded-full"></div>
              </div>

              {/* Modal Body */}
              <div className="px-6 pb-8">
                {/* Step 1: NFC Prompt */}
                {addCardStep === 'nfc' && (
                  <div className="text-center py-4">
                    {/* Title */}
                    <div className="mb-6">
                      <h2 className="text-2xl font-bold text-white mb-2">Add New Card</h2>
                      <p className="text-gray-400 text-sm">
                        {nfcError ? (
                          <span className="text-red-400">{nfcError}</span>
                        ) : (
                          'Tap your card to begin binding'
                        )}
                      </p>
                    </div>

                    {/* NFC Icon Container */}
                    <div className="relative w-40 h-40 mx-auto mb-8">
                      {/* Outer Ring */}
                      <div className="absolute inset-0 rounded-full bg-white/5 border border-white/10"></div>
                      {/* Icon */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <svg className="w-20 h-20 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21.192 2.808a13 13 0 010 18.384" />
                        </svg>
                      </div>
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={handleNfcScan}
                      className="w-full py-3.5 px-6 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white font-semibold text-base transition-all"
                    >
                      Tap Card Now
                    </button>
                  </div>
                )}

                {/* Step 2: NFC Scanning */}
                {addCardStep === 'scanning' && (
                  <div className="text-center py-4">
                    {/* Title */}
                    <div className="mb-6">
                      <h2 className="text-2xl font-bold text-white mb-2">Scanning...</h2>
                      <p className="text-gray-400 text-sm">Please hold your card steady</p>
                    </div>

                    {/* Scanning Animation */}
                    <div className="relative w-40 h-40 mx-auto mb-8">
                      {/* Base Circle */}
                      <div className="absolute inset-0 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                        <svg className="w-20 h-20 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21.192 2.808a13 13 0 010 18.384" />
                        </svg>
                      </div>
                      {/* Pulsing Rings */}
                      <div className="absolute inset-0 rounded-full border-2 border-white/20 animate-ping"></div>
                      <div className="absolute inset-[-10px] rounded-full border border-white/10 animate-pulse"></div>
                    </div>

                    {/* Progress Bar */}
                    <div className="max-w-xs mx-auto">
                      <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-white/40 rounded-full animate-pulse" style={{ width: '60%' }}></div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 3: Passkey Verification */}
                {addCardStep === 'passkey' && (
                  <div className="text-center py-4">
                    {/* Title */}
                    <div className="mb-6">
                      <h2 className="text-2xl font-bold text-white mb-2">Card Detected</h2>
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 mb-2">
                        <span className="text-gray-400 text-xs">UID:</span>
                        <span className="text-white font-mono text-sm">{scannedCardUID}</span>
                      </div>
                      <p className="text-gray-400 text-sm">Verify with Passkey to complete binding</p>
                    </div>

                    {/* Fingerprint Icon Container */}
                    <div className="relative w-40 h-40 mx-auto mb-8">
                      {/* Outer Ring */}
                      <div className="absolute inset-0 rounded-full bg-white/5 border border-white/10"></div>
                      {/* Icon */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <svg className="w-20 h-20 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a7.464 7.464 0 01-1.15 3.993m1.989 3.559A11.209 11.209 0 008.25 10.5a3.75 3.75 0 117.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 01-3.6 9.75m6.633-4.596a18.666 18.666 0 01-2.485 5.33" />
                        </svg>
                      </div>
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={handlePasskeyVerification}
                      className="w-full py-3.5 px-6 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white font-semibold text-base transition-all"
                    >
                      Verify with Passkey
                    </button>
                  </div>
                )}

                {/* Step 4: Success */}
                {addCardStep === 'success' && (
                  <div className="text-center py-4">
                    {/* Title */}
                    <div className="mb-6">
                      <h2 className="text-2xl font-bold text-white mb-2">Card Bound Successfully!</h2>
                      <p className="text-gray-400 text-sm">Your Bonjour Card is now active</p>
                    </div>

                    {/* Success Icon Container */}
                    <div className="relative w-40 h-40 mx-auto mb-8">
                      {/* Outer Ring with green accent */}
                      <div className="absolute inset-0 rounded-full bg-green-500/10 border border-green-500/30"></div>
                      {/* Icon */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <svg className="w-20 h-20 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    </div>

                    {/* Card Info */}
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10">
                      <span className="text-gray-400 text-xs">Card UID:</span>
                      <span className="text-white font-mono text-sm">{scannedCardUID}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* QR Code Modal */}
        {showQRModal && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setShowQRModal(false)}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
            
            {/* Modal Content */}
            <div 
              className={dialogModalClass}
              onClick={(e) => e.stopPropagation()}
              style={{
                boxShadow: isLight ? '0 20px 60px rgba(148,163,184,0.24)' : '0 20px 60px rgba(0,0,0,0.5)',
              }}
            >
              {/* Close Button */}
              <button
                onClick={() => setShowQRModal(false)}
                className="absolute top-4 right-4 p-2 rounded-xl hover:bg-white/10 transition-all"
              >
                <svg className="w-5 h-5 text-white/60 hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Title */}
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-white mb-2">Wallet Address</h2>
                <p className="text-gray-400 text-sm">Scan to receive funds</p>
              </div>

              {/* QR Code Container */}
              <div className="bg-white p-6 rounded-2xl mb-6 flex items-center justify-center">
                {address && (
                  <QRCodeSVG
                    value={address}
                    size={240}
                    level="H"
                    bgColor="#FFFFFF"
                    fgColor="#000000"
                    includeMargin={false}
                  />
                )}
              </div>

              {/* Address Display */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4">
                <p className="text-gray-400 text-xs mb-2">Address</p>
                <p className="text-white font-mono text-sm break-all">{address}</p>
              </div>

              {/* Copy Button */}
              <button
                onClick={handleCopy}
                className="w-full py-3.5 px-6 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white font-semibold text-base transition-all flex items-center justify-center gap-2"
              >
                {copied ? (
                  <>
                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>Copy Address</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* About Cards */}
        <div className={aboutCardClass}>
          <h3 className="text-lg font-bold text-white mb-3">About Cards</h3>
          <p className="text-gray-400 text-sm leading-relaxed mb-4">
            NFC-enabled cards that can be bound to your Monad wallet. 
            Each card acts as a physical key to access your funds quickly and securely.
          </p>
          <ul className="space-y-2 text-sm text-gray-400">
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Bind up to 5 cards per wallet</span>
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Freeze or unfreeze cards anytime</span>
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Unbind cards to free up slots</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
