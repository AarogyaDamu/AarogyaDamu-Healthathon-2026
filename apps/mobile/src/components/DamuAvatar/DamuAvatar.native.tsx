import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { DamuSceneMode } from './damuScene';
import { DamuAvatarFallback } from './DamuAvatarFallback';

export interface DamuAvatarProps {
  mode?: DamuSceneMode;
  paused?: boolean;
  size?: number;
  triggerWave?: boolean | number;
  testID?: string;
  onError?: () => void;
}

const DAMU_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: transparent; overflow: hidden; -webkit-user-select: none; user-select: none; }
    #damu-host { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; touch-action: none; }
    canvas { display: block; }
  </style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
</head>
<body>
  <div id="damu-host"></div>
  <script>
    (function() {
      if (typeof THREE === 'undefined') {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: 'ThreeJS unavailable' }));
        return;
      }

      var host = document.getElementById('damu-host');
      var disposed = false, lost = false, visible = true, elapsed = 0, lastTime = null, waveStarted = 0;
      var mode = 'idle', paused = false;

      var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      host.appendChild(renderer.domElement);

      var scene = new THREE.Scene();
      var camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 30);
      camera.position.set(0, 1.05, 9);
      camera.lookAt(0, 0.23, 0);

      scene.add(new THREE.AmbientLight(0xfff4e6, 0.95), new THREE.HemisphereLight(0xfff7e9, 0xb98053, 2.0));
      var keyLight = new THREE.DirectionalLight(0xfff0da, 3.1);
      keyLight.position.set(-3, 5, 5);
      keyLight.castShadow = true;
      scene.add(keyLight);

      var rim = new THREE.DirectionalLight(0xfffbf0, 2.0);
      rim.position.set(3, 2, -3);
      scene.add(rim);

      var fill = new THREE.DirectionalLight(0xffffff, 0.7);
      fill.position.set(3, 0, 4);
      scene.add(fill);

      // Procedural fur texture fallback
      var furCanvas = document.createElement('canvas');
      furCanvas.width = furCanvas.height = 128;
      var fctx = furCanvas.getContext('2d');
      if (fctx) {
        var idata = fctx.createImageData(128, 128);
        for (var i = 0; i < idata.data.length; i += 4) {
          var val = 128 + Math.floor((Math.random() - 0.5) * 45);
          idata.data[i] = idata.data[i+1] = idata.data[i+2] = val;
          idata.data[i+3] = 255;
        }
        fctx.putImageData(idata, 0, 0);
      }
      var fur = new THREE.CanvasTexture(furCanvas);
      fur.wrapS = fur.wrapT = THREE.RepeatWrapping;
      fur.repeat.set(5, 4);

      var soft = function(color, extra) {
        return new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.8 }, extra || {}));
      };

      var orange = soft(0xbc470d, { bumpMap: fur, bumpScale: 0.013 });
      var cream = soft(0xffefd3);
      var capMaterial = soft(0xffefd5, { roughness: 0.62 });
      var coral = soft(0xf78b2c, { roughness: 0.4 });
      var iris = new THREE.MeshStandardMaterial({ color: 0x4d1b0b, roughness: 0.19 });
      var pupil = new THREE.MeshStandardMaterial({ color: 0x150b08, roughness: 0.07 });
      var highlight = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1 });
      var mouthMaterial = new THREE.MeshStandardMaterial({ color: 0x74331b, roughness: 0.5 });
      var sphereGeometry = new THREE.SphereGeometry(1, 48, 36);

      var add = function(parent, geometry, material, pos, sc) {
        var mesh = new THREE.Mesh(geometry, material);
        if (pos) mesh.position.set(pos[0], pos[1], pos[2]);
        if (sc) mesh.scale.set(sc[0], sc[1], sc[2]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
      };

      var sphere = function(parent, material, pos, sc) {
        return add(parent, sphereGeometry, material, pos, sc);
      };

      var character = new THREE.Group();
      scene.add(character);

      var body = new THREE.Group();
      character.add(body);

      var bodyGeometry = new THREE.SphereGeometry(1, 64, 48);
      var vertices = bodyGeometry.attributes.position;
      var colors = [];
      var orangeColor = new THREE.Color(0xc95410);
      var creamColor = new THREE.Color(0xfff0d8);

      var blend = function(a, b, x) {
        var t = Math.max(0, Math.min(1, (x - a) / (b - a)));
        return t * t * (3 - 2 * t);
      };

      for (var vi = 0; vi < vertices.count; vi++) {
        var x = vertices.getX(vi), y = vertices.getY(vi), z = vertices.getZ(vi);
        var fullness = (1.0 - 0.12 * y) * Math.sqrt(1 + Math.max(0, y * y));
        vertices.setXYZ(vi, x * 0.87 * fullness, y * 0.94 - 0.02, z * 0.66 * fullness);
        var creamTop = 0.32 - 0.20 * Math.pow(Math.abs(x), 0.65);
        var amount = (1 - blend(creamTop - 0.18, creamTop + 0.08, y)) * blend(0.50, 0.82, z);
        var col = orangeColor.clone().lerp(creamColor, amount);
        colors.push(col.r, col.g, col.b);
      }
      bodyGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      bodyGeometry.computeVertexNormals();
      var bodyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, bumpMap: fur, bumpScale: 0.017 });
      add(body, bodyGeometry, bodyMaterial);

      var eyes = [-1, 1].map(function(side) {
        var eye = new THREE.Group();
        eye.position.set(side * 0.29, 0.35, 0.602);
        eye.rotation.y = side * 0.20;
        character.add(eye);
        sphere(eye, orange, [0, 0, -0.014], [0.126, 0.152, 0.066]);
        sphere(eye, iris, [0, 0, 0.025], [0.108, 0.133, 0.055]);
        sphere(eye, pupil, [0.004, 0.007, 0.054], [0.087, 0.112, 0.031]);
        sphere(eye, highlight, [-0.028, 0.065, 0.08], [0.025, 0.03, 0.008]);
        sphere(eye, highlight, [0.032, -0.035, 0.081], [0.009, 0.012, 0.006]);
        return eye;
      });

      var smileCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.07, 0.147, 0.675),
        new THREE.Vector3(-0.025, 0.125, 0.688),
        new THREE.Vector3(0.03, 0.13, 0.688),
        new THREE.Vector3(0.075, 0.157, 0.675)
      ]);
      var smile = add(character, new THREE.TubeGeometry(smileCurve, 32, 0.009, 8, false), mouthMaterial);

      var cap = new THREE.Group();
      cap.position.y = 0.62;
      character.add(cap);

      sphere(cap, capMaterial, [0, 0.22, -0.025], [0.68, 0.255, 0.50]);
      var cross = new THREE.Shape();
      cross.moveTo(-0.045, -0.13); cross.lineTo(0.045, -0.13); cross.lineTo(0.045, -0.045);
      cross.lineTo(0.13, -0.045); cross.lineTo(0.13, 0.045); cross.lineTo(0.045, 0.045);
      cross.lineTo(0.045, 0.13); cross.lineTo(-0.045, 0.13); cross.lineTo(-0.045, 0.045);
      cross.lineTo(-0.13, 0.045); cross.lineTo(-0.13, -0.045); cross.lineTo(-0.045, -0.045); cross.closePath();
      var crossExt = new THREE.ExtrudeGeometry(cross, { depth: 0.045, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.02, bevelThickness: 0.02 });
      add(cap, crossExt, coral, [0, 0.18, 0.568], [0.72, 0.72, 0.72]);

      for (var s = -1; s <= 1; s += 2) {
        var wing = new THREE.Group();
        wing.position.set(s * 0.56, 0.32, -0.08);
        wing.rotation.z = s * -0.08;
        cap.add(wing);
        sphere(wing, capMaterial, [0, 0.05, 0], [0.17, 0.14, 0.10]);
        [[0.06, 0.23, -0.42, 0.27], [0.14, 0.11, -0.78, 0.22]].forEach(function(item) {
          var feather = sphere(wing, capMaterial, [s * item[0], item[1], -0.015], [0.085, item[3], 0.07]);
          feather.rotation.z = s * item[2];
        });
      }

      function makeArm(side) {
        var pivot = new THREE.Group();
        pivot.position.set(side * 0.77, -0.05, 0.13);
        character.add(pivot);
        var limb = sphere(pivot, orange, [side * 0.035, -0.16, 0.10], [0.145, 0.255, 0.15]);
        limb.rotation.z = side * 0.2;
        sphere(pivot, orange, [side * 0.065, -0.32, 0.16], [0.135, 0.125, 0.13]);
        return pivot;
      }
      var leftArm = makeArm(-1);
      var rightArm = makeArm(1);

      var pendant = new THREE.Group();
      pendant.position.set(0, -0.46, 0.81);
      pendant.scale.setScalar(1.18);
      character.add(pendant);
      sphere(pendant, coral, [0, -0.15, 0.10], [0.12, 0.14, 0.045]);

      var shadowCanvas = document.createElement('canvas');
      shadowCanvas.width = shadowCanvas.height = 128;
      var sctx = shadowCanvas.getContext('2d');
      if (sctx) {
        var grad = sctx.createRadialGradient(64, 64, 4, 64, 64, 64);
        grad.addColorStop(0, 'rgba(117,65,26,.24)');
        grad.addColorStop(0.4, 'rgba(117,65,26,.13)');
        grad.addColorStop(1, 'rgba(117,65,26,0)');
        sctx.fillStyle = grad;
        sctx.fillRect(0, 0, 128, 128);
      }
      var shadowTex = new THREE.CanvasTexture(shadowCanvas);
      var shadow = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.28), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
      shadow.position.set(0, -1.18, -0.4);
      scene.add(shadow);

      function draw() {
        if (!disposed && !lost) renderer.render(scene, camera);
      }

      function animate(now) {
        var delta = lastTime === null ? 0 : Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        elapsed += delta;
        var t = elapsed;

        character.position.y = 0.035 + Math.sin(t * 1.7) * 0.035;
        character.rotation.z += ((Math.sin(t * 0.8) * 0.018 + (mode === 'thinking' ? 0.07 : mode === 'listening' ? -0.045 : 0)) - character.rotation.z) * 0.06;
        body.scale.y = 1 + Math.sin(t * 1.7) * 0.009;

        var phase = t % 4.6;
        var blink = phase < 0.16 ? 1 - Math.sin((phase / 0.16) * Math.PI) * 0.96 : 1;
        eyes.forEach(function(eye) { eye.scale.y = blink; });

        var waving = t - waveStarted < 1.8;
        rightArm.rotation.z += (((waving ? 1.7 + Math.sin(t * 10) * 0.22 : 0.04 + Math.sin(t * 1.7) * 0.04)) - rightArm.rotation.z) * 0.13;
        leftArm.rotation.z = -0.04 + Math.sin(t * 1.7) * 0.04;
        smile.scale.y = mode === 'speaking' ? 1 + Math.sin(t * 11) * 0.3 : 1;

        draw();
      }

      function resize() {
        var width = Math.max(host.clientWidth || window.innerWidth, 1);
        var height = Math.max(host.clientHeight || window.innerHeight, 1);
        var halfHeight = 1.68;
        var halfWidth = halfHeight * width / height;
        camera.left = -halfWidth;
        camera.right = halfWidth;
        camera.top = halfHeight;
        camera.bottom = -halfHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        draw();
      }

      window.addEventListener('resize', resize);
      resize();

      function syncLoop() {
        lastTime = null;
        renderer.setAnimationLoop(!paused && visible ? animate : null);
        draw();
      }
      syncLoop();

      // Listen for postMessage from React Native
      window.addEventListener('message', function(event) {
        try {
          var data = JSON.parse(event.data);
          if (data.type === 'SET_MODE') {
            mode = data.mode;
          } else if (data.type === 'SET_PAUSED') {
            paused = data.paused;
            syncLoop();
          } else if (data.type === 'WAVE') {
            waveStarted = elapsed;
          }
        } catch (e) {}
      });

      // Notify React Native that scene is mounted and ready
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MOUNTED' }));
    })();
  </script>
