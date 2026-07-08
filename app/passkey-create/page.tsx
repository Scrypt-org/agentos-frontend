'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPrfWallet, PrfUnsupportedError } from '@/wallet/key-management';
import { useWallet } from '@/contexts/WalletContext';

export default function PasskeyCreatePage() {
  const router = useRouter();
  const { unlock } = useWallet();
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }

    if (username.length > 20) {
      setError('Username must be 20 characters or less');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Secure PRF wallet; createPrfWallet returns the derived key directly.
      const result = await createPrfWallet(username);

      const { loadWallet } = await import('@/wallet/keystore');
      const keystore = loadWallet();
      if (!keystore) {
        throw new Error('Failed to load created wallet');
      }

      unlock(result.privateKey, keystore);
      router.replace('/dashboard');
    } catch (err) {
      if (err instanceof PrfUnsupportedError) {
        setError('此设备/浏览器不支持安全钱包（PRF）。请到主页用密码方式创建。');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to create passkey');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <button
        onClick={() => router.back()}
        className="p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-gray-400 hover:text-white"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <div style={styles.animatedBg}></div>

      <div style={styles.content}>
        <div style={styles.card}>
          <div style={styles.header}>
            <div style={styles.icon}>🔐</div>
            <h2 style={styles.title}>Passkey Login</h2>
            <p style={styles.subtitle}>Access the Injective ecosystem</p>
          </div>

          {error && (
            <div style={styles.errorBanner}>
              {error}
            </div>
          )}

          <div style={styles.form}>
            <div style={styles.inputGroup}>
              <label htmlFor="username" style={styles.label}>
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                maxLength={20}
                style={styles.input}
                disabled={loading}
              />
              <small style={styles.hint}>
                Username will be used to identify your pass
              </small>
            </div>

            <button
              onClick={handleCreate}
              disabled={loading || !username.trim()}
              style={{
                ...styles.createBtn,
                opacity: loading || !username.trim() ? 0.5 : 1,
              }}
            >
              {loading ? 'Creating...' : 'Create Cloud-Hosted Pass'}
            </button>


            <button
              onClick={() => router.push('/welcome')}
              disabled={loading}
              className="p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-gray-400 hover:text-white"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div style={styles.poweredBy}>
        <span style={styles.poweredByText}>Powered by</span>
        <span style={styles.poweredByBrand}>Injective</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    minHeight: '100vh',
    backgroundColor: 'var(--bg-color)',
    overflow: 'hidden',
  },
  backBtn: {
    position: 'absolute',
    top: '1.5rem',
    left: '1.5rem',
    padding: '0.5rem 1rem',
    fontSize: '0.875rem',
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--primary-text)',
    cursor: 'pointer',
    zIndex: 10,
  },
  animatedBg: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    background: 'radial-gradient(circle at 30% 50%, rgba(0, 102, 255, 0.1) 0%, transparent 50%)',
    pointerEvents: 'none',
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '2rem',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    backgroundColor: 'var(--card-bg)',
    border: '1px solid var(--card-border)',
    borderRadius: '16px',
    padding: '2.5rem',
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.08)',
  },
  header: {
    textAlign: 'center',
    marginBottom: '2rem',
  },
  icon: {
    fontSize: '3rem',
    marginBottom: '1rem',
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: '700',
    color: 'var(--primary-text)',
    margin: '0 0 0.5rem 0',
  },
  subtitle: {
    fontSize: '0.875rem',
    color: 'var(--secondary-text)',
    margin: 0,
  },
  errorBanner: {
    padding: '1rem',
    marginBottom: '1.5rem',
    backgroundColor: '#FEE',
    border: '1px solid #F88',
    borderRadius: '8px',
    color: '#C00',
    fontSize: '0.875rem',
    textAlign: 'center',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: 'var(--primary-text)',
  },
  input: {
    padding: '0.875rem',
    fontSize: '1rem',
    border: '2px solid var(--surface-border)',
    borderRadius: '8px',
    backgroundColor: 'var(--surface)',
    color: 'var(--primary-text)',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  hint: {
    fontSize: '0.75rem',
    color: 'var(--muted-text)',
  },
  createBtn: {
    padding: '1rem',
    fontSize: '1rem',
    fontWeight: '600',
    backgroundColor: 'var(--accent-color)',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  backButton: {
    padding: '0.875rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    backgroundColor: 'transparent',
    color: 'var(--secondary-text)',
    border: '2px solid var(--surface-border)',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  poweredBy: {
    position: 'absolute',
    bottom: '2rem',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--muted-text)',
  },
  poweredByText: {
    color: 'var(--muted-text)',
  },
  poweredByBrand: {
    fontWeight: '600',
    color: 'var(--primary-text)',
  },
};
