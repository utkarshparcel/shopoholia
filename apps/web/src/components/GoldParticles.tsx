'use client';

import { useEffect, useRef } from 'react';

type P = {
  x: number; y: number;
  r: number;      // radius
  vx: number;     // drift
  vy: number;     // rise speed
  tw: number;     // twinkle phase
  tws: number;    // twinkle speed
  depth: number;  // 0..1, affects parallax + opacity
};

/**
 * Ambient gold-dust particle field — perf-first:
 * DPR-capped canvas, pauses off-screen & on hidden tabs, no work per frame
 * beyond draw, fully disabled under prefers-reduced-motion.
 */
export function GoldParticles({ density = 70 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = ref.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let raf = 0;
    let running = false;
    let inView = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const mouse = { x: -9999, y: -9999 };

    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    const spawn = (): P => ({
      x: rand(0, w),
      y: rand(0, h),
      r: rand(0.6, 2.4),
      vx: rand(-0.12, 0.12),
      vy: rand(-0.28, -0.08) * (0.5 + Math.random()),
      tw: rand(0, Math.PI * 2),
      tws: rand(0.008, 0.03),
      depth: rand(0.25, 1),
    });

    let parts: P[] = [];

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = Math.round((w * h) / 16000);
      const n = Math.max(24, Math.min(density, target));
      if (parts.length < n) {
        while (parts.length < n) parts.push(spawn());
      } else {
        parts = parts.slice(0, n);
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        // drift + mouse parallax by depth
        const mx = (mouse.x - w / 2) * 0.02 * p.depth;
        const my = (mouse.y - h / 2) * 0.02 * p.depth;
        p.x += p.vx + mx * 0.02;
        p.y += p.vy + my * 0.01;
        p.tw += p.tws;

        if (p.y < -8) { p.y = h + 8; p.x = rand(0, w); }
        if (p.x < -8) p.x = w + 8;
        if (p.x > w + 8) p.x = -8;

        const twinkle = 0.5 + 0.5 * Math.sin(p.tw);
        const alpha = 0.08 + p.depth * 0.3 * twinkle;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 6);
        g.addColorStop(0, `rgba(210, 175, 115, ${alpha})`);
        g.addColorStop(0.5, `rgba(200, 168, 122, ${alpha * 0.4})`);
        g.addColorStop(1, 'rgba(200, 168, 122, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 6, 0, Math.PI * 2);
        ctx.fill();

        // sparkle core
        if (p.depth > 0.7) {
          ctx.fillStyle = `rgba(255, 236, 200, ${alpha * 0.85})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const tick = () => {
      if (!running) return;
      draw();
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (running || !inView || document.hidden) return;
      running = true;
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const io = new IntersectionObserver(([e]) => {
      inView = e.isIntersecting;
      if (inView) start();
      else stop();
    }, { threshold: 0 });
    io.observe(wrap);

    const vis = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', vis);

    const onMove = (e: MouseEvent) => {
      const r = wrap.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    };
    window.addEventListener('mousemove', onMove, { passive: true });

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    start();

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
    };
  }, [density]);

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <canvas ref={ref} className="absolute inset-0" />
    </div>
  );
}