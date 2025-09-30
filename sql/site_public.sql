-- Public site tables
CREATE TABLE IF NOT EXISTS public.site_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  source text,
  ip inet,
  user_agent text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  referrer text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.site_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  email text NOT NULL,
  message text NOT NULL,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  referrer text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Toll-free readiness submissions
CREATE TABLE IF NOT EXISTS public.tollfree_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text,
  website text,
  contact_email text,
  support_hours text,
  sample_messages text[],
  opt_in_description text,
  user_agent text,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
