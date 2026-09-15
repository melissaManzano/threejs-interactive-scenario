import * as THREE from 'three';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { Octree } from 'three/addons/math/Octree.js';

import { Capsule } from 'three/addons/math/Capsule.js';

import RAPIER from 'https://cdn.skypack.dev/@dimforge/rapier3d-compat';


// =====================================================
// RAPIER INIT
// =====================================================

await RAPIER.init();


// =====================================================
// CONTENEDOR Y ESCENA
// =====================================================

const container = document.getElementById('scene-container');

const scene = new THREE.Scene();

scene.background = new THREE.Color(0x07111f);

scene.fog = new THREE.Fog(0x07111f, 18, 65);


// =====================================================
// CÁMARA Y RENDERER
// =====================================================

const camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);

camera.rotation.order = 'YXZ';

const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

renderer.setSize(window.innerWidth, window.innerHeight);

renderer.shadowMap.enabled = true;

renderer.shadowMap.type = THREE.PCFSoftShadowMap;

renderer.domElement.tabIndex = -1;

container.appendChild(renderer.domElement);


// =====================================================
// ILUMINACIÓN
// =====================================================

scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x182030, 1.8));

const sun = new THREE.DirectionalLight(0xffffff, 3);

sun.position.set(-5, 18, 6);

sun.castShadow = true;

sun.shadow.mapSize.set(2048, 2048);

// Frustum de la cámara de sombras ampliado para cubrir todo collision-world.glb,
// no solo el área ±5 por defecto de THREE.DirectionalLight.
sun.shadow.camera.near = 0.1;
sun.shadow.camera.far = 100;
sun.shadow.camera.left = -30;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;
sun.shadow.bias = -0.00006;

scene.add(sun);


// =====================================================
// TIMER Y OCTREE
// =====================================================

const timer = new THREE.Timer();

const worldOctree = new Octree();

// Submuestreo de la física del jugador: cada frame se resuelve en varios
// pasos pequeños para que la cápsula no atraviese paredes/escaleras a alta velocidad.
const STEPS_PER_FRAME = 5;


// =====================================================
// JUGADOR
// =====================================================

const playerCollider = new Capsule(
    new THREE.Vector3(0, 0.35, 0),
    new THREE.Vector3(0, 1, 0),
    0.35
);

const playerVelocity = new THREE.Vector3();

const playerDirection = new THREE.Vector3();

const keyStates = {};

let playerOnFloor = false;


// =====================================================
// MUNDO FÍSICO RAPIER
// =====================================================

const gravity = { x: 0, y: -9.81, z: 0 };

const physicsWorld = new RAPIER.World(gravity);

const physicalObjects = [];

const lasers = [];


// =====================================================
// CREAR CUBO DINÁMICO
// =====================================================

function createDynamicBox(x, y, z, sx, sy, sz, mass = 4) {

    const geometry = new THREE.BoxGeometry(sx, sy, sz);

    const randomColor = new THREE.Color().setHSL(Math.random(), 0.7, 0.55);

    const material = new THREE.MeshStandardMaterial({
        color: randomColor,
        roughness: 0.4,
        metalness: 0.1
    });

    const mesh = new THREE.Mesh(geometry, material);

    mesh.position.set(x, y, z);

    mesh.castShadow = true;

    mesh.receiveShadow = true;

    scene.add(mesh);

    const bodyDesc = RAPIER.RigidBodyDesc
        .dynamic()
        .setTranslation(x, y, z)
        .setGravityScale(1.0);

    const body = physicsWorld.createRigidBody(bodyDesc);

    const collider = RAPIER.ColliderDesc
        .cuboid(sx / 2, sy / 2, sz / 2)
        .setDensity(mass / Math.max(sx * sy * sz, 0.01))
        .setFriction(0.7)
        .setRestitution(0.2);

    physicsWorld.createCollider(collider, body);

    body.wakeUp();

    physicalObjects.push({
        mesh,
        body,
        size: { x: sx, y: sy, z: sz }
    });
}


// =====================================================
// GENERADOR DE CUBOS ALEATORIOS AL RECARGAR
// =====================================================

function spawnRandomFallingBoxes() {
    const totalBoxes = THREE.MathUtils.randInt(15, 25);

    for (let i = 0; i < totalBoxes; i++) {
        const sx = THREE.MathUtils.randFloat(0.8, 2.0);
        const sy = THREE.MathUtils.randFloat(0.8, 2.0);
        const sz = THREE.MathUtils.randFloat(0.8, 2.0);

        const x = THREE.MathUtils.randFloat(-10, 10);
        const z = THREE.MathUtils.randFloat(-10, 10);
        const y = THREE.MathUtils.randFloat(8, 22) + (i * 0.2);

        createDynamicBox(x, y, z, sx, sy, sz, 3);
    }
}

