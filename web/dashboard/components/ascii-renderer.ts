import { BLUR, COMPOSITE, FIELD, HALO, VERTEX } from "./ascii-shaders";

type RGB = readonly [number, number, number];
type Program = { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null> };
type Target = { framebuffer: WebGLFramebuffer; textures: WebGLTexture[]; width: number; height: number };
export type AsciiFrame = {
  time: number;
  intro: number;
  seed: number;
  compact: boolean;
  still: boolean;
  trail: Float32Array;
  clicks: Float32Array;
};
export type AsciiRenderer = {
  resize: (width: number, height: number, ratio: number) => void;
  theme: (light: boolean, palette: RGB[]) => void;
  draw: (frame: AsciiFrame) => void;
  dispose: () => void;
};

function oklab([r, g, b]: RGB) {
  const linear = (value: number) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  const lr = linear(r), lg = linear(g), lb = linear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function buildProgram(gl: WebGL2RenderingContext, fragment: string): Program {
  const shaders: WebGLShader[] = [];
  const program = gl.createProgram();
  if (!program) throw new Error("Unable to allocate the ASCII program");
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, fragment]] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Unable to allocate the ASCII shader");
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error("ASCII shader compilation failed");
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("ASCII shader linking failed");
    const uniforms: Program["uniforms"] = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
    for (let index = 0; index < count; index++) {
      const info = gl.getActiveUniform(program, index);
      if (info) uniforms[info.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(program, info.name);
    }
    return { program, uniforms };
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  } finally {
    shaders.forEach((shader) => gl.deleteShader(shader));
  }
}

