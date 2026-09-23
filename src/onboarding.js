import { addLanguagePicker } from './i18n.js';

const KEY = 'shikyou:onboarding:v1';

export function showOnboarding() {
  try {
    if ([KEY, 'shikyou:local', 'shikyou:token', 'shikyou:lastid'].some(key => localStorage.getItem(key))) return;
  } catch { /* 保存を制限したブラウザーでも案内とゲームは使える。 */ }

  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = new URL('./onboarding.css', import.meta.url).href;
  document.head.append(style);
  const dialog = document.createElement('dialog');
  dialog.className = 'welcome';
  dialog.setAttribute('aria-labelledby', 'welcome-title');
  dialog.innerHTML = `
    <header><span id="welcome-progress">はじめての方へ · 1/2</span><button type="button" id="welcome-skip">スキップ</button><button type="button" class="welcome-close" aria-label="案内を閉じる">×</button></header>
    <section id="welcome-account">
      <h2 id="welcome-title" tabindex="-1">続きを守る、<br>かんたんログイン</h2>
      <p><span class="welcome-phrase">はじめる前に、</span><span class="welcome-phrase">名前と合言葉を</span><span class="welcome-phrase">登録しませんか？</span></p>
      <div class="welcome-card"><strong>メールアドレスは不要です</strong><p><span class="welcome-phrase">好きな名前と、</span><span class="welcome-phrase">4文字以上の合言葉だけで</span><span class="welcome-phrase">登録できます。</span></p></div>
      <p><span class="welcome-phrase">進み具合を</span><span class="welcome-phrase">クラウドに保存できます。</span></p><p><span class="welcome-phrase">端末のデータが消えても、</span><span class="welcome-phrase">同じ名前と合言葉で</span><span class="welcome-phrase">保存した続きから遊べます。</span></p>
      <p class="welcome-note"><span class="welcome-phrase">保存には通信が必要です。</span><span class="welcome-phrase">名前と合言葉は</span><span class="welcome-phrase">控えておいてください。</span></p>
      <button type="button" class="welcome-primary" id="welcome-next">次へ：ホーム画面に追加</button>
    </section>
    <section id="welcome-install" hidden>
      <h2 tabindex="-1">次からは、<br>ホーム画面から</h2>
      <p><span class="welcome-phrase">ホーム画面に追加すると、</span><span class="welcome-phrase">アイコンを押すだけで</span><span class="welcome-phrase">すぐに遊べます。</span></p>
      <label for="welcome-device">お使いの端末</label>
      <select id="welcome-device"><option value="ios">iPhone / iPad（Safari）</option><option value="android">Android（Chrome）</option><option value="desktop">PC（Chrome / Edge）</option></select>
      <div class="welcome-card" id="welcome-instructions"></div>
      <button type="button" id="welcome-native" hidden>ホーム画面に追加する</button>
      <p class="welcome-note" id="welcome-install-status" role="status"><span class="welcome-phrase">追加はあとからでもできます。</span><span class="welcome-phrase">同じ名前と合言葉で</span><span class="welcome-phrase">ログインしてください。</span></p>
      <button type="button" class="welcome-primary" id="welcome-register">名前と合言葉を登録する</button>
      <button type="button" id="welcome-back">戻る</button>
    </section>
    `;
  addLanguagePicker(dialog);
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  const account = $('#welcome-account');
  const install = $('#welcome-install');
  let deferredPrompt = null;
  let closed = false;
  const markSeen = () => { try { localStorage.setItem(KEY, 'done'); } catch {} };
  function close(register = false) {
    if (closed) return;
    closed = true;
    markSeen();
    dialog.close();
    dialog.remove();
    removeEventListener('beforeinstallprompt', captureInstall);
    removeEventListener('appinstalled', installed);
    if (register) {
      document.querySelector('.tab[data-mode="signup"]').click();
      document.getElementById('name').focus();
    } else document.getElementById('go').focus();
  }
  function step(second) {
    account.hidden = second;
    install.hidden = !second;
    $('#welcome-progress').textContent = `はじめての方へ · ${second ? 2 : 1}/2`;
    const heading = (second ? install : account).querySelector('h2');
    dialog.setAttribute('aria-labelledby', second ? 'welcome-install-title' : 'welcome-title');
    heading.focus();
    dialog.scrollTop = 0;
  }
  install.querySelector('h2').id = 'welcome-install-title';
  $('.welcome-close').onclick = () => close();
  $('#welcome-skip').onclick = () => close();
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  $('#welcome-next').onclick = () => step(true);
  $('#welcome-back').onclick = () => step(false);
  $('#welcome-register').onclick = () => close(true);
  const device = $('#welcome-device');
  const ua = navigator.userAgent;
  device.value = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'ios' : /Android/.test(ua) ? 'android' : 'desktop';
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const instructions = {
    ios: '<ol><li>Safariでこのゲームを開きます。</li><li><span class="welcome-phrase">共有ボタンを押します。</span><br><span class="welcome-phrase">四角から上向き矢印の</span><span class="welcome-phrase">マークです。</span><br><span class="welcome-phrase">見当たらないときは</span><span class="welcome-phrase">メニュー内を確認します。</span></li><li><span class="welcome-phrase">「ホーム画面に追加」</span>を選び、<span class="welcome-phrase">「追加」を押します。</span><br><span class="welcome-phrase">「Webアプリとして開く」</span><span class="welcome-phrase">が表示されたら</span><span class="welcome-phrase">オンにします。</span></li></ol>',
    android: '<ol><li>Chromeでこのゲームを開きます。</li><li>右上の「⋮」メニューを開きます。</li><li><span class="welcome-phrase">「ホーム画面に追加」</span>を選びます。表示が異なる場合は「インストールしてショートカットを作成」を選び、案内に沿って追加します。</li></ol>',
    desktop: '<ol><li>ChromeまたはEdgeでこのゲームを開きます。</li><li>ブラウザーのメニューから、アプリのインストールやショートカットの作成を選びます。</li><li>画面の案内に沿って追加します。</li></ol>'
  };
  function instructionsForDevice() {
    $('#welcome-instructions').innerHTML = standalone ? '<strong>ホーム画面から起動できています</strong><p>追加の操作は必要ありません。そのまま遊べます。</p>' : instructions[device.value];
  }
  device.onchange = instructionsForDevice;
  instructionsForDevice();
  function captureInstall(event) {
    if (standalone) return;
    event.preventDefault();
    deferredPrompt = event;
    $('#welcome-native').hidden = false;
  }
  function installed() {
    deferredPrompt = null;
    $('#welcome-native').hidden = true;
    $('#welcome-install-status').textContent = '追加されました。次からはホーム画面のアイコンから開けます。';
  }
  addEventListener('beforeinstallprompt', captureInstall);
  addEventListener('appinstalled', installed);
  $('#welcome-native').onclick = async () => {
    if (!deferredPrompt) return;
    const prompt = deferredPrompt;
    deferredPrompt = null;
    $('#welcome-native').hidden = true;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      $('#welcome-install-status').textContent = choice.outcome === 'accepted' ? '追加手続きを受け付けました。端末の案内をご確認ください。' : '追加はあとからでもできます。上の手順からお試しください。';
    } catch { $('#welcome-install-status').textContent = '上のブラウザーのメニュー操作で追加できます。'; }
  };
  dialog.showModal();
  markSeen();
  $('#welcome-title').focus();
}
