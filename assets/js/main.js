/* =================================================================
   4D Polytope Visualizer — main.js
   · Slice mode      : corte W=0 em tempo real
   · Shadow proj.    : projeção semi-transparente achatada
   · Matrix display  : matriz de rotação 4D ao vivo
   · Ortho toggle    : perspectiva / ortográfica
   · InstancedMesh   : vértices como esferas instanciadas
   ================================================================= */

/* ── Renderer ─────────────────────────────────────────────────── */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 1);
document.body.appendChild(renderer.domElement);

/* ── Scene ────────────────────────────────────────────────────── */
const scene = new THREE.Scene();

/* ── Cameras ──────────────────────────────────────────────────── */
const perspCamera = new THREE.PerspectiveCamera(
    75, window.innerWidth / window.innerHeight, 0.1, 1000
);
perspCamera.position.z = 2.8;

const orthoSize = 2.2;
const orthoCamera = new THREE.OrthographicCamera(
    -orthoSize * (window.innerWidth / window.innerHeight),
     orthoSize * (window.innerWidth / window.innerHeight),
     orthoSize, -orthoSize, 0.1, 1000
);
orthoCamera.position.z = 2.8;

let useOrtho = false;
let camera   = perspCamera;

/* ── Resize ───────────────────────────────────────────────────── */
window.addEventListener("resize", () => {
    const w = window.innerWidth, h = window.innerHeight;
    perspCamera.aspect = w / h;
    perspCamera.updateProjectionMatrix();
    orthoCamera.left   = -orthoSize * (w / h);
    orthoCamera.right  =  orthoSize * (w / h);
    orthoCamera.updateProjectionMatrix();
    renderer.setSize(w, h);
});

/* ── 4D Math ──────────────────────────────────────────────────── */
let angle = 0;

function getRotMatrix(a) {
    const c = Math.cos(a), s = Math.sin(a);
    const mul = (A, B) => {
        const R = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
        for (let i = 0; i < 4; i++)
            for (let j = 0; j < 4; j++)
                for (let k = 0; k < 4; k++)
                    R[i][j] += A[i][k] * B[k][j];
        return R;
    };
    const Rxy = [[c,-s,0,0],[s,c,0,0],[0,0,1,0],[0,0,0,1]];
    const Rxw = [[c,0,0,-s],[0,1,0,0],[0,0,1,0],[s,0,0,c]];
    const Ryz = [[1,0,0,0],[0,c,-s,0],[0,s,c,0],[0,0,0,1]];
    const Rzw = [[1,0,0,0],[0,1,0,0],[0,0,c,-s],[0,0,s,c]];
    return mul(Rzw, mul(Ryz, mul(Rxw, Rxy)));
}

function applyMatrix4D(v, M) {
    const [x, y, z, w] = v;
    return [
        M[0][0]*x + M[0][1]*y + M[0][2]*z + M[0][3]*w,
        M[1][0]*x + M[1][1]*y + M[1][2]*z + M[1][3]*w,
        M[2][0]*x + M[2][1]*y + M[2][2]*z + M[2][3]*w,
        M[3][0]*x + M[3][1]*y + M[3][2]*z + M[3][3]*w,
    ];
}

function project4Dto3D(v) {
    if (useOrtho) return [v[0], v[1], v[2]];
    const d = 3, f = 1 / (d - v[3]);
    return [v[0]*f, v[1]*f, v[2]*f];
}

/* ── Geometry builders ────────────────────────────────────────── */
function buildTesseract() {
    const S = 1.2, verts = [];
    for (let x of [-S,S]) for (let y of [-S,S])
    for (let z of [-S,S]) for (let w of [-S,S])
        verts.push([x,y,z,w]);
    const edges = [];
    for (let i = 0; i < verts.length; i++)
        for (let j = i+1; j < verts.length; j++) {
            let d = 0;
            for (let k = 0; k < 4; k++) if (verts[i][k] !== verts[j][k]) d++;
            if (d === 1) edges.push([i, j]);
        }
    return { verts, edges };
}

function build16Cell() {
    const verts = [
        [1.6,0,0,0],[-1.6,0,0,0],[0,1.6,0,0],[0,-1.6,0,0],
        [0,0,1.6,0],[0,0,-1.6,0],[0,0,0,1.6],[0,0,0,-1.6],
    ];
    const edges = [];
    for (let i = 0; i < verts.length; i++)
        for (let j = i+1; j < verts.length; j++) {
            let dot = 0;
            for (let d = 0; d < 4; d++) dot += verts[i][d]*verts[j][d];
            if (Math.abs(dot + 1) > 0.01) edges.push([i, j]);
        }
    return { verts, edges };
}

