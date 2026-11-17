/**
 * Latar langit: awan lembut melayang pelan (siang) atau bintang (malam).
 * Murni dekoratif (aria-hidden); animasi berhenti kalau
 * prefers-reduced-motion aktif. Dipotong overflow-hidden + contain
 * supaya tidak melebarkan halaman.
 */
export function SkyBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden [contain:strict]" aria-hidden>
      {/* cahaya: matahari (siang) / bulan (malam) di pojok kanan atas */}
      <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full blur-3xl" style={{ background: 'var(--glow)' }} />

      {/* bintang: hanya terlihat di mode gelap */}
      <svg
        className="absolute inset-0 h-full w-full transition-opacity duration-300"
        style={{ opacity: 'var(--star-opacity)' }}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {Array.from({ length: 70 }, (_, i) => {
          // posisi deterministik supaya tidak berubah tiap render
          const x = ((i * 37) % 100) + (i % 3) * 0.7;
          const y = ((i * 53) % 70) + (i % 5) * 0.4;
          const r = i % 9 === 0 ? 0.3 : 0.16;
          return <circle key={i} cx={x} cy={y} r={r} fill="#fff" opacity={i % 4 === 0 ? 0.9 : 0.5} />;
        })}
      </svg>

      <div className="transition-opacity duration-300" style={{ opacity: 'var(--cloud-opacity)' }}>
        <Cloud className="top-[7%] h-12 w-40 animate-drift opacity-60" />
        <Cloud className="top-[44%] h-16 w-56 animate-drift-slow opacity-35" style={{ animationDelay: '-60s' }} />
        <Cloud className="top-[72%] h-10 w-32 animate-drift opacity-30" style={{ animationDelay: '-35s' }} />
      </div>
    </div>
  );
}

function Cloud({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={`absolute left-0 ${className}`} style={style} viewBox="0 0 120 50" fill="var(--cloud)">
      <ellipse cx="38" cy="32" rx="30" ry="16" />
      <ellipse cx="62" cy="24" rx="24" ry="19" />
      <ellipse cx="84" cy="33" rx="24" ry="14" />
      <rect x="14" y="31" width="90" height="14" rx="7" />
    </svg>
  );
}
