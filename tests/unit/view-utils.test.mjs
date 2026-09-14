import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModules } from './load-global-module.mjs';

const { THREE: T, VibeMolViewUtils: V } = loadGlobalModules(['assets/vendor/js/three.min.js', 'assets/app/js/view-utils.js']);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
const sphere = (x, y, z, radius = 0.5) => {
  const mesh = new T.Mesh(new T.SphereGeometry(radius, 16, 12), new T.MeshBasicMaterial());
  mesh.position.set(x, y, z); return mesh;
};

test('orthographic depth covers rotated slabs and orbital bounds with padding without reframing', () => {
  const root = new T.Group(), camera = new T.OrthographicCamera(-20, 20, 20, -20, 0.1, 10);
  const depth = V.createCameraDepthController(T);
  for (const x of [-12, 0, 12]) for (const y of [-12, 0, 12]) root.add(sphere(x, y, 0));
  root.add(sphere(0, 0, 0, 18)); // Diffuse orbital extends beyond the atom slab.
  camera.position.set(6, 6, 3); camera.lookAt(0, 0, 0); camera.zoom = 0.4; camera.updateProjectionMatrix();
  for (const angle of [0, 0.8, 1.7, Math.PI]) {
    root.rotation.set(angle, angle * 0.7, angle * 0.3); root.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    const pose = camera.position.clone(), quaternion = camera.quaternion.clone(), before = [];
    const corners = [];
    root.children.forEach(mesh => {
      mesh.geometry.computeBoundingBox(); const b = mesh.geometry.boundingBox;
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
        const world = new T.Vector3(x, y, z).applyMatrix4(mesh.matrixWorld);
        corners.push(world); before.push(world.clone().project(camera));
      }
    });
    depth.update(root, camera);
    corners.forEach((world, i) => {
      const p = world.clone().project(camera), d = -world.clone().applyMatrix4(camera.matrixWorldInverse).z;
      near(p.x, before[i].x); near(p.y, before[i].y);
      assert.ok(p.z >= -1 && p.z <= 1);
      assert.ok(d - camera.near >= 3 - 1e-7 && camera.far - d >= 3 - 1e-7);
    });
    assert.ok(camera.near < 0);
    assert.ok(camera.position.equals(pose) && camera.quaternion.equals(quaternion));
    assert.equal(camera.zoom, 0.4);
  }
});

test('perspective depth follows dollying and stays positive when the camera enters the structure', () => {
  const root = new T.Group(), camera = new T.PerspectiveCamera(45, 1, 0.1, 10), depth = V.createCameraDepthController(T);
  root.add(sphere(0, 0, 0, 1));
  for (const distance of [5, 1000, 0.5]) {
    camera.position.z = distance; depth.update(root, camera);
    assert.ok(camera.near > 0 && camera.far >= distance + 4);
    assert.ok(camera.near <= Math.max(0.01, distance - 4));
    assert.equal(camera.position.z, distance);
  }
});

test('mutated geometry and instanced clouds refresh their cached bounds', () => {
  const root = new T.Group(), camera = new T.OrthographicCamera(-1, 1, 1, -1), depth = V.createCameraDepthController(T);
  const cloud = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial(), 2);
  cloud.setMatrixAt(0, new T.Matrix4().makeTranslation(0, 0, 20));
  cloud.setMatrixAt(1, new T.Matrix4().makeTranslation(0, 0, -40));
  cloud.instanceMatrix.needsUpdate = true; root.add(cloud); depth.update(root, camera);
  assert.ok(camera.near <= -23.5 && camera.far >= 43.5);
  cloud.setMatrixAt(1, new T.Matrix4().makeTranslation(0, 0, -140));
  cloud.instanceMatrix.needsUpdate = true; depth.update(root, camera);
  assert.ok(camera.far > 143.5);
  cloud.count = 1; depth.update(root, camera); assert.ok(camera.far < 0);
  const position = cloud.geometry.attributes.position;
  position.setZ(0, 50); position.needsUpdate = true; depth.update(root, camera);
  assert.ok(camera.near <= -73);
  cloud.geometry = new T.BoxGeometry(2, 2, 200); depth.update(root, camera);
  assert.ok(camera.near <= -123 && camera.far >= 83);
});