// The supplied field → ASCII atlas → glow pipeline, with bounded buffers and
// explicit resource ownership so React's effect replay can initialize it again.
export function createAsciiRenderer(canvas: HTMLCanvasElement): AsciiRenderer | null {
  const gl = canvas.getContext("webgl2", {
    alpha: true, premultipliedAlpha: true, antialias: false,
    depth: false, stencil: false, powerPreference: "low-power",
  });
  if (!gl) return null;
  const programs: Program[] = [];
  const textures: WebGLTexture[] = [];
  const framebuffers: WebGLFramebuffer[] = [];
  let vao: WebGLVertexArrayObject | null = null;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    textures.forEach((texture) => gl.deleteTexture(texture));
    framebuffers.forEach((framebuffer) => gl.deleteFramebuffer(framebuffer));
    programs.forEach(({ program }) => gl.deleteProgram(program));
    if (vao) gl.deleteVertexArray(vao);
    // Do not force context loss: Strict Mode immediately replays this effect.
  };
  try {
    const makeProgram = (source: string) => {
      const result = buildProgram(gl, source);
      programs.push(result);
      return result;
    };
    const texture = () => {
      const result = gl.createTexture();
      if (!result) throw new Error("Unable to allocate the ASCII texture");
      textures.push(result);
      return result;
    };
    const makeTarget = (count: number): Target => {
      const framebuffer = gl.createFramebuffer();
      if (!framebuffer) throw new Error("Unable to allocate the ASCII target");
      framebuffers.push(framebuffer);
      const attachments = Array.from({ length: count }, () => {
        const result = texture();
        gl.bindTexture(gl.TEXTURE_2D, result);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return result;
      });
      return { framebuffer, textures: attachments, width: 0, height: 0 };
    };
    const field = makeProgram(FIELD);
    const halo = makeProgram(HALO);
    const blur = makeProgram(BLUR);
    const composite = makeProgram(COMPOSITE);
    vao = gl.createVertexArray();
    if (!vao) throw new Error("Unable to allocate the ASCII vertex array");
    const fieldTarget = makeTarget(2);
    const haloA = makeTarget(1);
    const haloB = makeTarget(1);

    const characters = [..." .:-=+xX0#@"];
    const atlasCanvas = document.createElement("canvas");
    atlasCanvas.width = 60 * characters.length;
    atlasCanvas.height = 100;
    const context = atlasCanvas.getContext("2d");
    if (!context) throw new Error("Unable to render the ASCII atlas");
    context.font = '400 78px Consolas, "Liberation Mono", monospace';
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#fff";
    characters.forEach((character, index) => context.fillText(character, index * 60 + 30, 53));
    const atlas = texture();
    gl.bindTexture(gl.TEXTURE_2D, atlas);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const ramp = new Float32Array(8 * 3);
    let light = false;
    let paletteSize = 4;
    let width = 1, height = 1, ratio = 1;
    const sizeTarget = (target: Target, w: number, h: number) => {
      if (target.width === w && target.height === h) return;
      target.width = w;
      target.height = h;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      target.textures.forEach((attachment, index) => {
        gl.bindTexture(gl.TEXTURE_2D, attachment);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + index, gl.TEXTURE_2D, attachment, 0);
      });
      gl.drawBuffers(target.textures.map((_, index) => gl.COLOR_ATTACHMENT0 + index));
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("ASCII render target is incomplete");
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };
    const bindGlyphs = ({ uniforms: u }: Program, frame: AsciiFrame) => {
      const cellHeight = (frame.compact ? 16 : 19) * ratio;
      const cellWidth = cellHeight * 0.6;
      for (const [index, value] of [fieldTarget.textures[0], fieldTarget.textures[1], atlas].entries()) {
        gl.activeTexture(gl.TEXTURE0 + index);
        gl.bindTexture(gl.TEXTURE_2D, value);
      }
      gl.uniform1i(u.uField, 0);
      gl.uniform1i(u.uAux, 1);
      gl.uniform1i(u.uAtlas, 2);
      gl.uniform2f(u.uResolution, canvas.width, canvas.height);
      gl.uniform2f(u.uCell, cellWidth, cellHeight);
      gl.uniform2f(u.uOffset, (canvas.width - Math.ceil(canvas.width / cellWidth) * cellWidth) / 2, (canvas.height - Math.ceil(canvas.height / cellHeight) * cellHeight) / 2);
      gl.uniform2f(u.uAtlasGrid, characters.length, 1);
      gl.uniform1f(u.uCount, characters.length);
      gl.uniform1f(u.uDensity, 0.82);
      gl.uniform1f(u.uOpacity, 0.9);
      gl.uniform1f(u.uFlicker, frame.still ? 0 : 0.16);
      gl.uniform1f(u.uDepth, 0.13);
      gl.uniform1f(u.uGlyphTime, frame.time * 0.75);
      gl.uniform1f(u.uSeedValue, 2.1);
      gl.uniform1f(u.uLight, light ? 1 : 0);
    };
    return {
      theme(isLight, palette) {
        light = isLight;
        paletteSize = Math.min(palette.length, 8);
        ramp.fill(0);
        palette.slice(0, 8).forEach((color, index) => ramp.set(oklab(color), index * 3));
      },
      resize(cssWidth, cssHeight, pixelRatio) {
        if (disposed) return;
        width = Math.max(1, cssWidth);
        height = Math.max(1, cssHeight);
        ratio = pixelRatio;
        canvas.width = Math.max(1, Math.round(width * ratio));
        canvas.height = Math.max(1, Math.round(height * ratio));
        sizeTarget(fieldTarget, Math.max(1, Math.round(canvas.width / 2)), Math.max(1, Math.round(canvas.height / 2)));
        const haloWidth = Math.max(1, Math.round(canvas.width / 4));
        const haloHeight = Math.max(1, Math.round(canvas.height / 4));
        sizeTarget(haloA, haloWidth, haloHeight);
        sizeTarget(haloB, haloWidth, haloHeight);
      },
      draw(frame) {
        if (disposed) return;
        gl.bindVertexArray(vao);
        gl.disable(gl.BLEND);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fieldTarget.framebuffer);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
        gl.viewport(0, 0, fieldTarget.width, fieldTarget.height);
        gl.useProgram(field.program);
        const fu = field.uniforms;
        gl.uniform1f(fu.uAspect, width / height);
        gl.uniform1f(fu.uTime, frame.time * 0.35);
        gl.uniform1i(fu.uShape, 0);
        gl.uniform3fv(fu.uRamp, ramp);
        gl.uniform1i(fu.uCount, paletteSize);
        gl.uniform1f(fu.uScale, 1.05);
        gl.uniform1f(fu.uSoftness, 0.7);
        gl.uniform1f(fu.uFlow, 0.8);
        gl.uniform2f(fu.uSeed, 6.657, 4.011);
        gl.uniform4fv(fu.uTrail, frame.trail);
        gl.uniform1f(fu.uRadius, 0.12);
        gl.uniform4fv(fu.uClicks, frame.clicks);
        gl.uniform1i(fu.uClickEffect, 1);
        gl.uniform1f(fu.uIntro, frame.intro);
        gl.uniform1f(fu.uFrame, frame.seed);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        gl.bindFramebuffer(gl.FRAMEBUFFER, haloA.framebuffer);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
        gl.viewport(0, 0, haloA.width, haloA.height);
        gl.useProgram(halo.program);
        bindGlyphs(halo, frame);
        gl.uniform1f(halo.uniforms.uDownscale, canvas.width / haloA.width);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.useProgram(blur.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(blur.uniforms.uSource, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, haloB.framebuffer);
        gl.bindTexture(gl.TEXTURE_2D, haloA.textures[0]);
        gl.uniform2f(blur.uniforms.uStep, 1 / haloA.width, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindFramebuffer(gl.FRAMEBUFFER, haloA.framebuffer);
        gl.bindTexture(gl.TEXTURE_2D, haloB.textures[0]);
        gl.uniform2f(blur.uniforms.uStep, 0, 1 / haloA.height);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(composite.program);
        bindGlyphs(composite, frame);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, haloA.textures[0]);
        const cu = composite.uniforms;
        gl.uniform1i(cu.uHalo, 3);
        gl.uniform1f(cu.uGlow, 0.12);
        gl.uniform1f(cu.uGradient, light ? 0.18 : 0.24);
        gl.uniform1f(cu.uGrain, frame.still ? 0 : 0.018);
        gl.uniform1f(cu.uFrame, frame.seed);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      dispose,
    };
  } catch {
    dispose();
    return null;
  }
}
