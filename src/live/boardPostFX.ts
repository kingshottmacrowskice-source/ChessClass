// Adapted from ../sky-island/dist/island-postfx.js. Preserve transparent parchment,
// full-resolution output and ungraded pixel sprites; omit sky rays in this indoor scene.
// Post-processing effects inspired by Complementary Reimagined shader pack.
// Implements: SSAO, Bloom, God Rays (volumetric light), and enhanced water reflections.
// Original Three.js implementation; GLSL techniques adapted from Complementary Shaders by EminGT.
import * as T from "three";

export function createPostFX({
  renderer,
  scene,
  camera,
  sun,
}: {
  renderer: T.WebGLRenderer;
  scene: T.Scene;
  camera: T.PerspectiveCamera;
  sun: T.DirectionalLight;
}) {
  const size = new T.Vector2();
  renderer.getSize(size);
  let w = Math.max(1, size.x),
    h = Math.max(1, size.y);

  // --- Render Targets ---
  const rtScene = new T.WebGLRenderTarget(w, h, { type: T.HalfFloatType });
  // Attach depth texture for SSAO and god rays
  rtScene.depthTexture = new T.DepthTexture(w, h);
  rtScene.depthTexture.type = T.UnsignedIntType;
  const rtBright = new T.WebGLRenderTarget(w / 2, h / 2, {
    type: T.HalfFloatType,
  });
  const rtBlur1 = new T.WebGLRenderTarget(w / 2, h / 2, {
    type: T.HalfFloatType,
  });
  const rtBlur2 = new T.WebGLRenderTarget(w / 2, h / 2, {
    type: T.HalfFloatType,
  });
  const rtGod1 = new T.WebGLRenderTarget(w / 4, h / 4, {
    type: T.HalfFloatType,
  });
  const rtGod2 = new T.WebGLRenderTarget(w / 4, h / 4, {
    type: T.HalfFloatType,
  });
  const rtAO = new T.WebGLRenderTarget(w / 2, h / 2, { type: T.HalfFloatType });
  const rtAOBlur = new T.WebGLRenderTarget(w / 2, h / 2, {
    type: T.HalfFloatType,
  });

  // --- Full-screen quad ---
  const quadGeo = new T.PlaneGeometry(2, 2);
  const quadCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadMesh = new T.Mesh(quadGeo, new T.ShaderMaterial());
  const placeholder = quadMesh.material;
  const rtComposite = new T.WebGLRenderTarget(w, h, { type: T.HalfFloatType });
  const quadScene = new T.Scene();
  quadScene.add(quadMesh);

  // --- SSAO Shader (inspired by Complementary's GetAmbientOcclusion) ---
  const ssaoMaterial = new T.ShaderMaterial({
    uniforms: {
      tDepth: { value: rtScene.depthTexture },
      tNormal: { value: null },
      resolution: { value: new T.Vector2(w / 2, h / 2) },
      cameraNear: { value: camera.near },
      cameraFar: { value: camera.far },
      kernelRadius: { value: 0.65 },
      intensity: { value: 1.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main(){vUv=uv;gl_Position=vec4(position,1.);}
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D tDepth;
      uniform vec2 resolution;
      uniform float cameraNear,cameraFar,kernelRadius,intensity;

      float getDepth(vec2 uv){
        return texture2D(tDepth,uv).r;
      }
      float getLinearDepth(float d){
        float z=d*2.0-1.0;
        return (2.0*cameraNear*cameraFar)/(cameraFar+cameraNear-z*(cameraFar-cameraNear));
      }
      // Spiral sample offset (from Complementary's OffsetDist)
      vec2 offsetDist(float x,int s){
        float n=fract(x*1.414)*3.1415;
        return vec2(cos(n),sin(n))*x/float(s);
      }

      void main(){
        float z0=getDepth(vUv);
        if(z0>=1.0){gl_FragColor=vec4(1.0);return;}
        float linearZ0=getLinearDepth(z0);
        float ao=0.0;
        int samples=8;
        float dither=fract(sin(dot(vUv,vec2(12.9898,78.233)))*43758.5453);

        for(int i=1;i<=samples;i++){
          vec2 offset=offsetDist(float(i)+dither,samples)*kernelRadius/max(linearZ0,1.0)*vec2(resolution.y/resolution.x,1.0);
          if(mod(float(i),2.0)==0.0)offset.y=-offset.y;

          float sampleDepth1=getLinearDepth(getDepth(vUv+offset));
          float sampleDepth2=getLinearDepth(getDepth(vUv-offset));

          float delta1=linearZ0-sampleDepth1;
          float delta2=linearZ0-sampleDepth2;

          // Equal-depth surfaces must remain fully lit. Only nearby foreground
          // samples occlude; distant silhouettes must not darken the whole island.
          float ao1=smoothstep(.04,.18,delta1)*(1.0-smoothstep(kernelRadius,kernelRadius*2.0,abs(delta1)));
          float ao2=smoothstep(.04,.18,delta2)*(1.0-smoothstep(kernelRadius,kernelRadius*2.0,abs(delta2)));
          ao+=(ao1+ao2)*0.5;
        }
        ao=pow(clamp(1.0-ao/float(samples),0.0,1.0),intensity);
        gl_FragColor=vec4(vec3(ao),1.0);
      }
    `,
  });

  // --- SSAO Blur (denoise) ---
  const ssaoBlurMaterial = new T.ShaderMaterial({
    uniforms: {
      tAO: { value: null },
      resolution: { value: new T.Vector2(w / 2, h / 2) },
    },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position,1.);}`,
    fragmentShader: `
      varying vec2 vUv;uniform sampler2D tAO;uniform vec2 resolution;
      void main(){
        vec2 texel=1.0/resolution;float result=0.0;
        for(int x=-2;x<=2;x++)for(int y=-2;y<=2;y++)
          result+=texture2D(tAO,vUv+vec2(float(x),float(y))*texel).r;
        gl_FragColor=vec4(vec3(result/25.0),1.0);
      }
    `,
  });

  // --- Bright pass (bloom threshold) ---
  const brightMaterial = new T.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      threshold: { value: 0.75 },
      softKnee: { value: 0.3 },
    },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position,1.);}`,
    fragmentShader: `
      varying vec2 vUv;uniform sampler2D tDiffuse;uniform float threshold,softKnee;
      void main(){
        vec4 c=texture2D(tDiffuse,vUv);
        float br=max(c.r,max(c.g,c.b));
        float knee=threshold*softKnee+1e-5;
        float soft=clamp(br-threshold+knee,0.0,2.0*knee);
        soft=soft*soft/(4.0*knee+1e-5);
        float contrib=max(soft,br-threshold)/max(br,1e-5);
        gl_FragColor=vec4(c.rgb*contrib,1.0);
      }
    `,
  });

  // --- Gaussian blur ---
  const blurMaterial = new T.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      direction: { value: new T.Vector2(1, 0) },
      resolution: { value: new T.Vector2(w / 2, h / 2) },
    },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position,1.);}`,
    fragmentShader: `
      varying vec2 vUv;uniform sampler2D tDiffuse;uniform vec2 direction,resolution;
      void main(){
        vec2 texel=direction/resolution;
        vec4 result=vec4(0.0);
        float weights[5];
        weights[0]=0.227027;weights[1]=0.1945946;weights[2]=0.1216216;weights[3]=0.054054;weights[4]=0.016216;
        result+=texture2D(tDiffuse,vUv)*weights[0];
        for(int i=1;i<5;i++){
          result+=texture2D(tDiffuse,vUv+texel*float(i))*weights[i];
          result+=texture2D(tDiffuse,vUv-texel*float(i))*weights[i];
        }
        gl_FragColor=result;
      }
    `,
  });

  // --- God Rays (volumetric light shafts, inspired by Complementary's GetVolumetricLight) ---
  const godRayMaterial = new T.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      tDepth: { value: rtScene.depthTexture },
      lightPosition: { value: new T.Vector3() },
      density: { value: 0.85 },
      weight: { value: 0.45 },
      decay: { value: 0.93 },
      exposure: { value: 0.28 },
      samples: { value: 32 },
      sunColor: { value: new T.Color(1, 0.95, 0.85) },
    },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position,1.);}`,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D tDiffuse,tDepth;
      uniform vec3 lightPosition,sunColor;
      uniform float density,weight,decay,exposure;
      uniform int samples;

      void main(){
        vec2 texCoord=vUv;
        vec2 deltaTexCoord=texCoord-lightPosition.xy;
        deltaTexCoord*=1.0/float(samples)*density;

        float illuminationDecay=1.0;
        vec4 color=vec4(0.0);

        for(int i=0;i<32;i++){
          if(i>=samples)break;
          texCoord-=deltaTexCoord;
          float skyMask=step(.99999,texture2D(tDepth,texCoord).r);
          float source=1.0-smoothstep(.012,.055,length(texCoord-lightPosition.xy));
          vec4 sample_=vec4(vec3(source*skyMask),0.0);
          sample_*=illuminationDecay*weight;
          color+=sample_;
          illuminationDecay*=decay;
        }
        gl_FragColor=color*exposure;
      }
    `,
  });

  // --- Composite pass: combine scene + bloom + god rays + SSAO ---
  const compositeMaterial = new T.ShaderMaterial({
    uniforms: {
      tScene: { value: rtScene.texture },
      tBloom: { value: null },
      tGodRays: { value: null },
      tAO: { value: null },
      useBloom: { value: 1 },
      useGodRays: { value: 1 },
      useAO: { value: 1 },
      bloomStrength: { value: 0.12 },
      godRayStrength: { value: 0.25 },
      aoStrength: { value: 0.25 },
      sunColor: { value: sun.color },
    },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position,1.);}`,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D tScene,tBloom,tGodRays,tAO;
      uniform vec3 sunColor;
      uniform float useBloom,useGodRays,useAO,bloomStrength,godRayStrength,aoStrength;

      void main(){
        vec4 scene=texture2D(tScene,vUv);
        vec3 color=scene.rgb;

        // SSAO multiply
        if(useAO>0.5){
          float ao=texture2D(tAO,vUv).r;
          color*=mix(1.0,ao,aoStrength);
        }

        // Bloom add
        if(useBloom>0.5){
          vec3 bloom=texture2D(tBloom,vUv).rgb;
          color+=bloom*bloomStrength;
        }

        // God rays add
        if(useGodRays>0.5){
          vec3 godRay=texture2D(tGodRays,vUv).rgb;
          color+=godRay*sunColor*godRayStrength;
        }

        gl_FragColor=vec4(color,scene.a);
      }
    `,
  });

  // --- Final: tone mapping + color grading (inspired by Complementary's final pass) ---
  const finalMaterial = new T.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      vignette: { value: 0.04 },
      saturation: { value: 1.0 },
      contrast: { value: 1.0 },
    },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position,1.);}`,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D tDiffuse;
      uniform float vignette,saturation,contrast;

      void main(){
        vec4 color=texture2D(tDiffuse,vUv);

        // Vignette (from Complementary's final.glsl)
        vec2 center=vUv-0.5;
        float dist=length(center);
        float vig=1.0-vignette*dist*dist*2.0;
        color.rgb*=vig;

        // Saturation
        float luma=dot(color.rgb,vec3(0.2126,0.7152,0.0722));
        color.rgb=mix(vec3(luma),color.rgb,saturation);

        // Contrast
        color.rgb=(color.rgb-0.5)*contrast+0.5;

        // Dither (from Complementary - reduce banding)
        float dither=fract(sin(dot(vUv,vec2(12.9898,78.233)))*43758.5453)/128.0;
        color.rgb+=dither;

        gl_FragColor=vec4(max(color.rgb,vec3(0.0)),color.a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor.rgb *= gl_FragColor.a;
      }
    `,
  });

  // --- Apply SSAO to scene material (inject into existing materials) ---
  // We apply SSAO in post rather than modifying each material.

  let enabled = true;
  const options = { bloom: true, godRays: false, ao: true };

  function render() {
    if (!enabled) {
      renderer.render(scene, camera);
      return;
    }

    const currentSize = new T.Vector2();
    renderer.getSize(currentSize);
    const aspect = currentSize.x / currentSize.y;

    // 1. Render scene to target (depth is written to rtScene.depthTexture)
    renderer.setRenderTarget(rtScene);
    renderer.clear();
    renderer.render(scene, camera);

    // 2. SSAO pass
    if (options.ao) {
      ssaoMaterial.uniforms.tDepth.value = rtScene.depthTexture;
      quadMesh.material = ssaoMaterial;
      renderer.setRenderTarget(rtAO);
      renderer.render(quadScene, quadCam);

      // AO blur
      ssaoBlurMaterial.uniforms.tAO.value = rtAO.texture;
      quadMesh.material = ssaoBlurMaterial;
      renderer.setRenderTarget(rtAOBlur);
      renderer.render(quadScene, quadCam);
    }

    // 4. Bloom: bright pass + blur
    if (options.bloom) {
      brightMaterial.uniforms.tDiffuse.value = rtScene.texture;
      quadMesh.material = brightMaterial;
      renderer.setRenderTarget(rtBright);
      renderer.render(quadScene, quadCam);

      // Horizontal blur
      blurMaterial.uniforms.tDiffuse.value = rtBright.texture;
      blurMaterial.uniforms.direction.value.set(1, 0);
      blurMaterial.uniforms.resolution.value.set(w / 2, h / 2);
      quadMesh.material = blurMaterial;
      renderer.setRenderTarget(rtBlur1);
      renderer.render(quadScene, quadCam);

      // Vertical blur
      blurMaterial.uniforms.tDiffuse.value = rtBlur1.texture;
      blurMaterial.uniforms.direction.value.set(0, 1);
      quadMesh.material = blurMaterial;
      renderer.setRenderTarget(rtBlur2);
      renderer.render(quadScene, quadCam);

      // Second blur pass for smoother bloom
      blurMaterial.uniforms.tDiffuse.value = rtBlur2.texture;
      blurMaterial.uniforms.direction.value.set(1, 0);
      quadMesh.material = blurMaterial;
      renderer.setRenderTarget(rtBlur1);
      renderer.render(quadScene, quadCam);

      blurMaterial.uniforms.tDiffuse.value = rtBlur1.texture;
      blurMaterial.uniforms.direction.value.set(0, 1);
      quadMesh.material = blurMaterial;
      renderer.setRenderTarget(rtBlur2);
      renderer.render(quadScene, quadCam);
    }

    // 5. God rays
    if (options.godRays) {
      // Project sun position to screen space
      const direction =
        sun.userData.solarDirection ||
        sun.position.clone().sub(sun.target.position).normalize();
      const sunPos = camera.position.clone().addScaledVector(direction, 100);
      const projected = sunPos.project(camera);
      const screenX = (projected.x + 1) / 2,
        screenY = (projected.y + 1) / 2;

      // Only render god rays if sun is on screen and not behind camera
      const onScreen =
        (sun.userData.solarVisibility ?? 1) > 0 &&
        projected.z > -1 &&
        projected.z < 1 &&
        screenX >= -0.2 &&
        screenX <= 1.2 &&
        screenY >= -0.2 &&
        screenY <= 1.2;

      if (onScreen) {
        godRayMaterial.uniforms.tDiffuse.value = rtScene.texture;
        godRayMaterial.uniforms.tDepth.value = rtScene.depthTexture;
        godRayMaterial.uniforms.lightPosition.value.set(screenX, screenY, 0);
        godRayMaterial.uniforms.sunColor.value.copy(sun.color);
        quadMesh.material = godRayMaterial;
        renderer.setRenderTarget(rtGod1);
        renderer.render(quadScene, quadCam);

        // Blur god rays
        blurMaterial.uniforms.tDiffuse.value = rtGod1.texture;
        blurMaterial.uniforms.direction.value.set(1, 0);
        blurMaterial.uniforms.resolution.value.set(w / 4, h / 4);
        quadMesh.material = blurMaterial;
        renderer.setRenderTarget(rtGod2);
        renderer.render(quadScene, quadCam);

        blurMaterial.uniforms.tDiffuse.value = rtGod2.texture;
        blurMaterial.uniforms.direction.value.set(0, 1);
        quadMesh.material = blurMaterial;
        renderer.setRenderTarget(rtGod1);
        renderer.render(quadScene, quadCam);
      } else {
        // Clear god ray target
        renderer.setRenderTarget(rtGod1);
        renderer.setClearColor(0x000000, 1);
        renderer.clear();
      }
    }

    // 6. Composite
    compositeMaterial.uniforms.tScene.value = rtScene.texture;
    compositeMaterial.uniforms.tBloom.value = rtBlur2.texture;
    compositeMaterial.uniforms.tGodRays.value = rtGod1.texture;
    compositeMaterial.uniforms.tAO.value = rtAOBlur.texture;
    compositeMaterial.uniforms.useBloom.value = options.bloom ? 1 : 0;
    compositeMaterial.uniforms.useGodRays.value = options.godRays ? 1 : 0;
    compositeMaterial.uniforms.godRayStrength.value =
      0.25 * (sun.userData.solarVisibility ?? 1);
    compositeMaterial.uniforms.useAO.value = options.ao ? 1 : 0;
    quadMesh.material = compositeMaterial;
    renderer.setRenderTarget(rtComposite);
    renderer.render(quadScene, quadCam);

    // 7. Final: tone mapping + vignette + color grading
    finalMaterial.uniforms.tDiffuse.value = rtComposite.texture;
    quadMesh.material = finalMaterial;
    renderer.setRenderTarget(null);
    renderer.render(quadScene, quadCam);
  }

  function setSize(width: number, height: number) {
    w = Math.max(2, Math.round(width));
    h = Math.max(2, Math.round(height));
    width = w;
    height = h;
    rtComposite.setSize(w, h);
    rtScene.setSize(width, height);
    rtScene.depthTexture!.image.width = width;
    rtScene.depthTexture!.image.height = height;
    rtScene.depthTexture!.needsUpdate = true;
    rtBright.setSize(width / 2, height / 2);
    rtBlur1.setSize(width / 2, height / 2);
    rtBlur2.setSize(width / 2, height / 2);
    rtGod1.setSize(width / 4, height / 4);
    rtGod2.setSize(width / 4, height / 4);
    rtAO.setSize(width / 2, height / 2);
    rtAOBlur.setSize(width / 2, height / 2);
    ssaoMaterial.uniforms.resolution.value.set(width / 2, height / 2);
    ssaoBlurMaterial.uniforms.resolution.value.set(width / 2, height / 2);
    blurMaterial.uniforms.resolution.value.set(width / 2, height / 2);
  }

  function setEnabled(value: boolean) {
    enabled = value;
  }
  function setOption(key: keyof typeof options, value: boolean) {
    options[key] = value;
  }

  function dispose() {
    [
      rtScene,
      rtBright,
      rtBlur1,
      rtBlur2,
      rtGod1,
      rtGod2,
      rtAO,
      rtAOBlur,
      rtComposite,
    ].forEach((t) => t.dispose());
    [
      placeholder,
      ssaoMaterial,
      ssaoBlurMaterial,
      brightMaterial,
      blurMaterial,
      godRayMaterial,
      compositeMaterial,
      finalMaterial,
    ].forEach((m) => m.dispose());
    quadGeo.dispose();
  }
  return {
    render,
    setSize,
    setEnabled,
    setOption,
    options,
    dispose,
    get enabled() {
      return enabled;
    },
  };
}

