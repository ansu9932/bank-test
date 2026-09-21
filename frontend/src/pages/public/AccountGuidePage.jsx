import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Check, Clock3, Info, Play } from 'lucide-react';
import PageTransition from '../../components/public/PageTransition';
import AccountGuidePlayer, { formatTime, guideDuration } from '../../components/public/AccountGuidePlayer';
import guide from '../../content/account-guide.json';

export default function AccountGuidePage() {
  return (
    <PageTransition title="How to Open an Account — Video Guide | Alister Bank" description="Watch the complete Alister Bank account-opening walkthrough: application, email verification, video KYC, sandbox activation, account setup, and first login.">
      <div className="account-guide font-sans">
        <header className="guide-header">
          <div className="guide-container guide-header-inner">
            <Link to="/" className="guide-brand" aria-label="Alister Bank home"><span aria-hidden="true">A</span> Alister Bank</Link>
            <Link to="/" className="guide-back-link"><ArrowLeft size={16} aria-hidden="true" /> Back to home</Link>
          </div>
        </header>
        <main className="guide-container guide-main">
          <div className="guide-intro">
            <div>
              <p className="guide-eyebrow"><Play size={14} aria-hidden="true" /> THE ACCOUNT-OPENING GUIDE</p>
              <h1 className="text-balance">From your first step<br />to your <span>first sign-in.</span></h1>
              <p className="guide-intro-description text-pretty">A little guidance goes a long way. Watch the complete account-opening journey, at your own pace.</p>
            </div>
            <div className="guide-video-details" aria-label="Video details"><span><Clock3 size={17} aria-hidden="true" /> {formatTime(guideDuration)} minutes</span><span>1080p HD</span><span>English captions</span></div>
          </div>

          <AccountGuidePlayer />

          <aside className="guide-disclosure" id="guide-video-description">
            <Info size={20} aria-hidden="true" />
            <div><h2>A guide, not a live account recording</h2><p>{guide.disclosure} Do not use real payment-card details in the simulation.</p></div>
          </aside>

          <section className="guide-next-step" aria-labelledby="guide-ready-title">
            <div>
              <p className="guide-eyebrow">WHEN YOU ARE READY</p>
              <h2 id="guide-ready-title">Your next step starts here.</h2>
              <ul><li><Check size={16} aria-hidden="true" /> Email access</li><li><Check size={16} aria-hidden="true" /> Identity documents</li><li><Check size={16} aria-hidden="true" /> Camera-ready device</li></ul>
              <p className="guide-eligibility">India access is limited to pre-approved participants in this project.</p>
            </div>
            <div className="guide-next-actions">
              <Link className="guide-primary-button" to="/open-account">Request account access <ArrowUpRight size={19} aria-hidden="true" /></Link>
              <Link className="guide-text-link" to="/login">Already set up? Sign in <ArrowUpRight size={16} aria-hidden="true" /></Link>
            </div>
          </section>
        </main>
        <footer className="guide-footer"><div className="guide-container guide-footer-inner"><span>Alister Bank · Account-opening guide</span><Link to="/contact">Need help? Contact support <ArrowUpRight size={15} aria-hidden="true" /></Link></div></footer>
      </div>
    </PageTransition>
  );
}
