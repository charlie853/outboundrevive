"use client";

import React, { useState } from 'react';

/**
 * Connect GoHighLevel Button
 * 
 * Uses direct OAuth (not Nango) since GHL isn't available in Nango's catalog
 * Redirects to /api/oauth/gohighlevel/authorize which starts the OAuth flow
 */
export default function ConnectGHLButton() {
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    setLoading(true);
    
    try {
      // Redirect to our custom GHL OAuth authorize route
      window.location.href = '/api/oauth/gohighlevel/authorize';
    } catch (error) {
      console.error('Failed to start GoHighLevel connection:', error);
      alert('Failed to connect to GoHighLevel. Please try again.');
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleConnect}
      disabled={loading}
      className="flex items-center gap-3 rounded-xl border-2 border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 px-6 py-4 text-left transition-all hover:border-orange-300 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-500">
        <svg className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      </div>
      <div className="flex-1">
        <div className="font-semibold text-slate-900">GoHighLevel</div>
        <div className="text-sm text-slate-600">
          {loading ? 'Connecting...' : 'Connect your GHL account'}
        </div>
      </div>
      <svg
        className={`h-5 w-5 text-slate-400 transition-transform ${loading ? 'animate-spin' : ''}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        {loading ? (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        )}
      </svg>
    </button>
  );
}

