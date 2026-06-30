import React from 'react';

/**
 * Generic 404 page. Shown for unknown routes AND for the admin panel when the
 * current device isn't approved — so an unapproved visitor cannot tell the
 * admin panel exists at all.
 */
export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-900 px-6 text-center">
      <div>
        <p className="text-[80px] font-bold leading-none text-dark-600">404</p>
        <h1 className="text-xl font-semibold text-white mt-2">Page not found</h1>
        <p className="text-dark-300 text-sm mt-2 max-w-sm mx-auto">
          The page you are looking for doesn’t exist or has been moved.
        </p>
        <a href="/" className="inline-block mt-6 text-sm text-brand-400 hover:text-brand-300 underline">
          Go to homepage
        </a>
      </div>
    </div>
  );
}
