# 死鏡団地 — 引きつぎメモ（Codex 用）

このファイルを読めば、どこに何があるか・次に何をすればいいかが分かるようにしてあります。
そのまま Codex に貼って使えます。

---

## 0. まず場所

| なに | どこ |
|---|---|
| ソース一式 | `I:\Claude code\shikyou-danchi\` |
| GitHub | https://github.com/YANOKEN10/shikyou-danchi （公開） |
| 公開URL | https://shikyou-danchi.vercel.app/ |
| 動作確認 | https://shikyou-danchi.vercel.app/api/health → `configured: true` なら正常 |
| デプロイ | `git push origin main` で Vercel が自動デプロイ。手動操作は不要 |

ローカルで動かす：

```bash
cd "I:\Claude code\shikyou-danchi" && node serve.js
```

→ http://localhost:5180 （`serve.js` は開発専用。`.vercelignore` で本番には出ません）

---

## 1. これは何のゲームか

「雪葬」「白栄大学０号館」のような、**ブラウザだけで遊べる日本語の一人称探索ホラー**。
解体前夜の団地「死鏡団地・四号棟」の一階から五階までを、階段でのぼっていく。

- Three.js r169（`lib/three.module.js` に同梱。CDN は使わない）
- **画像ファイルも音声ファイルも一つも使っていない。** すべて canvas と WebAudio でその場で作る
- ビルド工程なし。素の ES modules をブラウザが直接読む
- ログインは Vercel Serverless + Vercel Blob。メールアドレス無しでも、有りでも入れる
- 同じアカウントで PC とスマホの続きができる

---

## 2. ファイルの地図

### 画面まわり

| ファイル | 行数 | 中身 |
|---|---|---|
| `index.html` | 561 | 全部の HTML と CSS。ログイン画面・HUD・スマホ操作・各種シート（読み物／持ち物／小休止／結末／記録選択／鬼ごっこの待合） |
| `src/main.js` | 423 | 入口。ログイン画面の制御、記録の選択、鬼ごっこの待合、スマホ操作の割り当て |
| `src/ui.js` | 309 | 画面表示（せりふ、階の見出し、目標、鬼ごっこの表示） |

### ゲーム本体

| ファイル | 行数 | 中身 |
|---|---|---|
| `src/game.js` | 1393 | **中心。** 主ループ `_step(dt)`、階の読み込み `loadFloor()`、調べる `_interact()`、部屋のしかけ `_roomFx()`、小休止の各画面（ヒント `_hintPanel()`／音 `_soundPanel()`／アカウント `_accountPanel()`） |
| `src/build.js` | 1312 | 3D の組み立て。寸法 `D`、当たり判定 `Colliders`、住戸 `buildUnit()`、家財の型 `FURNISH`、階段室 `buildStair()`、階まるごと `buildFloor()`、「それ」の見た目 `buildEntity()`、引きずる裾 `buildHem()` |
| `src/player.js` | 374 | 移動・視点・しゃがむ・走る・懐中電灯・電池 |
| `src/entity.js` | 263 | 「それ」の思考（`sleep`／`patrol`／`listen`／`hunt`）と、部屋の奥に立つ `Apparition` |
| `src/haunt.js` | 440 | **怪奇現象（新しい）。** 下の 4章参照 |
| `src/story.js` | 672 | **文章と設定のすべて。** 階の定義 `FLOORS`、部屋 `ROOMS`、メモ `MEMOS`、持ち物 `ITEMS`、ささやき `WHISPERS`、結末 `ENDINGS`、いまの目標 `currentGoal()`、逃げ方のヒント `SURVIVAL` |
| `src/textures.js` | 970 | 見た目のもと。全部 canvas で描く。壁・床・扉・畳・鏡・砂嵐・顔 `face()`・髪 `hairFront()`・血 `bloodStain()` など |
| `src/audio.js` | 747 | 音。全部 WebAudio で合成。`catalog()` に一覧（小休止の「音のたしかめ」から鳴らせる） |

### 通信・保存

| ファイル | 中身 |
|---|---|
| `src/cloud.js` | ログイン状態と記録の保存／読み込み。localStorage の鍵は `shikyou:token` `shikyou:local` `shikyou:owner` `shikyou:lastid` |
| `src/net.js` | WebRTC のデータチャンネル（鬼ごっこ用） |
| `src/versus.js` | 鬼ごっこ本体。host が判定を持つ |
| `api/_lib.js` | 認証の中身。scrypt でパスワード、HMAC-SHA256 で1年の署名つきトークン。CORS の許可元もここ |
| `api/_store.js` | 保存先の切りかえ。本番は Vercel Blob、手元は `.devdata/` |
| `api/auth.js` | 登録・ログイン（名前でもメールでも入れる） |
| `api/account.js` | メール設定／解除、パスワード変更、改名、退会 |
| `api/save.js` | 記録の読み書き。`rev` が食い違えば 409 |
| `api/room.js` | 鬼ごっこの合流部屋（4文字の合言葉）。20分で消える |
| `api/health.js` | 設定できているかの確認 |

### 環境変数（Vercel に設定済み。触らなくてよい）

- `AUTH_SECRET` — トークンの署名鍵
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob の鍵

---

## 3. 遊びの流れ（実装済み）

1. **一階** — 靴箱の上の懐中電灯を拾う。掲示板に解体のお知らせ
2. **二階** — 二〇二号室の台所のフックに、階段の南京錠の鍵
3. **三階** — 蛍光灯が切れかけ。**ここから「それ」が出る。** 分電盤を上げないと階段室が暗くて進めない
4. **四階** — 廊下がつながっていて、何度回っても同じ場所に戻る。四〇四号室のメモ（m5）を読むと輪が解ける
5. **五階** — 屋上へ。結末は「おぼえている」（真）と「四〇四号室」（つかまった）の二つ

**鬼ごっこ**：小休止かログイン画面から。合言葉4文字で合流。鬼が一人、逃げる側が残り。
制限5分・鍵3本。人数が増えても難易度は変えない（本人の希望）。

---

## 4. 怪奇現象 `src/haunt.js`（いちばん新しい仕事）

### しくみ

`Haunts` クラスが階ごとに時計を持ち、**30〜55秒に一度**、そのとき起こせるものを一つ選ぶ。
直前と同じものは選ばない。作った物は `game.floor.group` にぶら下げるので、階を移れば
`disposeFloor()` が一緒に片づける。

`game.js` との接点は4か所だけ：

- `constructor` … `this.haunt = new Haunts(this)`
- `loadFloor()` … `this.haunt.reset()`
- `_step(dt)` … `this.haunt.update(dt)`（`_roomFx(dt)` の直後）
- `_roomEnter()` / `_roomExit()` … `armShoes()` / `dropShoes()`

### 中身

| 名前 | 起きること | 起きる条件 |
|---|---|---|
| `_pot()` | 台所で鍋が落ちる。蓋も外れて床をまわる | 住戸の中にいるとき |
| `dropShoes()` | 部屋を出ると、無かったはずの靴が落ちている | 二階以上で部屋に入ったあと、出たときに1/2 |
| `_blood()` | 壁に血が滲み、5秒でにじみ切り、4秒とどまり、6秒で消える | いつでも |
| `_sway()` | 玄関の扉が11秒ゆらゆら揺れる | 廊下にいて、3.5〜15m 先に閉じた扉がある |
| `_opens()` | 部屋の扉がひとりでに開く | 廊下にいて、5〜16m 先に入れる扉がある |
| `_roomLight()` | 閉まった扉の下から部屋の灯りが漏れる。ときどき翳る | 廊下にいて、4〜18m 先に閉じた扉がある |
| `_outage()` | 廊下の灯りが全部消え、5〜9秒後にばたついてまた点く | 廊下にいて、生きている灯りがある |

新しく足したもの：`TX.bloodStain()`（`src/textures.js`）、`snd.clatter()`（`src/audio.js`）。

### 気をつけた点

- 扉の演出中に主人公がその扉を開け閉めしたら、演出のほうが折れる（`d.open` を毎フレーム見ている）
- `d.busy` を立てて、同じ扉に二つの演出が重ならないようにしている
- 鬼ごっこ中は `update()` の頭で止まる

---

## 5. 三階で逃げられなかった不具合（直済み）

**症状**：三階で「それ」に出会うと、どう逃げてもつかまる。

**原因**：廊下の幅は 2.55m しかないのに、つかまる距離が 0.85m、
さらに「それ」が左右に ±0.18m ふらついていた。壁ぎわに寄っても運まかせだった。

**直した内容**：

- `src/entity.js` … つかまる距離 `0.85` → `0.6`、ふらつき `* 0.18` → `* 0.07`
- `src/build.js` … `rec.startOpen = Boolean(floorDef.entity) && (i === 1 || i === 3)`
  （「それ」が出る階では、扉を2枚ぶん最初から開けておく＝逃げこむ先）
- `src/game.js` … `loadFloor()` で `startOpen` の扉を開けておく
- `src/story.js` … `SURVIVAL` と三階の目標文を「まんなかを避けて、どちらかの壁ぎわに寄る」と書き直した

**確認のしかた**（各5回、すべて再現した）：
壁ぎわを走る／壁ぎわを歩く／手すり側を走る → いずれも逃げきる。
まんなかを走る → つかまる（これは意図どおり）。

---

## 6. 残っている仕事

### ■ 家具の作り込み（ユーザーの依頼。まだ手つかず）

> 各部屋の家具を様々に置いてください。
> ・お風呂場やトイレ、キッチンなどは全ての部屋にも設置し、お風呂場やトイレは入れるようにしてください。
> ・部屋の中には、冷蔵庫も置いて、開けられるようにしてください。
> ・手紙や日記などは、実際にモノがわかるように作成して置いてください。
> ・懐中電灯や、鍵も、見た目で分かるように作成して置いてください。

**いまの状態**：住戸は `src/build.js` の `buildUnit()` が組み立てる。
玄関側が台所（タイル床）、奥が居室（畳／板／むきだし）。部屋ごとの家財は
`FURNISH` という14種類の型（`kitchen` `butsudan` `boxes` `child` `empty` `trash`
`bath` `mirrors` `futon` `flowers` `storage` `office` `tv` `dolls` `letter` `home`）から
`ROOMS[部屋番号].kind` で選んでいる。風呂・トイレは `bath` の型だけが持っていて、
入れる部屋にはなっていない。

**やるべきこと**：

1. `buildUnit()` に、型に関係なく必ず作る**水まわりの区画**を足す
   （台所の横に、風呂とトイレの小部屋。仕切りの壁と、開く戸）
2. 風呂とトイレを歩いて入れるようにする
   → 仕切りに当たり判定を足しつつ、戸の開口部だけは通れるようにする。
   `_insideUnit()`（`src/game.js`）は住戸の外枠しか見ていないので、そのままで通るはず
3. 冷蔵庫を「開けられる」ものにする
   → `inter.push({ kind: "detail", ... })` で調べられるようにし、扉を回す。
   `_detailScare()`（`src/game.js`）に冷蔵庫用の反応を足す
4. **持ち物を実物として置く。** いまは `item:` が指定された部屋に、
   目印だけがある状態。懐中電灯・鍵・手紙・日記が、見てそれと分かる形に必要
   - 懐中電灯 … 円筒＋レンズ＋スイッチ
   - 鍵 … 小さな板と歯。キーホルダー付き
   - 手紙 … 封筒（`mats.envelope` がすでにある）と、開いた便箋
   - 日記 … 厚みのあるノート（`mats.notebook` がすでにある）
5. 置いたものは、いまの `_nearest()` の優先順（持ち物＞調べる）に乗せる

`FURNISH` を全部書き直す必要はない。共通部分を `buildUnit()` 側に足して、
`FURNISH` は「その部屋らしさ」だけを足す係にすると、まとまりがよくなる。

### ■ そのほか、気になれば

- 怪奇現象は今のところ「見せるだけ」。どれかを持ち物や話に結びつけると深くなる
- 五階から先（屋上）の作り込みは、いまは結末を出すだけ

---

## 7. 手を入れるときの決まりごと

- **画像も音声も、ファイルを増やさない。** canvas と WebAudio で作る（この作りを崩さない）
- **コメントは日本語で、なぜそうしたかを書く。** 既存のコメントの書き方に合わせる
- **three.js は r169 で、光は物理単位（カンデラ）。** 強さの桁が直感と違う。
  SpotLight / PointLight は 10〜50 くらい入れないと見えない
- 「それ」はレイヤー1 に置き、距離で減らない DirectionalLight だけで照らしている。
  白飛びさせないための仕掛けなので、動かすときは注意
- 白色雑音を細い帯域で濾すと音が消えるので、`_makeup()` で戻している（`src/audio.js`）
- 部屋の中身は**扉を開けたときにはじめて組み立てる**（`rec.build()`）。最初に全部作らない
- コミットの署名は `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

## 8. 手元での確かめ方

ブラウザで動かしているとき、`localhost` に限り `window.__g` からゲーム本体を触れます。

```js
const g = window.__g;
await g.loadFloor(3, 0, true);   // 三階を読みこむ
g.player.pos.set(10, g.player.pos.y, 1.3);
for (let i = 0; i < 600; i++) g._step(1/60);   // 10秒ぶん進める
g.haunt._blood();                // 怪奇現象を名指しで起こす
```

画面を出さずに絵を確かめたいときは、`serve.js` の `/_shot` に POST すると
`shots/` に PNG が落ちます（`shots/` は git にも Vercel にも上がりません）。

```js
await fetch("/_shot", { method: "POST",
  body: JSON.stringify({ name: "test", data: g.canvas.toDataURL("image/png") }) });
```
