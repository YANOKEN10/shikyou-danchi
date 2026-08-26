// ============================================================
//  物語とフロアの中身
//   ・見取り図の寸法は build.js が持ちます。ここは「何があるか」だけ。
//   ・号室は 階×100＋番号（1階なら 101〜105）
// ============================================================

export const TITLE = "死鏡団地";
export const SUB = "四号棟・解体前夜";

/* ---------- はじまりの語り ---------- */

export const OPENING = [
  "死鏡団地 四号棟。",
  "私が十八まで住んでいた建物は、明日の朝、重機に囲まれる。",
  "母の部屋に、ノートを一冊置いたままだった。",
  "電気はもう止まっている。階段で上がるしかない。",
  "——三十分で戻る。それだけのつもりだった。",
];

/* ---------- 各階 ---------- */
// enter: 中に入れる住戸　locked: 鍵が要る
// item:  拾えるもの（id は inventory の鍵）
// memo:  読めるもの（MEMOS の id）

export const FLOORS = [
  {
    n: 1,
    title: "一階",
    intro: "階段室の鉄扉は、押すとまだ動いた。",
    lightsOut: false,
    entity: null,
    stairLocked: false,
    stairHint: "",
    units: [
      { no: 101, enter: true, item: "light", note: "自分の家だったころ、傘立ての上に置いていた。" },
      { no: 102, enter: true },
      { no: 103, enter: true },
      { no: 104, enter: true },
      { no: 105, enter: true },
    ],
    board: {
      memo: "m1",
      lines: ["解体工事のお知らせ", "死鏡団地 四号棟", "八月三十一日をもって", "立入を禁止いたします", "死鏡団地管理組合"],
    },
    events: [
      { at: 6, once: true, say: "懐中電灯は、たしか玄関の靴箱の上だ。" },
      { at: 26, once: true, say: "……風の音しかしない。" },
    ],
  },

  {
    n: 2,
    title: "二階",
    intro: "郵便受けの列が、まだ名前を貼ったまま残っている。",
    lightsOut: false,
    entity: null,
    stairLocked: true,
    stairKey: "key3",
    stairHint: "階段の扉に、南京錠がかかっている。",
    units: [
      { no: 201, enter: true },
      { no: 202, enter: true, item: "key3", memo: "m3draft", note: "台所の壁のフックに、鍵が一本ぶら下がっていた。" },
      { no: 203, enter: true },
      { no: 204, enter: true },
      { no: 205, enter: true },
    ],
    post: { memo: "m2" },
    events: [
      { at: 4, once: true, say: "二〇二号室。あの子の家だ。" },
      { at: 14, once: true, sound: "thud", say: "——上で、何か落ちた。" },
      { at: 30, once: true, sound: "doorShut", say: "扉が、ひとりでに閉まった。" },
    ],
  },

  {
    n: 3,
    title: "三階",
    intro: "蛍光灯が一本だけ、まだ切れかけのまま生きている。",
    lightsOut: false,
    flicker: true,
    entity: { speed: 1.05, hear: 9, sight: 13, patience: 5 },
    stairLocked: true,
    stairTask: "breaker",
    stairHint: "階段室が暗すぎて、扉の位置さえ分からない。",
    breaker: { say: "廊下の端の鉄箱。中のつまみが、下がったままだ。" },
    units: [
      { no: 301, enter: true },
      { no: 302, enter: true },
      { no: 303, enter: true, memo: "m3", item: "battery", note: "管理人の詰所だった部屋。棚に日誌の切れ端が挟まっている。" },
      { no: 304, enter: true },
      { no: 305, enter: true },
    ],
    events: [
      { at: 3, once: true, say: "……足音が、二重に聞こえる。" },
      { at: 12, once: true, sound: "whisper" },
    ],
  },

  {
    n: 4,
    title: "四階",
    intro: "四階。ここで折り返せば、あと一つ上だ。",
    lightsOut: true,
    loop: true,
    entity: { speed: 1.25, hear: 12, sight: 16, patience: 7 },
    stairLocked: false,
    units: [
      { no: 401, enter: true },
      { no: 402, enter: true },
      { no: 403, enter: true },
      { no: 404, enter: true },
      { no: 405, enter: true },
    ],
    graffiti: { memo: "m4" },
    // ループの周ごとの変化
    laps: [
      { intro: "四階。ここで折り返せば、あと一つ上だ。", doors: null, entities: 1 },
      { intro: "……四階。いま、上ったはずだ。", doors: 404, entities: 1, say: "号室の札が、全部同じ数字になっている。" },
      { intro: "四階。四階。四階。", doors: 404, entities: 2, short: true, open404: true, say: "一つだけ、扉が開いている。" },
    ],
  },

  {
    n: 5,
    title: "五階",
    intro: "五階だけ、廊下の灯りがついていた。",
    lightsOut: false,
    entity: null,
    stairLocked: false,
    units: [
      { no: 501, enter: true },
      { no: 502, enter: true },
      { no: 503, enter: true },
      { no: 504, enter: true, memo: "m6", goal: true, note: "自分の家。表札はまだ外されていない。" },
      { no: 505, enter: true },
    ],
    events: [
      { at: 2, once: true, say: "……電気は止まっているはずだ。" },
    ],
  },
];

