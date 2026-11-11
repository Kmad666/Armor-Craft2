const PATHS: Record<string, string> = {
  select: 'M5 3l14 7-6 2-2 6z',
  move: 'M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3',
  rotate: 'M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5',
  scale: 'M4 20L20 4M14 4h6v6M4 14v6h6',
  morph: 'M4 18c2-8 6-12 8-12s6 4 8 12M12 6v-3M4 18h16M9 3h6',
  duplicate: 'M8 8h12v12H8zM4 16V4h12',
  mirror: 'M12 3v18M8 7l-5 5 5 5zM16 7l5 5-5 5z',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  eyeOff: 'M3 3l18 18M10.6 5.2A9.6 9.6 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.5 6.6C3.7 8.6 2 12 2 12s4 7 10 7a9.8 9.8 0 0 0 4-.9M9.9 9.9a3 3 0 0 0 4.2 4.2',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  unlock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 7.5-2',
  up: 'M12 19V5M5 12l7-7 7 7',
  down: 'M12 5v14M5 12l7 7 7-7',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  save: 'M5 3h11l3 3v15H5zM8 3v6h7V3M8 21v-7h8v7',
  folder: 'M3 6h6l2 2h10v11H3z',
  plus: 'M12 5v14M5 12h14',
  download: 'M12 3v12M7 10l5 5 5-5M4 20h16',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 10.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01',
  focus: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  chevronRight: 'M9 5l7 7-7 7',
  chevronDown: 'M5 9l7 7 7-7',
  chevronLeft: 'M15 5l-7 7 7 7',
  close: 'M5 5l14 14M19 5L5 19',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.700l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  unlink: 'M10 14a4 4 0 0 0 5.7 0l1-1M14 10a4 4 0 0 0-5.7 0l-1 1M17 7l3-3M7 17l-3 3M16 3v2M21 8h-2M8 21v-2M3 16h2',
  reset: 'M4 4v6h6M4 10a8 8 0 1 1 2 6',
  symmetry: 'M12 3v18M5 8l-2 4 2 4M19 8l2 4-2 4M8 6v12M16 6v12',
  pin: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.800 7 11 7 11zM12 8a2.500 2.500 0 1 0 0 5 2.500 2.500 0 0 0 0-5z',
  star: 'M12 3l2.7 5.6 6.1.9-4.400 4.300 1 6.100L12 17l-5.400 2.900 1-6.100L3.200 9.500l6.100-.900z',
  grid: 'M4 4h16v16H4zM4 10h16M4 16h16M10 4v16M16 4v16',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  check: 'M4 12l5 5L20 6',
};

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] ?? PATHS.plus} />
    </svg>
  );
}
