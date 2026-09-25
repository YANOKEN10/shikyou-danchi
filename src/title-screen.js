import { language } from './i18n.js';

export function showTitleScreen() {
  const screen = document.getElementById('titleScreen');
  if (!screen) return Promise.resolve();
  const button = document.getElementById('titleEnter');
  const copy = {
    ja: ['四号棟', '死鏡団地', '決して、入ってはいけない。', 'タップしてはじめる', 'はじめる'],
    es: ['BLOQUE CUATRO', 'SHIKYOU DANCHI', 'Nunca debes entrar.', 'Toca para comenzar', 'Comenzar'],
    en: ['BUILDING No. 4', 'SHIKYOU DANCHI', 'Never enter.', 'Tap to begin', 'Begin'],
    'zh-Hans': ['四号楼', '死镜团地', '绝对不要进去。', '轻触开始', '开始'],
    'zh-Hant': ['四號樓', '死鏡團地', '絕對不要進去。', '輕觸開始', '開始'],
  }[language] || null;
  if (copy) {
    ['.title-location', '.title-wordmark', '.title-tagline', '.title-action'].forEach((selector, i) => {
      screen.querySelector(selector).textContent = copy[i];
    });
    button.setAttribute('aria-label', copy[4]);
    screen.setAttribute('aria-label', copy[1]);
  }
  screen.dataset.language = language;
  button.focus({ preventScroll: true });
  return new Promise(resolve => {
    button.addEventListener('click', () => {
      button.disabled = true;
      screen.classList.add('leaving');
      const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450;
      setTimeout(() => {
        screen.remove();
        resolve();
        requestAnimationFrame(() => {
          if (!document.querySelector('dialog[open]')) document.querySelector('#gate .language-picker select, #gate input')?.focus({ preventScroll: true });
        });
      }, duration);
    }, { once: true });
  });
}
