// Real GPU readback of the private measurement connection factory; no product API.
body=>{
   const make=Function('THREE',body+';return createMeasurementConnection;')(THREE);
   const canvas=document.querySelector('canvas'),renderer=new THREE.WebGLRenderer({canvas,antialias:false,preserveDrawingBuffer:true});
   renderer.setClearColor(0x000000,1);const gl=renderer.getContext(),rows=[];
   function draw({dpr,kind,zoom,z,vertical=false,target=false,native=false}){
    renderer.setPixelRatio(dpr);renderer.setSize(101,101,false);
    const camera=kind==='orthographic'?new THREE.OrthographicCamera(-1,1,1,-1,.1,100):new THREE.PerspectiveCamera(45,1,.1,100);
    camera.position.z=z;camera.zoom=zoom;camera.updateProjectionMatrix();camera.lookAt(0,0,0);
    const points=(vertical?[[0,-.75,0],[0,.75,0]]:[[-.75,0,0],[.75,0,0]]).map(v=>new THREE.Vector3(...v));
    const line=native?new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xffffff,linewidth:3})):make(points,0xffffff);
    const scene=new THREE.Scene();scene.add(line);const size=101*dpr*(target?2:1),renderTarget=target?new THREE.WebGLRenderTarget(size,size):null;
    renderer.setRenderTarget(renderTarget);renderer.render(scene,camera);
    const pixels=new Uint8Array(size*size*4);if(renderTarget)renderer.readRenderTargetPixels(renderTarget,0,0,size,size,pixels);else gl.readPixels(0,0,size,size,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    const center=Math.floor(size/2),covered=[];
    for(let i=0;i<size;i++){const offset=(vertical?(center*size+i):(i*size+center))*4;if(pixels[offset]>0)covered.push(i);}
    const actual={native,dpr,kind,zoom,z,vertical,target,coveredPixels:covered.length,expectedPixels:native?Math.round(Math.min(3*dpr,gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE)[1])):3*dpr*(target?2:1),uniformWidth:line.material.uniforms?.lineWidth.value,resolution:line.material.uniforms?.resolution.value.toArray(),nativeRange:Array.from(gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE))};
    rows.push(actual);line.geometry.dispose();line.material.dispose();renderer.setRenderTarget(null);renderTarget?.dispose();return actual;
   }
   for(const dpr of [1,2]){
    draw({dpr,kind:'orthographic',zoom:1,z:5,native:true});
    for(const pose of [{kind:'orthographic',zoom:1,z:5},{kind:'orthographic',zoom:2,z:5},{kind:'perspective',zoom:1,z:5},{kind:'perspective',zoom:1,z:10}])for(const vertical of [false,true])draw({dpr,...pose,vertical});
    draw({dpr,kind:'orthographic',zoom:1,z:5,target:true});
   }
   renderer.dispose();renderer.forceContextLoss();return {rows};
  };
