import { useState } from 'react';
import { renderShareCard, shareFileName, type ShareSize } from '../lib/shareCard';
import type { PublicSeat } from '../lib/types';
import { Button, Notice } from './ui';
import { Sheet } from './Sheet';
import { GoldButton } from './theme';

/**
 * Buat gambar share card (PNG) lalu bagikan / unduh.
 * Pakai Web Share API kalau tersedia (HP), selain itu unduh file.
 */
export function ShareCardButton({ seat }: { seat: PublicSeat }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ShareSize | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; size: ShareSize } | null>(null);

  const make = async (size: ShareSize) => {
    setBusy(size);
    setError(null);
    try {
      const blob = await renderShareCard(seat, size);
      const file = new File([blob], shareFileName(seat, size), { type: 'image/png' });
      // tampilkan pratinjau supaya user tahu hasilnya
      setPreview((p) => {
        if (p) URL.revokeObjectURL(p.url);
        return { url: URL.createObjectURL(blob), size };
      });

      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'Seat aku di sini' });
          return;
        } catch (e) {
          if ((e as DOMException)?.name === 'AbortError') return;
        }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch {
      setError('Gagal membuat gambar. Coba lagi ya.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <GoldButton size="lg" onClick={() => setOpen(true)}>
        🖼️ Bikin share card
      </GoldButton>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Share card seat kamu"
        actions={
          <Button variant="secondary" onClick={() => setOpen(false)} data-autofocus>
            Tutup
          </Button>
        }
      >
        <p className="text-sm text-ink-soft">
          Gambar dibuat di HP kamu sendiri (bukan pakai aset resmi), jadi aman dibagikan.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button onClick={() => void make('story')} loading={busy === 'story'}>
            IG Story 1080×1920
          </Button>
          <Button onClick={() => void make('square')} loading={busy === 'square'}>
            Postingan 1080×1080
          </Button>
        </div>
        {error && (
          <div className="mt-3">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
        {preview && (
          <figure className="mt-4">
            <img
              src={preview.url}
              alt={`Pratinjau share card ${preview.size === 'story' ? '1080x1920' : '1080x1080'}`}
              className="mx-auto max-h-72 w-auto rounded-2xl border-2 border-white shadow-lift"
            />
            <figcaption className="mt-2 text-center text-xs text-ink-soft">
              Kalau belum tersimpan, tekan lama gambar ini untuk menyimpannya.
            </figcaption>
          </figure>
        )}
      </Sheet>
    </>
  );
}
