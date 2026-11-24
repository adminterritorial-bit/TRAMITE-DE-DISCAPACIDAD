// Decorative motion is optional and isolated from authentication and service flows.
const KEY='sits-ambient-motion-paused';

export function initAmbientMotion(){
 const button=document.getElementById('ambientMotionToggle');
 if(!button)return;
 const root=document.documentElement;
 const label=button.querySelector('span');
 let paused=false;
 try{paused=window.sessionStorage.getItem(KEY)==='yes';}catch{}
 const update=()=>{
  root.classList.toggle('motion-paused',paused);
  button.setAttribute('aria-pressed',String(paused));
  label.textContent=paused?'Reanudar movimiento del fondo':'Pausar movimiento del fondo';
  button.title=paused?'Reanudar efectos decorativos':'Detener efectos decorativos';
 };
 button.addEventListener('click',()=>{
  paused=!paused;
  try{window.sessionStorage.setItem(KEY,paused?'yes':'no');}catch{}
  update();
 });
 update();
}
