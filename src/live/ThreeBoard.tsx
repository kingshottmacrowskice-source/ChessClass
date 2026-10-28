import { PIECE_FORWARD_OFFSET } from "./boardView";
import { useLayoutEffect, useRef, useState } from "react";
import * as T from "three";
import { Chess, type Move } from "chess.js";
import {
  boardViews,
  boardHome,
  type CameraPose,
  type BoardFlight,
} from "./camera";
import type { Beat, CinemaShow } from "./cinema";
import { movingFrom } from "./transition";
import "./three-board.css";
import ChessPiece from "./ChessPiece";
import { createPostFX } from "./boardPostFX";

type Props = {
  fen: string;
  actor: { x: number; y: number };
  facing: number;
  carried: string;
  boardAngle: number;
  hidden: string[];
  move: Move | null;
  progress: number;
  lastMove: Move | null;
  show?: CinemaShow;
  beat: Beat;
};
const squarePosition = (square: string) =>
  new T.Vector3(
    square.charCodeAt(0) - 97 - 3.5,
    0,
    8 - Number(square[1]) - 3.5 + PIECE_FORWARD_OFFSET,
  );

function dispose(root: T.Object3D) {
  const materials = new Set<T.Material>();
  root.traverse((obj) => {
    if (obj instanceof T.Mesh) {
      obj.geometry.dispose();
      const list = Array.isArray(obj.material) ? obj.material : [obj.material];
      list.forEach((m) => materials.add(m));
    }
  });
  materials.forEach((m) => m.dispose());
}

