import { AQUARIUMS } from './registry.js';

const overlay = document.getElementById('selector');
const grid    = overlay.querySelector('.aq-grid');

AQUARIUMS.forEach(aq => {
  const card = document.createElement('button');
  card.className = 'aq-card';
  card.setAttribute('role', 'listitem');
  card.setAttribute('aria-label', aq.title + 'に入る');
  card.innerHTML = `
    <div class="aq-thumb" style="background:${aq.gradient}">
      <div class="aq-thumb-shine"></div>
    </div>
    <div class="aq-info">
      <h2 class="aq-name">${aq.title}</h2>
      <p class="aq-desc">${aq.desc}</p>
      <span class="aq-cta">入る →</span>
    </div>
  `;
  card.addEventListener('click', () => enter(aq));
  grid.appendChild(card);
});

function enter(aq) {
  overlay.classList.add('sel-leaving');
  setTimeout(() => {
    overlay.style.display = 'none';
    aq.launch();
    injectBackButton();
  }, 520);
}

function injectBackButton() {
  const btn = document.createElement('button');
  btn.className = 'btn back-btn';
  btn.textContent = '◀ 水槽を変える';
  btn.setAttribute('title', '水槽選択画面へ戻る');
  btn.addEventListener('click', () => { location.reload(); });
  document.body.appendChild(btn);
}
