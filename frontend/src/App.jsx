import React, { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useSelector, useDispatch } from 'react-redux';
import { getMe } from './store/slices/authSlice';

import PageLoader from './components/common/PageLoader';

// Auth pages
import LoginPage from './pages/auth/LoginPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';

// Public marketing site (lazy-loaded for fast initial paint)
import PublicLayout from './components/public/PublicLayout';
const HomePage = lazy(() => import('./pages/public/HomePage'));
const AccountsPage = lazy(() => import('./pages/public/AccountsPage'));
const CardsPublicPage = lazy(() => import('./pages/public/CardsPage'));
const LoansPage = lazy(() => import('./pages/public/LoansPage'));
const InvestmentsPage = lazy(() => import('./pages/public/InvestmentsPage'));
const PaymentsPage = lazy(() => import('./pages/public/PaymentsPage'));
const AboutPage = lazy(() => import('./pages/public/AboutPage'));
const ContactPage = lazy(() => import('./pages/public/ContactPage'));
const CareersPage = lazy(() => import('./pages/public/CareersPage'));
const PressPage = lazy(() => import('./pages/public/PressPage'));
const PrivacyPolicyPage = lazy(() => import('./pages/public/PrivacyPolicyPage'));
const TermsOfServicePage = lazy(() => import('./pages/public/TermsOfServicePage'));

// Account opening flow (lazy-loaded — only fetched when these routes are hit)
import DashboardLayout from './components/layout/DashboardLayout';
import AdminLayout from './components/layout/AdminLayout';
const AccountOpeningPage = lazy(() => import('./pages/account-opening/AccountOpeningPage'));
const CyberVideoKYC = lazy(() => import('./pages/account-opening/CyberVideoKYC'));
const AccountSetupPage = lazy(() => import('./pages/account-opening/AccountSetupPage'));
const ActivateDepositPage = lazy(() => import('./pages/account-opening/ActivateDepositPage'));

// Dashboard (lazy-loaded — layout shell stays eager, page content is split)
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));
const TransactionsPage = lazy(() => import('./pages/dashboard/TransactionsPage'));
const TransferPage = lazy(() => import('./pages/dashboard/TransferPage'));
const DepositFunds = lazy(() => import('./pages/dashboard/DepositFunds'));
const BeneficiariesPage = lazy(() => import('./pages/dashboard/BeneficiariesPage'));
const StatementPage = lazy(() => import('./pages/dashboard/StatementPage'));
const ProfilePage = lazy(() => import('./pages/dashboard/ProfilePage'));
const SecurityPage = lazy(() => import('./pages/dashboard/SecurityPage'));
const SupportPage = lazy(() => import('./pages/dashboard/SupportPage'));
const AnalyticsPage = lazy(() => import('./pages/dashboard/AnalyticsPage'));
const CardsPage = lazy(() => import('./pages/dashboard/CardsPage'));

// Admin (lazy-loaded — layout shell stays eager, page content is split)
const AdminLoginPage = lazy(() => import('./pages/admin/AdminLoginPage'));
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'));
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage'));
const AdminUserDetailPage = lazy(() => import('./pages/admin/AdminUserDetailPage'));
const AdminKYCReviewPage = lazy(() => import('./pages/admin/AdminKYCReviewPage'));
const AdminTransactionsPage = lazy(() => import('./pages/admin/AdminTransactionsPage'));
const AdminNeftRequestsPage = lazy(() => import('./pages/admin/AdminNeftRequestsPage'));
const AdminAuditPage = lazy(() => import('./pages/admin/AdminAuditPage'));
const AdminTicketsPage = lazy(() => import('./pages/admin/AdminTicketsPage'));
const AdminApprovedCardsPage = lazy(() => import('./pages/admin/AdminApprovedCardsPage'));

// Wraps a lazy page element in a Suspense boundary with the shared loader.
const withSuspense = (element) => (
  <Suspense fallback={<PageLoader />}>{element}</Suspense>
);

// Guards
const PrivateRoute = ({ children }) => {
  const { isAuthenticated, user } = useSelector(s => s.auth);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.account_status === 'pending') return <Navigate to="/account-setup" replace />;
  return children;
};

