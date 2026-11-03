import { APP_STORE_URL, PLAY_STORE_URL } from '@/lib/site';

export function AppleIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

export function PlayIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 20.5V3.5c0-.6.34-1.1.84-1.35L13.5 12 3.84 21.85c-.5-.25-.84-.75-.84-1.35zm13.81-5.38L6.05 21.34l8.49-8.49 2.27 2.27zm3.35-4.31c.34.27.59.68.59 1.19s-.22.9-.57 1.18l-2.29 1.32-2.5-2.5 2.5-2.5 2.27 1.31zM6.05 2.66l10.76 6.22-2.27 2.27-8.49-8.49z" />
    </svg>
  );
}

/**
 * Download buttons for the stores Worn Play is in (NEXT_PUBLIC_APP_STORE_URL / _PLAY_STORE_URL).
 * Renders nothing while neither is set. Light buttons, for the dark CTA bands.
 */
export function StoreButtons({ className = '' }: { className?: string }) {
  const stores = [
    APP_STORE_URL && { href: APP_STORE_URL, small: 'Download on the', name: 'App Store', icon: <AppleIcon size={22} /> },
    PLAY_STORE_URL && { href: PLAY_STORE_URL, small: 'Get it on', name: 'Google Play', icon: <PlayIcon size={20} /> },
  ].filter(Boolean) as { href: string; small: string; name: string; icon: React.ReactNode }[];
  if (!stores.length) return null;
  return (
    <ul aria-label="Download Worn Play" className={`flex flex-wrap items-center justify-center gap-3 ${className}`}>
      {stores.map((s) => (
        <li key={s.name}>
          <a
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[52px] items-center gap-3 rounded-md bg-worn-paper px-5 text-left text-worn-ink transition-colors hover:bg-worn-gold-tint focus-visible:outline focus-visible:outline-2 focus-visible:outline-worn-gold"
          >
            {s.icon}
            <span className="flex flex-col leading-tight">
              <span className="text-[11px] font-medium">{s.small}</span>
              <span className="text-[17px] font-semibold">{s.name}</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
