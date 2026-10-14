import { pub } from '../data'

interface Props {
  page: 'landing' | 'live'
  nerd: boolean
  onNerd: () => void
  theme: 'dark' | 'light'
  onToggleTheme: () => void
}

export default function Nav({ page, nerd, onNerd, theme, onToggleTheme }: Props) {
  const isLight = theme === 'light'

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 28px',
        background: isLight ? 'rgba(235, 240, 245, 0.88)' : 'rgba(12, 16, 23, 0.85)',
        backdropFilter: 'blur(16px)',
        borderBottom: 'var(--neu-border)',
        boxShadow: isLight
          ? '0 4px 16px rgba(166, 178, 194, 0.4)'
          : '0 4px 20px rgba(0, 0, 0, 0.5)',
        transition: 'background 0.25s ease, border 0.25s ease',
      }}
    >
      <a href="#/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--text)' }}>
        <img src={pub('mark.svg')} alt="" width={36} height={28} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--amber)' }}>चक्र</span><span>DRISHTI</span>
          </span>
          <span className="mono" style={{ fontSize: 9, color: 'var(--dim)', letterSpacing: 1 }}>
            AUTONOMOUS URBAN RE-ID
          </span>
        </div>
      </a>

      <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <a
          className="btn"
          href="#/"
          style={page === 'landing' ? { borderColor: 'var(--teal)', color: 'var(--teal)' } : undefined}
        >
          Home
        </a>
        <a
          className="btn"
          href="#/live"
          style={page === 'live' ? { borderColor: 'var(--teal)', color: 'var(--teal)' } : undefined}
        >
          <span className="blink" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--rose)' }} />
          Console
        </a>

        {/* Sleek Minimalist Neumorphic Theme Toggle */}
        <button
          className="btn"
          onClick={onToggleTheme}
          aria-label={isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          title={isLight ? 'Switch to Tactical Dark Mode' : 'Switch to Soft Light Mode'}
          style={{
            width: 40,
            height: 40,
            minHeight: 40,
            padding: 0,
            borderRadius: '50%',
            justifyContent: 'center',
            alignItems: 'center',
            fontSize: 18,
            border: 'var(--neu-border)',
            boxShadow: 'var(--neu-shadow-raised-sm)',
            transition: 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              transform: isLight ? 'rotate(0deg) scale(1.05)' : 'rotate(360deg) scale(1)',
              transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
              lineHeight: 1,
            }}
          >
            {isLight ? '☀️' : '🌙'}
          </span>
        </button>

        <button
          className="btn mono"
          onClick={onNerd}
          aria-pressed={nerd}
          aria-label={nerd ? 'Hide technical overview' : 'Under the hood — technical overview'}
          title={nerd ? 'Hide technical overview' : 'Under the hood — models, datasets & metrics'}
          style={{
            fontSize: 13,
            borderColor: nerd ? 'var(--violet)' : undefined,
            color: nerd ? 'var(--violet)' : undefined,
          }}
        >
          {'</>'}
        </button>
      </nav>
    </header>
  )
}
