// ─── Creature info lookup (all aquariums) ────────────────────────────────────
const INFO = {
  // deep-sea
  leviathan:    { label: 'リヴァイアサン',      desc: '太古の深海に君臨する伝説の巨大生命体' },
  jellyfish:    { label: 'クラゲ',             desc: '浮遊する光の化身。触手に毒を持つ種もある' },
  coelacanth:   { label: 'シーラカンス',        desc: '4億年前から姿を変えない「生きた化石」' },
  trilobite:    { label: '三葉虫',             desc: '古生代の海を支配した節足動物の祖先' },
  isopod:       { label: 'ダイオウグソクムシ',   desc: '深海の掃除屋。数年間の断食にも耐える' },
  gar:          { label: 'アリゲーターガー',     desc: '恐竜時代から姿が変わらない生きた化石' },
  pirarucu:     { label: 'ピラルク',           desc: '世界最大級の淡水魚。アマゾン川の主' },
  // tropical
  clownfish:    { label: 'クマノミ',           desc: 'イソギンチャクと共生する橙色の守護者' },
  'neon-tetra': { label: 'ネオンテトラ',        desc: '青と赤の蛍光帯が輝く熱帯魚の宝石' },
  'sea-turtle': { label: 'ウミガメ',           desc: '数十年を生きる海の旅人。生まれた浜に戻る' },
  guppy:        { label: 'グッピー',           desc: '鮮やかな尾びれを持つ人気の熱帯魚' },
  shrimp:       { label: '小エビ',             desc: '水槽の掃除屋。敏捷な動きで底を走る' },
  seahorse:     { label: 'タツノオトシゴ',      desc: 'オスが子どもを産む、海の不思議な魚' },
  // ocean
  dolphin:      { label: 'イルカ',             desc: '高い知能を持つ海の賢者。群れで暮らす' },
  orca:         { label: 'シャチ',             desc: '海の頂点捕食者。高度な社会性と知性を持つ' },
  whale:        { label: 'クジラ',             desc: '地球最大の生命体。歌声は数百kmに届く' },
  shark:        { label: 'サメ',               desc: '4億年、姿を変えない完全なる狩人' },
  megalodon:    { label: 'メガロドン',          desc: '体長18mに達したとされる太古の超巨大ザメ' },
  squid:        { label: 'ダイオウイカ',         desc: '深海に棲む最大級の無脊椎動物。巨大な眼と長い触腕を持つ' },
  // sweets
  taiyaki:             { label: 'たい焼き',         desc: '水中を泳ぐ甘い主役。尾びれをパタパタ、時々くるっと旋回' },
  'coelacanth-monaka': { label: 'シーラカンスモナカ', desc: 'レアな古代菓子。金色のオーラを纏いゆっくり漂う' },
  'crab-pan':          { label: 'カニパン',         desc: '横歩きする愛嬌者。脚がちょこちょこ、ハサミをぶんぶん' },
  'goldfish-jelly':    { label: '金魚ゼリー',       desc: '透明ゼリーに泳ぐ金魚。ぷるぷる揺れてふわふわ上下' },
  'tako-sen':          { label: 'タコせん',         desc: '平たいせんべい。くるくる回転しながら漂い、たまにフラッター' },
  'ebi-sen':           { label: 'えびせん',         desc: 'パリッと軽快。小群れで水中を素早く横切る' },
};

// ─── UI component ─────────────────────────────────────────────────────────────

export function createObservationUI() {
  const wrap = document.createElement('div');
  wrap.style.cssText = [
    'position:fixed',
    'top:max(16px,env(safe-area-inset-top))',
    'left:50%',
    'transform:translateX(-50%)',
    'z-index:150',
    'display:flex',
    'align-items:center',
    'gap:10px',
    'padding:9px 14px 9px 18px',
    'border-radius:999px',
    'background:rgba(6,20,36,0.60)',
    'backdrop-filter:blur(14px) saturate(140%)',
    '-webkit-backdrop-filter:blur(14px) saturate(140%)',
    'border:1px solid rgba(140,220,255,0.20)',
    'box-shadow:0 4px 24px rgba(0,0,0,0.45)',
    'color:#d8f2ff',
    'font-family:inherit',
    'white-space:nowrap',
    'max-width:calc(100vw - 32px)',
    'opacity:0',
    'pointer-events:none',
    'transition:opacity 0.35s ease',
  ].join(';');

  const nameEl = document.createElement('span');
  nameEl.style.cssText = 'font-size:14px;font-weight:700;letter-spacing:0.04em;flex-shrink:0;';

  const sep = document.createElement('span');
  sep.textContent = '—';
  sep.style.cssText = 'opacity:0.30;flex-shrink:0;font-size:12px;';

  const descEl = document.createElement('span');
  descEl.style.cssText = [
    'font-size:11px',
    'opacity:0.62',
    'letter-spacing:0.03em',
    'overflow:hidden',
    'text-overflow:ellipsis',
    'max-width:260px',
  ].join(';');

  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '&#x2715;';
  closeBtn.title = '閉じる';
  closeBtn.style.cssText = [
    'appearance:none',
    'border:1px solid rgba(140,220,255,0.18)',
    'background:rgba(20,50,70,0.50)',
    'color:#d8f2ff',
    'width:26px',
    'height:26px',
    'border-radius:50%',
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    'font-size:11px',
    'cursor:pointer',
    'flex-shrink:0',
    'padding:0',
    'line-height:1',
    'margin-left:2px',
  ].join(';');

  wrap.append(nameEl, sep, descEl, closeBtn);
  document.body.appendChild(wrap);

  let _onClose = null;
  closeBtn.addEventListener('click', () => _onClose?.());

  return {
    show(species) {
      const info = INFO[species] ?? { label: species, desc: '' };
      nameEl.textContent = info.label;
      descEl.textContent = info.desc;
      const hasDesc = !!info.desc;
      sep.style.display  = hasDesc ? '' : 'none';
      descEl.style.display = hasDesc ? '' : 'none';
      wrap.style.opacity = '1';
      wrap.style.pointerEvents = 'auto';
    },
    hide() {
      wrap.style.opacity = '0';
      wrap.style.pointerEvents = 'none';
    },
    onClose(cb) { _onClose = cb; },
  };
}