export default function ThreeBoard(props: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const [error, setError] = useState(false);
  useLayoutEffect(() => {
    const element = canvas.current!,
      host = element.parentElement!;
    let renderer: T.WebGLRenderer;
    try {
      renderer = new T.WebGLRenderer({
        canvas: element,
        antialias: true,
        alpha: true,
      });
    } catch {
      setError(true);
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.localClippingEnabled = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFShadowMap;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = 64;
    shadowCanvas.height = 64;
    const shadowContext = shadowCanvas.getContext("2d")!;
    const gradient = shadowContext.createRadialGradient(32, 32, 3, 32, 32, 32);
    gradient.addColorStop(0, "rgba(49,66,51,.36)");
    gradient.addColorStop(0.45, "rgba(49,66,51,.22)");
    gradient.addColorStop(1, "rgba(49,66,51,0)");
    shadowContext.fillStyle = gradient;
    shadowContext.fillRect(0, 0, 64, 64);
    const shadowTexture = new T.CanvasTexture(shadowCanvas);
    shadowTexture.colorSpace = T.SRGBColorSpace;
    // Reuse the original pixel artwork. Only the board is solid geometry.
    const pieceTextures = new Map<string, T.CanvasTexture>();
    const piece = (type: string, color: string) => {
      const key = color + type;
      let texture = pieceTextures.get(key);
      if (!texture) {
        const source = host.querySelector<HTMLCanvasElement>(
          `[data-art="${key}"] canvas`,
        )!;
        texture = new T.CanvasTexture(source);
        texture.colorSpace = T.SRGBColorSpace;
        texture.magFilter = T.NearestFilter;
        texture.minFilter = T.NearestFilter;
        texture.generateMipmaps = false;
        pieceTextures.set(key, texture);
      }
      const group = new T.Group();
      const art = new T.Mesh(
        new T.PlaneGeometry(0.86, 1.075),
        new T.MeshBasicMaterial({
          map: texture,
          toneMapped: false,
          transparent: true,
          alphaTest: 0.4,
          side: T.DoubleSide,
        }),
      );
      art.layers.set(1);
      art.userData.height = 1.075;
      art.userData.texture = texture;
      art.userData.billboard = true;
      group.add(art);
      const shadow = new T.Mesh(
        new T.PlaneGeometry(0.68, 0.48),
        new T.MeshBasicMaterial({
          map: shadowTexture,
          toneMapped: false,
          transparent: true,
          opacity: 1,
          depthWrite: false,
        }),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.008;
      shadow.userData.contactShadow = true;
      group.add(shadow);
      return group;
    };
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(38, 1, 0.08, 100);
    const hemi = new T.HemisphereLight(0xe7f5ff, 0x4a3a28, 3);
    scene.add(hemi);
    const light = new T.DirectionalLight(0xfff8f0, 1.65);
    light.position.set(-4, 8, 5);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    Object.assign(light.shadow.camera, {
      left: -7,
      right: 7,
      top: 7,
      bottom: -7,
      near: 0.5,
      far: 24,
    });
    light.shadow.bias = -0.0005;
    scene.add(light);
    const rim = new T.DirectionalLight(0xb5d0ff, 0.4);
    rim.position.set(5, 4, -5);
    scene.add(rim);
    // Practicals for the finishers: a pool of light under each featured piece.
    const heroLight = new T.PointLight(0xffd27a, 0, 4.5, 1.6),
      victimLight = new T.PointLight(0xff3b2a, 0, 4.5, 1.6);
    scene.add(heroLight, victimLight);
    const lights = { hemi: 3, sun: 1.65, rim: 0.4, hero: 0, victim: 0 };
    const box = (w: number, h: number, d: number, color: number, y: number) => {
      const m = new T.Mesh(
        new T.BoxGeometry(w, h, d),
        new T.MeshStandardMaterial({ color, roughness: 0.65 }),
      );
      m.position.y = y;
      m.receiveShadow = true;
      scene.add(m);
      return m;
    };
    box(8.65, 0.35, 8.65, 0x543724, -0.24);
    box(8.73, 0.07, 8.73, 0xb5945c, -0.09);
    const tiles: T.Mesh[] = [];
    for (let row = 0; row < 8; row++)
      for (let col = 0; col < 8; col++) {
        const m = box(
          0.995,
          0.08,
          0.995,
          (row + col) % 2 ? 0x536958 : 0xd8c4a0,
          -0.04,
        );
        m.position.x = col - 3.5;
        m.position.z = row - 3.5;
        tiles.push(m);
      }
    // Engraved-looking rank/file labels sit on the frame in world space.
    const textures: T.Texture[] = [];
    for (let i = 0; i < 8; i++)
      for (const edge of [0, 1]) {
        const c = document.createElement("canvas");
        c.width = 128;
        c.height = 128;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#ead4a9";
        ctx.font = "bold 84px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          edge ? String(8 - i) : String.fromCharCode(97 + i),
          64,
          64,
        );
        const texture = new T.CanvasTexture(c);
        textures.push(texture);
        const m = new T.Mesh(
          new T.PlaneGeometry(0.22, 0.22),
          new T.MeshBasicMaterial({
            map: texture,
            toneMapped: false,
            transparent: true,
            depthWrite: false,
          }),
        );
        m.rotation.x = -Math.PI / 2;
        m.position.set(edge ? -4.18 : i - 3.5, 0.005, edge ? i - 3.5 : 4.18);
        scene.add(m);
      }
    const actorTexture = new T.CanvasTexture(document.createElement("canvas"));
    actorTexture.colorSpace = T.SRGBColorSpace;
    const actorSprite = new T.Sprite(
      new T.SpriteMaterial({
        map: actorTexture,
        toneMapped: false,
        transparent: true,
        alphaTest: 0.1,
      }),
    );
    actorSprite.layers.set(1);
    actorSprite.center.set(0.5, 0.12);
    actorSprite.scale.set(0.9, 1.125, 1);
    scene.add(actorSprite);
    let flying: BoardFlight[] = [];
    const transient = new T.Group();
    scene.add(transient);
    const transientPieces = new Map<string, T.Group>();
    const cast = new T.Group();
    scene.add(cast);
    let width = 1,
      height = 1,
      pose = boardHome(latest.current.boardAngle),
      signature = "",
      frame = 0,
      lastNow = 0,
      phase = "",
      phaseAt = 0,
      slainAt = 0,
      swappedAt = 0;
    // Billboards face the camera without its dutch roll, so pieces stay upright on the board.
    const billboard = new T.Quaternion();
    let halves: {
      group: T.Group;
      plane: T.Plane;
      local: T.Plane;
      upper: boolean;
    }[] = [];
    const objects = new Map<string, T.Group>();
    const notify = () => host.dispatchEvent(new Event("board-view"));
    const applyPose = (p: CameraPose) => {
      pose = { ...p };
      if (camera.fov !== p.fov) {
        camera.fov = p.fov;
        camera.updateProjectionMatrix();
      }
      const distance = p.distance * Math.max(1, 1 / camera.aspect);
      camera.position.set(
        p.x + Math.sin(p.azimuth) * Math.cos(p.elevation) * distance,
        p.height + Math.sin(p.elevation) * distance,
        p.z + Math.cos(p.azimuth) * Math.cos(p.elevation) * distance,
      );
      // Define north explicitly at 90 degrees, where the default up vector is singular.
      camera.up.set(
        0,
        p.elevation >= Math.PI / 2 - 1e-6 ? 0 : 1,
        p.elevation >= Math.PI / 2 - 1e-6 ? -1 : 0,
      );
      camera.lookAt(p.x, p.height, p.z);
      billboard.copy(camera.quaternion);
      if (p.roll) camera.rotateZ(p.roll);
      camera.updateMatrixWorld();
      element.dataset.elevation = String(p.elevation);
      element.dataset.azimuth = String(p.azimuth);
      element.dataset.distance = String(p.distance);
      element.dataset.fov = String(p.fov);
      notify();
    };
    const screen = (v: T.Vector3) => {
      v.project(camera);
      return { x: ((v.x + 1) * width) / 2, y: ((1 - v.y) * height) / 2 };
    };
    boardViews.set(host, {
      home: () => boardHome(latest.current.boardAngle),
      flights: (value) => {
        flying = value;
      },
      pose: applyPose,
      project: (x, y) => {
        const v = new T.Vector3(x / 12.5 - 4, 0, y / 12.5 - 4),
          at = screen(v.clone());
        // Project a camera-facing unit at the feet for correctly sized sprites.
        const right = new T.Vector3()
          .setFromMatrixColumn(camera.matrixWorld, 0)
          .multiplyScalar(0.5);
        const a = screen(v.clone().sub(right)),
          b = screen(v.clone().add(right));
        return { ...at, width: Math.hypot(b.x - a.x, b.y - a.y) };
      },
    });
    const postFX = createPostFX({ renderer, scene, camera, sun: light });
    const resize = () => {
      width = Math.max(1, host.clientWidth);
      height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      postFX.setSize(
        Math.round(width * Math.min(devicePixelRatio, 1.5)),
        Math.round(height * Math.min(devicePixelRatio, 1.5)),
      );
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      applyPose(pose);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    let cachedFen = "";
    let cachedPieces: NonNullable<
      ReturnType<Chess["board"]>[number][number]
    >[] = [];
    const render = (now: number) => {
      const home = boardHome(latest.current.boardAngle);
      if (
        !host.classList.contains("camera-on") &&
        pose.elevation !== home.elevation
      )
        applyPose(home);
      const actorCanvas =
        host.querySelector<HTMLCanvasElement>(".character-sprite");
      if (actorCanvas) {
        actorTexture.image = actorCanvas;
        actorTexture.needsUpdate = true;
      }
      const actorAt = latest.current.actor;
      actorSprite.position.set(
        actorAt.x / 12.5 - 4,
        0.015,
        actorAt.y / 12.5 - 4,
      );
      actorTexture.repeat.x = latest.current.facing;
      actorTexture.offset.x = latest.current.facing < 0 ? 1 : 0;
      actorSprite.visible = !host.classList.contains("camera-on");
      const p = latest.current,
        show = p.show && p.beat.phase !== "lead" ? p.show : undefined;
      const dt = Math.min(0.05, Math.max(0, now - lastNow) / 1000);
      lastNow = now;
      if (phase !== p.beat.phase) {
        phase = p.beat.phase;
        phaseAt = now;
      }
      if (!p.beat.slain) slainAt = 0;
      else if (!slainAt) slainAt = now;
      if (!p.beat.swapped) swappedAt = 0;
      else if (!swappedAt) swappedAt = now;
      if (cachedFen !== p.fen) {
        cachedFen = p.fen;
        cachedPieces = new Chess(p.fen)
          .board()
          .flat()
          .filter((v) => v !== null);
      }
      const entries = cachedPieces
        .filter(
          (v) =>
            !p.hidden.includes(v.square) &&
            (!show || (v.square !== show.square && v.square !== show.victim)),
        )
        .map((v) => ({
          square: String(v.square),
          type: String(
            p.move?.to === v.square && p.progress < 1 ? p.move.piece : v.type,
          ),
          color: String(v.color),
        }));
      if (show) {
        entries.push({
          square: show.square,
          type: p.beat.swapped ? show.promo || show.hero : show.hero,
          color: show.by,
        });
        if (show.victim)
          entries.push({
            square: show.victim,
            type: "k",
            color: show.by === "w" ? "b" : "w",
          });
      }
      element.dataset.pieces = entries
        .map((e) => `${e.square}:${e.color}${e.type}`)
        .join(" ");
      const next = JSON.stringify([entries, !!show && p.beat.slain]);
      if (signature !== next) {
        signature = next;
        dispose(cast);
        cast.clear();
        objects.clear();
        halves = [];
        entries.forEach((e) => {
          let obj: T.Group;
          if (show?.victim === e.square && p.beat.slain) {
            obj = new T.Group();
            for (const upper of [false, true]) {
              const half = piece(e.type, e.color),
                local = new T.Plane(
                  new T.Vector3(0, upper ? 1 : -1, 0),
                  upper ? -0.48 : 0.48,
                ),
                plane = local.clone();
              half.traverse((m) => {
                if (m instanceof T.Mesh) {
                  m.material.clippingPlanes = [plane];
                  m.material.clipShadows = true;
                  m.material.side = T.DoubleSide;
                }
              });
              obj.add(half);
              halves.push({ group: half, plane, local, upper });
            }
          } else obj = piece(e.type, e.color);
          obj.position.copy(squarePosition(e.square));
          cast.add(obj);
          objects.set(e.square, obj);
        });
        element.dataset.pieceCount = String(entries.length);
      }
      entries.forEach((e) => {
        const obj = objects.get(e.square)!;
        obj.position.copy(squarePosition(e.square));
        obj.rotation.set(0, 0, 0);
        obj.scale.setScalar(1);
        const from = movingFrom(p.move, e.square);
        if (from && p.progress < 1) {
          obj.position.lerpVectors(
            squarePosition(from),
            squarePosition(e.square),
            p.progress,
          );
          obj.position.y =
            Math.sin(p.progress * Math.PI) * (e.type === "n" ? 0.35 : 0.07);
        }
        if (show?.square === e.square) {
          const ease = (t: number) => 1 - (1 - Math.min(1, t)) ** 3;
          if (p.beat.phase === "ascend")
            // Lift off slowly, then hang and tremble as the power builds.
            obj.position.y =
              ease((now - phaseAt) / 1100) * 0.34 +
              Math.sin(now * 0.005) * 0.03 +
              (Math.random() - 0.5) * 0.012 * ease((now - phaseAt) / 1600);
          else if (show.kind === "promotion" && swappedAt)
            // The new piece lands with weight: drop, then a small bounce.
            obj.position.y =
              0.34 * Math.max(0, 1 - (now - swappedAt) / 260) +
              Math.abs(
                Math.sin(Math.min(1, (now - swappedAt) / 520) * Math.PI),
              ) *
                0.05 *
                Math.max(0, 1 - (now - swappedAt) / 520);
        }
        if (
          show?.victim === e.square &&
          !p.beat.slain &&
          p.beat.phase === "strobe"
        )
          // The king's nerve breaks: a growing shiver.
          obj.position.x +=
            (Math.random() - 0.5) * 0.05 * Math.min(1, (now - phaseAt) / 900);
        // Foreground pieces must not block a low camera's view of the featured pieces.
        let occludes = false;
        if (show && e.square !== show.square && e.square !== show.victim) {
          for (const target of [show.square, show.victim].filter(
            Boolean,
          ) as string[]) {
            const aim = squarePosition(target);
            aim.y = 0.65;
            const line = new T.Line3(camera.position, aim),
              centre = obj.position.clone();
            centre.y = 0.65;
            const t = line.closestPointToPointParameter(centre, true);
            if (
              t > 0 &&
              t < 0.93 &&
              line.at(t, new T.Vector3()).distanceTo(centre) < 0.75
            )
              occludes = true;
          }
        }
        obj.visible = !occludes;
      });
      const airborne = [
        ...flying.map((f) => ({ ...f, key: `flight-${f.id}` })),
      ];
      if (p.carried)
        airborne.push({
          key: "carried",
          id: -1,
          piece: p.carried,
          color: "b",
          s: { ...p.actor, h: 0.75, rot: 0, scale: 1, alpha: 1 },
        });
      const activeKeys = new Set(airborne.map((f) => f.key));
      for (const [key, obj] of transientPieces) {
        if (!activeKeys.has(key)) {
          dispose(obj);
          transient.remove(obj);
          transientPieces.delete(key);
        }
      }
      for (const f of airborne) {
        let obj = transientPieces.get(f.key);
        if (obj && obj.userData.artKey !== f.color + f.piece) {
          dispose(obj);
          transient.remove(obj);
          transientPieces.delete(f.key);
          obj = undefined;
        }
        if (!obj) {
          obj = piece(f.piece, f.color);
          obj.userData.artKey = f.color + f.piece;
          transientPieces.set(f.key, obj);
          transient.add(obj);
        }
        obj.position.set(
          f.s.x / 12.5 - 4,
          f.s.h,
          f.s.y / 12.5 - 4 + PIECE_FORWARD_OFFSET,
        );
        obj.scale.setScalar(f.s.scale);
        obj.userData.spin = (f.s.rot * Math.PI) / 180;
        obj.userData.alpha = f.s.alpha;
        obj.traverse((m) => {
          if (m instanceof T.Mesh && m.userData.billboard)
            (m.material as T.MeshBasicMaterial).opacity = f.s.alpha;
        });
      }
      element.dataset.airborne = airborne
        .map((f) => `${f.key}:${f.color}${f.piece}`)
        .join(" ");
      tiles.forEach((tile, i) => {
        const sq = String.fromCharCode(97 + (i % 8)) + (8 - Math.floor(i / 8));
        const mat = tile.material as T.MeshStandardMaterial;
        mat.emissive.setHex(
          p.lastMove?.to === sq
            ? 0x665511
            : p.lastMove?.from === sq
              ? 0x333010
              : 0,
        );
      });
      pieceTextures.forEach((t) => {
        if (
          !t.userData.loaded &&
          (t.image as HTMLCanvasElement).dataset.loaded === "true"
        ) {
          t.needsUpdate = true;
          t.userData.loaded = true;
        }
      });
      // Billboard planes face the camera; their floor positions remain in world space.
      const alignBillboard = (obj: T.Object3D) => {
        if (obj.userData.billboard && obj instanceof T.Mesh) {
          const texture = obj.userData.texture as T.CanvasTexture;
          const bottom =
            Number(
              (texture.image as HTMLCanvasElement).dataset.pixelBottom || 38,
            ) / 40;
          // The visible bottom pixel is the pivot, even as the camera descends.
          const lift = (bottom - 0.5) * obj.userData.height;
          obj.quaternion.copy(billboard);
          if (obj.parent?.userData.spin) obj.rotateZ(obj.parent.userData.spin);
          obj.position.set(0, lift, 0).applyQuaternion(obj.quaternion);
        }
        if (obj.userData.contactShadow && obj instanceof T.Mesh) {
          const root = obj.parent!;
          // Keep shadows on the floor when the piece jumps or ascends.
          obj.position.y = (0.008 - root.position.y) / root.scale.y;
          const lift = Math.max(0, root.position.y);
          obj.scale.setScalar(1 + lift * 0.5);
          (obj.material as T.MeshBasicMaterial).opacity =
            (root.userData.alpha ?? 1) / (1 + lift * 3);
        }
      };
      cast.traverse(alignBillboard);
      transient.traverse(alignBillboard);
      // The cut king parts along the blade, the crown sliding off and falling away.
      const cut = slainAt ? Math.min(1, (now - slainAt) / 900) : 0,
        slide = 1 - (1 - cut) ** 3;
      halves.forEach((h) => {
        if (!h.upper) return;
        h.group.position.set(
          0.42 * slide,
          0.14 * Math.sin(slide * Math.PI * 0.7) - 0.3 * cut * cut,
          0,
        );
        h.group.rotation.z = -0.62 * slide;
      });
      // Lights down on the room, up on the featured pieces.
      const want = !show
        ? { hemi: 3, sun: 1.65, rim: 0.4, hero: 0, victim: 0 }
        : show.kind === "promotion"
          ? p.beat.phase === "out"
            ? { hemi: 3, sun: 1.65, rim: 0.4, hero: 0, victim: 0 }
            : p.beat.swapped
              ? { hemi: 1.5, sun: 0.9, rim: 1.2, hero: 7, victim: 0 }
              : p.beat.phase === "ascend"
                ? { hemi: 0.75, sun: 0.35, rim: 0.8, hero: 9, victim: 0 }
                : { hemi: 1.3, sun: 0.7, rim: 0.6, hero: 4, victim: 0 }
          : p.beat.phase === "out"
            ? { hemi: 3, sun: 1.65, rim: 0.4, hero: 0, victim: 0 }
            : p.beat.slain
              ? { hemi: 0.6, sun: 0.3, rim: 0.3, hero: 3, victim: 10 }
              : p.beat.phase === "strobe"
                ? { hemi: 0.45, sun: 0.2, rim: 0.9, hero: 2, victim: 8 }
                : { hemi: 1.1, sun: 0.55, rim: 0.7, hero: 4, victim: 5 };
      const follow = 1 - Math.exp(-dt * 5);
      for (const key of Object.keys(lights) as (keyof typeof lights)[])
        lights[key] += (want[key] - lights[key]) * follow;
      hemi.intensity = lights.hemi;
      light.intensity = lights.sun;
      rim.intensity = lights.rim;
      heroLight.intensity = lights.hero;
      victimLight.intensity =
        lights.victim *
        (p.beat.phase === "strobe" && !p.beat.slain
          ? 0.75 + 0.25 * Math.sin(now * 0.012)
          : 1);
      if (p.show) {
        heroLight.color.setHex(
          p.show.kind === "checkmate"
            ? 0xffe2b8
            : p.show.by === "b"
              ? 0xffd27a
              : 0x9fd4ff,
        );
        heroLight.position.copy(squarePosition(p.show.square)).setY(0.9);
        if (p.show.victim)
          victimLight.position.copy(squarePosition(p.show.victim)).setY(0.75);
      }
      element.dataset.lights = lights.hero > 0.5 ? "stage" : "room";
      scene.updateMatrixWorld(true);
      halves.forEach((h) =>
        h.plane.copy(h.local).applyMatrix4(h.group.matrixWorld),
      );
      camera.layers.set(0);
      postFX.render();
      // Render original sRGB sprites after grading so their source palette survives.
      renderer.autoClear = false;
      renderer.clearDepth();
      camera.layers.set(1);
      renderer.render(scene, camera);
      renderer.autoClear = true;
      camera.layers.set(0);
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    const lost = (e: Event) => {
      e.preventDefault();
      setError(true);
    };
    element.addEventListener("webglcontextlost", lost);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      boardViews.delete(host);
      element.removeEventListener("webglcontextlost", lost);
      postFX.dispose();
      shadowTexture.dispose();
      dispose(scene);
      textures.forEach((t) => t.dispose());
      pieceTextures.forEach((t) => t.dispose());
      actorTexture.dispose();
      actorSprite.material.dispose();
      renderer.dispose();
    };
  }, []);
  return (
    <>
      <div className="piece-texture-sources" aria-hidden="true">
        {["w", "b"].flatMap((color) =>
          ["p", "r", "n", "b", "q", "k"].map((type) => (
            <span key={color + type} data-art={color + type}>
              <ChessPiece type={type} color={color} />
            </span>
          )),
        )}
      </div>
      <canvas
        className="three-board"
        ref={canvas}
        role="img"
        aria-label="立体国际象棋棋盘"
      />
      {error && (
        <p className="board-render-error" role="alert">
          无法显示 3D 棋盘，请启用浏览器硬件加速后刷新。
        </p>
      )}
    </>
  );
}
