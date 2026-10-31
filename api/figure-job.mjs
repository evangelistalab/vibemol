// Host-side job contract. The app remains classic scripts with no build step.
export const JOB_VERSION = 1;
export const FIGURE_DEFAULTS = Object.freeze({cols:3,gutter:24,border:false,camera:'current',sharedIso:false,
  sharedLook:true,widthIn:6.5,dpi:300,background:'look',format:'png',labelPosition:'below',fontPt:10});
export class FigureError extends Error {
  constructor(stage, message, detail={}) { super(message); this.name='FigureError'; this.stage=stage; this.detail=detail; }
}
const fail = message => { throw new FigureError('validation',message); };
function object(value, keys, label) {
  if (!value || typeof value!=='object' || Array.isArray(value)) fail(`${label} must be an object.`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`Unknown ${label} field: ${key}.`);
}
function number(value,min,max,label,integer=false) {
  if (typeof value!=='number' || !Number.isFinite(value) || value<min || value>max || (integer&&!Number.isInteger(value)))
    fail(`${label} must be ${integer?'an integer':'a number'} in ${min}..${max}.`);
}
function choice(value,allowed,label) { if (!allowed.includes(value)) fail(`${label} must be one of ${allowed.join(', ')}.`); }
export function validateJob(input) {
  object(input,['version','session','output','environment','figure','referenceEnvironment'],'job');
  if (input.version!==JOB_VERSION) fail(`job.version must be ${JOB_VERSION}.`);
  for (const key of ['session','output']) if (typeof input[key]!=='string'||!input[key].trim()||input[key].includes('\0')) fail(`job.${key} must be a nonempty local path.`);
  if (input.referenceEnvironment!==undefined&&(typeof input.referenceEnvironment!=='string'||!input.referenceEnvironment.trim()||input.referenceEnvironment.includes('\0'))) fail('referenceEnvironment must be a local environment-record path.');
  object(input.environment,['browserVersion','theme','font','viewport','backend','sandbox'],'environment');
  const e={sandbox:true,...input.environment};
  if (typeof e.sandbox!=='boolean') fail('environment.sandbox must be boolean.');
  if (typeof e.browserVersion!=='string'||!/^\d+\.\d+\.\d+\.\d+$/.test(e.browserVersion)) fail('environment.browserVersion must pin the full four-part browser version.');
  choice(e.theme,['light','dark'],'environment.theme'); choice(e.font,['geist','inter','plex'],'environment.font');
  choice(e.backend,['swiftshader'],'environment.backend');
  object(e.viewport,['width','height','deviceScaleFactor'],'viewport');
  number(e.viewport.width,320,8192,'viewport.width',true); number(e.viewport.height,320,8192,'viewport.height',true);
  number(e.viewport.deviceScaleFactor,1,4,'viewport.deviceScaleFactor');
  if (e.viewport.width*e.viewport.height*e.viewport.deviceScaleFactor**2>64000000) fail('The browser viewport backing buffer must not exceed 64 megapixels.');
  const f=input.figure;
  object(f,[...Object.keys(FIGURE_DEFAULTS),'targets','width','iso'],'figure');
  if (f.targets!=='all' && (!Array.isArray(f.targets)||!f.targets.length||f.targets.length>128)) fail('figure.targets must be "all" or 1..128 explicit layer IDs / {id,label} objects.');
  const ids=[];
  if (Array.isArray(f.targets)) for (const target of f.targets) {
    if (typeof target!=='string') {
      object(target,['id','label'],'target');
      if (target.label!==undefined && (typeof target.label!=='string'||target.label.length>500)) fail('target.label must be text of at most 500 characters.');
    }
    const id=typeof target==='string'?target:target.id;
    if (typeof id!=='string'||!id.length||id.length>200) fail('Each target needs a nonempty layer ID.');
    ids.push(id);
  }
  if (new Set(ids).size!==ids.length) fail('Choose each target only once.');
  const options={...FIGURE_DEFAULTS,...f};
  for (const [key,min,max,integer] of [['cols',1,12,true],['gutter',0,1000,true],['widthIn',.1,40,false],['dpi',36,2400,false],['fontPt',4,48,false]]) number(options[key],min,max,`figure.${key}`,integer);
  if (f.width!==undefined) number(f.width,16,32767,'figure.width',true);
  if (f.width!==undefined&&f.widthIn!==undefined) fail('Specify figure.width or figure.widthIn, not both.');
  if (f.width!==undefined) delete options.widthIn;
  for (const key of ['border','sharedIso','sharedLook']) if (typeof options[key]!=='boolean') fail(`figure.${key} must be boolean.`);
  choice(options.camera,['current','fit'],'figure.camera'); choice(options.background,['look','white','transparent'],'figure.background');
  choice(options.format,['png','svg'],'figure.format'); choice(options.labelPosition,['below','overlay'],'figure.labelPosition');
  if (f.iso!==undefined) number(f.iso,Number.MIN_VALUE,Number.MAX_VALUE,'figure.iso');
  if (options.sharedIso&&f.iso===undefined) fail('Set figure.iso explicitly when sharedIso is true.');
  return JSON.parse(JSON.stringify({...input,environment:e,figure:options}));
}
export function selectTargets(requested,available) {
  if (!available.length) throw new FigureError('targets','The session has no Figure targets.');
  if (available.length>128&&requested==='all') throw new FigureError('targets','More than 128 targets; choose an explicit subset.',{available});
  return (requested==='all'?available.map(t=>({id:t.id,label:t.name})):requested).map(t=>{
    const id=typeof t==='string'?t:t.id, found=available.find(a=>a.id===id);
    if (!found) throw new FigureError('targets',`Unknown layer ID: ${id}.`,{available});
    return {id,label:typeof t==='object'&&t.label!==undefined?t.label:found.name};
  });
}
// Same numeric tolerance as figure.py's restoration assertion; never a sleep.
export function stableValue(a,b) {
  if (typeof a==='number'||typeof b==='number') return typeof a==='number'&&typeof b==='number'&&Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-12*Math.max(1,Math.abs(a),Math.abs(b));
  if (a===null||b===null||typeof a!=='object'||typeof b!=='object') return a===b;
  if (Array.isArray(a)!==Array.isArray(b)) return false;
  const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&stableValue(a[k],b[k]));
}