/* ---------- 住戸の中 ---------- */
// kind    … 置いてある家財のひとそろい（build.js が組み立てます）
// floor   … 床の張りかた "tatami" | "wood" | "bare"
// enter   … はじめて入ったときの一言
// detail  … 中のものを調べたときの一言（{ label, say } または say だけ）
// scare   … こわいしかけ。build.js と game.js が見ています
//            mirror(鏡にうつる) / bulge(布団のふくらみ) / eyes(すきまの目)
//            static(砂嵐) / turned(こちらを向く) / warm(まだ温かい)

export const ROOMS = {
  /* --- 一階 --- */
  101: {
    kind: "kitchen", floor: "tatami",
    enter: "自分の家だったころの部屋。畳の目まで覚えている。",
    detail: { label: "靴箱を見る", say: "傘立ての上。やっぱり、そこにあった。" },
  },
  102: {
    kind: "butsudan", floor: "tatami", scare: "portrait",
    enter: "一〇二号室。佐々木さんの家だ。仏間の匂いがまだ残っている。",
    detail: { label: "仏壇を見る", say: "線香が、途中まで燃えて折れている。灰はまだ温かい。" },
  },
  103: {
    kind: "boxes", floor: "wood",
    enter: "引っ越しの途中で止まったまま、十何年たった部屋。",
    detail: { label: "段ボールを開ける", say: "衣類。いちばん下に、髪の毛が一束、輪ゴムでまとめてある。" },
  },
  104: {
    kind: "child", floor: "wood", scare: "scribble",
    enter: "子ども部屋。柱に、背の高さの傷が並んでいる。",
    detail: { label: "傷を数える", say: "十二本ある。最後の一本だけ、天井近くに刻まれている。" },
  },
  105: {
    kind: "empty", floor: "tatami", scare: "shape",
    enter: "からっぽの部屋。家財の跡だけが、畳に焼きついている。",
    detail: { label: "畳の跡を見る", say: "箪笥、卓袱台、それから——人がひとり、ずっと座っていた形。" },
  },

  /* --- 二階 --- */
  201: {
    kind: "trash", floor: "wood", scare: "eyes",
    enter: "袋の山。中身は分からない。踏むと、やわらかい。",
    detail: { label: "袋を見る", say: "いちばん上の袋が、いま、ゆっくり沈んだ。" },
  },
  202: {
    kind: "kitchen", floor: "tatami",
    enter: "台所の壁のフックに、鍵が一本ぶら下がっていた。",
    detail: { label: "冷蔵庫を開ける", say: "電気は止まっているのに、中が冷えている。" },
  },
  203: {
    kind: "bath", floor: "bare", scare: "water",
    enter: "水回りの部屋。奥の扉の向こうから、水の音がする。",
    detail: { label: "風呂の扉を開ける", say: "音が止んだ。浴槽は乾ききっている。髪だけが、排水口から伸びている。" },
  },
  204: {
    kind: "mirrors", floor: "tatami", scare: "mirror",
    enter: "姿見が三枚、壁に立てかけてある。どれも布がかけてあった形跡がある。",
    detail: { label: "鏡を覗く", say: "自分が映っている。……こちらを向くのが、一拍おそい。" },
  },
  205: {
    kind: "futon", floor: "tatami", scare: "warm",
    enter: "二〇五号室。高木さんの家。万年床が敷きっぱなしだ。",
    detail: { label: "布団に触れる", say: "へこんでいる。人の形に。まだ、温かい。" },
  },

  /* --- 三階 --- */
  301: {
    kind: "flowers", floor: "tatami",
    enter: "三〇一号室。中村さんの家。花瓶がいくつも並んでいる。",
    detail: { label: "花瓶を見る", say: "花はすべて枯れている。水だけが、新しい。" },
  },
  302: {
    kind: "storage", floor: "bare", scare: "eyes",
    enter: "物置。家財が天井まで積み上がって、奥へは行けない。",
    detail: { label: "すきまを覗く", say: "奥に、たんすが一棹。その陰から、こちらを見ている。" },
  },
  303: {
    kind: "office", floor: "wood",
    enter: "管理人の詰所だった部屋。棚に日誌の切れ端が挟まっている。",
    detail: { label: "書類棚を見る", say: "住民名簿。八月のところで、名前が一つずつ、線で消されている。" },
  },
  304: {
    kind: "tv", floor: "tatami", scare: "static",
    enter: "テレビがついている。電気は止まっているはずだ。",
    detail: { label: "画面を見る", say: "砂嵐——のあいだに、いま歩いてきた廊下が、一瞬だけ映った。" },
  },
  305: {
    kind: "dolls", floor: "wood", scare: "turned",
    enter: "子ども部屋。ぬいぐるみが棚に並んでいる。全部、壁を向いている。",
    detail: { label: "ぬいぐるみを見る", say: "顔をこちらに直した。……一つだけ、もともとこちらを向いていた。" },
  },

  /* --- 四階 --- */
  401: {
    kind: "empty", floor: "tatami", scare: "shape",
    enter: "何もない。畳だけが、新しく替えられている。",
    detail: { label: "畳を見る", say: "四階の畳だけ、どこも新しい。替える必要が、あったのだろうか。" },
  },
  402: {
    kind: "boxes", floor: "wood",
    enter: "段ボールに、几帳面な字で中身が書いてある。",
    detail: { label: "字を読む", say: "「たいせつなもの」。全部の箱に、同じ字で。" },
  },
  403: {
    kind: "mirrors", floor: "bare", scare: "mirror",
    enter: "壁という壁に、鏡が貼りつけてある。合わせ鏡になっている。",
    detail: { label: "合わせ鏡を覗く", say: "奥へ、奥へ、自分が続いている。……七番目から、数が合わない。" },
  },
  404: {
    kind: "letter", floor: "tatami", scare: "bulge",
    enter: "四〇四号室。表札の枠だけが残っている。",
    detail: { label: "部屋を見まわす", say: "誰も住んでいない部屋のはずが、掃除が行き届いている。" },
  },
  405: {
    kind: "futon", floor: "tatami", scare: "bulge",
    enter: "布団が敷いてある。まんなかが、ふくらんでいる。",
    detail: { label: "布団をめくる", say: "何もない。掛け布団の内側だけが、人肌の温度をしている。" },
  },

  /* --- 五階 --- */
  501: {
    kind: "flowers", floor: "tatami",
    enter: "花の匂いがする。枯れているのに。",
    detail: { label: "花を見る", say: "供花だ。名札に、この棟の号室が書いてある。全部で四つ。" },
  },
  502: {
    kind: "empty", floor: "wood",
    enter: "がらんとした部屋。窓だけが、きれいに拭いてある。",
    detail: { label: "窓を見る", say: "内側から拭いてある。指の跡が、外側にも同じだけ付いている。" },
  },
  503: {
    kind: "mirrors", floor: "tatami", scare: "mirror",
    enter: "姿見が一枚。ちょうど、玄関を映す向きに置いてある。",
    detail: { label: "鏡を見る", say: "玄関が映っている。いま閉めたはずの扉が、開いている。" },
  },
  504: {
    kind: "home", floor: "tatami",
    enter: "自分の家。表札はまだ外されていない。",
    detail: { label: "部屋を見まわす", say: "母が出ていった日のまま。灰皿の上で、線香が一本、燃え尽きている。" },
  },
  505: {
    kind: "butsudan", floor: "tatami", scare: "portrait",
    enter: "仏間。位牌がいくつも並んでいる。数が多すぎる。",
    detail: { label: "位牌を数える", say: "十九。この棟に住んでいた世帯の数と、同じだ。" },
  },
};

