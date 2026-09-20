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
    <header><span id="welcome-progress">はじめての方へ · 1 / 2</span><button type="button" id="welcome-skip">スキップ</button><button type="button" class="welcome-close" aria-label="案内を閉じる">×</button></header>
    <section id="welcome-account">
      <h2 id="welcome-title" tabindex="-1">続きを守る、<br>かんたんログイン</h2>
      <p>はじめる前に、名前と合言葉を登録しておきませんか？</p>
      <div class="welcome-card"><strong>メールアドレスは不要です</strong><p>好きな名前と、4文字以上の合言葉だけで登録できます。</p></div>
      <p>ログインすると、進み具合をクラウドに保存できます。端末のデータが消えても、同じ名前と合言葉で、クラウドに保存した続きから遊べます。</p>
      <p class="welcome-note">保存には通信が必要です。名前と合言葉は忘れないように控えておいてください。</p>
      <button type="button" class="welcome-primary" id="welcome-next">次へ：ホーム画面に追加</button>
    </section>
    <section id="welcome-install" hidden>
      <h2 tabindex="-1">次からは、<br>ホーム画面から</h2>
      <p>ゲームをホーム画面に追加すると、アイコンを押すだけですぐに遊べます。</p>
      <label for="welcome-device">お使いの端末</label>
      <select id="welcome-device"><option value="ios">iPhone / iPad（Safari）</option><option value="android">Android（Chrome）</option><option value="desktop">パソコン（Chrome / Edge）</option></select>
      <div class="welcome-card" id="welcome-instructions"></div>
      <button type="button" id="welcome-native" hidden>ホーム画面に追加する</button>
      <p class="welcome-note" id="welcome-install-status" role="status">追加はあとからでもできます。ログインして、同じ名前と合言葉で続きを遊んでください。</p>
      <button type="button" class="welcome-primary" id="welcome-register">名前と合言葉を登録する</button>
      <button type="button" id="welcome-back">戻る</button>
    </section>
    `;
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
    $('#welcome-progress').textContent = `はじめての方へ · ${second ? 2 : 1} / 2`;
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
    ios: '<ol><li>Safariでこのゲームを開きます。</li><li>共有ボタン（四角から上向き矢印）を押します。見つからない場合はメニューを開きます。</li><li>「ホーム画面に追加」を選び、「追加」を押します。「Webアプリとして開く」が表示されたらオンにします。</li></ol>',
    android: '<ol><li>Chromeでこのゲームを開きます。</li><li>右上の「⋮」メニューを開きます。</li><li>「ホーム画面に追加」または「インストールしてショートカットを作成」を選び、画面の案内に沿って追加します。</li></ol>',
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
