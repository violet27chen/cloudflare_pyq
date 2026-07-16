'use client';

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'moments_visitor_id';

/**
 * Generate and persist a visitor_id in localStorage.
 *
 * Format: visitor_<16 random alphanumeric chars>
 * Generated once on first visit, then stable across sessions.
 */
function generateVisitorId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = 'visitor_';
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 16; i++) {
    id += chars[arr[i] % chars.length];
  }
  return id;
}

export function useVisitorId(): string {
  const [visitorId, setVisitorId] = useState<string | null>(null);

  useEffect(() => {
    try {
      let existing = localStorage.getItem(STORAGE_KEY);
      if (!existing) {
        existing = generateVisitorId();
        localStorage.setItem(STORAGE_KEY, existing);
      }
      setVisitorId(existing);
    } catch {
      // localStorage unavailable (private browsing, etc.)
      setVisitorId(generateVisitorId());
    }
  }, []);

  // Return a fallback for SSR / hydration mismatch. The real id resolves
  // after the first client effect.
  return visitorId ?? '';
}

export function getVisitorIdSync(): string {
  try {
    let existing = localStorage.getItem(STORAGE_KEY);
    if (!existing) {
      existing = generateVisitorId();
      localStorage.setItem(STORAGE_KEY, existing);
    }
    return existing;
  } catch {
    return generateVisitorId();
  }
}
