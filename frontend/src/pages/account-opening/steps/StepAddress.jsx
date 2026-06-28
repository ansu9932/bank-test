import React from 'react';
import { getCountryByCode } from '../../../config/kycRequirements';

const STATES = ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Delhi','Jammu & Kashmir','Ladakh','Puducherry'];

export default function StepAddress({ form, update, errors = {} }) {
  const set = (k) => (e) => update({ [k]: e.target.value });
  const isIndia = (form.countryCode || 'IN') === 'IN';
  const country = getCountryByCode(form.countryCode);

  // PIN/postal handler. India is digit-only capped at 6; others allow
  // alphanumeric postal codes up to 12 chars.
  const setPincode = (e) => {
    const v = isIndia
      ? e.target.value.replace(/\D/g, '').slice(0, 6)
      : e.target.value.replace(/[^A-Za-z0-9\s-]/g, '').slice(0, 12);
    update({ pincode: v });
  };

  const ring = (k) => (errors[k] ? ' !border-brand-500 focus:!border-brand-500' : '');
  const Err = ({ k }) => (errors[k] ? <p className="text-brand-400 text-[11px] mt-1">{errors[k]}</p> : null);

  return (
    <div>
      <h3 className="font-display text-xl font-700 text-white mb-1">Address Details</h3>
      <p className="text-dark-300 text-sm mb-6">Enter your current residential address</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="form-label">Address Line 1 *</label>
          <input className={`input-field${ring('addressLine1')}`} value={form.addressLine1} onChange={set('addressLine1')} placeholder="House No., Street, Area" />
          <Err k="addressLine1" />
        </div>
        <div className="sm:col-span-2">
          <label className="form-label">Address Line 2</label>
          <input className="input-field" value={form.addressLine2} onChange={set('addressLine2')} placeholder="Landmark (optional)" />
        </div>
        <div>
          <label className="form-label">City *</label>
          <input className={`input-field${ring('city')}`} value={form.city} onChange={set('city')} placeholder="City" />
          <Err k="city" />
        </div>
        <div>
          <label className="form-label">{isIndia ? 'State *' : 'State / Province *'}</label>
          {isIndia ? (
            <select className={`input-field${ring('state')}`} value={form.state} onChange={set('state')}>
              <option value="">Select state</option>
              {STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <input className={`input-field${ring('state')}`} value={form.state} onChange={set('state')} placeholder="State / Province" />
          )}
          <Err k="state" />
        </div>
        <div>
          <label className="form-label">{isIndia ? 'PIN Code *' : 'Postal Code *'}</label>
          <input
            className={`input-field${ring('pincode')}`}
            value={form.pincode} onChange={setPincode}
            placeholder={isIndia ? '560001' : 'Postal code'}
            inputMode={isIndia ? 'numeric' : 'text'}
            maxLength={isIndia ? 6 : 12}
          />
          <Err k="pincode" />
        </div>
        <div>
          <label className="form-label">Country</label>
          {/* Country is chosen via the searchable selector on Step 1 and shown
              here read-only so it stays consistent with the KYC documents. */}
          <div className="input-field flex items-center gap-2 opacity-90 cursor-not-allowed">
            <span className="text-lg leading-none">{country.flag}</span>
            <span className="text-white">{country.name}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
