import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { RiUploadCloud2Line, RiCheckLine, RiLoader4Line, RiBuilding2Line, RiShieldCheckLine } from 'react-icons/ri';
import toast from 'react-hot-toast';
import { compressImage } from '../../../utils/imageCompress';
import { verifyPanCached, getCachedPanResult } from '../../../utils/panVerifyCache';

// ── Business entity types recognised for Indian current accounts ─────────────
export const BUSINESS_TYPES = [
  { value: 'sole_proprietorship', label: 'Sole Proprietorship' },
  { value: 'partnership',         label: 'Partnership Firm' },
  { value: 'llp',                 label: 'Limited Liability Partnership (LLP)' },
  { value: 'private_limited',     label: 'Private Limited Company' },
  { value: 'public_limited',      label: 'Public Limited Company' },
  { value: 'opc',                 label: 'One Person Company (OPC)' },
];

// Entity types that are registered companies → CIN + Certificate of
// Incorporation become mandatory.
export const CIN_REQUIRED_TYPES = ['private_limited', 'public_limited', 'opc'];

// Format rules (mirror the backend validateOpenAccount middleware).
export const BIZ_PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const CIN_RE = /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;
export const UDYAM_RE = /^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/;

// Business KYC documents. `requiredFor` limits mandatory uploads by entity type
// (null = required for every business type).
export const BUSINESS_DOCS = [
  { key: 'business_pan',              label: 'Business PAN Card',            required: true,  requiredFor: null },
  { key: 'trade_license',             label: 'Trade License',                required: true,  requiredFor: null },
  { key: 'gst_certificate',           label: 'GST Registration Certificate', required: false, requiredFor: null },
  { key: 'incorporation_certificate', label: 'Certificate of Incorporation', required: true,  requiredFor: CIN_REQUIRED_TYPES },
];

/** Validation for the business step — returns { fieldKey: message }. */
export function getBusinessStepErrors(form) {
  const e = {};
  if (!form.companyName?.trim() || form.companyName.trim().length < 2) {
    e.companyName = 'Company / business name is required.';
  }
  if (!form.businessType) e.businessType = 'Please select your business entity type.';
  const pan = (form.businessPan || '').toUpperCase();
  if (!pan) e.businessPan = 'Business PAN is required.';
  else if (!BIZ_PAN_RE.test(pan)) e.businessPan = 'Enter a valid PAN (format: ABCDE1234F).';
  if (!form.tradeLicenseNumber?.trim() || form.tradeLicenseNumber.trim().length < 3) {
    e.tradeLicenseNumber = 'Trade license number is required.';
  }
  const gstin = (form.gstin || '').toUpperCase();
  if (gstin && !GSTIN_RE.test(gstin)) e.gstin = 'Enter a valid 15-character GSTIN.';
  const isCompany = CIN_REQUIRED_TYPES.includes(form.businessType);
  const cin = (form.cin || '').toUpperCase();
  if (isCompany && !cin) e.cin = 'CIN is required for registered companies.';
  else if (cin && !CIN_RE.test(cin)) e.cin = 'Enter a valid 21-character CIN.';
  const udyam = (form.udyamNumber || '').toUpperCase();
  if (udyam && !UDYAM_RE.test(udyam)) e.udyamNumber = 'Format: UDYAM-XX-00-0000000';
  if (!form.dateOfIncorporation) {
    e.dateOfIncorporation = 'Date of incorporation / establishment is required.';
  }
  // Document uploads
  BUSINESS_DOCS.forEach((d) => {
    const mandatory = d.required && (!d.requiredFor || d.requiredFor.includes(form.businessType));
    if (mandatory && !form.files?.[d.key]) {
      e[`file_${d.key}`] = `${d.label} upload is required.`;
    }
  });
  return e;
}

const Field = ({ label, error, children, hint }) => (
  <div>
    <label className="form-label">{label}</label>
    {children}
    {hint && !error && <p className="text-dark-400 text-[11px] mt-1">{hint}</p>}
    {error && <p className="text-brand-400 text-[11px] mt-1">{error}</p>}
  </div>
);

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

