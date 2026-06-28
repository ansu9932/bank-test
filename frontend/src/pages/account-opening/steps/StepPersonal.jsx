import React from 'react';
import CountrySelect from '../../../components/common/CountrySelect';
import { getCountryByCode } from '../../../config/kycRequirements';

const Field = ({ label, error, children, hint }) => (
  <div>
    <label className="form-label">{label}</label>
    {children}
    {hint && !error && <p className="text-dark-400 text-[11px] mt-1">{hint}</p>}
    {error && <p className="text-brand-400 text-[11px] mt-1">{error}</p>}
  </div>
);

export default function StepPersonal({ form, update, errors = {}, nameLocked = false, onCountryChange }) {
  const set = (k) => (e) => update({ [k]: e.target.value });
  const isIndia = (form.countryCode || 'IN') === 'IN';

  // Digit-only handler for the mobile number. India is capped at 10 digits;
  // other countries allow up to 15 (international).
  const setPhone = (e) => {
    const max = isIndia ? 10 : 15;
    const digits = e.target.value.replace(/\D/g, '').slice(0, max);
    update({ phone: digits });
  };

  // Red ring helper for invalid fields.
  const ring = (k) => (errors[k] ? ' !border-brand-500 focus:!border-brand-500' : '');

  return (
    <div>
      <h3 className="font-display text-xl font-700 text-white mb-1">Personal Information</h3>
      <p className="text-dark-300 text-sm mb-6">Fill in your basic personal details as per government ID</p>

      {/* Country selector — drives which KYC documents are required (Step 3). */}
      <div className="mb-5">
        <label className="form-label">Choose Country *</label>
        <CountrySelect
          value={form.countryCode}
          onChange={(code) => onCountryChange?.(code)}
          error={errors.countryCode}
        />
        <p className="text-dark-400 text-[11px] mt-1">
          Your KYC document requirements are based on the country you select.
        </p>
      </div>

      {nameLocked && (
        <div className="mb-5 p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-xs text-green-300 flex items-center gap-2">
          <span>🔒</span>
          <span>Your name has been verified against the PAN registry and locked to match your tax records.</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="First Name *" error={errors.firstName} hint={nameLocked ? 'Auto-filled from PAN verification' : undefined}>
          <input
            className={`input-field${ring('firstName')}${nameLocked ? ' opacity-70 cursor-not-allowed' : ''}`}
            value={form.firstName} onChange={set('firstName')} placeholder="Arjun"
            readOnly={nameLocked}
          />
        </Field>
        <Field label="Last Name *" error={errors.lastName} hint={nameLocked ? 'Auto-filled from PAN verification' : undefined}>
          <input
            className={`input-field${ring('lastName')}${nameLocked ? ' opacity-70 cursor-not-allowed' : ''}`}
            value={form.lastName} onChange={set('lastName')} placeholder="Sharma"
            readOnly={nameLocked}
          />
        </Field>
        <Field label="Email Address *" error={errors.email}>
          <input className={`input-field${ring('email')}`} type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" />
        </Field>
        <Field label="Mobile Number *" error={errors.phone}>
          <input className={`input-field${ring('phone')}`} type="tel" inputMode="numeric" value={form.phone} onChange={setPhone} placeholder={isIndia ? '9876543210' : 'Mobile number'} maxLength={isIndia ? 10 : 15} />
        </Field>
        <Field label="Date of Birth *" error={errors.dateOfBirth}>
          <input className={`input-field${ring('dateOfBirth')}`} type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} max={new Date(Date.now() - 18*365*24*60*60*1000).toISOString().split('T')[0]} />
        </Field>
        <Field label="Gender *" error={errors.gender}>
          <select className={`input-field${ring('gender')}`} value={form.gender} onChange={set('gender')}>
            <option value="">Select gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Father's Name">
          <input className="input-field" value={form.fatherName} onChange={set('fatherName')} placeholder="Rajesh Sharma" />
        </Field>
        <Field label="Mother's Name">
          <input className="input-field" value={form.motherName} onChange={set('motherName')} placeholder="Sunita Sharma" />
        </Field>
        <Field label="Marital Status">
          <select className="input-field" value={form.maritalStatus} onChange={set('maritalStatus')}>
            <option value="">Select status</option>
            <option value="single">Single</option>
            <option value="married">Married</option>
            <option value="divorced">Divorced</option>
            <option value="widowed">Widowed</option>
          </select>
        </Field>
        <Field label="Occupation">
          <input className="input-field" value={form.occupation} onChange={set('occupation')} placeholder="Software Engineer" />
        </Field>
        <Field label="Annual Income ($)">
          <input className="input-field" type="number" value={form.annualIncome} onChange={set('annualIncome')} placeholder="1500000" />
        </Field>
        <Field label="Account Type *" error={errors.accountType}>
          <select className={`input-field${ring('accountType')}`} value={form.accountType} onChange={set('accountType')}>
            <option value="savings">Savings Account</option>
            <option value="current">Current Account</option>
          </select>
        </Field>
      </div>
    </div>
  );
}
