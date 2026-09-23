import { EN } from './en.js';

const KEY = 'shikyou:language';
function preferredLanguage() {
  const requested = new URLSearchParams(location.search).get('lang');
  if (requested === 'en' || requested === 'ja') return requested;
  try { const saved = localStorage.getItem(KEY); if (saved === 'en' || saved === 'ja') return saved; } catch {}
  return navigator.language?.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}
export const language = preferredLanguage();
export const missingTranslations = new Set();
const trimmed = new Map(Object.entries(EN).map(([key, value]) => [key.trim(), value]));
const japanese = /[\u3040-\u30ff\u3400-\u9fff]/;
const floors = { '一階': '1F', '二階': '2F', '三階': '3F', '四階': '4F', '五階': '5F' };

// Only display strings enter this function. Save IDs, account names and game state stay untouched.
export function tr(value) {
  if (language !== 'en' || typeof value !== 'string') return value;
  if (Object.hasOwn(EN, value)) return EN[value];
  const text = value.trim();
  if (trimmed.has(text)) return trimmed.get(text);
  if (!japanese.test(text)) return value;
  let match;
  if ((match = text.match(/^(.*) さん、おかえりなさい。$/))) return `${match[1]}, welcome back.`;
  if ((match = text.match(/^ログイン中：(.*)$/))) return `Logged in: ${match[1]}`;
  if ((match = text.match(/^名前：(.*?)　／　メール：(.*)$/))) return `Name: ${match[1]} / Email: ${match[2] === '登録なし' ? 'Not registered' : match[2]}`;
  if ((match = text.match(/^(.*?)( がつかまった。| が起きあがった。| が連れて行かれた。)$/))) return match[1] + EN[match[2]];
  if ((match = text.match(/^(.+)を取る$/))) return `Take ${tr(match[1])}`;
  if ((match = text.match(/^(.+)を取りました。$/))) return `Acquired: ${tr(match[1])}.`;
  if ((match = text.match(/^(.+)を開ける$/))) return `Open ${tr(match[1])}`;
  if ((match = text.match(/^(.+)を閉める$/))) return `Close ${tr(match[1])}`;
  if ((match = text.match(/^▸\s*(.*)$/))) return `▸ ${tr(match[1])}`;
  if ((match = text.match(/^・(.*?)(　×\d+)?$/))) return `• ${tr(match[1])}${match[2] || ''}`;
  if ((match = text.match(/^(.*)で遊びます$/))) return `${tr(match[1])} selected`;
  if ((match = text.match(/^はじめる（(\d+)人）$/))) return `Start (${match[1]} players)`;
  if ((match = text.match(/^(.+)。（休 → こまったときは、で詳しく）$/))) return `${tr(match[1])}. (Pause → Help for details.)`;
  // Composed status counters contain only game-owned labels and numbers.
  if (/見つけたもの|かかった時間|のこり|　鍵 |　あと|^鍵 |^\d+分|^\d+秒/.test(text)) {
    let result = text;
    for (const [ja, en] of Object.entries(floors)) result = result.replaceAll(ja, en);
    for (const [ja, en] of [['見つけたもの','Found: '],['かかった時間','Time: '],['のこり','Remaining: '],['階段室へ！','Get to the stairs!'],['それ','The Presence'],['住人','Resident'],['鍵','Keys '],['あと','Left: '],['人',' players'],['回',' times'],['分',' min'],['秒',' sec'],['　／　',' / ']]) result = result.replaceAll(ja, en);
    if (!japanese.test(result)) return result;
  }
  if ((match = text.match(/^(それ|住人)　——(勝ち|負け)$/))) return `${tr(match[1])} — ${match[2] === '勝ち' ? 'WIN' : 'LOSE'}`;
  if ((match = text.match(/^うまくいきませんでした（(.*)）$/))) return `Something went wrong (${match[1]})`;
  missingTranslations.add(value);
  return value;
}

const excluded = 'script,style,textarea,[data-user-content],[data-no-translate],#contName,#lobbyCode';
function translateNode(node) {
  const parent = node.parentElement;
  if (!parent || parent.closest(excluded)) return;
  if (parent.id === 'whoami' && node.nodeValue.startsWith('☁')) return;
  const translated = tr(node.nodeValue);
  if (translated !== node.nodeValue) node.nodeValue = translated;
}
function translateTree(root) {
  if (root.nodeType === Node.TEXT_NODE) { translateNode(root); return; }
  if (root.nodeType !== Node.ELEMENT_NODE || root.matches(excluded)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) translateNode(walker.currentNode);
  for (const el of [root, ...root.querySelectorAll('[placeholder],[aria-label],[title]')]) {
    if (el.closest('[data-user-content],[data-no-translate]')) continue;
    for (const attribute of ['placeholder','aria-label','title']) {
      const text = el.getAttribute(attribute);
      if (text != null && tr(text) !== text) el.setAttribute(attribute, tr(text));
    }
  }
}
export function addLanguagePicker(host) {
  const label = document.createElement('label');
  label.className = 'language-picker';
  label.dataset.noTranslate = '';
  label.append('Language / 言語 ');
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Language / 言語');
  select.innerHTML = '<option value="ja">日本語</option><option value="en">English</option>';
  select.value = language;
  select.onchange = () => {
    try {
      localStorage.setItem(KEY, select.value);
      if (document.querySelector('.welcome')) localStorage.removeItem('shikyou:onboarding:v1');
    } catch {}
    const url = new URL(location.href);
    url.searchParams.set('lang', select.value);
    location.replace(url.href);
  };
  label.append(select);
  host.prepend(label);
}
export function initLocale() {
  document.documentElement.lang = language;
  addLanguagePicker(document.querySelector('#gate .panel'));
  if (language !== 'en') return;
  document.title = 'Shikyou Danchi | Horror Game';
  translateTree(document.body);
  // Covers dynamically created menus and server messages without changing gameplay strings.
  new MutationObserver(records => {
    const changed = new Set();
    for (const record of records) {
      if (record.type === 'childList') record.addedNodes.forEach(node => changed.add(node));
      else changed.add(record.target);
    }
    for (const node of changed) if (node.isConnected) translateTree(node);
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder','aria-label','title'] });
}