export function roomFor(no) {
  return ROOMS[no] || { kind: "kitchen", floor: "tatami", enter: "" };
}

/* ---------- 読めるもの ---------- */

export const MEMOS = {
  m1: {
    title: "回覧板の切れ端",
    where: "一階・掲示板",
    body: [
      "＜解体工事に伴う立入禁止のお知らせ＞",
      "",
      "八月三十一日をもって、四号棟への立入を",
      "全面的に禁止いたします。",
      "室内に残された私物につきましては、",
      "当組合では一切の責任を負いかねます。",
      "",
      "なお、四号棟にお住まいの方は",
      "現在ゼロ世帯となっております。",
      "",
      "……この「ゼロ世帯」の上に、",
      "誰かが鉛筆で線を引いて、",
      "「うそ」と書いてある。",
    ],
  },

  m2: {
    title: "宛名のない葉書",
    where: "二階・郵便受け",
    body: [
      "消印は十二年前。切手は貼られていない。",
      "宛名の欄は、まっさらのままだ。",
      "",
      "　まだ いるのですか",
      "",
      "　こちらは かわりません",
      "　あかりは つけたままにしてあります",
      "　かえってくるなら 五かいまで",
      "",
      "裏を返すと、鉛筆で薄く",
      "「504」とだけ書いてある。",
    ],
  },

  m3draft: {
    title: "台所のメモ",
    where: "二〇二号室",
    body: [
      "冷蔵庫に、マグネットで留まっていた。",
      "",
      "　・かいだんの かぎ フックにかけた",
      "　・よるは でないこと",
      "　・おとを たてないこと",
      "",
      "三つ目だけ、何度もなぞって書いてある。",
    ],
  },

  m3: {
    title: "管理日誌（切れ端）",
    where: "三〇三号室",
    body: [
      "八月十四日　晴",
      "　四号棟、巡回。異常なし。",
      "",
      "八月十七日　曇",
      "　深夜二時、四階で足音の苦情。",
      "　行ってみたが誰もいない。",
      "　四階は先月から全戸空き家のはず。",
      "",
      "八月二十日",
      "　五〇四号室の灯りがついている。",
      "　電気は先々月に止めたはずだ。",
      "　管理会社に確認するよう申し送る。",
      "",
      "八月二十二日",
      "　四階から下りられない。",
      "　同じ階に出る。四回",
      "",
      "（ここで文字が途切れている）",
    ],
  },

  m4: {
    title: "壁の落書き",
    where: "四階・廊下",
    body: [
      "低い位置に、子どもの背丈で書いてある。",
      "クレヨンが、コンクリートに食い込んでいる。",
      "",
      "　４かいは かえれない",
      "　４かいは かえれない",
      "　４かいは かえれない",
      "　４かいは かえれない",
      "",
      "同じ行が、壁の端まで続いている。",
      "最後の一行だけ、字が大人のものだ。",
      "",
      "　むかえに いきます",
    ],
  },

  m5: {
    title: "母の手紙",
    where: "四〇四号室",
    body: [
      "封も切られていない。宛名は私の名前だ。",
      "",
      "　あなたが出ていってから、",
      "　この棟は、ずいぶん静かになりました。",
      "",
      "　夜になると、廊下を歩く音がします。",
      "　はじめは怖かったけれど、",
      "　いまは、その音がないと眠れません。",
      "",
      "　わたしはここに残ります。",
      "　建物が無くなるまでは、",
      "　まだ「ここ」があるということだから。",
      "",
      "　ノートは机の上に置いておきます。",
      "　持って帰るなら、振り返らないで。",
      "",
      "　　　　　　　　　　　　　　母",
    ],
  },

  m6: {
    title: "母のノート",
    where: "五〇四号室",
    body: [
      "表紙に、四号棟の見取り図が描いてある。",
      "住戸の一つ一つに、名前と、日付。",
      "",
      "　一〇二　佐々木さん　　三月",
      "　二〇五　高木さん　　　五月",
      "　三〇一　中村さん　　　七月",
      "　四〇四　　　　　　　　八月",
      "",
      "四〇四だけ、名前の欄が空いている。",
      "その下に、母の字でこう書いてある。",
      "",
      "　わたしの番になったら、",
      "　この行に名前を書いてください。",
      "",
      "最後のページには、一行だけ。",
      "",
      "　だれかが おぼえていれば、",
      "　この たてものは のこる。",
    ],
  },
};

