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
  tamoto:       { label: '田本',               desc: 'マスク姿で深海を漂う謎のスイマー。普段は底でスマホ三昧、三葉虫や大王具足虫が近づくと慌てて砂に潜る。餌が落ちると誰より早く突っ込む' },
  // tropical
  clownfish:    { label: 'クマノミ',           desc: 'イソギンチャクと共生する橙色の守護者' },
  'neon-tetra': { label: 'ネオンテトラ',        desc: '青と赤の蛍光帯が輝く熱帯魚の宝石' },
  'sea-turtle': { label: 'ウミガメ',           desc: '数十年を生きる海の旅人。生まれた浜に戻る' },
  guppy:        { label: 'グッピー',           desc: '鮮やかな尾びれを持つ人気の熱帯魚' },
  shrimp:       { label: '小エビ',             desc: '水槽の掃除屋。敏捷な動きで底を走る' },
  seahorse:     { label: 'タツノオトシゴ',      desc: 'オスが子どもを産む、海の不思議な魚' },
  'garden-eel': { label: 'チンアナゴ',          desc: '砂から顔を出してゆらゆら揺れる、愛嬌たっぷりの穴子の仲間' },
  // ocean
  dolphin:      { label: 'イルカ',             desc: '高い知能を持つ海の賢者。群れで暮らす' },
  orca:         { label: 'シャチ',             desc: '海の頂点捕食者。高度な社会性と知性を持つ' },
  whale:        { label: 'クジラ',             desc: '地球最大の生命体。歌声は数百kmに届く' },
  shark:        { label: 'サメ',               desc: '4億年、姿を変えない完全なる狩人' },
  megalodon:    { label: 'メガロドン',          desc: '体長18mに達したとされる太古の超巨大ザメ' },
  squid:        { label: 'ダイオウイカ',         desc: '深海に棲む最大級の無脊椎動物。巨大な眼と長い触腕を持つ' },
  innocence:    { label: 'イノセンス',           desc: 'スーツ姿のままスマホ片手に遊泳する謎の存在。時々サメに追われては大慌て' },
  // jellyfish
  'moon-jelly':    { label: 'ミズクラゲ',     desc: '4葉のゴナドが透ける半透明の傘。最も身近で美しい王道のクラゲ' },
  'red-jelly':     { label: 'アカクラゲ',     desc: '16本の縞模様と長く流れる触手。刺胞毒は強く、別名「ハクションクラゲ」' },
  'nomura-jelly':  { label: 'エチゼンクラゲ', desc: '直径2mに達する世界最大級のクラゲ。重さ200kg、悠然と漂う海の主' },
  'spotted-jelly': { label: 'タコクラゲ',     desc: '白い水玉模様と8本のこん棒状の口腕。共生藻類で光合成もする' },
  'crystal-jelly': { label: 'オワンクラゲ',   desc: '透明な傘とGFP蛍光タンパク質。脈打つたびに緑に光る、ノーベル賞の星' },

  // sweets
  taiyaki:             { label: 'たい焼き',         desc: '水中を泳ぐ甘い主役。尾びれをパタパタ、時々くるっと旋回' },
  'coelacanth-monaka': { label: 'シーラカンスモナカ', desc: 'レアな古代菓子。金色のオーラを纏いゆっくり漂う' },
  'crab-pan':          { label: 'カニパン',         desc: '横歩きする愛嬌者。脚がちょこちょこ、ハサミをぶんぶん' },
  'goldfish-jelly':    { label: '金魚ゼリー',       desc: '透明ゼリーに泳ぐ金魚。ぷるぷる揺れてふわふわ上下' },
  'tako-sen':          { label: 'タコせん',         desc: '平たいせんべい。くるくる回転しながら漂い、たまにフラッター' },
  'ebi-sen':           { label: 'えびせん',         desc: 'パリッと軽快。小群れで水中を素早く横切る' },
  'mr-utsugi':         { label: 'Mr. ウツギ',        desc: '水槽の名物キャラ。お菓子生物を追いかけ回し、餌が落ちると猛烈に走って食べる丸メガネの食いしん坊' },

  // ancient giants
  futabasaurus: { label: 'フタバスズキリュウ', desc: '白亜紀末の日本近海を泳いだ首長竜。長い首と4枚の大きな鰭脚で、ゆったりと水中を滑空する' },
  opabinia:     { label: 'オパビニア',         desc: 'カンブリア紀の奇妙な節足動物。5つの眼柄と先端に爪を持つ象の鼻のような触手で獲物を捕らえる' },
  anomalocaris: { label: 'アノマロカリス',     desc: '古生代の海を支配したカンブリア紀の頂点捕食者。並ぶ側鰭で波打つように泳ぎ、円形の口で三葉虫すら噛み砕いた' },
  cameroceras:  { label: 'カメロケラス',       desc: '体長6mを超えるオルドビス紀の巨大直角貝。長い円錐形の殻に身を隠し、10本の触手で獲物を絡め取った海の主' },
  bluewhale:    { label: 'シロナガスクジラ',     desc: '地球上最大の動物。体長24〜30m、体重100〜180トン。ひげ板で海水を濾し小さなオキアミを大量に食べる、回復途上の優しき巨人' },
  frilledshark: { label: 'ラブカ',             desc: '深海120〜1280mに棲む「生きた化石」。6対の襞状エラと約300本の三叉の歯、3年以上ともされる長い妊娠期間を持つウナギ型の深海ザメ' },
  ammonite:     { label: 'アンモナイト',        desc: '約4.5億年前に出現し中生代に大繁栄、6600万年前に絶滅した渦巻く殻の頭足類。気室で浮力を調整しながら太古の海を漂った' },
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
