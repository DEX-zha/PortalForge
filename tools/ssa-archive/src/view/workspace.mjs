export function bindWorkspace() {
  const $ = id => document.getElementById(id);
  for (const tab of ['hierarchy','layers']) $('tab-'+tab).addEventListener('click', () => {
    for (const name of ['hierarchy','layers']) { $(name+'-pane').hidden=name!==tab; $('tab-'+name).classList.toggle('on',name===tab); }
  });
  $('scene-help').addEventListener('click',()=>{ $('hint').hidden=!$('hint').hidden; });
  const read=(key,fallback)=>{try{return Number(localStorage.getItem(key))||fallback;}catch{return fallback;}};
  const write=(key,value)=>{try{localStorage.setItem(key,String(value));}catch{}};
  function height(value) {
    const max=Math.max(180,innerHeight-300);
    value=Math.max(180,Math.min(value,max));
    $('project-splitter').setAttribute('aria-valuemax',String(max));
    document.documentElement.style.setProperty('--project-height',value+'px'); $('project-splitter').setAttribute('aria-valuenow',String(Math.round(value))); write('pf-project-height',value);
  }
  height(read('pf-project-height',Math.min(310,innerHeight*.34)));
  const splitter=$('project-splitter');
  splitter.addEventListener('pointerdown',e=>{ splitter.setPointerCapture(e.pointerId); });
  splitter.addEventListener('pointermove',e=>{ if(splitter.hasPointerCapture(e.pointerId))height(innerHeight-e.clientY-26); });
  splitter.addEventListener('pointerup',e=>{if(splitter.hasPointerCapture(e.pointerId))splitter.releasePointerCapture(e.pointerId);});
  splitter.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();e.stopPropagation();height(Number(splitter.getAttribute('aria-valuenow'))+(e.key==='ArrowUp'?20:-20));}});
  addEventListener('resize',()=>height(Number(splitter.getAttribute('aria-valuenow'))));
  const size=$('thumbnail-size'); size.value=String(Math.max(110,Math.min(220,read('pf-thumbnail-size',150))));
  const resize=()=>{document.documentElement.style.setProperty('--tile-size',size.value+'px');write('pf-thumbnail-size',size.value);};
  size.addEventListener('input',resize);resize();
}
