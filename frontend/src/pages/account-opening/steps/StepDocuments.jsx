import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { RiUploadCloud2Line, RiCheckLine, RiLoader4Line, RiShieldCheckLine } from 'react-icons/ri';
import api from '../../../services/api';
import toast from 'react-hot-toast';
import { compressImage } from '../../../utils/imageCompress';
import {
  getDocsForCountry, getCountryByCode, applyTransform, formatAadhaar,
} from '../../../config/kycRequirements';

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

function FileUpload({ docKey, onDrop, file, error, optimizing }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => onDrop(docKey, files[0]),
    accept: { 'image/*': [], 'application/pdf': [] },
    maxFiles: 1,
    disabled: optimizing,
  });

  return (
    <>
      <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all text-center
        ${isDragActive ? 'border-brand-500 bg-brand-500/10' : file ? 'border-green-500/50 bg-green-500/5' : error ? 'border-brand-500/60' : 'border-white/[0.08] hover:border-white/20'}`}>
        <input {...getInputProps()} />
        {optimizing ? (
          <div className="flex items-center gap-2 justify-center">
            <RiLoader4Line className="text-brand-400 animate-spin" />
            <p className="text-dark-200 text-xs">Optimizing image…</p>
          </div>
        ) : file ? (
          <div className="flex items-center gap-2 justify-center">
            <div className="w-8 h-8 rounded-full bg-green-500/15 flex items-center justify-center">
              <RiCheckLine className="text-green-400" />
            </div>
            <div className="text-left">
              <p className="text-white text-xs font-medium truncate max-w-[160px]">{file.name}</p>
              <p className="text-dark-300 text-[10px]">{(file.size / 1024).toFixed(0)} KB</p>
            </div>
          </div>
        ) : (
          <>
            <RiUploadCloud2Line className="text-dark-300 text-2xl mx-auto mb-1" />
            <p className="text-dark-300 text-xs">{isDragActive ? 'Drop here' : 'Click or drag to upload'}</p>
            <p className="text-dark-500 text-[10px] mt-0.5">PNG, JPG, PDF • auto-compressed</p>
          </>
        )}
      </div>
      {error && <p className="text-brand-400 text-[11px] mt-1">{error}</p>}
    </>
  );
}

export default function StepDocuments({ form, update, errors = {}, nameLocked = false, setNameLocked }) {
  const countryCode = form.countryCode || 'IN';
  const country = getCountryByCode(countryCode);
  const docs = getDocsForCountry(countryCode);
  const isIndia = countryCode === 'IN';

  // Keep the latest files in a ref so an async compression that finishes after a
  // second file is added still merges against the newest state (race-safe).
  const filesRef = useRef(form.files);
  useEffect(() => { filesRef.current = form.files; }, [form.files]);

  // Per-document "optimizing" flags (shown while we compress the image).
  const [optimizing, setOptimizing] = useState({});

  const setFile = useCallback(async (key, file) => {
    if (!file) return;
    setOptimizing((o) => ({ ...o, [key]: true }));
    let finalFile = file;
    try {
      // Downscale/compress big camera photos so they never exceed the upload
      // limit and submit instantly. Falls back to the original on any error.
      finalFile = await compressImage(file);
    } catch {
      finalFile = file;
    }
    update({ files: { ...filesRef.current, [key]: finalFile } });
    setOptimizing((o) => ({ ...o, [key]: false }));
  }, [update]);

  const [panVerifying, setPanVerifying] = useState(false);
  const [panVerifyMsg, setPanVerifyMsg] = useState('');   // status line under the PAN field
  const [panVerifyOk, setPanVerifyOk] = useState(false);
  const dispatchedPan = useRef('');
  const debounceRef = useRef(null);

  // Generic ID-number change handler — applies the document's configured transform.
  const onIdChange = (idKey, transform) => (e) => {
    update({ [idKey]: applyTransform(transform, e.target.value) });
  };

  // ── PAN name auto-fetch (India only) ────────────────────────────────────────
  // Fires once a clean 10-char PAN pattern is entered AND the country is India.
  useEffect(() => {
    // Only India uses the Cashfree PAN → income-tax name lookup.
    if (!isIndia) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (panVerifyMsg) { setPanVerifyMsg(''); setPanVerifyOk(false); }
      return;
    }

    const pan = (form.panNumber || '').toUpperCase();

    if (!PAN_RE.test(pan)) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (panVerifyMsg) { setPanVerifyMsg(''); setPanVerifyOk(false); }
      return;
    }
    if (pan === dispatchedPan.current) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      dispatchedPan.current = pan;
      setPanVerifying(true);
      setPanVerifyOk(false);
      setPanVerifyMsg('Verifying your identity with income tax registry…');
      try {
        const { data } = await api.post('/kyc/verify-pan', { pan });
        if (pan !== (form.panNumber || '').toUpperCase()) return;
        const result = data?.data || {};
        if (result.verified && result.name) {
          const parts = String(result.name).trim().split(/\s+/);
          const firstName = parts.shift() || '';
          const lastName = parts.join(' ');
          update({ firstName, lastName });
          if (setNameLocked) setNameLocked(true);
          setPanVerifyOk(true);
          setPanVerifyMsg(`Verified: ${result.name}`);
          toast.success('PAN verified — name auto-filled from income tax registry.');
        } else {
          dispatchedPan.current = '';
          if (setNameLocked) setNameLocked(false);
          setPanVerifyOk(false);
          setPanVerifyMsg(result.message || 'This PAN could not be verified. Please re-check the number.');
        }
      } catch (err) {
        if (pan === (form.panNumber || '').toUpperCase()) dispatchedPan.current = '';
        if (setNameLocked) setNameLocked(false);
        setPanVerifyOk(false);
        setPanVerifyMsg(
          err?.response?.data?.message
          || 'Identity verification is temporarily unavailable. Please try again shortly.'
        );
      } finally {
        setPanVerifying(false);
      }
    }, 600);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.panNumber, isIndia]);

  return (
    <div className="relative">
      {/* Sleek verification overlay — covers the form while Cashfree responds. */}
      {panVerifying && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl bg-dark-900/80 backdrop-blur-sm">
          <div className="relative flex items-center justify-center mb-4">
            <span className="absolute inline-flex h-14 w-14 rounded-full bg-brand-500/30 animate-ping" />
            <RiLoader4Line className="text-brand-400 text-4xl animate-spin" />
          </div>
          <p className="text-white text-sm font-medium">Verifying your identity with income tax registry…</p>
          <p className="text-dark-300 text-[11px] mt-1">Securely matching your PAN with Cashfree Secure ID</p>
        </div>
      )}

      <h3 className="font-display text-xl font-700 text-white mb-1">KYC Documents</h3>
      <p className="text-dark-300 text-sm mb-1">Upload clear, legible copies of your documents. Files are encrypted and stored securely.</p>
      <p className="text-dark-400 text-xs mb-6 flex items-center gap-1.5">
        <span className="text-base leading-none">{country.flag}</span>
        Showing the documents required to open an account in <span className="text-white font-medium">{country.name}</span>.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {docs.map((d) => {
          const { key, idKey, label, placeholder, required, format, transform, maxLength } = d;
          const isPan = isIndia && key === 'pan';
          const displayValue = format === 'aadhaar'
            ? formatAadhaar(form[idKey] || '')
            : (idKey ? (form[idKey] || '') : '');

          return (
            <div key={key}>
              <label className="form-label">{label} {required && <span className="text-brand-400">*</span>}</label>
              {idKey && (
                <>
                  <input
                    className={`input-field mb-1 ${errors[idKey] ? '!border-brand-500 focus:!border-brand-500' : ''} ${isPan && (panVerifying || panVerifyOk) ? 'opacity-70 cursor-not-allowed' : ''}`}
                    value={displayValue}
                    onChange={onIdChange(idKey, transform)}
                    placeholder={placeholder}
                    inputMode={transform === 'digits' || transform === 'digits12' ? 'numeric' : 'text'}
                    maxLength={format === 'aadhaar' ? 14 : maxLength}
                    autoCapitalize={isPan ? 'characters' : undefined}
                    style={transform === 'pan' || transform === 'upper' ? { textTransform: 'uppercase' } : undefined}
                    disabled={isPan && panVerifying}
                    readOnly={isPan && panVerifyOk}
                  />
                  {errors[idKey] && <p className="text-brand-400 text-[11px] mb-1">{errors[idKey]}</p>}

                  {/* PAN verification status line (India only) */}
                  {isPan && panVerifyMsg && (
                    <p className={`text-[11px] mb-1 flex items-center gap-1.5 ${panVerifyOk ? 'text-green-400' : panVerifying ? 'text-brand-300' : 'text-amber-300'}`}>
                      {panVerifying
                        ? <RiLoader4Line className="animate-spin" />
                        : panVerifyOk ? <RiShieldCheckLine /> : <span>ℹ</span>}
                      <span>{panVerifyMsg}</span>
                    </p>
                  )}
                </>
              )}
              <FileUpload
                docKey={key}
                onDrop={setFile}
                file={form.files?.[key]}
                error={errors[`file_${key}`]}
                optimizing={!!optimizing[key]}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-4 p-3 rounded-xl bg-dark-700/50 border border-white/[0.05] text-xs text-dark-300">
        🔒 Your documents are encrypted using AES-256. They will only be accessed by verified Alister Bank KYC officers.
      </div>
    </div>
  );
}
