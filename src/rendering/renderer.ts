import { Painting, SIZE } from '../painting/engine';

const vertex = `#version 300 es
out vec2 uv;
void main(){ vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2); uv=p; gl_Position=vec4(p*2.-1.,0.,1.); }`;
const fragment = `#version 300 es
precision highp float;
precision highp usampler2D;
in vec2 uv;
uniform sampler2D pigment;
uniform usampler2D relief;
uniform float lighting;
out vec4 outColor;
float h(ivec2 p){return float(texelFetch(relief,clamp(p,ivec2(0),ivec2(1023)),0).r);}
float noise(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
  vec2 pos=vec2(uv.x,1.-uv.y)*1024.;
  ivec2 p=clamp(ivec2(pos),ivec2(0),ivec2(1023));
  vec4 paint=texelFetch(pigment,p,0);
  float height=h(p);
  float weave=(sin(pos.x*2.094)*.6+sin(pos.y*2.094)*.4);
  float grain=noise(floor(pos))-.5;
  vec3 linen=vec3(.949,.934,.887)+(weave*.016+grain*.016);
  vec3 color=mix(linen,paint.rgb,paint.a);
  float dx=(h(p+ivec2(1,0))-h(p-ivec2(1,0)))*.00055;
  float dy=(h(p+ivec2(0,1))-h(p-ivec2(0,1)))*.00055;
  float fabric=(1.-min(height/6000.,.94))*.05;
  vec3 n=normalize(vec3(-dx+cos(pos.x*2.094)*fabric,-dy+cos(pos.y*2.094)*fabric,1.));
  vec3 light=normalize(vec3(-.55,-.65,.9));
  float diffuse=dot(n,light);
  float shade=clamp(.82+.27*diffuse,.62,1.14);
  float spec=pow(max(dot(n,normalize(light+vec3(0,0,1))),0.),28.)*.085*paint.a;
  color=mix(color,color*shade+vec3(spec),lighting);
  color+=grain*.003*paint.a;
  outColor=vec4(clamp(color,0.,1.),1.);
}`;

