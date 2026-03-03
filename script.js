const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.z = 4;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ===== 4D TESSERACT ===== */

const size = 1;
let vertices4D = [];

// 16 vértices
for (let x of [-size, size])
for (let y of [-size, size])
for (let z of [-size, size])
for (let w of [-size, size]) {
    vertices4D.push([x, y, z, w]);
}

// Conectar arestas (diferença em apenas 1 dimensão)
let edges = [];
for (let i = 0; i < vertices4D.length; i++) {
    for (let j = i + 1; j < vertices4D.length; j++) {
        let diff = 0;
        for (let d = 0; d < 4; d++) {
            if (vertices4D[i][d] !== vertices4D[j][d]) diff++;
        }
        if (diff === 1) edges.push([i, j]);
    }
}

const material = new THREE.LineBasicMaterial({ color: 0x00ffff });
const geometry = new THREE.BufferGeometry();
let linePositions = new Float32Array(edges.length * 2 * 3);

geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(linePositions, 3)
);

const lines = new THREE.LineSegments(geometry, material);
scene.add(lines);

/* ===== ROTATION + PROJECTION ===== */

let angle = 0;

function rotate4D(v) {
    let [x, y, z, w] = v;

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // XY
    [x, y] = [x * cos - y * sin, x * sin + y * cos];

    // XW
    [x, w] = [x * cos - w * sin, x * sin + w * cos];

    // YZ
    [y, z] = [y * cos - z * sin, y * sin + z * cos];

    // ZW
    [z, w] = [z * cos - w * sin, z * sin + w * cos];

    return [x, y, z, w];
}

function project4Dto3D(v) {
    const distance = 3;
    const wFactor = 1 / (distance - v[3]);

    return [
        v[0] * wFactor,
        v[1] * wFactor,
        v[2] * wFactor
    ];
}

function animate() {
    requestAnimationFrame(animate);
    angle += 0.01;

    const projected = vertices4D.map(v => {
        const rotated = rotate4D(v);
        return project4Dto3D(rotated);
    });

    let index = 0;

    edges.forEach(edge => {
        const v1 = projected[edge[0]];
        const v2 = projected[edge[1]];

        linePositions[index++] = v1[0];
        linePositions[index++] = v1[1];
        linePositions[index++] = v1[2];

        linePositions[index++] = v2[0];
        linePositions[index++] = v2[1];
        linePositions[index++] = v2[2];
    });

    geometry.attributes.position.needsUpdate = true;

    renderer.render(scene, camera);
}

animate();