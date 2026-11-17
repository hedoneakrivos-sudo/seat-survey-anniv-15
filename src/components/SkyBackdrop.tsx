/**
 * Awan lembut yang bergerak pelan di belakang konten, plus bintang
 * untuk dark mode. Murni dekoratif (aria-hidden), dan animasi
 * otomatis berhenti kalau prefers-reduced-motion aktif (lihat index.css).
 */
export function SkyBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      {/* bintang: hanya tampil di dark mode */}
      <div className="absolute inset-0 hidden dark:block">
        <svg className="h-full w-full opacity-70" viewBox="0 0 100 100" preserveAspectRatio="none">
          {Array.from({ length: 60 }, (_, i) => {
            // posisi deterministik supaya tidak berubah tiap render
            const x = ((i * 37) % 100) + ((i % 3) * 0.7);
            const y = ((i * 53) % 62) + ((i % 5) * 0.4);
            const r = i % 7 === 0 ? 0.32 : 0.18;
            return <circle key={i} cx={x} cy={y} r={r} fill="#fff" opacity={i % 4 === 0 ? 0.95 : 0.55} />;
          })}
        </svg>
      </div>

      {/* awan */}
      <Cloud className="top-[6%] h-16 w-48 animate-drift opacity-80 dark:opacity-25" />
      <Cloud className="top-[22%] h-24 w-72 animate-drift-slow opacity-70 dark:opacity-20" />
      <Cloud className="top-[46%] h-14 w-40 animate-drift opacity-60 dark:opacity-15" style={{ animationDelay: '-30s' }} />
      <Cloud className="top-[68%] h-20 w-64 animate-drift-slow opacity-50 dark:opacity-10" style={{ animationDelay: '-70s' }} />
    </div>
  );
}

function Cloud({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={`absolute ${className}`} style={style} viewBox="0 0 120 50" fill="white">
      <ellipse cx="38" cy="32" rx="30" ry="16" />
      <ellipse cx="62" cy="24" rx="24" ry="19" />
      <ellipse cx="84" cy="33" rx="24" ry="14" />
      <rect x="14" y="31" width="90" height="14" rx="7" />
    </svg>
  );
}
