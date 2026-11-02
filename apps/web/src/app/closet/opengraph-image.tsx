import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const alt = 'Worn Closet: for everything you already bought';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const SAMPLES = [
  { kicker: 'Sample · wool coat', title: '48 wears', note: 'Cost per wear falling' },
  { kicker: 'Sample · café gift card', title: 'Expiring this month', note: 'Reminder set' },
  { kicker: 'Sample · linen trousers', title: 'Return window: 4 days', note: 'Refund tracked' },
];

/* the share card: Closet's own headline on warm paper, so a shared link never reads as Worn Play */
export default async function OpengraphImage() {
  const root = process.cwd();
  const [serif, serifItalic] = await Promise.all([
    readFile(join(root, 'src/app/_og/DMSerifDisplay-Regular.ttf')),
    readFile(join(root, 'src/app/_og/DMSerifDisplay-Italic.ttf')),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 72px',
          fontFamily: 'DM Serif Display',
          color: '#0f0e0c',
          backgroundColor: '#faf8f5',
          backgroundImage: 'radial-gradient(60% 80% at 80% 50%, rgba(200,168,122,0.22), rgba(250,248,245,0) 70%)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 640 }}>
          <div style={{ display: 'flex', fontSize: 26, letterSpacing: 9, color: '#806440' }}>WORN CLOSET</div>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 34, fontSize: 84, lineHeight: 1.02 }}>
            <span>You already own the mall.</span>
            <span style={{ fontStyle: 'italic', color: '#806440' }}>Let’s run it.</span>
          </div>
          <div style={{ display: 'flex', marginTop: 30, fontSize: 30, lineHeight: 1.3, color: '#2a2722' }}>
            Plan the week, track cost per wear, and find the money sleeping in your wardrobe.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, width: 380 }}>
          {SAMPLES.map((s) => (
            <div
              key={s.title}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '22px 26px',
                borderRadius: 18,
                backgroundColor: '#ffffff',
                border: '1px solid #e0dbd2',
                boxShadow: '0 18px 40px rgba(60,40,20,0.12)',
              }}
            >
              <div style={{ display: 'flex', fontSize: 16, letterSpacing: 3, color: '#6e6861' }}>{s.kicker.toUpperCase()}</div>
              <div style={{ display: 'flex', marginTop: 8, fontSize: 36 }}>{s.title}</div>
              <div style={{ display: 'flex', marginTop: 6, fontSize: 16, letterSpacing: 3, color: '#806440' }}>{s.note.toUpperCase()}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'DM Serif Display', data: serif, style: 'normal', weight: 400 },
        { name: 'DM Serif Display', data: serifItalic, style: 'italic', weight: 400 },
      ],
    },
  );
}
