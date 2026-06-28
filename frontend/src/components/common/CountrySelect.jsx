import React, { useEffect, useRef, useState } from 'react';
import { RiSearchLine, RiArrowDownSLine, RiCheckLine } from 'react-icons/ri';
import { COUNTRIES } from '../../config/kycRequirements';

/**
 * Searchable country selector for the Open Account flow.
 * Self-contained (no extra deps): a trigger button that opens a panel with a
 * search input and a filtered list. Selecting a country calls
 * `onChange(code, name)`.
 *
 * Props:
 *   value      → selected country code (e.g. 'IN')
 *   onChange   → (code, name) => void
 *   options    → optional list override (defaults to COUNTRIES)
 *   error      → optional error string shown under the control
 */
export default function CountrySelect({ value, onChange, options = COUNTRIES, error }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);
  const searchRef = useRef(null);

  const selected = options.find((c) => c.code === value) || null;

  // Close on outside click.
  useEffect(() => {
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Focus the search box when the panel opens.
  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
  }, [open]);

  const filtered = options.filter((c) =>
    c.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  const choose = (c) => {
    onChange?.(c.code, c.name);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`input-field flex items-center justify-between w-full text-left ${error ? '!border-brand-500 focus:!border-brand-500' : ''}`}
      >
        <span className="flex items-center gap-2">
          {selected ? (
            <>
              <span className="text-lg leading-none">{selected.flag}</span>
              <span className="text-white">{selected.name}</span>
            </>
          ) : (
            <span className="text-dark-300">Select your country</span>
          )}
        </span>
        <RiArrowDownSLine className={`text-dark-300 text-lg transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="absolute z-30 mt-2 w-full rounded-xl overflow-hidden shadow-2xl"
          style={{ background: '#14151a', border: '1px solid rgba(255,255,255,0.12)' }}
        >
          <div className="p-2 border-b border-white/[0.07]">
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <RiSearchLine className="text-dark-300" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search country…"
                className="bg-transparent outline-none text-sm text-white w-full placeholder:text-dark-400"
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-sm text-dark-300">No country found.</p>
            ) : (
              filtered.map((c) => {
                const isSel = c.code === value;
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => choose(c)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-white/[0.06] transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="text-lg leading-none">{c.flag}</span>
                      <span className="text-sm text-white">{c.name}</span>
                    </span>
                    {isSel && <RiCheckLine className="text-green-400" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {error && <p className="text-brand-400 text-[11px] mt-1">{error}</p>}
    </div>
  );
}