</body>
</html>
`;

export const DamuAvatar: React.FC<DamuAvatarProps> = ({
  mode = 'idle',
  paused = false,
  size = 240,
  triggerWave,
  testID = 'damu-3d-avatar-native',
  onError,
}) => {
  const webViewRef = useRef<any>(null);
  const [hasError, setHasError] = useState(false);

  // On Expo Web the platform-specific file splitter should route to DamuAvatar.web.tsx,
  // but if this native file is ever evaluated in a web context, bail out immediately
  // before attempting to require react-native-webview (which logs the unsupported warning).
  if (Platform.OS === 'web') {
    return <DamuAvatarFallback mode={mode} size={size} testID={testID} />;
  }

  // Lazy-require react-native-webview so tests or headless runners don't crash
  let WebView: any = null;
  try {
    const rnw = require('react-native-webview');
    WebView = rnw.WebView || rnw.default;
  } catch {
    WebView = null;
  }

  useEffect(() => {
    if (!WebView) {
      setHasError(true);
      onError?.();
    }
  }, [WebView, onError]);

  // Sync mode changes to WebView
  useEffect(() => {
    if (webViewRef.current && !hasError) {
      webViewRef.current.postMessage(
        JSON.stringify({ type: 'SET_MODE', mode })
      );
    }
  }, [mode, hasError]);

  // Sync paused changes
  useEffect(() => {
    if (webViewRef.current && !hasError) {
      webViewRef.current.postMessage(
        JSON.stringify({ type: 'SET_PAUSED', paused })
      );
    }
  }, [paused, hasError]);

  // Sync wave triggers
  useEffect(() => {
    if (triggerWave && webViewRef.current && !hasError) {
      webViewRef.current.postMessage(
        JSON.stringify({ type: 'WAVE' })
      );
    }
  }, [triggerWave, hasError]);

  if (hasError || !WebView) {
    return <DamuAvatarFallback mode={mode} size={size} testID={testID} />;
  }

  return (
    <View
      testID={testID}
      style={[styles.container, { width: size, height: size }]}
      accessibilityRole="image"
      accessibilityLabel={`Damu interactive 3D companion in ${mode} state`}
    >
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: DAMU_HTML }}
        style={styles.webview}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        scalesPageToFit={Platform.OS === 'android'}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        transparent={true}
        onError={() => {
          setHasError(true);
          onError?.();
        }}
        onMessage={(event: any) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'ERROR') {
              setHasError(true);
              onError?.();
            }
          } catch {}
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  webview: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
});