export const MEMO_ORDER = ["m1", "m2", "m3draft", "m3", "m4", "m5", "m6"];

/* ---------- 拾えるもの ---------- */

export const ITEMS = {
  light: { name: "懐中電灯", say: "懐中電灯。電池はもう長くない。" },
  battery: { name: "予備の電池", say: "電池を一本、見つけた。" },
  key3: { name: "階段の鍵", say: "階段の鍵。南京錠のものだ。" },
};

/* ---------- ささやき（不意に聞こえるもの） ---------- */

export const WHISPERS = [
  "……おかえり",
  "……まだ いる",
  "……ごう しつ",
  "……あかり つけて",
  "……よん かい",
  "……ふりむかないで",
  "……わすれないで",
];

/* ---------- 追われているときの語り ---------- */

export const CHASE_LINES = [
  "見られている。",
  "走るな。音を立てるな。",
  "扉の中へ。",
  "近い。",
];

/* ---------- 終わり方 ---------- */

export const ENDINGS = {
  caught: {
    id: "caught",
    name: "四〇四号室",
    bad: true,
    lines: [
      "肩に、手が触れた。",
      "冷たくはなかった。むしろ、覚えのある温度だった。",
      "",
      "廊下の照明が、一本ずつ点いていく。",
      "郵便受けに、私の名前の札が貼られている。",
      "",
      "四〇四号室。名前の欄が、埋まった。",
    ],
  },

  escaped: {
    id: "escaped",
    name: "外",
    lines: [
      "鉄扉を押し開けて、外に出た。",
      "空が白みはじめている。",
      "",
      "振り返ると、四号棟はただの古い建物だった。",
      "五階の窓に、灯りはついていない。",
      "",
      "ノートは、鞄の中で少し温かい。",
      "",
      "——三か月後、更地になった土地の前を通った。",
      "何が建っていたか、思い出すのに少しかかった。",
    ],
  },

  remember: {
    id: "remember",
    name: "おぼえている",
    best: true,
    lines: [
      "鉄扉を押し開けて、外に出た。",
      "空が白みはじめている。",
      "",
      "私は振り返って、五階を見上げた。",
      "五〇四号室の窓に、灯りがついている。",
      "手を振ると、灯りが二度、またたいた。",
      "",
      "ノートの最後のページに、私は名前を書き足した。",
      "四〇四の行ではなく、その次の行に。",
      "",
      "——建物は、夏の終わりに無くなった。",
      "それでも、私はまだ、",
      "四号棟の階段が何段あったかを言える。",
    ],
  },
};

// 集めたメモの数で終わり方が変わる
export function endingFor(memoCount) {
  return memoCount >= 6 ? ENDINGS.remember : ENDINGS.escaped;
}

/* ---------- 操作の案内 ---------- */

export const HELP_PC = [
  ["W A S D", "移動"],
  ["マウス", "見まわす"],
  ["Shift", "走る（音が響く）"],
  ["Ctrl / C", "しゃがむ（静かに歩く）"],
  ["E / クリック", "調べる・開ける"],
  ["F", "懐中電灯"],
  ["Tab", "持ち物とメモ"],
  ["Esc", "ポーズ"],
];

export const HELP_TOUCH = [
  ["左スティック", "移動"],
  ["画面を なぞる", "見まわす"],
  ["調", "調べる・開ける"],
  ["走", "走る"],
  ["屈", "しゃがむ"],
  ["灯", "懐中電灯"],
  ["帳", "持ち物とメモ"],
];
