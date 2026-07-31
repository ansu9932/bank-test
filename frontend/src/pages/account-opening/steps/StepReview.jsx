import React from 'react';
import { RiCheckLine } from 'react-icons/ri';
import { getDocsForCountry, getCountryByCode, formatAadhaar } from '../../../config/kycRequirements';
import { BUSINESS_TYPES, BUSINESS_DOCS } from './StepBusiness';

export default function StepReview({ form }) {
  const country = getCountryByCode(form.countryCode);
  const docs = getDocsForCountry(form.countryCode);
  const Row = ({ label, value }) => value ? (
    <div className="flex justify-between py-2.5 border-b border-white/[0.04] last:border-0">
      <span className="text-dark-300 text-sm">{label}</span>
      <span className="text-white text-sm font-medium text-right max-w-[200px] truncate">{value}</span>
    </div>
  ) : null;

  const Section = ({ title, icon, children }) => (
    <div className="glass-card p-5 mb-4">
      <h4 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
        <span>{icon}</span>{title}
      </h4>
      {children}
    </div>
  );

  return (
    <div>
      <h3 className="font-display text-xl font-700 text-white mb-1">Review Your Application</h3>
      <p className="text-dark-300 text-sm mb-6">Please review all details before submitting.</p>

      <Section title="Personal Information" icon="👤">
        <Row label="Full Name" value={`${form.firstName} ${form.lastName}`} />
        <Row label="Email" value={form.email} />
        <Row label="Phone" value={form.phone} />
        <Row label="Date of Birth" value={form.dateOfBirth} />
        <Row label="Gender" value={form.gender} />
        <Row label="Occupation" value={form.occupation} />
        <Row label="Account Type" value={form.accountType?.replace(/_/g, ' ').toUpperCase()} />
      </Section>

      {form.accountType === 'business_elite' && (
        <Section title="Company Information" icon="🏢">
          <Row label="Company Name" value={form.companyName} />
          <Row label="Entity Type" value={BUSINESS_TYPES.find((t) => t.value === form.businessType)?.label} />
          <Row label="Business PAN" value={form.businessPan?.toUpperCase()} />
          <Row label="Trade License No." value={form.tradeLicenseNumber} />
          <Row label="GSTIN" value={form.gstin?.toUpperCase()} />
          <Row label="CIN" value={form.cin?.toUpperCase()} />
          <Row label="Udyam / MSME No." value={form.udyamNumber?.toUpperCase()} />
          <Row label="Date of Incorporation" value={form.dateOfIncorporation} />
          <div className="mt-2 flex flex-wrap gap-2">
            {BUSINESS_DOCS
              .filter((d) => form.files?.[d.key])
              .map((d) => (
                <span key={d.key} className="badge badge-success">
                  <RiCheckLine /> {d.label}
                </span>
              ))}
          </div>
          <div className="mt-3 p-3 rounded-lg bg-brand-500/10 border border-brand-500/25">
            <p className="text-brand-300 text-xs">
              Your account will be opened in the name of{' '}
              <strong className="text-white">{form.companyName}</strong>.
            </p>
          </div>
        </Section>
      )}

      <Section title="Address" icon="📍">
        <Row label="Address" value={`${form.addressLine1} ${form.addressLine2 || ''}`} />
        <Row label="City / State" value={`${form.city}, ${form.state}`} />
        <Row label={form.countryCode === 'IN' ? 'PIN Code' : 'Postal Code'} value={form.pincode} />
        <Row label="Country" value={`${country.flag} ${country.name}`} />
      </Section>

      <Section title="KYC Documents" icon="📄">
        {docs.map((d) => {
          if (!d.idKey) return null;
          const raw = form[d.idKey];
          if (!raw) return null;
          const value = d.format === 'aadhaar' ? formatAadhaar(raw) : raw;
          return <Row key={d.idKey} label={`${d.label} Number`} value={value} />;
        })}
        <div className="mt-2 flex flex-wrap gap-2">
          {docs
            .filter((d) => form.files?.[d.key])
            .map((d) => (
              <span key={d.key} className="badge badge-success">
                <RiCheckLine /> {d.label}
              </span>
            ))}
        </div>
      </Section>

      <div className="p-4 rounded-xl bg-dark-700/50 border border-white/[0.05]">
        <p className="text-dark-200 text-xs leading-relaxed">
          By submitting, I confirm that all information provided is accurate. I agree to Alister Bank's{' '}
          <a href="#" className="text-brand-400">Terms & Conditions</a> and{' '}
          <a href="#" className="text-brand-400">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}