function build5Cell() {
    const verts = [
        [1,1,1,-1/Math.sqrt(10)],[1,-1,-1,-1/Math.sqrt(10)],
        [-1,1,-1,-1/Math.sqrt(10)],[-1,-1,1,-1/Math.sqrt(10)],
        [0,0,0,4/Math.sqrt(10)],
    ].map(v => { const l = Math.sqrt(v.reduce((s,x)=>s+x*x,0)); return v.map(x=>x/l*1.9); });
    const edges = [];
    for (let i = 0; i < verts.length; i++)
        for (let j = i+1; j < verts.length; j++)
            edges.push([i,j]);
    return { verts, edges };
}

function buildHypersphere(aD=8, bD=8, cD=8) {
    const S = 1.6, verts = [], edges = [];
    const idx = (a,b,c) => a*(bD+1)*(cD+1) + b*(cD+1) + c;
    for (let ai=0;ai<=aD;ai++) {
        const a=(ai/aD)*Math.PI;
        for (let bi=0;bi<=bD;bi++) {
            const b=(bi/bD)*Math.PI;
            for (let ci=0;ci<=cD;ci++) {
                const c=(ci/cD)*2*Math.PI;
                verts.push([
                    S*Math.sin(a)*Math.sin(b)*Math.cos(c),
                    S*Math.sin(a)*Math.sin(b)*Math.sin(c),
                    S*Math.sin(a)*Math.cos(b),
                    S*Math.cos(a)
                ]);
            }
        }
    }
    for (let ai=0;ai<=aD;ai++) for (let bi=0;bi<=bD;bi++) for (let ci=0;ci<cD;ci++)  edges.push([idx(ai,bi,ci),idx(ai,bi,ci+1)]);
    for (let ai=0;ai<=aD;ai++) for (let bi=0;bi<bD;bi++)  for (let ci=0;ci<=cD;ci++) edges.push([idx(ai,bi,ci),idx(ai,bi+1,ci)]);
    for (let ai=0;ai<aD;ai++)  for (let bi=0;bi<=bD;bi++) for (let ci=0;ci<=cD;ci++) edges.push([idx(ai,bi,ci),idx(ai+1,bi,ci)]);
    return { verts, edges };
}

function build24Cell() {
    const verts = [];
    for (let i=0;i<4;i++) for (let j=i+1;j<4;j++)
        for (let si of[-1,1]) for (let sj of[-1,1]) {
            const v=[0,0,0,0]; v[i]=si*1.6; v[j]=sj*1.6; verts.push(v);
        }
    const edges = [];
    for (let i=0;i<verts.length;i++)
        for (let j=i+1;j<verts.length;j++) {
            let d2=0;
            for (let d=0;d<4;d++) { const dd=verts[i][d]-verts[j][d]; d2+=dd*dd; }
            if (Math.abs(d2 - 2*1.6*1.6) < 0.01) edges.push([i,j]);
        }
    return { verts, edges };
}

/* ── Shape registry ───────────────────────────────────────────── */
const SHAPES = [
    { label:"Tesseract",   subtitle:"Hypercube 4D · 16 verts · 32 edges",     color:0x00ffff, build:buildTesseract   },
    { label:"16-Cell",     subtitle:"Cross Polytope 4D · 8 verts · 24 edges", color:0xff6ec7, build:build16Cell      },
    { label:"5-Cell",      subtitle:"Pentachoron · 5 verts · 10 edges",        color:0xaaff44, build:build5Cell       },
    { label:"Hypersphere", subtitle:"3-Sphere · Parametric surface",           color:0xff9900, build:buildHypersphere },
    { label:"24-Cell",     subtitle:"No 3D analogue · 24 verts · 96 edges",   color:0xcc88ff, build:build24Cell      },
];

/* ── Scene object refs ────────────────────────────────────────── */
let mainLines   = null, mainGeo   = null, mainPos   = null;
let shadowLines = null, shadowGeo = null, shadowPos = null;

let currentVerts = [];
let currentEdges = [];
let currentColor = 0x00ffff;
let shadowMode   = false;

