import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Phone, Mail, MapPin, MessageCircle } from 'lucide-react';

const PRODUCTS = [
  ['Savings Account', '/accounts'],
  ['Current Account', '/accounts'],
  ['Fixed Deposit', '/investments'],
  ['Recurring Deposit', '/investments'],
  ['Personal Loan', '/loans'],
  ['Home Loan', '/loans'],
  ['Car Loan', '/loans'],
  ['Debit Card', '/cards'],
];

const QUICK = [
  ['About Us', '/about'],
  ['Careers', '/careers'],
  ['Press', '/press'],
  ['Interest Rates', '/loans'],
  ['Fees & Charges', '/accounts'],
  ['Privacy Policy', '/privacy-policy'],
  ['Terms of Service', '/terms-of-service'],
  ['Grievance Redressal', '/contact'],
];

// Social media presence intentionally removed per brand policy.

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative border-t border-white/[0.08]" style={{ background: '#080808' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-14 lg:py-20">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand column */}
          <div>
            <div className="flex items-center gap-2.5 mb-5">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center font-serif-display font-extrabold text-white text-2xl"
                style={{ background: 'linear-gradient(135deg, #CC0000, #FF3333)', boxShadow: '0 0 22px rgba(204,0,0,0.45)' }}
              >
                A
              </div>
              <span className="font-bold tracking-tight text-white text-xl">
                Alister<span style={{ color: '#FF3333' }}> Bank</span>
              </span>
            </div>
            <p className="text-sm italic mb-5" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Banking Beyond Boundaries
            </p>
            <div className="space-y-2 text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
              <p>US Federally Regulated | Serving India via Corporate Partnership</p>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10">
                <ShieldCheck size={13} style={{ color: '#FF3333' }} /> FDIC Insured | US Federal Reserve Member
              </span>
            </div>
          </div>

          {/* Products */}
          <div>
            <p className="text-white font-semibold text-sm mb-4">Products</p>
            <ul className="space-y-2.5">
              {PRODUCTS.map(([label, to]) => (
                <li key={label}>
                  <Link to={to} className="inline-block text-sm transition-all duration-200 hover:text-white hover:translate-x-1" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Quick links */}
          <div>
            <p className="text-white font-semibold text-sm mb-4">Quick Links</p>
            <ul className="space-y-2.5">
              {QUICK.map(([label, to]) => (
                <li key={label}>
                  <Link to={to} className="inline-block text-sm transition-all duration-200 hover:text-white hover:translate-x-1" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <p className="text-white font-semibold text-sm mb-4">Contact</p>
            <ul className="space-y-3.5 text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
              <li className="flex items-start gap-2.5">
                <Phone size={16} style={{ color: '#FF3333' }} className="mt-0.5 shrink-0" />
                <span>1-800-425-4783<br /><span className="text-xs text-white/40">24/7 Toll-Free</span></span>
              </li>
              <li className="flex items-start gap-2.5">
                <Mail size={16} style={{ color: '#FF3333' }} className="mt-0.5 shrink-0" />
                support@alisterbank.com
              </li>
              <li className="flex items-start gap-2.5">
                <MapPin size={16} style={{ color: '#FF3333' }} className="mt-0.5 shrink-0" />
                Alister Bank, N.A.<br />350 Park Avenue, 21st Floor<br />New York, NY 10022, USA
              </li>
              <li>
                <Link to="/contact" className="inline-flex items-center gap-1.5 font-semibold" style={{ color: '#FF3333' }}>
                  <MessageCircle size={15} /> Chat with us →
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-white/[0.08] space-y-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-center md:text-left">
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              © {year} Alister Bank. All rights reserved.
            </p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Copyright © 2025 Alister Bank. SWIFT: ALSTUS33 | Regulated by the Federal Reserve &amp; FDIC | India Operations conducted under Corporate Service Agreement
            </p>
          </div>
          <p className="text-[11px] leading-relaxed text-center md:text-left" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Alister Bank is a US federally chartered bank. India-based services are provided solely to pre-approved corporate project participants. Not a public retail bank in India. Deposits governed by US federal law.
          </p>
        </div>
      </div>
    </footer>
  );
}
