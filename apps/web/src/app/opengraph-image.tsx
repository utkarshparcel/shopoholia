import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const alt = 'Worn: the shopping app where nothing ships';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/* the share card: the headline beside a real reveal render (sage mini, the Amalfi steps) */
export default async function OpengraphImage() {
  const root = process.cwd();
  const [serif, serifItalic, render] = await Promise.all([
    readFile(join(root, 'src/app/_og/DMSerifDisplay-Regular.ttf')),
    readFile(join(root, 'src/app/_og/DMSerifDisplay-Italic.ttf')),
    readFile(join(root, 'public/renders/sage-amalfi.jpg')),
  ]);
  const photo = `data:image/jpeg;base64,${render.toString('base64')}`;

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
          color: '#faf8f5',
          backgroundColor: '#0c0b09',
          backgroundImage: 'radial-gradient(60% 80% at 75% 50%, rgba(200,168,122,0.28), rgba(12,11,9,0) 70%)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 640 }}>
          <div style={{ display: 'flex', fontSize: 26, letterSpacing: 9, color: '#c8a87a' }}>WORN</div>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 34, fontSize: 92, lineHeight: 1.02 }}>
            <span>Stop shopping.</span>
            <span style={{ fontStyle: 'italic', color: '#c8a87a' }}>Start wearing.</span>
          </div>
          <div style={{ display: 'flex', marginTop: 30, fontSize: 32, lineHeight: 1.3, color: 'rgba(250,248,245,0.78)' }}>
            The shopping app where nothing ships. Try it on, haul it with coins, unbox photos of you in it.
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            width: 352,
            height: 514,
            borderRadius: 28,
            overflow: 'hidden',
            border: '2px solid rgba(200,168,122,0.55)',
            boxShadow: '0 40px 90px rgba(0,0,0,0.6)',
          }}
        >
          <img src={photo} width={352} height={514} style={{ objectFit: 'cover' }} />
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