spawnRandomFallingBoxes();


// =====================================================
// ESCENARIO GLTF (CONVERTIDO A FÍSICA REAL)
// =====================================================

const loader = new GLTFLoader();

loader.load(
    './assets/models/collision-world.glb',
    (gltf) => {
        const model = gltf.scene;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;

                if (child.material?.map) {
                    child.material.map.anisotropy = 4;
                }

                // Generar colisionador físico estático exacto para cada pared/escalera del mapa
                const geometry = child.geometry;
                const posAttr = geometry.attributes.position;
                const indexAttr = geometry.index;

                if (posAttr && indexAttr) {
                    child.updateWorldMatrix(true, false);
                    const matrix = child.matrixWorld;

                    const vertices = posAttr.array;
                    const indices = indexAttr.array;
                    const transformedVertices = new Float32Array(vertices.length);

                    const v = new THREE.Vector3();
                    for (let i = 0; i < vertices.length; i += 3) {
                        v.set(vertices[i], vertices[i + 1], vertices[i + 2]);
                        v.applyMatrix4(matrix);
                        transformedVertices[i] = v.x;
                        transformedVertices[i + 1] = v.y;
                        transformedVertices[i + 2] = v.z;
                    }

                    const bodyDesc = RAPIER.RigidBodyDesc.fixed();
                    const body = physicsWorld.createRigidBody(bodyDesc);
                    const colliderDesc = RAPIER.ColliderDesc.trimesh(transformedVertices, indices);
                    physicsWorld.createCollider(colliderDesc, body);
                }
            }
        });

        scene.add(model);
        worldOctree.fromGraphNode(model);
    },
    undefined,
    (error) => {
        console.error('Error al cargar el escenario:', error);
    }
);


// =====================================================
// CONTROLES Y MOVIMIENTO DEL JUGADOR
// =====================================================

function getForwardVector() {
    camera.getWorldDirection(playerDirection);
    playerDirection.y = 0;
    return playerDirection.normalize();
}

function getSideVector() {
    camera.getWorldDirection(playerDirection);
    playerDirection.y = 0;
    playerDirection.normalize();
    playerDirection.cross(camera.up);
    return playerDirection;
}

function controls(deltaTime) {
    const speed = playerOnFloor ? 18 : 7;

    if (keyStates.KeyW) playerVelocity.add(getForwardVector().multiplyScalar(speed * deltaTime));
    if (keyStates.KeyS) playerVelocity.add(getForwardVector().multiplyScalar(-speed * deltaTime));
    if (keyStates.KeyA) playerVelocity.add(getSideVector().multiplyScalar(-speed * deltaTime));
    if (keyStates.KeyD) playerVelocity.add(getSideVector().multiplyScalar(speed * deltaTime));

    if (playerOnFloor && keyStates.Space) {
        playerVelocity.y = 7;
    }
}

function playerCollisions() {
    const result = worldOctree.capsuleIntersect(playerCollider);
    playerOnFloor = false;

    if (result) {
        playerOnFloor = result.normal.y > 0;
        if (!playerOnFloor) {
            playerVelocity.addScaledVector(result.normal, -result.normal.dot(playerVelocity));
        }
        playerCollider.translate(result.normal.multiplyScalar(result.depth));
    }
}

function pushNearbyObjects() {
    const moving = new THREE.Vector3(playerVelocity.x, 0, playerVelocity.z);
    if (moving.lengthSq() < 0.04) return;

    for (const item of physicalObjects) {
        const p = item.body.translation();
        const dx = p.x - camera.position.x;
        const dz = p.z - camera.position.z;
        const d = Math.hypot(dx, dz);

        if (d < 1.35) {
            const force = 0.7 / Math.max(d, 0.25);
            item.body.applyImpulse({ x: dx * force, y: 0.08, z: dz * force }, true);
        }
    }
}

function updatePlayer(deltaTime) {
    let damping = Math.exp(-4 * deltaTime) - 1;

    if (!playerOnFloor) {
        playerVelocity.y -= 25 * deltaTime;
        damping *= 0.1;
    }

    playerVelocity.addScaledVector(playerVelocity, damping);
    playerCollider.translate(playerVelocity.clone().multiplyScalar(deltaTime));
    playerCollisions();

    camera.position.copy(playerCollider.end);
    pushNearbyObjects();

    if (camera.position.y < -20) {
        playerCollider.start.set(0, 0.35, 0);
        playerCollider.end.set(0, 1, 0);
        playerVelocity.set(0, 0, 0);
        camera.position.copy(playerCollider.end);
    }
}


