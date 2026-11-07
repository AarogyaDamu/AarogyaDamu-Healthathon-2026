import {
  ACESFilmicToneMapping,
  AmbientLight,
  BufferGeometry,
  CatmullRomCurve3,
  CanvasTexture,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  LatheGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  MeshBasicMaterial,
  OrthographicCamera,
  PCFShadowMap,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';

export type DamuSceneMode = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface DamuSceneController {
  setMode: (mode: DamuSceneMode) => void;
  setPaused: (paused: boolean) => void;
  wave: () => void;
  dispose: () => void;
}

export interface DamuSceneOptions {
  mode?: DamuSceneMode;
  paused?: boolean;
  onError?: () => void;
}

function createProceduralFurTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const imgData = ctx.createImageData(128, 128);
    for (let i = 0; i < imgData.data.length; i += 4) {
      const val = 128 + Math.floor((Math.random() - 0.5) * 45);
      imgData.data[i] = val;
      imgData.data[i + 1] = val;
      imgData.data[i + 2] = val;
      imgData.data[i + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(5, 4);
  return texture;
}

export function createDamuScene(
  host: HTMLElement,
  options: DamuSceneOptions = {}
): DamuSceneController {
  let { mode = 'idle', paused = false, onError } = options;
  let disposed = false;
  let lost = false;
  let visible = true;
  let elapsed = 0;
  let lastTime: number | null = null;
  let waveStarted = -10;

  const renderer = new WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new OrthographicCamera(-2, 2, 2, -2, 0.1, 30);
  camera.position.set(0, 1.05, 9);
  camera.lookAt(0, 0.23, 0);

  scene.add(new AmbientLight(0xfff4e6, 0.95), new HemisphereLight(0xfff7e9, 0xb98053, 2.0));

  const keyLight = new DirectionalLight(0xfff0da, 3.1);
  keyLight.position.set(-3, 5, 5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.left = keyLight.shadow.camera.bottom = -2.5;
  keyLight.shadow.camera.right = keyLight.shadow.camera.top = 2.5;
  keyLight.shadow.normalBias = 0.025;
  keyLight.shadow.radius = 4;
  scene.add(keyLight);

  const rim = new DirectionalLight(0xfffbf0, 2);
  rim.position.set(3, 2, -3);
  scene.add(rim);

  const fill = new DirectionalLight(0xffffff, 0.7);
  fill.position.set(3, 0, 4);
  scene.add(fill);

  const textures = new Set<any>();
  let fur = createProceduralFurTexture();
  textures.add(fur);

  try {
    const loadedFur = new TextureLoader().load(
      '/damu-fur-v2.png',
      () => {
        if (disposed) {
          loadedFur.dispose();
          return;
        }
        loadedFur.wrapS = loadedFur.wrapT = RepeatWrapping;
        loadedFur.repeat.set(5, 4);
        orange.bumpMap = loadedFur;
        bodyMaterial.bumpMap = loadedFur;
        draw();
      },
      undefined,
      () => {}
    );
    textures.add(loadedFur);
  } catch {}

  const soft = (color: number, extra: any = {}) =>
    new MeshPhysicalMaterial({
      color,
      roughness: 0.8,
      sheen: 0.8,
      sheenRoughness: 0.8,
      sheenColor: 0xffe2b0,
      ...extra,
    });

  const orange = soft(0xbc470d, { bumpMap: fur, bumpScale: 0.013 });
  const cream = soft(0xffefd3);
  const capMaterial = soft(0xffefd5, { roughness: 0.62, sheen: 0.55 });
  const coral = soft(0xf78b2c, { roughness: 0.4 });
  const iris = new MeshPhysicalMaterial({
    color: 0x4d1b0b,
    roughness: 0.19,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
  });
  const pupil = new MeshPhysicalMaterial({
    color: 0x150b08,
    roughness: 0.07,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
  });
  const highlight = new MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfffaf3,
    emissiveIntensity: 0.65,
    roughness: 0.1,
  });
  const mouthMaterial = new MeshStandardMaterial({ color: 0x74331b, roughness: 0.5 });
  const sphereGeometry = new SphereGeometry(1, 48, 36);

  const add = (
    parent: Group,
    geometry: any,
    material: any,
    position: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1]
  ): Mesh => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const sphere = (
    parent: Group,
    material: any,
    position: [number, number, number],
    scale: [number, number, number]
  ) => add(parent, sphereGeometry, material, position, scale);

  const tube = (
    parent: Group,
    material: any,
    points: [number, number, number][],
    radius: number
  ) =>
    add(
      parent,
      new TubeGeometry(
        new CatmullRomCurve3(points.map((p) => new Vector3(...p))),
        64,
        radius,
        12,
        false
      ),
      material
    );

  const extrude = (
    parent: Group,
    shape: Shape,
    material: any,
    position: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1],
    depth = 0.045
  ) =>
    add(
      parent,
      new ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelSegments: 4,
        steps: 1,
        bevelSize: 0.025,
        bevelThickness: 0.023,
        curveSegments: 28,
      }),
      material,
      position,
      scale
    );

  const character = new Group();
  scene.add(character);

  const body = new Group();
  character.add(body);

  const bodyGeometry = new SphereGeometry(1, 96, 72);
  const vertices = bodyGeometry.attributes.position;
  const colors: number[] = [];
  const orangeColor = new Color(0xc95410);
  const creamColor = new Color(0xfff0d8);

  const blend = (a: number, b: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i);
    const y = vertices.getY(i);
    const z = vertices.getZ(i);
    const fullness = (1.0 - 0.12 * y) * Math.sqrt(1 + Math.max(0, y) ** 2);
    vertices.setXYZ(i, x * 0.87 * fullness, y * 0.94 - 0.02, z * 0.66 * fullness);
    const creamTop = 0.32 - 0.2 * Math.pow(Math.abs(x), 0.65);
    const amount = (1 - blend(creamTop - 0.18, creamTop + 0.08, y)) * blend(0.5, 0.82, z);
    const color = orangeColor.clone().lerp(creamColor, amount);
    colors.push(color.r, color.g, color.b);
  }

  bodyGeometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  bodyGeometry.computeVertexNormals();

  const bodyMaterial = soft(0xffffff, { vertexColors: true, bumpMap: fur, bumpScale: 0.017 });
  add(body, bodyGeometry, bodyMaterial);

  const hairs: number[] = [];
  const hairColors: number[] = [];
  let seed = 29;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let i = 0; i < 4800; i++) {
    const y = random() * 2 - 1;
    const phi = random() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    const x = Math.cos(phi) * r;
    const z = Math.sin(phi) * r;
    const f = (1 - 0.12 * y) * Math.sqrt(1 + Math.max(0, y) ** 2);
    const point = new Vector3(x * 0.87 * f, y * 0.94 - 0.02, z * 0.66 * f);
    const normal = new Vector3(x / 0.87, y / 0.94, z / 0.66).normalize();
    const end = point.clone().addScaledVector(normal, 0.004 + random() * 0.008);
    hairs.push(...point.toArray(), ...end.toArray());
    const amount = (1 - blend(0.14, 0.4, y)) * blend(0.5, 0.82, z);
    const color = orangeColor.clone().lerp(creamColor, amount);
    for (let n = 0; n < 2; n++) hairColors.push(color.r, color.g, color.b);
  }

  const hairGeometry = new BufferGeometry();
  hairGeometry.setAttribute('position', new Float32BufferAttribute(hairs, 3));
  hairGeometry.setAttribute('color', new Float32BufferAttribute(hairColors, 3));
  body.add(
    new LineSegments(
      hairGeometry,
      new LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
      })
    )
  );

  const eyes = [-1, 1].map((side) => {
    const eye = new Group();
    eye.position.set(side * 0.29, 0.35, 0.602);
    eye.rotation.y = side * 0.2;
    character.add(eye);
    sphere(eye, orange, [0, 0, -0.014], [0.126, 0.152, 0.066]);
    sphere(eye, iris, [0, 0, 0.025], [0.108, 0.133, 0.055]);
    sphere(eye, pupil, [0.004, 0.007, 0.054], [0.087, 0.112, 0.031]);
    sphere(eye, highlight, [-0.028, 0.065, 0.08], [0.025, 0.03, 0.008]);
    sphere(eye, highlight, [0.032, -0.035, 0.081], [0.009, 0.012, 0.006]);
    return eye;
  });

  const smile = tube(
    character,
    mouthMaterial,
    [
      [-0.07, 0.147, 0.675],
      [-0.025, 0.125, 0.688],
      [0.03, 0.13, 0.688],
      [0.075, 0.157, 0.675],
    ],
    0.009
  );

  const cap = new Group();
  cap.position.y = 0.62;
  character.add(cap);

  const bandPoints = [
    [0.64, 0],
    [0.7, 0.01],
    [0.735, 0.055],
    [0.75, 0.12],
    [0.75, 0.23],
    [0.72, 0.285],
    [0.65, 0.3],
    [0.64, 0.26],
    [0.68, 0.22],
    [0.68, 0.07],
    [0.64, 0],
  ].map((p) => new Vector2(...p));

  add(cap, new LatheGeometry(bandPoints, 80), capMaterial, [0, 0, 0], [1, 1, 0.78]);
  sphere(cap, capMaterial, [0, 0.22, -0.025], [0.68, 0.255, 0.5]);

  const cross = new Shape();
  cross.moveTo(-0.045, -0.13);
  cross.lineTo(0.045, -0.13);
  cross.lineTo(0.045, -0.045);
  cross.lineTo(0.13, -0.045);
  cross.lineTo(0.13, 0.045);
  cross.lineTo(0.045, 0.045);
  cross.lineTo(0.045, 0.13);
  cross.lineTo(-0.045, 0.13);
  cross.lineTo(-0.045, 0.045);
  cross.lineTo(-0.13, 0.045);
  cross.lineTo(-0.13, -0.045);
  cross.lineTo(-0.045, -0.045);
  cross.closePath();
  extrude(cap, cross, coral, [0, 0.18, 0.568], [0.72, 0.72, 0.72]);

  for (const side of [-1, 1]) {
    const wing = new Group();
    wing.position.set(side * 0.56, 0.32, -0.08);
    wing.rotation.z = side * -0.08;
    cap.add(wing);
    sphere(wing, capMaterial, [0, 0.05, 0], [0.17, 0.14, 0.1]);
    for (const [x, y, angle, length] of [
      [0.06, 0.23, -0.42, 0.27],
      [0.14, 0.11, -0.78, 0.22],
      [0.15, 0.015, -1.1, 0.17],
    ]) {
      const feather = sphere(wing, capMaterial, [side * x, y, -0.015], [0.085, length, 0.07]);
      feather.rotation.z = side * angle;
    }
  }

  function arm(side: number) {
    const pivot = new Group();
    pivot.position.set(side * 0.77, -0.05, 0.13);
    character.add(pivot);
    const limb = sphere(pivot, orange, [side * 0.035, -0.16, 0.1], [0.145, 0.255, 0.15]);
    limb.rotation.z = side * 0.2;
    sphere(pivot, orange, [side * 0.065, -0.32, 0.16], [0.135, 0.125, 0.13]);
    sphere(pivot, orange, [side * 0.13, -0.29, 0.225], [0.065, 0.075, 0.06]);
    return pivot;
  }

  const leftArm = arm(-1);
  const rightArm = arm(1);

  for (const side of [-1, 1]) {
    tube(
      character,
      cream,
      [
        [0.64, 0.46, -0.12],
        [0.84, 0.27, 0.22],
        [0.69, 0.03, 0.57],
        [0.3, -0.17, 0.75],
        [0, -0.25, 0.81],
      ].map(([x, y, z]) => [side * x, y, z]),
      0.037
    );
  }

  const pendant = new Group();
  pendant.position.set(0, -0.46, 0.81);
  pendant.scale.setScalar(1.18);
  character.add(pendant);

  const drop = new Shape();
  drop.moveTo(0, 0.18);
  drop.bezierCurveTo(-0.08, 0.17, -0.13, 0.04, -0.18, -0.09);
  drop.bezierCurveTo(-0.29, -0.36, 0.29, -0.36, 0.18, -0.09);
  drop.bezierCurveTo(0.13, 0.04, 0.08, 0.17, 0, 0.18);
  extrude(pendant, drop, capMaterial, [0, 0, 0], [1, 1, 1], 0.08);

  sphere(pendant, coral, [0, -0.15, 0.1], [0.12, 0.14, 0.045]);

  const halo = new MeshStandardMaterial({
    color: 0xffd477,
    emissive: 0xffbd4f,
    emissiveIntensity: 0.7,
    roughness: 0.35,
  });
  add(pendant, new TorusGeometry(0.105, 0.012, 12, 48), halo, [0, -0.15, 0.144], [1, 1.12, 1]);

  const heart = new Shape();
  heart.moveTo(0, -0.065);
  heart.bezierCurveTo(-0.17, 0.05, -0.03, 0.13, 0, 0.06);
  heart.bezierCurveTo(0.03, 0.13, 0.17, 0.05, 0, -0.065);
  extrude(pendant, heart, orange, [0, -0.16, 0.146], [0.58, 0.58, 0.3], 0.01);

  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const shadowCtx = shadowCanvas.getContext('2d');
  if (shadowCtx) {
    const gradient = shadowCtx.createRadialGradient(64, 64, 4, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(117,65,26,.24)');
    gradient.addColorStop(0.4, 'rgba(117,65,26,.13)');
    gradient.addColorStop(1, 'rgba(117,65,26,0)');
    shadowCtx.fillStyle = gradient;
    shadowCtx.fillRect(0, 0, 128, 128);
  }

  const shadowTexture = new CanvasTexture(shadowCanvas);
  textures.add(shadowTexture);

  const shadow = new Mesh(
    new PlaneGeometry(2, 0.28),
    new MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false })
  );
  shadow.position.set(0, -1.18, -0.4);
  scene.add(shadow);

  const pointer = { x: 0, y: 0 };

  function draw() {
    if (!disposed && !lost) renderer.render(scene, camera);
  }

  function animate(now: number) {
    const delta = lastTime === null ? 0 : Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    elapsed += delta;
    const t = elapsed;

    character.position.y = 0.035 + Math.sin(t * 1.7) * 0.035;
    character.rotation.y +=
      (pointer.x * 0.2 + Math.sin(t * 0.45) * 0.075 - character.rotation.y) * 0.055;
    character.rotation.z +=
      (Math.sin(t * 0.8) * 0.018 +
        (mode === 'thinking' ? 0.07 : mode === 'listening' ? -0.045 : 0) -
        character.rotation.z) *
      0.06;
    character.rotation.x += (pointer.y * 0.055 - character.rotation.x) * 0.06;
    body.scale.y = 1 + Math.sin(t * 1.7) * 0.009;

    const phase = t % 4.6;
    const blink = phase < 0.16 ? 1 - Math.sin((phase / 0.16) * Math.PI) * 0.96 : 1;
    eyes.forEach((eye) => (eye.scale.y = blink));

    const waving = t - waveStarted < 1.8;
    rightArm.rotation.z +=
      ((waving ? 1.7 + Math.sin(t * 10) * 0.22 : 0.04 + Math.sin(t * 1.7) * 0.04) -
        rightArm.rotation.z) *
      0.13;
    leftArm.rotation.z = -0.04 + Math.sin(t * 1.7) * 0.04;
    smile.scale.y = mode === 'speaking' ? 1 + Math.sin(t * 11) * 0.3 : 1;
    pendant.rotation.z = Math.sin(t * 1.7) * 0.018;

    draw();
  }

  function syncLoop() {
    lastTime = null;
    renderer.setAnimationLoop(
      !paused && visible && !document.hidden && !lost && !disposed ? animate : null
    );
    draw();
  }

  function resize() {
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    const halfHeight = 1.68;
    const halfWidth = (halfHeight * width) / height;
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    draw();
  }

  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  if (resizeObserver) resizeObserver.observe(host);

  const visibilityObserver =
    typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(([entry]) => {
          visible = entry.isIntersecting;
          syncLoop();
        })
      : null;
  if (visibilityObserver) visibilityObserver.observe(host);

  const move = (event: PointerEvent) => {
    if (paused) return;
    const rect = host.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
  };

  const leave = () => {
    pointer.x = pointer.y = 0;
  };

  const contextLost = (event: Event) => {
    event.preventDefault();
    lost = true;
    renderer.setAnimationLoop(null);
    onError?.();
  };

  host.addEventListener('pointermove', move as any);
  host.addEventListener('pointerleave', leave);
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  document.addEventListener('visibilitychange', syncLoop);

  resize();
  syncLoop();

  return {
    setMode(value: DamuSceneMode) {
      mode = value;
    },
    setPaused(value: boolean) {
      paused = value;
      syncLoop();
    },
    wave() {
      waveStarted = elapsed;
    },
    dispose() {
      disposed = true;
      renderer.setAnimationLoop(null);
      if (resizeObserver) resizeObserver.disconnect();
      if (visibilityObserver) visibilityObserver.disconnect();
      host.removeEventListener('pointermove', move as any);
      host.removeEventListener('pointerleave', leave);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      document.removeEventListener('visibilitychange', syncLoop);

      const geometries = new Set<any>();
      const materials = new Set<any>();
      scene.traverse((object: any) => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) materials.add(object.material);
      });

      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      keyLight.shadow.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
