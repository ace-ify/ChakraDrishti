import * as Cesium from 'cesium'

export const FLIR_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D colorTexture;
  uniform vec2 colorTextureDimensions;
  in vec2 v_textureCoordinates;

  vec3 ironbow(float t) {
    t = clamp(t, 0.0, 1.0);
    const vec3 c0 = vec3(0.0, 0.0, 0.0);
    const vec3 c1 = vec3(0.13, 0.0, 0.30);
    const vec3 c2 = vec3(0.49, 0.0, 0.45);
    const vec3 c3 = vec3(0.86, 0.10, 0.18);
    const vec3 c4 = vec3(1.0, 0.55, 0.0);
    const vec3 c5 = vec3(1.0, 0.91, 0.32);
    const vec3 c6 = vec3(1.0, 1.0, 1.0);
    float s = t * 6.0;
    if (s < 1.0) return mix(c0, c1, s);
    if (s < 2.0) return mix(c1, c2, s - 1.0);
    if (s < 3.0) return mix(c2, c3, s - 2.0);
    if (s < 4.0) return mix(c3, c4, s - 3.0);
    if (s < 5.0) return mix(c4, c5, s - 4.0);
    return mix(c5, c6, s - 5.0);
  }

  void main() {
    vec2 uv = v_textureCoordinates;
    vec4 src = texture(colorTexture, uv);
    float luma = dot(src.rgb, vec3(0.299, 0.587, 0.114));
    
    // Thermal Ironbow color mapping
    float temp = clamp((luma - 0.1) / 0.8, 0.0, 1.0);
    vec3 thermal = ironbow(temp);
    
    // Optical lens vignette
    vec2 c = uv * 2.0 - 1.0;
    float vign = 1.0 - dot(c, c) * 0.35;
    
    out_FragColor = vec4(thermal * vign, 1.0);
  }
`

export const NVG_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D colorTexture;
  uniform vec2 colorTextureDimensions;
  in vec2 v_textureCoordinates;

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
    vec2 uv = v_textureCoordinates;
    vec4 src = texture(colorTexture, uv);
    float luma = dot(src.rgb, vec3(0.299, 0.587, 0.114));
    
    // P43 phosphor green (530nm) with high gain amplification
    vec3 phosphor = vec3(0.16, 1.0, 0.24);
    float amplified = clamp(luma * 1.85, 0.0, 1.0);
    
    // Scintillation tube grain
    float grain = (hash(uv * colorTextureDimensions) - 0.5) * 0.09;
    
    // Scanlines
    float scanline = sin(uv.y * colorTextureDimensions.y * 1.2) * 0.06;
    
    // Lens tube mask
    vec2 c = uv * 2.0 - 1.0;
    float dist = length(c);
    float tube = smoothstep(1.05, 0.75, dist);
    
    vec3 finalColor = phosphor * (amplified + grain - scanline) * tube;
    out_FragColor = vec4(finalColor, 1.0);
  }
`

export const CRT_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D colorTexture;
  uniform vec2 colorTextureDimensions;
  in vec2 v_textureCoordinates;

  void main() {
    vec2 uv = v_textureCoordinates;
    vec2 texel = 1.0 / colorTextureDimensions;
    
    // Slight RGB chromatic aberration
    vec2 offset = (uv - 0.5) * 0.006;
    float r = texture(colorTexture, uv + offset).r;
    float g = texture(colorTexture, uv).g;
    float b = texture(colorTexture, uv - offset).b;
    
    // Scanlines
    float scan = sin(uv.y * colorTextureDimensions.y * 1.5) * 0.5 + 0.5;
    vec3 rgb = vec3(r, g, b) * (0.85 + 0.15 * scan);
    
    // Corner vignette
    vec2 vigUV = uv * (1.0 - uv);
    float vig = vigUV.x * vigUV.y * 22.0;
    rgb *= clamp(pow(vig, 0.25), 0.0, 1.0);
    
    out_FragColor = vec4(rgb, 1.0);
  }
`

export class TacticalShaderStageManager {
  private stages: Map<'flir' | 'nvg' | 'crt', Cesium.PostProcessStage> = new Map()
  private scene: Cesium.Scene

  constructor(scene: Cesium.Scene) {
    this.scene = scene
    this.initStages()
  }

  private initStages() {
    const configs: Array<{ name: 'flir' | 'nvg' | 'crt'; shader: string }> = [
      { name: 'flir', shader: FLIR_FRAGMENT_SHADER },
      { name: 'nvg', shader: NVG_FRAGMENT_SHADER },
      { name: 'crt', shader: CRT_FRAGMENT_SHADER },
    ]

    for (const { name, shader } of configs) {
      try {
        const stage = new Cesium.PostProcessStage({
          name: `tactical_${name}`,
          fragmentShader: shader,
        })
        stage.enabled = false
        this.scene.postProcessStages.add(stage)
        this.stages.set(name, stage)
      } catch (err) {
        console.warn(`[TacticalShader] Error initializing stage ${name}:`, err)
      }
    }
  }

  setMode(mode: 'normal' | 'flir' | 'nvg' | 'crt') {
    this.stages.forEach((stage, key) => {
      stage.enabled = key === mode
    })
    this.scene.requestRender()
  }

  destroy() {
    if (!this.scene.isDestroyed()) {
      this.stages.forEach((stage) => {
        this.scene.postProcessStages.remove(stage)
      })
      this.stages.clear()
    }
  }
}
