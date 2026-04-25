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
  {
    id:       'ocean',
    title:    'ジャイアントオーシャン水槽',
    desc:     '広大な大海原。クジラ、シャチ、メガロドン、そしてダイオウイカ——地球最大級の生命たちが悠々と泳ぐ、圧倒的スケールの海。',
    gradient: 'linear-gradient(155deg,#001428 0%,#003060 45%,#005580 100%)',
    accent:   '#40c8ff',
    launch:   () => import('./aquariums/ocean.js').then(m => m.launch()),
  },
  {
    id:       'sweets',
    title:    'スイーツアクアリウム',
    desc:     '海モチーフのお菓子たちが泳ぐ、ちょっと不思議な水槽。たい焼き、金魚ゼリー、シーラカンスモナカ——甘くて可愛い、もう一つの海。',
    gradient: 'linear-gradient(155deg,#ffd6ec 0%,#b8e4ff 45%,#fff0c8 100%)',
    accent:   '#ff7aa8',
    launch:   () => import('./aquariums/sweets.js').then(m => m.launch()),
  },
  {
    id:       'jellyfish',
    title:    'クラゲ幻想水槽',
    desc:     '光と闇が溶け合う、薄暮の水槽。ミズクラゲ、アカクラゲ、エチゼンクラゲ——大小様々な海月たちが、ゆっくりと脈打ちながら漂う、幻想的な静寂の海。',
    gradient: 'linear-gradient(155deg,#1a0838 0%,#3a1466 35%,#0a3a5a 70%,#062840 100%)',
    accent:   '#b988ff',
    launch:   () => import('./aquariums/jellyfish.js').then(m => m.launch()),
  },
];
