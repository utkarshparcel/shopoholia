'use client';

import { motion, useScroll, useSpring } from 'framer-motion';

/** Fixed gold hairline that tracks reading progress. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });

  return (
    <motion.div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 z-[60] h-[3px] origin-left"
      style={{
        scaleX,
        background: 'linear-gradient(90deg, #9c7a4e, #c8a87a 50%, #e6c795)',
      }}
    />
  );
}