"use client";

import React from 'react';

/**
 * Contact Enrichment Panel
 * 
 * Displays CRM metadata and lead details in conversation threads
 * Shows: name, phone, email, company, role, lead type, status, CRM link
 */

interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  company?: string | null;
  role?: string | null;
  lead_type?: 'new' | 'old' | null;
  crm_source?: string | null;
  crm_url?: string | null;
  crm_owner?: string | null;
  crm_owner_email?: string | null;
  status?: string | null;
  opted_out?: boolean;
  last_inbound_at?: string | null;
  last_outbound_at?: string | null;
}

interface ContactPanelProps {
  lead: Lead | null;
}

export default function ContactPanel({ lead }: ContactPanelProps) {
  if (!lead) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="text-sm text-slate-500">No contact details available</div>
      </div>
    );
  }

  const leadTypeBadge = lead.lead_type === 'new' 
    ? { label: 'Cold Lead', color: 'bg-blue-100 text-blue-700' }
    : lead.lead_type === 'old'
    ? { label: 'Warm Lead', color: 'bg-amber-100 text-amber-700' }
    : null;

  const statusBadge = lead.opted_out
    ? { label: 'Opted Out', color: 'bg-red-100 text-red-700' }
    : lead.status === 'active'
    ? { label: 'Active', color: 'bg-green-100 text-green-700' }
    : { label: 'Pending', color: 'bg-slate-100 text-slate-600' };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{lead.name}</h3>
          <div className="mt-1 flex gap-2">
            {leadTypeBadge && (
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${leadTypeBadge.color}`}>
                {leadTypeBadge.label}
              </span>
            )}
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge.color}`}>
              {statusBadge.label}
            </span>
          </div>
        </div>

        {/* CRM Link */}
        {lead.crm_url && (
          <a
            href={lead.crm_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            View in {lead.crm_source || 'CRM'}
          </a>
        )}
      </div>

      {/* Contact Details */}
      <div className="space-y-3 border-t border-slate-100 pt-4">
        {/* Phone */}
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          <span className="text-sm text-slate-600">{lead.phone}</span>
        </div>

        {/* Email */}
        {lead.email && (
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <a href={`mailto:${lead.email}`} className="text-sm text-indigo-600 hover:text-indigo-700">
              {lead.email}
            </a>
          </div>
        )}

        {/* Company */}
        {lead.company && (
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <span className="text-sm text-slate-900 font-medium">{lead.company}</span>
          </div>
        )}

        {/* Role */}
        {lead.role && (
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-sm text-slate-600">{lead.role}</span>
          </div>
        )}

        {/* CRM Owner */}
        {lead.crm_owner && (
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <div>
              <span className="text-sm text-slate-900 font-medium">{lead.crm_owner}</span>
              {lead.crm_owner_email && (
                <a href={`mailto:${lead.crm_owner_email}`} className="text-xs text-indigo-600 hover:text-indigo-700 ml-2">
                  {lead.crm_owner_email}
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Activity Summary */}
      {(lead.last_inbound_at || lead.last_outbound_at) && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="text-xs font-medium text-slate-500 mb-2">Recent Activity</div>
          <div className="space-y-1 text-xs text-slate-600">
            {lead.last_outbound_at && (
              <div>Last contacted: {new Date(lead.last_outbound_at).toLocaleDateString()}</div>
            )}
            {lead.last_inbound_at && (
              <div>Last replied: {new Date(lead.last_inbound_at).toLocaleDateString()}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