export class StudioRenderer {
  gl: WebGL2RenderingContext | null = null;
  mode: 'webgl2' | 'canvas2d' = 'canvas2d';
  reason = '';
  lighting = 1;
  private program: WebGLProgram | null = null;
  private textures: WebGLTexture[] = [];
  private fallbackImage = new ImageData(SIZE, SIZE);
  private frame = 0;
  private disposed = false;
  private fullUpload = true;
  private context2d: CanvasRenderingContext2D;
  constructor(public canvas: HTMLCanvasElement, public fallback: HTMLCanvasElement, public painting: Painting, private notify: () => void, forceFallback = false) {
    fallback.width = fallback.height = SIZE;
    this.context2d = fallback.getContext('2d', { alpha: false })!;
    canvas.addEventListener('webglcontextlost', this.lost);
    canvas.addEventListener('webglcontextrestored', this.restored);
    if (!forceFallback) this.init(); else this.reason = '测试：WebGL 不可用';
    this.resize(); this.request();
  }
  private lost = (e: Event) => {
    e.preventDefault(); this.mode = 'canvas2d'; this.reason = '材质显示暂时中断，画作仍在';
    this.painting.end(); this.painting.invalidate(); this.notify(); this.request();
  };
  private restored = () => { this.init(); this.painting.invalidate(); this.notify(); this.request(); };
  retry() { this.init(); this.painting.invalidate(); this.notify(); this.request(); }
  private init() {
    try {
      const gl = this.canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: false, depth: false });
      if (!gl || gl.isContextLost()) throw new Error('此浏览器暂时无法开启材质光照');
      this.gl = gl;
      if (this.program) gl.deleteProgram(this.program);
      for (const texture of this.textures) gl.deleteTexture(texture);
      this.textures = [];
      const compile = (type: number, source: string) => {
        const shader = gl.createShader(type)!; gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { const error = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(error ?? 'Shader failed'); }
        return shader;
      };
      const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
      this.program = gl.createProgram()!; gl.attachShader(this.program, vs); gl.attachShader(this.program, fs); gl.linkProgram(this.program);
      gl.deleteShader(vs); gl.deleteShader(fs);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program) ?? 'Material link failed');
      for (let i = 0; i < 2; i++) {
        const texture = gl.createTexture()!; this.textures.push(texture); gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texStorage2D(gl.TEXTURE_2D, 1, i ? gl.R16UI : gl.RGBA8, SIZE, SIZE);
      }
      gl.useProgram(this.program); gl.uniform1i(gl.getUniformLocation(this.program, 'pigment'), 0); gl.uniform1i(gl.getUniformLocation(this.program, 'relief'), 1);
      this.fullUpload = true; this.mode = 'webgl2'; this.reason = '';
    } catch (error) { this.mode = 'canvas2d'; this.reason = error instanceof Error ? error.message : '材质光照不可用'; }
  }
  resize() {
    const side = Math.min(SIZE, Math.max(1, Math.round(this.canvas.clientWidth * Math.min(devicePixelRatio, 1.5))));
    if (this.canvas.width !== side) this.canvas.width = this.canvas.height = side;
    this.request();
  }
  request() {
    if (!this.frame && !this.disposed) this.frame = requestAnimationFrame(() => { this.frame = 0; this.draw(); });
  }
  private upload() {
    const gl = this.gl!;
    const d = this.fullUpload ? { x0: 0, y0: 0, x1: SIZE, y1: SIZE } : this.painting.dirty;
    if (!d) return;
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, SIZE);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, d.x0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, d.y0);
    for (let i = 0; i < 2; i++) {
      gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, this.textures[i]);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0, i ? gl.RED_INTEGER : gl.RGBA, i ? gl.UNSIGNED_SHORT : gl.UNSIGNED_BYTE, i ? this.painting.height : this.painting.color);
    }
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    this.fullUpload = false; this.painting.dirty = null;
  }
  private shade(width: number, height: number) {
    const gl = this.gl!;
    gl.viewport(0, 0, width, height); gl.useProgram(this.program);
    gl.uniform1f(gl.getUniformLocation(this.program!, 'lighting'), this.lighting);
    for (let i = 0; i < 2; i++) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, this.textures[i]); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  draw() {
    this.canvas.style.visibility = this.mode === 'webgl2' ? 'visible' : 'hidden';
    this.fallback.style.visibility = this.mode === 'webgl2' ? 'hidden' : 'visible';
    if (this.mode === 'webgl2' && !this.gl?.isContextLost()) { this.upload(); this.gl!.bindFramebuffer(this.gl!.FRAMEBUFFER, null); this.shade(this.canvas.width, this.canvas.height); }
    else this.drawFallback();
  }
  private drawFallback() {
    const dst = this.fallbackImage.data, src = this.painting.color;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4, a = src[i + 3] / 255;
      const weave = (Math.sin(x * 2.094) * .6 + Math.sin(y * 2.094) * .4) * 4;
      dst[i] = (242 + weave) * (1 - a) + src[i] * a;
      dst[i + 1] = (238 + weave) * (1 - a) + src[i + 1] * a;
      dst[i + 2] = (226 + weave) * (1 - a) + src[i + 2] * a; dst[i + 3] = 255;
    }
    this.context2d.putImageData(this.fallbackImage, 0, 0); this.painting.dirty = null;
  }
  async exportPng(): Promise<Blob> {
    this.painting.end(); this.draw();
    const output = document.createElement('canvas'); output.width = output.height = SIZE;
    const ctx = output.getContext('2d')!;
    if (this.mode === 'webgl2') {
      const gl = this.gl!, target = gl.createTexture(), fbo = gl.createFramebuffer();
      try {
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, target); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, SIZE, SIZE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('导出缓冲创建失败，请重试');
        this.shade(SIZE, SIZE);
        const raw = new Uint8Array(SIZE * SIZE * 4), result = ctx.createImageData(SIZE, SIZE);
        gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, raw);
        if (gl.isContextLost()) throw new Error('导出期间材质显示中断，请在简化模式下重试');
        for (let y = 0; y < SIZE; y++) result.data.set(raw.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4);
        ctx.putImageData(result, 0, 0);
      } finally { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fbo); gl.deleteTexture(target); this.request(); }
    } else ctx.drawImage(this.fallback, 0, 0);
    return new Promise((resolve, reject) => output.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG 编码失败，请重试')), 'image/png'));
  }
  info() {
    const gl = this.gl, ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return { mode: this.mode, renderer: gl && ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable', vendor: gl && ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : 'unavailable', backing: [this.canvas.width, this.canvas.height], dpr: devicePixelRatio, cpuBufferBytes: this.fallbackImage.data.byteLength, gpuTextureBytes: this.mode === 'webgl2' ? SIZE * SIZE * 6 : 0 };
  }
  dispose() { this.disposed = true; cancelAnimationFrame(this.frame); this.canvas.removeEventListener('webglcontextlost', this.lost); this.canvas.removeEventListener('webglcontextrestored', this.restored); for (const t of this.textures) this.gl?.deleteTexture(t); if (this.program) this.gl?.deleteProgram(this.program); }
}
