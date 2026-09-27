(function (global) {
  'use strict';
  const BOHR = 0.529177210903;
  const factorial = n => { let value=1;for(let i=2;i<=n;i++)value*=i;return value; };
  function radial(shell) {
    let odd=1;for(let i=1;i<2*shell.l;i+=2)odd*=i;
    const {exponents:a,coefficients:c,l}=shell;
    let norm=0;
    for(let i=0;i<a.length;i++)for(let j=0;j<a.length;j++)norm+=c[i]*c[j]*(2*Math.sqrt(a[i]*a[j])/(a[i]+a[j]))**(l+1.5);
    const weights=c.map((v,i)=>v*(2*a[i]/Math.PI)**0.75*(4*a[i])**(l/2)/Math.sqrt(odd*norm));
    return r2=>weights.reduce((sum,v,i)=>sum+v*Math.exp(-a[i]*r2),0);
  }
  // Real, Racah-normalized regular solid harmonics in Libint's CCA order.
  // There is no Condon–Shortley phase: l=1 is +y,+z,+x.
  function harmonic(l,index,x,y,z) {
    if(!l)return 1;
    const r=Math.hypot(x,y,z);if(r<1e-15)return 0;
    const signed=index-l,m=Math.abs(signed),cos=z/r;
    let pmm=1;for(let i=1;i<=m;i++)pmm*=(2*i-1)*Math.sqrt(Math.max(0,1-cos*cos));
    let p=pmm;
    if(l>m){let prev=pmm;p=(2*m+1)*cos*pmm;for(let n=m+2;n<=l;n++){const next=((2*n-1)*cos*p-(n+m-1)*prev)/(n-m);prev=p;p=next;}}
    const angle=m*Math.atan2(y,x), factor=m?Math.sqrt(2*factorial(l-m)/factorial(l+m)):1;
    return r**l*factor*p*(signed<0?Math.sin(angle):Math.cos(angle));
  }
  function grid(shell,component) {
    const f=radial(shell);
    let peak=0,extent=0;
    // Per-shell bounds resolve compact core orbitals as well as diffuse valence
    // functions. The browser preview uses a fixed 12% peak-amplitude contour.
    const maxRadius=4/BOHR;
    for(let i=0;i<=1600;i++){const r=maxRadius*i/1600;peak=Math.max(peak,Math.abs(f(r*r))*r**shell.l);}
    const iso=peak*0.12;
    for(let i=0;i<=1600;i++){const r=maxRadius*i/1600;if(Math.abs(f(r*r))*r**shell.l>=iso*0.5)extent=r;}
    extent=Math.min(maxRadius,Math.max(0.08/BOHR,extent*1.12));
    const n=43,step=2*extent/(n-1),data=new Float32Array(n*n*n);
    for(let i=0;i<n;i++)for(let j=0;j<n;j++)for(let k=0;k<n;k++){
      const x=-extent+i*step,y=-extent+j*step,z=-extent+k*step;
      data[(i*n+j)*n+k]=f(x*x+y*y+z*z)*harmonic(shell.l,component,x,y,z);
    }
    return {nxyz:[n,n,n],origin:[-extent,-extent,-extent],axes:[[step,0,0],[0,step,0],[0,0,step]],data,iso,idx:(i,j,k)=>(i*n+j)*n+k};
  }
  function create({scene,createMaterial,onStatus}) {
    const THREE=global.THREE,group=new THREE.Group(),cache=new Map();
    group.name='calculation-subspace';group.matrixAutoUpdate=false;group.visible=false;scene.add(group);
    let revision=0;
    function clearMeshes(){for(const child of [...group.children]){group.remove(child);child.material?.dispose();if(!child.isInstancedMesh)child.geometry?.dispose();else child.dispose();}}
    async function geometry(key,shell,component) {
      if(cache.has(key)){const value=cache.get(key);cache.delete(key);cache.set(key,value);return value;}
      // Yield between distinct functions; repeated atoms share the cached pair.
      await new Promise(resolve=>setTimeout(resolve,0));
      if(cache.has(key))return cache.get(key);
      const volume=grid(shell,component),make=global.VibeMolVolumeGeometry.makeIsosurface;
      const positive=make(volume,volume.iso);
      volume.data=volume.data.map(v=>-v);
      const negative=make(volume,volume.iso),result=[positive,negative];cache.set(key,result);return result;
    }
    async function sync(record,enabled) {
      const ticket=++revision;clearMeshes();group.visible=enabled;
      if(!enabled || !record)return;
      const projection=global.VibeMolCalculationsModel.projection(record),batches=new Map();
      if(projection.error){onStatus(projection.error);return;}
      for(const f of projection.functions){const key=`${f.atom.Z}:${f.shell.label}:${f.component}`;if(!batches.has(key))batches.set(key,[]);batches.get(key).push(f);}
      onStatus(batches.size?'Preparing MINAO previews…':'');
      try {
        for(const [key,functions]of batches){
          if(ticket!==revision)return;
          const [positive,negative]=await geometry(key,functions[0].shell,functions[0].component);
          if(ticket!==revision)return;
          for(const [shape,sign]of [[positive,'pos'],[negative,'neg']]){
            if(!shape.attributes.position.count)continue;
            const material=createMaterial(sign),mesh=new THREE.InstancedMesh(shape,material,functions.length);
            mesh.name=`minao:${key}:${sign}`;mesh.userData.minao=true;mesh.renderOrder=5;
            const matrix=new THREE.Matrix4(),quaternion=new THREE.Quaternion(),position=new THREE.Vector3(),scale=new THREE.Vector3(1,1,1);
            functions.forEach((f,i)=>{
              position.fromArray(f.atom.point);quaternion.identity();
              if(f.normal)quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),new THREE.Vector3(...f.normal));
              matrix.compose(position,quaternion,scale);mesh.setMatrixAt(i,matrix);
            });
            mesh.computeBoundingBox();mesh.computeBoundingSphere();group.add(mesh);
          }
        }
        for(const plane of projection.planes){
          const material=new THREE.MeshBasicMaterial({color:0x708bac,transparent:true,opacity:0.13,side:THREE.DoubleSide,depthWrite:false});
          const mesh=new THREE.Mesh(new THREE.CircleGeometry(plane.radius,64),material);mesh.name='avas-pi-plane';mesh.position.fromArray(plane.center);
          mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(...plane.normal));group.add(mesh);
          const points=Array.from({length:64},(_,i)=>new THREE.Vector3(plane.radius*Math.cos(i*Math.PI/32),plane.radius*Math.sin(i*Math.PI/32),0));
          const outline=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),
            new THREE.LineBasicMaterial({color:0x708bac,transparent:true,opacity:0.6,depthWrite:false}));
          outline.position.copy(mesh.position);outline.quaternion.copy(mesh.quaternion);group.add(outline);
        }
        // Retain at most 128 unused shapes; never evict geometry in the live view.
        for(const [key,pair]of cache){if(cache.size<=128)break;if(batches.has(key))continue;pair.forEach(g=>g.dispose());cache.delete(key);}
        onStatus('');
      }catch(error){if(ticket===revision)onStatus('MINAO preview failed: '+error.message);}
    }
    function setVisible(visible){group.visible=visible;if(!visible)++revision;}
    function updateTransform(atomGroup){atomGroup.updateWorldMatrix(true,false);group.matrix.copy(atomGroup.matrixWorld);group.matrixWorldNeedsUpdate=true;}
    return Object.freeze({group,sync,setVisible,updateTransform,cacheSize:()=>cache.size,dispose:()=>{++revision;clearMeshes();cache.forEach(pair=>pair.forEach(g=>g.dispose()));cache.clear();group.removeFromParent();}});
  }
  global.VibeMolMinaoRenderer=Object.freeze({radial,harmonic,grid,create});
})(window);