/* ── Load shape ───────────────────────────────────────────────── */
function loadShape(index) {
    const shape = SHAPES[index];

    [mainLines, shadowLines].forEach(o => { if (o) scene.remove(o); });
    [mainGeo, shadowGeo].forEach(g => { if (g) g.dispose(); });

    const { verts, edges } = shape.build();
    currentVerts = verts;
    currentEdges = edges;
    currentColor = shape.color;

    const nFloats = edges.length * 2 * 3;

    // Main edges
    mainGeo = new THREE.BufferGeometry();
    mainPos = new Float32Array(nFloats);
    mainGeo.setAttribute("position", new THREE.BufferAttribute(mainPos, 3));
    mainLines = new THREE.LineSegments(mainGeo, new THREE.LineBasicMaterial({ color: shape.color }));
    scene.add(mainLines);

    // Shadow projection
    shadowGeo = new THREE.BufferGeometry();
    shadowPos = new Float32Array(nFloats);
    shadowGeo.setAttribute("position", new THREE.BufferAttribute(shadowPos, 3));
    shadowLines = new THREE.LineSegments(shadowGeo, new THREE.LineBasicMaterial({
        color: shape.color, transparent: true, opacity: 0.5
    }));
    shadowLines.visible = shadowMode;
    scene.add(shadowLines);

    document.getElementById("shape-name").textContent = shape.label;
    document.getElementById("shape-sub").textContent  = shape.subtitle;
    document.querySelectorAll(".shape-btn").forEach((b, i) =>
        b.classList.toggle("active", i === index));

    angle = 0;
}

/* ── Matrix display ───────────────────────────────────────────── */
function updateMatrixDisplay(M) {
    const fmt = n => (n >= 0 ? " " : "") + n.toFixed(2);
    document.getElementById("matrix-display").textContent =
        M.map(row => "[ " + row.map(fmt).join("  ") + " ]").join("\n");
}

/* ── Animate ──────────────────────────────────────────────────── */
function animate() {
    requestAnimationFrame(animate);
    angle += 0.01;

    const M    = getRotMatrix(angle);
    updateMatrixDisplay(M);

    const rot4D  = currentVerts.map(v => applyMatrix4D(v, M));
    const proj3D = rot4D.map(v => project4Dto3D(v));

    // Main edges
    let pi = 0;
    currentEdges.forEach(([ei, ej]) => {
        const a = proj3D[ei], b = proj3D[ej];
        mainPos[pi++]=a[0]; mainPos[pi++]=a[1]; mainPos[pi++]=a[2];
        mainPos[pi++]=b[0]; mainPos[pi++]=b[1]; mainPos[pi++]=b[2];
    });
    mainGeo.attributes.position.needsUpdate = true;

    // Shadow — flatten to y = -1.2, drop W
    if (shadowMode) {
        let si = 0;
        currentEdges.forEach(([ei, ej]) => {
            const a = project4Dto3D([rot4D[ei][0], rot4D[ei][1], rot4D[ei][2], 0]);
            const b = project4Dto3D([rot4D[ej][0], rot4D[ej][1], rot4D[ej][2], 0]);
            shadowPos[si++]=a[0]; shadowPos[si++]=-1.2; shadowPos[si++]=a[2];
            shadowPos[si++]=b[0]; shadowPos[si++]=-1.2; shadowPos[si++]=b[2];
        });
        shadowGeo.attributes.position.needsUpdate = true;
    }

    renderer.render(scene, camera);
}

/* ── UI: shape buttons ────────────────────────────────────────── */
const nav = document.getElementById("shape-nav");
SHAPES.forEach((shape, i) => {
    const btn = document.createElement("button");
    btn.className = "shape-btn";
    btn.textContent = shape.label;
    btn.addEventListener("click", () => loadShape(i));
    nav.appendChild(btn);
});

/* ── UI: projection toggle ────────────────────────────────────── */
document.getElementById("btn-perspective").addEventListener("click", () => {
    useOrtho = false; camera = perspCamera;
    document.getElementById("btn-perspective").classList.add("active");
    document.getElementById("btn-ortho").classList.remove("active");
});
document.getElementById("btn-ortho").addEventListener("click", () => {
    useOrtho = true; camera = orthoCamera;
    document.getElementById("btn-ortho").classList.add("active");
    document.getElementById("btn-perspective").classList.remove("active");
});

/* ── UI: shadow toggle ────────────────────────────────────────── */
document.getElementById("btn-shadow").addEventListener("click", e => {
    shadowMode = !shadowMode;
    e.target.textContent = shadowMode ? "ON" : "OFF";
    e.target.classList.toggle("active", shadowMode);
    if (shadowLines) shadowLines.visible = shadowMode;
});

/* ── Init ─────────────────────────────────────────────────────── */
loadShape(0);
animate();