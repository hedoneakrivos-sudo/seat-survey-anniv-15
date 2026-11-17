import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { SEAT_LAYOUT } from '../config/seatLayout';
import { getCategory } from '../lib/layout';
import {
  NICK_MAX,
  STEP_FIELDS,
  errorsForStep,
  normCode,
  validate,
  type Errors,
  type FieldKey,
  type SeatFormValues,
} from '../lib/validation';
import { useDuplicateCheck, seatKeyString } from '../hooks/useDuplicateCheck';
import { useIsDesktop } from '../hooks/useMediaQuery';
import { Button, Field, Input, Notice, Select, cx, describedBy } from './ui';
import { Sheet } from './Sheet';

interface Props {
  initial: SeatFormValues;
  /**
   * Perubahan dari luar form (klik zona/kursi di denah). Setiap objek baru
   * diterapkan sekali. Ganti CAT akan mengosongkan gate yang tidak valid.
   */
  patch?: { seq: number; values: Partial<SeatFormValues> } | null;
  /** id entri saat edit, supaya cek duplikat tidak menghitung diri sendiri */
  selfId?: string;
  submitLabel: string;
  onSubmit: (v: SeatFormValues, forceDuplicate: boolean) => Promise<'ok' | 'seat_taken'>;
  onChange?: (v: SeatFormValues) => void;
  serverError?: string | null;
}

const STEP_TITLES = ['Lokasi seat', 'Tentang kamu', 'Tukar & kontak'];