export default function StepBusiness({ form, update, errors = {} }) {
  const set = (k) => (e) => update({ [k]: e.target.value });
  const setUpper = (k, max) => (e) =>
    update({ [k]: e.target.value.toUpperCase().replace(/\s/g, '').slice(0, max) });

  const isCompany = CIN_REQUIRED_TYPES.includes(form.businessType);

  // Race-safe file merge (same pattern as StepDocuments).
  const filesRef = useRef(form.files);
  useEffect(() => { filesRef.current = form.files; }, [form.files]);
  const [optimizing, setOptimizing] = useState({});

  const setFile = useCallback(async (key, file) => {
    if (!file) return;
    setOptimizing((o) => ({ ...o, [key]: true }));
    let finalFile = file;
    try {
      finalFile = await compressImage(file);
    } catch {
      finalFile = file;
    }
    update({ files: { ...filesRef.current, [key]: finalFile } });
    setOptimizing((o) => ({ ...o, [key]: false }));
  }, [update]);

  const ring = (k) => (errors[k] ? ' !border-brand-500 focus:!border-brand-500' : '');

  // ── Business PAN → registered company-name auto-fetch ──────────────────────
  // Same Cashfree lookup as the personal PAN, via the shared panVerifyCache so
  // the PAID API is hit at most ONCE per PAN per session — navigating Back and
  // returning to this step restores the verified state from cache with zero
  // network calls.
  const [bizPanVerifying, setBizPanVerifying] = useState(false);
  const [bizPanMsg, setBizPanMsg] = useState('');
  const [bizPanOk, setBizPanOk] = useState(false);
  const dispatchedBizPan = useRef('');
  const bizDebounceRef = useRef(null);

  // Apply a definitive verification result to the UI + form.
  const applyBizPanResult = useCallback((result) => {
    if (result.verified && result.name) {
      // The registry's registered_name for a business PAN IS the legal entity
      // name — auto-fill the company name so the account is titled exactly as
      // registered with the income tax department.
      update({ companyName: String(result.name).trim() });
      setBizPanOk(true);
      setBizPanMsg(`Verified: ${result.name}`);
    } else {
      setBizPanOk(false);
      setBizPanMsg(result.message || 'This PAN could not be verified. Please re-check the number.');
    }
  }, [update]);

  useEffect(() => {
    const pan = (form.businessPan || '').toUpperCase();

    if (!BIZ_PAN_RE.test(pan)) {
      if (bizDebounceRef.current) clearTimeout(bizDebounceRef.current);
      if (bizPanMsg) { setBizPanMsg(''); setBizPanOk(false); }
      return;
    }
    if (pan === dispatchedBizPan.current) return;

    // Cached (user came Back, or already verified the same PAN elsewhere) —
    // restore instantly, NO paid API call.
    const cached = getCachedPanResult(pan);
    if (cached) {
      dispatchedBizPan.current = pan;
      applyBizPanResult(cached);
      return;
    }

    if (bizDebounceRef.current) clearTimeout(bizDebounceRef.current);
    bizDebounceRef.current = setTimeout(async () => {
      dispatchedBizPan.current = pan;
      setBizPanVerifying(true);
      setBizPanOk(false);
      setBizPanMsg('Verifying business PAN with income tax registry…');
      try {
        const result = await verifyPanCached(pan);
        if (pan !== (form.businessPan || '').toUpperCase()) return;
        applyBizPanResult(result);
        if (result.verified && result.name) {
          toast.success('Business PAN verified — company name auto-filled from registry.');
        }
      } catch (err) {
        if (pan === (form.businessPan || '').toUpperCase()) dispatchedBizPan.current = '';
        setBizPanOk(false);
        setBizPanMsg(
          err?.response?.data?.message
          || 'Verification is temporarily unavailable. Please try again shortly.'
        );
      } finally {
        setBizPanVerifying(false);
      }
    }, 600);

    return () => { if (bizDebounceRef.current) clearTimeout(bizDebounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.businessPan]);

  return (
    <div>
      <h3 className="font-display text-xl font-700 text-white mb-1 flex items-center gap-2">
        <RiBuilding2Line className="text-brand-400" /> Company Information
      </h3>
      <p className="text-dark-300 text-sm mb-6">
        Business Elite accounts are opened in your company&apos;s name. Provide your registered
        business details and documents as per RBI current-account KYC norms.
      </p>

      <div className="mb-5 p-3 rounded-xl bg-brand-500/10 border border-brand-500/25 text-xs text-brand-300 flex items-center gap-2">
        <span>🏢</span>
        <span>
          Your account will be created in the name of{' '}
          <strong className="text-white">{form.companyName?.trim() || 'your company'}</strong>.
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="sm:col-span-2">
          <Field
            label="Company / Business Name *"
            error={errors.companyName}
            hint={bizPanOk
              ? 'Auto-filled from the income tax registry via your verified business PAN.'
              : 'Exactly as on your registration documents — this becomes your account name.'}
          >
            <input
              className={`input-field${ring('companyName')} ${bizPanOk ? 'opacity-70 cursor-not-allowed' : ''}`}
              value={form.companyName}
              onChange={set('companyName')}
              placeholder="Acme Trading Pvt Ltd"
              maxLength={120}
              readOnly={bizPanOk}
            />
          </Field>
        </div>
        <Field label="Business Entity Type *" error={errors.businessType}>
          <select className={`input-field${ring('businessType')}`} value={form.businessType} onChange={set('businessType')}>
            <option value="">Select entity type</option>
            {BUSINESS_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Date of Incorporation / Establishment *" error={errors.dateOfIncorporation}>
          <input className={`input-field${ring('dateOfIncorporation')}`} type="date" value={form.dateOfIncorporation} onChange={set('dateOfIncorporation')} max={new Date().toISOString().split('T')[0]} />
        </Field>
        <Field label="Business PAN *" error={errors.businessPan} hint={bizPanMsg ? undefined : 'PAN issued in the business / firm name (format: ABCDE1234F)'}>
          <input
            className={`input-field${ring('businessPan')} ${(bizPanVerifying || bizPanOk) ? 'opacity-70 cursor-not-allowed' : ''}`}
            value={form.businessPan}
            onChange={setUpper('businessPan', 10)}
            placeholder="ABCDE1234F"
            maxLength={10}
            autoCapitalize="characters"
            style={{ textTransform: 'uppercase' }}
            disabled={bizPanVerifying}
            readOnly={bizPanOk}
          />
          {bizPanMsg && (
            <p className={`text-[11px] mt-1 flex items-center gap-1.5 ${bizPanOk ? 'text-green-400' : bizPanVerifying ? 'text-brand-300' : 'text-amber-300'}`}>
              {bizPanVerifying
                ? <RiLoader4Line className="animate-spin" />
                : bizPanOk ? <RiShieldCheckLine /> : <span>ℹ</span>}
              <span>{bizPanMsg}</span>
            </p>
          )}
        </Field>
        <Field label="Trade License Number *" error={errors.tradeLicenseNumber} hint="Municipal trade license / Shops &amp; Establishment registration">
          <input className={`input-field${ring('tradeLicenseNumber')}`} value={form.tradeLicenseNumber} onChange={set('tradeLicenseNumber')} placeholder="TL/2024/012345" maxLength={50} />
        </Field>
        <Field label={`GSTIN${form.gstin ? ' ' : ' (if registered)'}`} error={errors.gstin} hint="15-character GST registration number">
          <input className={`input-field${ring('gstin')}`} value={form.gstin} onChange={setUpper('gstin', 15)} placeholder="22ABCDE1234F1Z5" maxLength={15} />
        </Field>
        <Field label={`CIN${isCompany ? ' *' : ' (companies only)'}`} error={errors.cin} hint="21-character Corporate Identification Number from MCA">
          <input className={`input-field${ring('cin')}`} value={form.cin} onChange={setUpper('cin', 21)} placeholder="U12345MH2020PTC123456" maxLength={21} />
        </Field>
        <Field label="Udyam / MSME Number (optional)" error={errors.udyamNumber} hint="Format: UDYAM-XX-00-0000000">
          <input className={`input-field${ring('udyamNumber')}`} value={form.udyamNumber} onChange={(e) => update({ udyamNumber: e.target.value.toUpperCase().slice(0, 19) })} placeholder="UDYAM-MH-01-1234567" maxLength={19} />
        </Field>
      </div>

      <h4 className="text-white font-semibold text-sm mb-3">Business Documents</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {BUSINESS_DOCS.map((d) => {
          const mandatory = d.required && (!d.requiredFor || d.requiredFor.includes(form.businessType));
          return (
            <div key={d.key}>
              <label className="form-label">{d.label}{mandatory ? ' *' : ' (optional)'}</label>
              <FileUpload
                docKey={d.key}
                onDrop={setFile}
                file={form.files?.[d.key]}
                error={errors[`file_${d.key}`]}
                optimizing={optimizing[d.key]}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
