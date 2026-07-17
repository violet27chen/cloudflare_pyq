'use client';

import { useState, useEffect } from 'react';
import { getProfile, type ProfileDTO } from '../utils/api';
import { AUTHOR_NAME } from '../utils/config';

/**
 * Public glass-header identity. Fetches the author profile from /api/profile
 * and shows the avatar + display name. Falls back to the build-time
 * AUTHOR_NAME while loading or if the request fails.
 */
export function ProfileHeader() {
  const [profile, setProfile] = useState<ProfileDTO | null>(null);

  useEffect(() => {
    let alive = true;
    getProfile()
      .then((p) => {
        if (alive) setProfile(p);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const name = profile?.display_name || AUTHOR_NAME;
  const avatar = profile?.avatar_url;

  return (
    <>
      <div
        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-xs font-semibold"
        style={{
          backgroundColor: 'var(--color-surface-2)',
          color: 'var(--fg)',
          border: '1px solid var(--line)',
        }}
      >
        {avatar ? (
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        ) : (
          name.charAt(0)
        )}
      </div>
      <span className="text-[15px] font-medium" style={{ color: 'var(--fg)' }}>
        {name}
      </span>
    </>
  );
}
