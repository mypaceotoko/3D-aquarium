// Aquarium registry.
// To add a new aquarium: append one entry. No other files need editing.

export const AQUARIUMS = [
  {
    id:       'deep-sea',
    title:    '深海ミステリー水槽',
    desc:     '神秘的な深海の世界。古代生物とリヴァイアサンが眠る、暗く壮大な海。',
    gradient: 'linear-gradient(155deg,#020d14 0%,#062030 55%,#041c28 100%)',
    accent:   '#00d8b8',
    launch:   () => import('./main.js').then(m => m.launch()),
  },
  {
    id:       'tropical',
    title:    'トロピカル水槽',
    desc:     '明るく温かい南の海。クマノミ、ウミガメ、カラフルな魚たちの楽園。',
    gradient: 'linear-gradient(155deg,#0070b0 0%,#00aadc 50%,#10d0c0 100%)',
    accent:   '#ffdd44',
    launch:   () => import('./aquariums/tropical.js').then(m => m.launch()),
  },
];
