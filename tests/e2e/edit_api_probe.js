(() => {
  const counts={atom:0,group:0,operation:0,history:0,apply:0,create:0};
  window.__editApiEffects=()=>({...counts});
  function publish(name,decorate){
    let current;Object.defineProperty(window,name,{configurable:true,get:()=>current,set:value=>{current=decorate(value);}});
  }
  publish('VibeMolStructureCore',value=>{
    const result={...value};
    for(const [name,key]of [['allocateBuilderAtomId','atom'],['allocateBuilderGroupId','group'],['allocateBuilderOpId','operation']]){
      const original=value[name];result[name]=(...args)=>{counts[key]++;return Reflect.apply(original,value,args);};
    }
    return Object.freeze(result);
  });
  publish('VibeMolEditState',value=>Object.freeze({...value,createEditStateController:(...args)=>{
    const result=value.createEditStateController(...args),wrapped={...result};
    for(const [name,key]of [['pushEditHistoryEntry','history'],['applyAtomsSnapshotToRecord','apply'],['createNewEditableVolumeRecord','create']]){
      const original=result[name];wrapped[name]=(...args)=>{counts[key]++;return Reflect.apply(original,result,args);};
    }
    return wrapped;
  }}));
})();