// =====================================================
// DISPARAR LÁSER
// =====================================================

function shootLaser() {
    if (document.pointerLockElement !== renderer.domElement) return;

    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    direction.normalize();

    const geometry = new THREE.CylinderGeometry(0.035, 0.035, 0.9, 10);
    geometry.rotateX(Math.PI / 2);

    const material = new THREE.MeshStandardMaterial({
        color: 0x67e8f9,
        emissive: 0x22d3ee,
        emissiveIntensity: 5
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(camera.position);
    mesh.position.addScaledVector(direction, 0.8);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);

    scene.add(mesh);

    lasers.push({ mesh, direction, speed: 32, life: 1.7 });
}

function createImpact(position) {
    const flash = new THREE.PointLight(0x67e8f9, 8, 4, 2);
    flash.position.copy(position);
    scene.add(flash);
    setTimeout(() => scene.remove(flash), 90);
}

function updateLasers(deltaTime) {
    const meshes = physicalObjects.map((item) => item.mesh);

    for (let i = lasers.length - 1; i >= 0; i--) {
        const laser = lasers[i];
        const distance = laser.speed * deltaTime;

        const ray = new THREE.Raycaster(laser.mesh.position, laser.direction, 0, distance + 0.5);
        const hit = ray.intersectObjects(meshes, false)[0];

        if (hit) {
            const item = physicalObjects.find((entry) => entry.mesh === hit.object);
            if (item) {
                item.body.applyImpulse({
                    x: laser.direction.x * 6,
                    y: laser.direction.y * 6 + 1.0,
                    z: laser.direction.z * 6
                }, true);
            }

            createImpact(hit.point);
            scene.remove(laser.mesh);
            lasers.splice(i, 1);
            continue;
        }

        laser.mesh.position.addScaledVector(laser.direction, distance);
        laser.life -= deltaTime;

        if (laser.life <= 0) {
            scene.remove(laser.mesh);
            lasers.splice(i, 1);
        }
    }
}


// =====================================================
// SINCRONIZACIÓN FÍSICA
// =====================================================

function syncPhysics() {
    for (const item of physicalObjects) {
        const p = item.body.translation();
        const q = item.body.rotation();

        item.mesh.position.set(p.x, p.y, p.z);
        item.mesh.quaternion.set(q.x, q.y, q.z, q.w);
    }
}


// =====================================================
// EVENTOS DE ENTRADA Y MOUSE
// =====================================================

document.addEventListener('keydown', (event) => { keyStates[event.code] = true; });
document.addEventListener('keyup', (event) => { keyStates[event.code] = false; });

const pointerHint = document.getElementById('pointer-hint');

renderer.domElement.addEventListener('click', () => {
    if (document.pointerLockElement !== renderer.domElement) {
        renderer.domElement.requestPointerLock();
    }
});

document.addEventListener('pointerlockchange', () => {
    const isLocked = document.pointerLockElement === renderer.domElement;
    document.body.classList.toggle('is-locked', isLocked);

    if (pointerHint) {
        pointerHint.textContent = isLocked
            ? 'Pointer Lock activo · ESC para liberar el mouse.'
            : 'Haz clic en el escenario para activar el mouse.';
    }
});

document.addEventListener('pointerlockerror', () => {
    console.error('No se pudo activar Pointer Lock en el canvas.');
    if (pointerHint) {
        pointerHint.textContent = 'No se pudo activar el control por mouse. Intenta hacer clic de nuevo.';
    }
});

document.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement !== renderer.domElement) return;

    camera.rotation.y -= event.movementX / 500;
    camera.rotation.x -= event.movementY / 500;
    camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x, -Math.PI / 2, Math.PI / 2);
});

document.addEventListener('mousedown', (event) => {
    if (event.button === 0) shootLaser();
});


// =====================================================
// ANIMACIÓN
// =====================================================

function animate() {
    timer.update();
    const delta = Math.min(0.05, timer.getDelta());
    const subDelta = delta / STEPS_PER_FRAME;

    // Varios pasos cortos de movimiento/colisión por frame (igual que games_fps)
    // en vez de uno solo con el delta completo.
    for (let i = 0; i < STEPS_PER_FRAME; i++) {
        controls(subDelta);
        updatePlayer(subDelta);
    }

    physicsWorld.step();

    syncPhysics();
    updateLasers(delta);

    renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);


// =====================================================
// RESIZE
// =====================================================

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
});