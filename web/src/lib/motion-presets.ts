import type { Transition, Variants } from 'motion/react';

export const spring = {
  smooth: { type: 'spring', stiffness: 320, damping: 30, mass: 0.8 },
  snappy: { type: 'spring', stiffness: 500, damping: 40, mass: 0.6 },
  bouncy: { type: 'spring', stiffness: 260, damping: 18 },
} satisfies Record<string, Transition>;

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 32 },
  visible: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 32 },
};

export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: -4 },
  visible: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: -2 },
};

export const tabSwap: Variants = {
  hidden: { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
};
