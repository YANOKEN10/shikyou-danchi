import { tr, language } from './i18n.js';
export const itemImage = id => new URL('../assets/items/'+id+'.webp',import.meta.url).href;
// Small cached previews are ready before the player finds an item.
for (const id of ['light','spareLight','battery','key3']) { const img=new Image(); img.src=itemImage(id); }
const copy={ja:{got:'手に入れたもの',close:'確認して戻る',dismiss:'閉じる'},en:{got:'ITEM ACQUIRED',close:'Continue',dismiss:'Close'},es:{got:'OBJETO OBTENIDO',close:'Continuar',dismiss:'Cerrar'}};
const uses={light:['暗い場所を照らせます。電池の残量に気をつけて。','Lights up dark places. Keep an eye on the battery.','Ilumina los lugares oscuros. Vigila la batería.'],spareLight:['電池の入った懐中電灯に持ち替えました。','You switched to a flashlight with a charged battery.','Has cambiado a una linterna con batería cargada.'],battery:['懐中電灯の交換用です。持ち物に追加しました。','A spare battery for your flashlight. Added to your inventory.','Una batería de repuesto para la linterna. Añadida al inventario.'],key3:['三階へ上がる階段の南京錠を開けられます。','Unlocks the stairway padlock leading to the third floor.','Abre el candado de la escalera que lleva al tercer piso.']};
export function showAcquired(ui,id,info,count){
 if(!info)return;
 const words=copy[language]||copy.ja;
 let d=ui.itemDialog;
 if(!d){d=document.createElement('dialog');d.className='item-acquired';d.setAttribute('aria-labelledby','acquired-name');d.setAttribute('aria-describedby','acquired-use');d.innerHTML='<button class="acquired-x" type="button">×</button><p class="acquired-eyebrow"></p><div class="acquired-art"><img width="640" height="640" alt=""></div><h2 id="acquired-name"></h2><p id="acquired-use"></p><p class="acquired-count"></p><button class="acquired-ok" type="button"></button>';d.dataset.noTranslate='';document.body.append(d);ui.itemDialog=d;d.addEventListener('cancel',e=>{e.preventDefault();ui.closeItem();});d.querySelector('.acquired-x').onclick=()=>ui.closeItem();d.querySelector('.acquired-ok').onclick=()=>ui.closeItem();}
 d.querySelector('.acquired-eyebrow').textContent=words.got;
 d.querySelector('.acquired-x').setAttribute('aria-label',words.dismiss);
 const img=d.querySelector('img');img.src=itemImage(id);img.alt=tr(info.name);
 d.querySelector('h2').textContent=tr(info.name);
 d.querySelector('#acquired-use').textContent=uses[id]?.[language==='en'?1:language==='es'?2:0]||tr(info.say);
 d.querySelector('.acquired-count').textContent=id==='battery'?(language==='en'?'In inventory: ':language==='es'?'En el inventario: ':'所持数：')+count:'';
 d.querySelector('.acquired-ok').textContent=words.close;
 ui.open='item';ui.setPrompt('');if(document.pointerLockElement)document.exitPointerLock();
 if(!d.open)d.showModal();d.querySelector('.acquired-ok').focus();
}
