import { ES } from './es.js';
const trimmed=new Map(Object.entries(ES).map(([k,v])=>[k.trim(),v]));
export function trSpanish(value,missing=new Set()){
 if(typeof value!=='string')return value;
 if(Object.hasOwn(ES,value))return ES[value];
 const text=value.trim(), tr=v=>trSpanish(v,missing);
 if(trimmed.has(text))return trimmed.get(text);
 if(!/[\u3040-\u30ff\u3400-\u9fff]/.test(text))return value;
 let m;
 if((m=text.match(/^(.*) さん、おかえりなさい。$/)))return `${m[1]}, te damos la bienvenida de nuevo.`;
 if((m=text.match(/^ログイン中：(.*)$/)))return `Sesión iniciada: ${m[1]}`;
 if((m=text.match(/^名前：(.*?)　／　メール：(.*)$/)))return `Nombre: ${m[1]} / Correo: ${m[2]==='登録なし'?'Sin registrar':m[2]}`;
 if((m=text.match(/^(.*?)( がつかまった。| が起きあがった。| が連れて行かれた。)$/)))return m[1]+ES[m[2]];
 if((m=text.match(/^(.+)を取る$/)))return `Recoger ${tr(m[1])}`;
 if((m=text.match(/^(.+)を取りました。$/)))return `Has recogido: ${tr(m[1])}.`;
 if((m=text.match(/^(.+)を開ける$/)))return `Abrir ${tr(m[1])}`;
 if((m=text.match(/^(.+)を閉める$/)))return `Cerrar ${tr(m[1])}`;
 if((m=text.match(/^▸\s*(.*)$/)))return `▸ ${tr(m[1])}`;
 if((m=text.match(/^・(.*?)(　×\d+)?$/)))return `• ${tr(m[1])}${m[2]||''}`;
 if((m=text.match(/^(.*)で遊びます$/)))return `Selección: ${tr(m[1])}`;
 if((m=text.match(/^はじめる（(\d+)人）$/)))return `Comenzar (${m[1]} jugadores)`;
 if((m=text.match(/^(.+)。（休 → こまったときは、で詳しく）$/)))return `${tr(m[1])}. (Más información en Pausa → Ayuda.)`;
 if(/見つけたもの|かかった時間|のこり|　鍵 |　あと|^鍵 |^\d+分|^\d+秒/.test(text)){
 let result=text;for(const [ja,es] of Object.entries({'一階':'Planta 1','二階':'Planta 2','三階':'Planta 3','四階':'Planta 4','五階':'Planta 5','見つけたもの':'Hallazgos: ','かかった時間':'Tiempo: ','のこり':'Quedan: ','階段室へ！':'¡Ve a la escalera!','それ':'La Presencia','住人':'Residente','鍵':'Llaves ','あと':'Faltan: ','人':' jugadores','回':' veces','分':' min','秒':' s','　／　':' / '}))result=result.replaceAll(ja,es);
 if(!/[\u3040-\u30ff\u3400-\u9fff]/.test(result))return result;}
 if((m=text.match(/^(それ|住人)　——(勝ち|負け)$/)))return `${tr(m[1])} — ${m[2]==='勝ち'?'VICTORIA':'DERROTA'}`;
 if((m=text.match(/^うまくいきませんでした（(.*)）$/)))return `Se ha producido un error (${tr(m[1])})`;
 if((m=text.match(/^はじめての方へ · (\d+)\/2$/)))return `Guía rápida · ${m[1]}/2`;
 missing.add(value);return value;
}