const AdminRoute = ({ children }) => {
  const adminToken = localStorage.getItem('adminToken');
  if (!adminToken) return <Navigate to="/admin/login" replace />;
  return children;
};

const GuestRoute = ({ children }) => {
  const { isAuthenticated } = useSelector(s => s.auth);
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return children;
};

export default function App() {
  const dispatch = useDispatch();
  const { isAuthenticated } = useSelector(s => s.auth);

  useEffect(() => {
    if (isAuthenticated) dispatch(getMe());
  }, []);

  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#1e1e2e',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            fontSize: '14px',
          },
          success: { iconTheme: { primary: '#22c55e', secondary: '#1e1e2e' } },
          error:   { iconTheme: { primary: '#c8102e', secondary: '#1e1e2e' } },
        }}
      />

      <Routes>
        {/* Public marketing site (Navbar + Footer shell) */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/cards" element={<CardsPublicPage />} />
          <Route path="/loans" element={<LoansPage />} />
          <Route path="/investments" element={<InvestmentsPage />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/careers" element={<CareersPage />} />
          <Route path="/press" element={<PressPage />} />
          <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
          <Route path="/terms-of-service" element={<TermsOfServicePage />} />
        </Route>

        {/* Auth */}
        <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Account Opening */}
        <Route path="/open-account" element={withSuspense(<AccountOpeningPage />)} />
        {/* Live production Video KYC — email secure links land here (?token=...) */}
        <Route path="/video-kyc" element={withSuspense(<CyberVideoKYC />)} />
        {/* Public showcase / demo of the same cyber wizard (no token = demo mode) */}
        <Route path="/cyber-kyc" element={withSuspense(<CyberVideoKYC />)} />
        <Route path="/account-setup" element={withSuspense(<AccountSetupPage />)} />
        {/* Activation deposit (sandbox simulation) — emailed secure-token link */}
        <Route path="/activate-deposit" element={withSuspense(<ActivateDepositPage />)} />

        {/* Dashboard */}
        <Route path="/dashboard" element={<PrivateRoute><DashboardLayout /></PrivateRoute>}>
          <Route index element={withSuspense(<DashboardPage />)} />
          <Route path="transactions" element={withSuspense(<TransactionsPage />)} />
          <Route path="transfer" element={withSuspense(<TransferPage />)} />
          <Route path="deposit" element={withSuspense(<DepositFunds />)} />
          <Route path="beneficiaries" element={withSuspense(<BeneficiariesPage />)} />
          <Route path="cards" element={withSuspense(<CardsPage />)} />
          <Route path="statement" element={withSuspense(<StatementPage />)} />
          <Route path="analytics" element={withSuspense(<AnalyticsPage />)} />
          <Route path="profile" element={withSuspense(<ProfilePage />)} />
          <Route path="security" element={withSuspense(<SecurityPage />)} />
          <Route path="support" element={withSuspense(<SupportPage />)} />
        </Route>

        {/* Admin */}
        <Route path="/admin/login" element={withSuspense(<AdminLoginPage />)} />
        <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
          <Route index element={withSuspense(<AdminDashboardPage />)} />
          <Route path="users" element={withSuspense(<AdminUsersPage />)} />
          <Route path="users/:id" element={withSuspense(<AdminUserDetailPage />)} />
          <Route path="kyc-review" element={withSuspense(<AdminKYCReviewPage />)} />
          <Route path="transactions" element={withSuspense(<AdminTransactionsPage />)} />
          {/* NEFT transfers awaiting admin approval (approve = complete, reject = refund) */}
          <Route path="neft-requests" element={withSuspense(<AdminNeftRequestsPage />)} />
          {/* approved cards — sandbox allow-list for the activation-deposit simulator */}
          <Route path="approved-cards" element={withSuspense(<AdminApprovedCardsPage />)} />
          {/* audit — matches the /admin/audit path used in Sidebar and AdminLayout */}
          <Route path="audit" element={withSuspense(<AdminAuditPage />)} />
          {/* audit-logs — alias so old bookmarks still work */}
          <Route path="audit-logs" element={withSuspense(<AdminAuditPage />)} />
          <Route path="tickets" element={withSuspense(<AdminTicketsPage />)} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
