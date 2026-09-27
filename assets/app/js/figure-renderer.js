(function (global) {
  'use strict';
  function create(deps) {
    const { THREE, renderer, scene, controls } = deps;
    let saved = null, locked = null, pixelScale = 1;
    function limits() {
      const gl=renderer.getContext(), gpu=gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
      return { gpu, panel:Math.min(8192,gpu,gl.getParameter(gl.MAX_TEXTURE_SIZE)), tiled:false };
    }
    function cameraSnapshot() {
      const c=deps.camera();
      return { position:c.position.toArray(), quaternion:c.quaternion.toArray(), zoom:c.zoom,
        target:controls.target.toArray(), near:c.near, far:c.far, aspect:c.aspect ?? (c.right-c.left)/(c.top-c.bottom) };
    }
    function captureState(options) {
      const camera=deps.camera();
      saved={ camera:camera.clone(), target:controls.target.clone(), enabled:controls.enabled,
        autoRotate:controls.autoRotate, size:renderer.getSize(new THREE.Vector2()), pixelRatio:renderer.getPixelRatio(),
        viewport:renderer.getViewport(new THREE.Vector4()), scissor:renderer.getScissor(new THREE.Vector4()),
        scissorTest:renderer.getScissorTest(), background:scene.background, clearColor:renderer.getClearColor(new THREE.Color()),
        clearAlpha:renderer.getClearAlpha(), app:deps.pause(options) };
      controls.enabled=false; controls.autoRotate=false; locked=null;
      return saved;
    }
    function projection(width,height) {
      const camera=deps.camera(), reference=locked?.camera || saved?.camera;
      if (!reference) return;
      const aspect=width/height;
      if (camera.isOrthographicCamera) {
        const half=(reference.top-reference.bottom)/2, cy=(reference.top+reference.bottom)/2, cx=(reference.left+reference.right)/2;
        camera.left=cx-half*aspect;camera.right=cx+half*aspect;camera.top=cy+half;camera.bottom=cy-half;
      } else camera.aspect=aspect;
      camera.updateProjectionMatrix();
    }
    function applyLocked() {
      deps.camera().copy(locked.camera);controls.target.copy(locked.target);
      deps.camera().updateMatrixWorld(true);
    }
    async function prepare(targets, options, plan, check, progress) {
      const bounds=new THREE.Box3();
      for (let i=0;i<targets.length;i++) {
        check(); progress?.(`Preparing panel ${i+1} of ${targets.length}…`);
        deps.activate(targets[i],options);deps.rebuild();
        bounds.union(deps.bounds());
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      const c=saved.camera.clone(), target=saved.target.clone();
      if (options.camera==='fit' && !bounds.isEmpty()) {
        const center=bounds.getCenter(new THREE.Vector3()), radius=Math.max(.01,bounds.getSize(new THREE.Vector3()).length()/2);
        const direction=new THREE.Vector3(0,0,1).applyQuaternion(c.quaternion);
        const halfFov=THREE.MathUtils.degToRad(c.fov || 45)/2;
        const distance=radius*1.12/Math.sin(halfFov);
        c.position.copy(center).addScaledVector(direction,distance);target.copy(center);c.zoom=1;
        if(c.isOrthographicCamera) { c.top=radius*1.12;c.bottom=-c.top;c.left=-c.top;c.right=c.top; }
      }
      // One depth range covers every panel, including space beyond the surfaces.
      if (!bounds.isEmpty()) {
        c.updateMatrixWorld(true);
        let min=Infinity,max=-Infinity;
        for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]) {
          const depth=-new THREE.Vector3(x,y,z).applyMatrix4(c.matrixWorldInverse).z;
          min=Math.min(min,depth);max=Math.max(max,depth);
        }
        const buffer=Math.max(3,(max-min)*.05);
        c.near=c.isOrthographicCamera ? min-buffer : Math.max(.01,min-buffer);c.far=Math.max(c.near+1,max+buffer);
      }
      c.clearViewOffset?.();locked={camera:c,target}; applyLocked();projection(1,1);
      locked.camera.copy(deps.camera());
    }
    function capture(pixels,options) {
      applyLocked();projection(pixels,pixels);
      renderer.setSize(pixels,pixels,false);
      const height=deps.viewportHeight();pixelScale=pixels/Math.max(1,height);
      scene.background=options.background==='transparent'?null:options.background==='white'?new THREE.Color('#ffffff'):saved.background;
      renderer.setClearColor(0x000000,options.background==='transparent'?0:1);
      // Only actual pixel-based quantities scale. Outline meshes, atom labels,
      // bond radii and world-space contour offsets already scale in projection.
      const materials=new Set();
      scene.traverseVisible(obj=>{for(const material of Array.isArray(obj.material)?obj.material:[obj.material])if(material)materials.add(material);});
      const undo=[];
      for(const m of materials) {
        if(m.uniforms?.uSize){undo.push(()=>{m.uniforms.uSize.value/=pixelScale;});m.uniforms.uSize.value*=pixelScale;}
        if(m.isPointsMaterial && !m.sizeAttenuation){const size=m.size;undo.push(()=>{m.size=size;});m.size*=pixelScale;}
        if(m.isLineBasicMaterial){const width=m.linewidth;undo.push(()=>{m.linewidth=width;});m.linewidth*=pixelScale;}
      }
      try { return deps.renderPixels(pixels,pixelScale); }
      finally { for(const restore of undo)restore();pixelScale=1; }
    }
    function restore(state) {
      try { deps.restoreApp(state.app); }
      finally {
        try {
          deps.dispose();
          scene.background=state.background;renderer.setClearColor(state.clearColor,state.clearAlpha);
          renderer.setRenderTarget(null);
          // setSize uses logical pixels. Preserve the original pixel ratio exactly.
          if(renderer.getPixelRatio()!==state.pixelRatio)renderer.setPixelRatio(state.pixelRatio);
          renderer.setSize(state.size.x,state.size.y,false);
          renderer.setViewport(state.viewport);renderer.setScissor(state.scissor);renderer.setScissorTest(state.scissorTest);
          controls.target.copy(state.target);deps.camera().copy(state.camera);deps.camera().updateMatrixWorld(true);
          controls.enabled=state.enabled;controls.autoRotate=state.autoRotate;
        } finally { saved=null;locked=null;deps.resume(); }
      }
    }
    return { limits,cameraSnapshot,captureState,prepare,activate:deps.activate,rebuild:deps.rebuild,capture,restore,projection };
  }
  global.VibeMolFigureRenderer=Object.freeze({create});
})(window);
