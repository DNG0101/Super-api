window.UCOSApp=async function(root,UCOS){
  await UCOS.vfs.mkdir('.');
  await UCOS.vfs.writeText('note.txt','sandbox-ok');
  const text=await UCOS.vfs.readText('note.txt');
  const env=await UCOS.capability.request('action:environment-info',{operation:'execute',mode:'local'});
  const wf=await UCOS.workflows.run({id:'sandbox-flow',steps:[{id:'a',type:'set',key:'value',value:'ok'},{id:'b',type:'condition',dependsOn:['a'],left:'${vars.value}',operator:'eq',right:'ok'}]},{source:'sandbox'});
  if(text!=='sandbox-ok'||!env?.ok||wf?.steps?.b?.result?.passed!==true)throw new Error('sandbox service contract failed');
  root.textContent='SANDBOX_READY';
};
