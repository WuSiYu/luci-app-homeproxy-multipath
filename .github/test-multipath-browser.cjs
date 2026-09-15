// Emits a standalone browser fixture using the production renderer and real DOM.
// This is layout/interaction validation, not an installed LuCI/rpcd end-to-end test.
const fs = require('node:fs');
const [source, log, target] = process.argv.slice(2);
const document = JSON.parse(fs.readFileSync(log, 'utf8').split('\n').filter(line => line.startsWith('STATUS ')).at(-1).slice(7));
document.generated_at = new Date().toISOString();
document.node.logical.remote_sender.updated_at = document.generated_at;
document.node.logical.remote_sender.stale = false;
const fixture = JSON.stringify(document).replaceAll('<', '\\u003c');
const renderer = JSON.stringify(fs.readFileSync(source, 'utf8')).replaceAll('<', '\\u003c');
fs.writeFileSync(target, `<!doctype html><meta charset="utf-8"><title>Multipath browser test</title>
<style>body{font:14px Arial,sans-serif;margin:20px;background:#f5f5f5;color:#333}button,select{font:inherit}*{box-sizing:border-box}</style>
<body><script>
String.prototype.format=function(...args){let i=0;return this.replace(/%(0?)(\\d*)([sd])/g,(_,z,w,t)=>String(t==='d'?Math.trunc(args[i++]):args[i++]).padStart(+w,z?'0':' '));};
const fixture=${fixture};
function E(tag,attrs,children){
 if(Array.isArray(tag)){const fragment=document.createDocumentFragment(); tag.forEach(n=>fragment.append(n));return fragment;}
 if(Array.isArray(attrs)){children=attrs;attrs={};}
 const node=document.createElement(tag);
 for(const [key,value] of Object.entries(attrs||{})){
  if(typeof value==='function')node.addEventListener(key,value);
  else if(value!=null)node.setAttribute(key,value);
 }
 function append(value){if(Array.isArray(value))value.forEach(append);else if(value!=null)node.append(value instanceof Node?value:document.createTextNode(String(value)));}
 append(children);return node;
}
const page=new Function('view','rpc','poll','dom','_','E',${renderer})(
 {extend:value=>value},{declare:()=>()=>Promise.resolve({nodes:[fixture]})},
 {add:(callback,interval)=>{if(interval!==1)throw Error('poll interval');}},
 {content:(node,children)=>node.replaceChildren(...children)},value=>value,E);
document.body.append(page.render({nodes:[fixture]}));
window.addEventListener('load',()=>{
 try{
  if(document.querySelectorAll('.mp-panel').length!==3)throw Error('missing panels');
  if(document.documentElement.scrollWidth>innerWidth+1)throw Error('horizontal overflow '+document.documentElement.scrollWidth+'/'+innerWidth);
  const details=document.querySelector('details');details.open=false;
  details.dispatchEvent(new Event('toggle'));page.renderStatus();
  if(document.querySelector('details').open)throw Error('fold state lost');
  document.querySelector('details').open=true;
  const result=document.createElement('pre');result.id='test-result';result.textContent='PASS browser '+innerWidth+'x'+innerHeight;document.body.append(result);
 }catch(error){document.title='FAIL';document.body.append(String(error));}
});
</script>`);
