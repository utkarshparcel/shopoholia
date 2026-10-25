import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/* the nav mark (the gold check in a ring) on ink, for home screens */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f0e0c',
        }}
      >
        <svg width="116" height="116" viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="14" stroke="#c8a87a" strokeWidth="2" />
          <path d="M10 16 L14 20 L22 12" stroke="#c8a87a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    size,
  );
}
