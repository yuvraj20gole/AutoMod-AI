import type { NextConfig } from "next";

// Signed URLs for car photos come from Supabase Storage, on the same
// project host already used for auth/the Data API — derived from the env
// var rather than hardcoded, so this doesn't silently point at the wrong
// project if the Supabase project ever changes.
const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: "https",
            hostname: supabaseHostname,
            port: "",
            // No `search` constraint — signed URLs always carry a
            // `?token=...` query string, and an empty-string `search`
            // would only match a URL with NO query string at all.
            pathname: "/storage/v1/object/sign/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