test('hidden geometry does not expand the interval, and empty scenes keep valid limits', () => {
  const root = new T.Group(), camera = new T.PerspectiveCamera(), depth = V.createCameraDepthController(T);
  root.add(sphere(0, 0, -10)); depth.update(root, camera);
  const limits = [camera.near, camera.far];
  const hidden = new T.Group(); hidden.visible = false; hidden.add(sphere(0, 0, -10000)); root.add(hidden);
  const transparent = sphere(0, 0, -10000); transparent.material.opacity = 0; root.add(transparent);
  depth.update(root, camera); assert.deepEqual([camera.near, camera.far], limits);
  root.clear(); depth.update(root, camera); assert.deepEqual([camera.near, camera.far], limits);
});

test('orthographic picking reaches the foremost atom even behind the nominal camera position', () => {
  const root = new T.Group(), camera = new T.OrthographicCamera(-5, 5, 5, -5), depth = V.createCameraDepthController(T);
  const front = sphere(0, 0, 4), back = sphere(0, 0, -4); root.add(front, back); depth.update(root, camera);
  const ray = new T.Raycaster(); V.setCameraRay(ray, new T.Vector2(0, 0), camera);
  const hits = ray.intersectObjects(root.children);
  assert.equal(hits[0].object, front); assert.ok(hits.some(hit => hit.object === back));
  near(-ray.ray.origin.z, camera.near); assert.equal(ray.far, camera.far - camera.near);
});

test('perspective ray limits use depth along the view axis at the screen edge', () => {
  const root = new T.Group(), camera = new T.PerspectiveCamera(90, 1, 1, 5);
  const visible = sphere(4.32, 0, -4.8, 0.03), clipped = sphere(4.86, 0, -5.4, 0.03);
  root.add(visible, clipped); root.updateMatrixWorld(true); camera.updateMatrixWorld(true);
  const ray = new T.Raycaster(); ray.near = 100; ray.far = 101;
  V.setCameraRay(ray, new T.Vector2(0.9, 0), camera);
  const hits = ray.intersectObjects(root.children);
  assert.ok(hits.length && hits.every(hit => hit.object === visible));
  assert.ok(hits[0].distance > camera.far);
});

test('picking reuses hits and misses until pointer, geometry, or view changes', () => {
  let group = {}, revision = 0, calls = 0;
  const matrix = [1, 0, 0, 1], viewport = [0, 0, 800, 600];
  const hit = { id: 'bond' };
  const cache = V.createPickCache(e => [e.x, e.y, group, revision, ...matrix, ...viewport], e => {
    calls++; return e.x > 0 ? hit : null;
  });
  const point = { x: 5, y: 6 };
  assert.equal(cache.get(point), hit);
  for (let frame = 0; frame < 100; frame++) assert.equal(cache.get({ ...point }), hit);
  assert.equal(calls, 1);
  matrix[2] = 3; cache.get(point); assert.equal(calls, 2);
  viewport[0] = 200; cache.get(point); assert.equal(calls, 3);
  revision++; cache.get(point); assert.equal(calls, 4);
  group = {}; cache.get(point); assert.equal(calls, 5);
  assert.equal(cache.get({ x: -1, y: 6 }), null);
  assert.equal(cache.get({ x: -1, y: 6 }), null);
  assert.equal(calls, 6);
  cache.clear(); cache.get(point); assert.equal(calls, 7);
});

test('a depth refit during picking is included in the cached view', () => {
  let far = 10, calls = 0;
  const cache = V.createPickCache(() => [far], () => { calls++; far = 100; return 'hit'; });
  assert.equal(cache.get({}), 'hit');
  assert.equal(cache.get({}), 'hit');
  assert.equal(calls, 1);
});
