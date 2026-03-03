const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.z = 2.8;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ===== ROTATION + PROJECTION ===== */

let angle = 0;

function rotate4D(v, a) {
    let [x, y, z, w] = v;
    const cos = Math.cos(a);
    const sin = Math.sin(a);

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
    return [v[0] * wFactor, v[1] * wFactor, v[2] * wFactor];
}

/* ===== GEOMETRY DEFINITIONS ===== */

function buildTesseract() {
    const size = 1.2;
    let verts = [];
    for (let x of [-size, size])
    for (let y of [-size, size])
    for (let z of [-size, size])
    for (let w of [-size, size]) {
        verts.push([x, y, z, w]);
    }
    let edges = [];
    for (let i = 0; i < verts.length; i++) {
        for (let j = i + 1; j < verts.length; j++) {
            let diff = 0;
            for (let d = 0; d < 4; d++) {
                if (verts[i][d] !== verts[j][d]) diff++;
            }
            if (diff === 1) edges.push([i, j]);
        }
    }
    return { verts, edges };
}

function build16Cell() {
    // 8 vertices: ±1 on each axis
    const verts = [
        [ 1.6,  0,    0,    0  ], [-1.6,  0,    0,    0  ],
        [ 0,    1.6,  0,    0  ], [ 0,   -1.6,  0,    0  ],
        [ 0,    0,    1.6,  0  ], [ 0,    0,   -1.6,  0  ],
        [ 0,    0,    0,    1.6], [ 0,    0,    0,   -1.6],
    ];
    // Connect all pairs that are NOT opposite (distance != 2)
    let edges = [];
    for (let i = 0; i < verts.length; i++) {
        for (let j = i + 1; j < verts.length; j++) {
            let dot = 0;
            for (let d = 0; d < 4; d++) dot += verts[i][d] * verts[j][d];
            // opposite vertices have dot = -1, skip them
            if (dot !== -1) edges.push([i, j]);
        }
    }
    return { verts, edges };
}

function build5Cell() {
    // 5-cell (4-simplex): 5 vertices embedded in 4D
    const s = Math.sqrt(1 / 10);
    const verts = [
        [ 1,  1,  1, -1/Math.sqrt(10)],
        [ 1, -1, -1, -1/Math.sqrt(10)],
        [-1,  1, -1, -1/Math.sqrt(10)],
        [-1, -1,  1, -1/Math.sqrt(10)],
        [ 0,  0,  0,  4/Math.sqrt(10)],
    ].map(v => {
        // normalize so all edges equal length
        const len = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
        return v.map(x => x / len * 1.9);
    });
    // All pairs connected (complete graph K5)
    let edges = [];
    for (let i = 0; i < verts.length; i++)
        for (let j = i + 1; j < verts.length; j++)
            edges.push([i, j]);
    return { verts, edges };
}

function buildHypersphere(latDiv = 8, lonDiv = 8) {
    const SCALE = 1.6;
    // Parametric 3-sphere: (x,y,z,w) = (sin(a)sin(b)cos(c), sin(a)sin(b)sin(c), sin(a)cos(b), cos(a))
    const verts = [];
    const edges = [];
    const idx = (a, b, c) => a * (lonDiv + 1) * (lonDiv + 1) + b * (lonDiv + 1) + c;

    const aSteps = latDiv;
    const bSteps = latDiv;
    const cSteps = lonDiv;

    for (let ai = 0; ai <= aSteps; ai++) {
        const a = (ai / aSteps) * Math.PI;
        for (let bi = 0; bi <= bSteps; bi++) {
            const b = (bi / bSteps) * Math.PI;
            for (let ci = 0; ci <= cSteps; ci++) {
                const c = (ci / cSteps) * 2 * Math.PI;
                verts.push([
                    SCALE * Math.sin(a) * Math.sin(b) * Math.cos(c),
                    SCALE * Math.sin(a) * Math.sin(b) * Math.sin(c),
                    SCALE * Math.sin(a) * Math.cos(b),
                    SCALE * Math.cos(a)
                ]);
            }
        }
    }

    // Connect along c-direction (longitude)
    for (let ai = 0; ai <= aSteps; ai++) {
        for (let bi = 0; bi <= bSteps; bi++) {
            for (let ci = 0; ci < cSteps; ci++) {
                edges.push([idx(ai, bi, ci), idx(ai, bi, ci + 1)]);
            }
        }
    }
    // Connect along b-direction
    for (let ai = 0; ai <= aSteps; ai++) {
        for (let bi = 0; bi < bSteps; bi++) {
            for (let ci = 0; ci <= cSteps; ci++) {
                edges.push([idx(ai, bi, ci), idx(ai, bi + 1, ci)]);
            }
        }
    }
    // Connect along a-direction
    for (let ai = 0; ai < aSteps; ai++) {
        for (let bi = 0; bi <= bSteps; bi++) {
            for (let ci = 0; ci <= cSteps; ci++) {
                edges.push([idx(ai, bi, ci), idx(ai + 1, bi, ci)]);
            }
        }
    }

    return { verts, edges };
}

