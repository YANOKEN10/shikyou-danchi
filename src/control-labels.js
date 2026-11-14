import {language} from './i18n.js';
export const controls={ja:{bAct:'調べる',bRun:'走る',bCrouch:'しゃがむ',bLight:'ライト',bBook:'手帳',bPause:'休止'},en:{bAct:'Interact',bRun:'Run',bCrouch:'Crouch',bLight:'Light',bBook:'Notes',bPause:'Pause'},es:{bAct:'Examinar',bRun:'Correr',bCrouch:'Agacharse',bLight:'Luz',bBook:'Notas',bPause:'Pausa'}};
export function labelControls(){for(const [id,text]of Object.entries(controls[language]||controls.ja)){const b=document.getElementById(id);if(!b)continue;b.dataset.noTranslate='';b.textContent=text;b.setAttribute('aria-label',text);b.title=text;}}
labelControls();
