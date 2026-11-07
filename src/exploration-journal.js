import {language,tr} from './i18n.js';
import {ITEMS,MEMOS} from './story.js';
const words={ja:{title:'探索の記録',goal:'いまの目的',empty:'部屋に入ると、訪問した場所をここに記録します。',visited:'訪問済み',unknown:'未訪問',found:'発見物あり',now:'現在地',tip:'静かに身を隠すには、視線を切り、走るのをやめて灯りを消す。足音が遠ざかるのを待とう。',note:'「発見物あり」は、その部屋ですべて見つけたという意味ではありません。'},en:{title:'Exploration journal',goal:'Current objective',empty:'Rooms you enter will be recorded here.',visited:'Visited',unknown:'Not visited',found:'Items found',now:'You are here',tip:'Break line of sight, stop running and turn off your light. Listen for footsteps moving away.',note:'Finding something does not mean a room has been completely searched.'},es:{title:'Diario de exploración',goal:'Objetivo actual',empty:'Aquí se registran las habitaciones que visitas.',visited:'Visitada',unknown:'Sin visitar',found:'Hallazgos',now:'Estás aquí',tip:'Rompe el contacto visual, deja de correr y apaga la linterna. Escucha hasta que los pasos se alejen.',note:'Hallar algo no significa que hayas explorado toda la habitación.'}};
export function recordRoom(game,kind,id){
 if(game.versus?.on)return;const room=game.curRoom;if(!room)return;
 const key=game.state.floor+':'+room.no;
 const data=game.state.flags.survey ||= {};
 const old=data[key];const entry=old&&typeof old==='object'?old:{finds:[]};if(!Array.isArray(entry.finds))entry.finds=[];
 if(kind&&id&&(ITEMS[id]||MEMOS[id])&&!entry.finds.some(f=>f.kind===kind&&f.id===id))entry.finds.push({kind,id});data[key]=entry;
}
export function renderJournal(host,state){
 if(!state.survey)return;const w=words[language]||words.ja,wrap=document.createElement('section');wrap.className='exploration-journal';wrap.dataset.noTranslate='';
 const add=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;wrap.append(e);return e;};add('h3',w.title);add('p',w.goal+'：'+tr(state.goal||''));
 const keys=new Set(Object.keys(state.survey).filter(k=>/^[1-5]:\d{3}$/.test(k)));for(const no of state.rooms||[])keys.add(state.floor+':'+no);
 if(!keys.size)add('p',w.empty);
 for(const key of [...keys].sort()){const [floor,no]=key.split(':'),entry=state.survey[key],finds=(Array.isArray(entry?.finds)?entry.finds:[]).map(f=>ITEMS[f.id]?.name||MEMOS[f.id]?.title).filter(Boolean);const row=add('div',floor+'F · '+no+' — '+(finds.length?w.found:entry?w.visited:w.unknown)+(state.floor===Number(floor)&&state.room===Number(no)?' · '+w.now:''));row.className='journal-room';row.style.cssText='padding:12px 14px;border-left:2px solid '+(finds.length?'#bba56c':entry?'#687566':'#3c3f3b')+';background:#9c976b0a;margin:8px 0;font-size:14px;line-height:1.8';if(finds.length){const detail=document.createElement('div');detail.style.cssText='font-size:12px;color:#aaa397';detail.textContent=finds.map(tr).join(' / ');row.append(detail);}}
 add('p',w.note).style.cssText='font-size:12px;color:#9b9689;line-height:1.8';add('p',w.tip).style.cssText='padding:14px;border:1px solid #574f3c;font-size:13px;line-height:1.9';host.append(wrap);
}