function build24Cell() {
    // 24-cell vertices: all permutations of (±1, ±1, 0, 0) — 24 vertices
    const verts = [];
    const axes = [0, 1, 2, 3];
    for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
            for (let si of [-1, 1]) {
                for (let sj of [-1, 1]) {
                    const v = [0, 0, 0, 0];
                    v[i] = si * 1.6;
                    v[j] = sj * 1.6;
                    verts.push(v);
                }
            }
        }
    }

    // Connect vertices at distance sqrt(2)
    const edges = [];
    for (let i = 0; i < verts.length; i++) {
        for (let j = i + 1; j < verts.length; j++) {
            let dist2 = 0;
            for (let d = 0; d < 4; d++) {
                const diff = verts[i][d] - verts[j][d];
                dist2 += diff * diff;
            }
            if (Math.abs(dist2 - 2 * 1.6 * 1.6) < 0.01) edges.push([i, j]);
        }
    }

    return { verts, edges };
}

/* ===== SHAPE REGISTRY ===== */

const SHAPES = [
    {
        id: "tesseract",
        label: "Tesseract",
        subtitle: "Hypercube 4D · 16 verts · 32 edges",
        color: 0x00ffff,
        build: buildTesseract,
    },
    {
        id: "cell16",
        label: "16-Cell",
        subtitle: "Cross Polytope 4D · 8 verts · 24 edges",
        color: 0xff6ec7,
        build: build16Cell,
    },
    {
        id: "cell5",
        label: "5-Cell",
        subtitle: "Pentachoron · 5 verts · 10 edges",
        color: 0xaaff44,
        build: build5Cell,
    },
    {
        id: "hypersphere",
        label: "Hypersphere",
        subtitle: "3-Sphere · Parametric surface",
        color: 0xff9900,
        build: buildHypersphere,
    },
    {
        id: "cell24",
        label: "24-Cell",
        subtitle: "No 3D analogue · 24 verts · 96 edges",
        color: 0xcc88ff,
        build: build24Cell,
    },
];

/* ===== SCENE MANAGEMENT ===== */

let currentLines = null;
let currentGeometry = null;
let currentVerts = [];
let currentEdges = [];
let currentColor = 0x00ffff;
let linePositions = null;

function loadShape(index) {
    const shape = SHAPES[index];

    if (currentLines) {
        scene.remove(currentLines);
        currentGeometry.dispose();
    }

    const { verts, edges } = shape.build();
    currentVerts = verts;
    currentEdges = edges;
    currentColor = shape.color;

    const material = new THREE.LineBasicMaterial({ color: shape.color });
    currentGeometry = new THREE.BufferGeometry();
    linePositions = new Float32Array(edges.length * 2 * 3);
    currentGeometry.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
    currentLines = new THREE.LineSegments(currentGeometry, material);
    scene.add(currentLines);

    // Update info panel
    document.getElementById("shape-name").textContent = shape.label;
    document.getElementById("shape-sub").textContent = shape.subtitle;

    // Update button states
    document.querySelectorAll(".shape-btn").forEach((btn, i) => {
        btn.classList.toggle("active", i === index);
    });

    angle = 0;
}

/* ===== UI BUTTONS ===== */

const nav = document.getElementById("shape-nav");
SHAPES.forEach((shape, i) => {
    const btn = document.createElement("button");
    btn.className = "shape-btn";
    btn.textContent = shape.label;
    btn.addEventListener("click", () => loadShape(i));
    nav.appendChild(btn);
});

/* ===== ANIMATE ===== */

function animate() {
    requestAnimationFrame(animate);
    angle += 0.01;

    const projected = currentVerts.map(v => {
        const rotated = rotate4D(v, angle);
        return project4Dto3D(rotated);
    });

    let index = 0;
    currentEdges.forEach(edge => {
        const v1 = projected[edge[0]];
        const v2 = projected[edge[1]];
        linePositions[index++] = v1[0];
        linePositions[index++] = v1[1];
        linePositions[index++] = v1[2];
        linePositions[index++] = v2[0];
        linePositions[index++] = v2[1];
        linePositions[index++] = v2[2];
    });

    currentGeometry.attributes.position.needsUpdate = true;
    renderer.render(scene, camera);
}

// Init with tesseract
loadShape(0);
animate();