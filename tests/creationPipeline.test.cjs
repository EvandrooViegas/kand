const {test}=require('node:test')
const assert=require('node:assert/strict')
const source=require('node:fs').readFileSync('components/Creation.jsx','utf8')
const body=source.slice(source.indexOf('  const generatePost = async () => {'),source.indexOf('  // ── next step'))
function setup(fail,existing={}) {
 const calls=[], lock={current:false}, result={copy:'copy-result',plan:'plan-result',resolve:'resolve-result',design:'design-result'}
 const scope={autoLock:lock,anyLoading:false,copy:null,plan:null,resolved:null,copyError:null,planError:null,resolveError:null,...existing,setAutoRunning:v=>calls.push(['running',v]),setConfirmRegen:()=>{},setActiveView:()=>{},toast:{success:()=>calls.push(['done'])}}
 for(const [key,name] of [['copy','runCopy'],['plan','runPlan'],['resolve','runResolve'],['design','runDesign']]) scope[name]=async(...args)=>{calls.push([key,...args]);return key===fail?undefined:result[key]}
 const run=new Function(...Object.keys(scope),body+';return generatePost')(...Object.values(scope))
 return {run,calls,lock}
}
test('automatic pipeline passes fresh results between steps',async()=>{
 const s=setup();await s.run()
 assert.deepEqual(s.calls.filter(c=>['copy','plan','resolve','design'].includes(c[0])),[['copy'],['plan','copy-result'],['resolve','plan-result'],['design','resolve-result','copy-result']])
 assert.equal(s.lock.current,false)
})
test('failure stops downstream work and releases busy state',async()=>{
 const s=setup('plan');await s.run()
 assert.equal(s.calls.some(c=>c[0]==='resolve'),false)
 assert.deepEqual(s.calls.at(-1),['running',false])
})
test('resume uses completed steps without regenerating images',async()=>{
 const s=setup(null,{copy:'saved-copy',plan:'saved-plan',resolved:'saved-images'});await s.run()
 assert.deepEqual(s.calls.filter(c=>['copy','plan','resolve','design'].includes(c[0])),[['design','saved-images','saved-copy']])
})