export function SeatForm({ initial, patch, selfId, submitLabel, onSubmit, onChange, serverError }: Props) {
  const isDesktop = useIsDesktop();
  const [v, setV] = useState<SeatFormValues>(initial);
  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [showAllErrors, setShowAllErrors] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [ackKey, setAckKey] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  /** true kalau modal duplikat dibuka dari tombol kirim (bukan auto-detect) */
  const pendingSubmit = useRef(false);
  /** server menolak karena seat keburu diisi orang lain */
  const [raceTaken, setRaceTaken] = useState(false);

  const layout = getCategory(v.category);
  const { errors, warnings } = useMemo(() => validate(v), [v]);
  const dup = useDuplicateCheck(v, selfId);
  const currentKey = seatKeyString(v);

  useEffect(() => onChange?.(v), [v, onChange]);

  // terapkan perubahan dari denah (sinkron dua arah)
  const lastPatch = useRef(0);
  useEffect(() => {
    if (!patch || patch.seq === lastPatch.current) return;
    lastPatch.current = patch.seq;
    setV((p) => {
      const next = { ...p, ...patch.values };
      if (patch.values.category !== undefined && patch.values.category !== p.category) {
        const lay = getCategory(next.category);
        if (lay?.gates.length && !lay.gates.includes(normCode(next.gate))) next.gate = '';
      }
      return next;
    });
    // kalau kursi dipilih dari peta, tandai field seat sebagai sudah disentuh
    if (patch.values.row_label || patch.values.seat_number) {
      setTouched((t) => ({ ...t, row_label: true, seat_number: true }));
    }
  }, [patch]);
  useEffect(() => setRaceTaken(false), [currentKey]);

  // Buka modal begitu seat terdeteksi sudah diisi orang (sekali per seat)
  useEffect(() => {
    if (dup.owner && ackKey !== currentKey) setDupOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dup.owner?.id, currentKey]);

  const set = <K extends FieldKey>(k: K, val: SeatFormValues[K]) => setV((p) => ({ ...p, [k]: val }));
  const blur = (k: FieldKey) => setTouched((t) => ({ ...t, [k]: true }));

  /** Error ditampilkan kalau field sudah disentuh atau user sudah coba lanjut */
  const visibleErr = (k: FieldKey): string | undefined => {
    const stepOf = STEP_FIELDS.findIndex((f) => f.includes(k));
    return touched[k] || showAllErrors.has(stepOf) ? errors[k] : undefined;
  };
  const warn = (k: FieldKey) => (visibleErr(k) ? undefined : warnings[k]);

  const onCategory = (cat: number | null) => {
    setV((p) => {
      const next = getCategory(cat);
      const gate = next && next.gates.length && !next.gates.includes(normCode(p.gate)) ? '' : p.gate;
      return { ...p, category: cat, gate };
    });
  };

  const stepHasErrors = (s: number, e: Errors = errors) => Object.keys(errorsForStep(e, s)).length > 0;

  const focusFirstError = (s: number) => {
    requestAnimationFrame(() => {
      const k = STEP_FIELDS[s].find((f) => errors[f]);
      if (k) document.getElementById(`f-${k}`)?.focus();
    });
  };

  const goNext = () => {
    if (stepHasErrors(step)) {
      setShowAllErrors((s) => new Set(s).add(step));
      focusFirstError(step);
      return;
    }
    setStep((s) => s + 1);
    requestAnimationFrame(() => headingRef.current?.focus());
  };
  const goBack = () => {
    setStep((s) => Math.max(0, s - 1));
    requestAnimationFrame(() => headingRef.current?.focus());
  };

  const doSubmit = async (force: boolean) => {
    setSubmitting(true);
    try {
      const res = await onSubmit(v, force);
      if (res === 'seat_taken') {
        setAckKey(null);
        setRaceTaken(true);
        pendingSubmit.current = true;
        setDupOpen(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!isDesktop && step < 2) return goNext();
    const bad = [0, 1, 2].find((s) => stepHasErrors(s));
    if (bad !== undefined) {
      setShowAllErrors(new Set([0, 1, 2]));
      if (!isDesktop) setStep(bad);
      focusFirstError(bad);
      return;
    }
    if (dup.owner && ackKey !== currentKey) {
      pendingSubmit.current = true;
      setDupOpen(true);
      return;
    }
    void doSubmit(!!dup.owner || (raceTaken && ackKey === currentKey));
  };

  const closeDup = () => {
    pendingSubmit.current = false;
    setDupOpen(false);
  };
  const dupChange = () => {
    closeDup();
    setRaceTaken(false);
    setStep(0);
    requestAnimationFrame(() => document.getElementById('f-seat_number')?.focus());
  };
  const dupKeep = () => {
    const shouldSubmit = pendingSubmit.current;
    setAckKey(currentKey);
    closeDup();
    if (shouldSubmit) void doSubmit(true);
  };

  const showStep = (s: number) => isDesktop || step === s;
  const rowOptions = layout?.rows.map((r) => r.label) ?? [];
  const gateIsSelect = !!layout && layout.gates.length > 0;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* Progress wizard (mobile) */}
      {!isDesktop && (
        <div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <h2 ref={headingRef} tabIndex={-1} className="font-display text-base text-ink outline-none">
              Langkah {step + 1}/3 · {STEP_TITLES[step]}
            </h2>
          </div>
          <ol className="grid grid-cols-3 gap-1.5" aria-hidden>
            {[0, 1, 2].map((s) => (
              <li
                key={s}
                className={cx('h-2 rounded-full', s <= step ? 'bg-gold-400 ring-1 ring-gold-ink/40' : 'bg-white/60 dark:bg-white/15')}
              />
            ))}
          </ol>
        </div>
      )}

      {/* Honeypot: tidak terlihat oleh manusia */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="f-website">Website</label>
        <input
          id="f-website"
          tabIndex={-1}
          autoComplete="off"
          value={v.website}
          onChange={(e) => set('website', e.target.value)}
        />
      </div>

      {/* ---------------- STEP 1 ---------------- */}
      {showStep(0) && (
        <fieldset className="space-y-4">
          {isDesktop && <legend className="mb-3 font-display text-lg text-ink">📍 {STEP_TITLES[0]}</legend>}

          <Field id="f-category" label="Category" required error={visibleErr('category')}>
            <Select
              id="f-category"
              value={v.category ?? ''}
              error={visibleErr('category')}
              aria-describedby={describedBy('f-category', !!visibleErr('category'))}
              onChange={(e) => onCategory(e.target.value ? Number(e.target.value) : null)}
              onBlur={() => blur('category')}
            >
              <option value="">Pilih CAT…</option>
              {SEAT_LAYOUT.map((c) => (
                <option key={c.category} value={c.category}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <Field id="f-gate" label="Gate" required error={visibleErr('gate')}>
              {gateIsSelect ? (
                <Select
                  id="f-gate"
                  value={normCode(v.gate)}
                  error={visibleErr('gate')}
                  warning={warn('gate')}
                  aria-describedby={describedBy('f-gate', !!(visibleErr('gate') || warn('gate')))}
                  onChange={(e) => set('gate', e.target.value)}
                  onBlur={() => blur('gate')}
                >
                  <option value="">—</option>
                  {layout!.gates.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                  {/* nilai lama (mis. dari data edit) yang tak ada di config tetap tampil */}
                  {v.gate && !layout!.gates.includes(normCode(v.gate)) && (
                    <option value={normCode(v.gate)}>{normCode(v.gate)}</option>
                  )}
                </Select>
              ) : (
                <Input
                  id="f-gate"
                  value={v.gate}
                  placeholder={layout ? 'mis. 3' : '—'}
                  autoCapitalize="characters"
                  autoComplete="off"
                  maxLength={10}
                  error={visibleErr('gate')}
                  warning={warn('gate')}
                  aria-describedby={describedBy('f-gate', !!(visibleErr('gate') || warn('gate')))}
                  onChange={(e) => set('gate', e.target.value)}
                  onBlur={() => {
                    set('gate', normCode(v.gate));
                    blur('gate');
                  }}
                />
              )}
            </Field>

            <Field id="f-row_label" label="Row" required error={visibleErr('row_label')}>
              <Input
                id="f-row_label"
                value={v.row_label}
                placeholder="C"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={3}
                list={rowOptions.length ? 'row-options' : undefined}
                error={visibleErr('row_label')}
                warning={warn('row_label')}
                aria-describedby={describedBy('f-row_label', !!(visibleErr('row_label') || warn('row_label')))}
                onChange={(e) => set('row_label', e.target.value.toUpperCase())}
                onBlur={() => {
                  set('row_label', normCode(v.row_label));
                  blur('row_label');
                }}
              />
              {rowOptions.length > 0 && (
                <datalist id="row-options">
                  {rowOptions.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              )}
            </Field>

            <Field id="f-seat_number" label="No. Seat" required error={visibleErr('seat_number')}>
              <Input
                id="f-seat_number"
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                min={1}
                step={1}
                placeholder="12"
                value={v.seat_number}
                error={visibleErr('seat_number')}
                warning={warn('seat_number')}
                aria-describedby={describedBy('f-seat_number', !!(visibleErr('seat_number') || warn('seat_number')))}
                onChange={(e) => set('seat_number', e.target.value.replace(/[^\d]/g, ''))}
                onBlur={() => blur('seat_number')}
              />
            </Field>
          </div>

          {/* Pesan layout ditampilkan sekali di bawah 3 kolom supaya muat di layar sempit */}
          {layout && !layout.verified && Object.keys(warnings).length > 0 && (
            <Notice tone="warn">
              <ul className="space-y-1 font-semibold" aria-live="polite">
                {(['gate', 'row_label', 'seat_number'] as const)
                  .filter((k) => warn(k))
                  .map((k) => (
                    <li key={k}>⚠️ {warnings[k]}</li>
                  ))}
              </ul>
              <p className="mt-1.5">
                Data layout {layout.name} masih perkiraan, jadi ini cuma peringatan — kamu tetap bisa kirim kalau yakin
                sesuai tiket.
              </p>
            </Notice>
          )}
          {dup.checking && (
            <p className="text-sm text-ink-soft" aria-live="polite">
              Ngecek seat…
            </p>
          )}
          {dup.owner && ackKey === currentKey && (
            <Notice tone="warn">
              Seat ini sudah diisi <strong>{dup.owner.nickname}</strong>. Entri kamu akan ditandai duplikat.
            </Notice>
          )}
        </fieldset>
      )}

      {/* ---------------- STEP 2 ---------------- */}
      {showStep(1) && (
        <fieldset className="space-y-4">
          {isDesktop && <legend className="mb-3 font-display text-lg text-ink">🙋 {STEP_TITLES[1]}</legend>}
          <Field
            id="f-nickname"
            label="Nickname"
            required
            error={visibleErr('nickname')}
            hint={`${[...v.nickname.trim()].length}/${NICK_MAX} karakter`}
          >
            <Input
              id="f-nickname"
              value={v.nickname}
              maxLength={NICK_MAX + 5}
              autoComplete="nickname"
              placeholder="Nama panggilan kamu"
              error={visibleErr('nickname')}
              aria-describedby="f-nickname-msg"
              onChange={(e) => set('nickname', e.target.value)}
              onBlur={() => blur('nickname')}
            />
          </Field>

          <fieldset aria-describedby={visibleErr('sex') ? 'f-sex-msg' : undefined}>
            <legend className="mb-1.5 block text-sm font-extrabold text-ink">
              Sex <span className="text-red-600 dark:text-red-400" aria-hidden>*</span>
            </legend>
            <div className="grid grid-cols-2 gap-2" role="radiogroup">
              {(
                [
                  ['M', 'Laki-laki'],
                  ['F', 'Perempuan'],
                ] as const
              ).map(([val, label]) => (
                <label
                  key={val}
                  className={cx(
                    'flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full border-2 px-3 py-3 font-extrabold transition',
                    'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold-500',
                    v.sex === val
                      ? 'border-gold-ink bg-gold-400 text-gold-ink shadow-[0_3px_0_0_var(--color-gold-ink)]'
                      : 'border-white bg-white/85 text-ink dark:border-white/15 dark:bg-white/10',
                  )}
                >
                  <input
                    type="radio"
                    name="sex"
                    id={val === 'M' ? 'f-sex' : undefined}
                    value={val}
                    checked={v.sex === val}
                    onChange={() => set('sex', val)}
                    onBlur={() => blur('sex')}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>
            {visibleErr('sex') && (
              <p id="f-sex-msg" role="alert" className="mt-1.5 text-sm text-red-600 dark:text-red-400">
                {visibleErr('sex')}
              </p>
            )}
          </fieldset>
        </fieldset>
      )}

      {/* ---------------- STEP 3 ---------------- */}
      {showStep(2) && (
        <fieldset className="space-y-4">
          {isDesktop && <legend className="mb-3 font-display text-lg text-ink">🔁 {STEP_TITLES[2]}</legend>}

          <label
            htmlFor="f-want_swap"
            className="flex cursor-pointer items-center justify-between gap-4 rounded-3xl border-2 border-white bg-white/85 p-4 dark:border-white/15 dark:bg-white/10"
          >
            <span>
              <span className="block font-display text-lg text-ink">MAU TUKAR</span>
              <span className="block text-sm text-ink-soft">
                Aktifkan kalau kamu bersedia tukar seat
              </span>
            </span>
            <span className="relative inline-flex shrink-0">
              <input
                id="f-want_swap"
                type="checkbox"
                role="switch"
                checked={v.want_swap}
                onChange={(e) => set('want_swap', e.target.checked)}
                className="peer sr-only"
              />
              <span className="h-8 w-14 rounded-full bg-slate-300 transition peer-checked:bg-orange-500 peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gold-500 dark:bg-white/25" />
              <span className="absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow transition peer-checked:translate-x-6" />
            </span>
          </label>

          {v.want_swap && <Notice tone="info">💬 Isi sosmed biar gampang dihubungi.</Notice>}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="f-x_username" label="Username X (opsional)" error={visibleErr('x_username')}>
              <HandleInput
                id="f-x_username"
                value={v.x_username}
                error={visibleErr('x_username')}
                maxLength={16}
                onChange={(val) => set('x_username', val)}
                onBlur={() => blur('x_username')}
              />
            </Field>
            <Field id="f-ig_username" label="Username Instagram (opsional)" error={visibleErr('ig_username')}>
              <HandleInput
                id="f-ig_username"
                value={v.ig_username}
                error={visibleErr('ig_username')}
                maxLength={31}
                onChange={(val) => set('ig_username', val)}
                onBlur={() => blur('ig_username')}
              />
            </Field>
          </div>

          <p className="text-sm text-ink-soft">
            🔓 Nickname dan sosmed yang kamu isi akan tampil publik.
          </p>
        </fieldset>
      )}

      {serverError && <Notice tone="error">{serverError}</Notice>}

      {/* Tombol navigasi */}
      <div
        className={cx(
          'flex gap-2',
          !isDesktop &&
            'sticky bottom-0 z-10 -mx-4 -mb-4 rounded-b-4xl border-t-2 border-white/70 bg-[#eaf6fe] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 dark:border-white/10 dark:bg-[#161d4f]',
        )}
      >
        {!isDesktop && step > 0 && (
          <Button variant="secondary" onClick={goBack} className="flex-1">
            Kembali
          </Button>
        )}
        <Button type="submit" loading={submitting} className="flex-[2] lg:w-full">
          {isDesktop || step === 2 ? submitLabel : 'Lanjut'}
        </Button>
      </div>

      {/* Modal seat duplikat */}
      <Sheet
        open={dupOpen && (!!dup.owner || raceTaken)}
        onClose={closeDup}
        title="Seat ini sudah ada yang isi"
        actions={
          <>
            <Button variant="secondary" onClick={dupKeep}>
              Tetap kirim
            </Button>
            <Button onClick={dupChange} data-autofocus>
              Ubah seat
            </Button>
          </>
        }
      >
        <p>
          Seat CAT {v.category} Gate {normCode(v.gate)} Row {normCode(v.row_label)} No. {Number(v.seat_number)} sudah
          diisi oleh{' '}
          <strong className="text-ink">{dup.owner?.nickname ?? 'orang lain'}</strong>. Yakin seat
          kamu sama?
        </p>
      </Sheet>
    </form>
  );
}

function HandleInput({
  id,
  value,
  error,
  maxLength,
  onChange,
  onBlur,
}: {
  id: string;
  value: string;
  error?: string;
  maxLength: number;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-bold text-slate-500" aria-hidden>
        @
      </span>
      <Input
        id={id}
        value={value}
        maxLength={maxLength}
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        placeholder="username"
        className="pl-7"
        error={error}
        aria-describedby={describedBy(id, !!error)}
        onChange={(e) => onChange(e.target.value.replace(/^@+/, '').replace(/\s/g, ''))}
        onBlur={onBlur}
      />
    </div>
  );
}
