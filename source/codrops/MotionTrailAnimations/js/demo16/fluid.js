import * as THREE from 'three/webgpu';
import { Fn, vec2, vec4, texture, uniform, screenUV, exp, dot, abs, length } from 'three/tsl';

/**
 * A small fluid simulation over the viewport, in the 'stable fluids' way: the mouse stirs the velocity, swirls are kept alive
 * (vorticity confinement), the flow is made incompressible (a pressure solve), then everything is carried along by itself (advection).
 * It also keeps a displacement map: for every point, where the picture there has been carried from. The flow carries the map
 * along with itself, so where the fluid swirls the pictures twist into spirals, like paint stirred in water; the map relaxes
 * back to nothing as the water calms.
 * Every step is a full-screen pass drawn into a texture; pairs of textures take turns being read and written.
 * Velocities are in CSS pixels per frame (at 60fps), x to the right and y down, like the mouse.
 */
export class Fluid {
  // How much of the velocity remains after each frame (at 60fps)
  velocityDissipation = 0.985;
  // How much of the displacement remains after each frame (at 60fps): lower and the pictures straighten out sooner
  relax = 0.965;
  // How much of the last frame's pressure the solver starts from
  pressureDecay = 0.8;
  // Solver iterations: more makes a more convincing fluid, and costs more
  pressureIterations = 12;
  // How strongly swirls are kept alive
  curl = 0.08;
  // Radius of the mouse's stir, as a fraction of the viewport height
  radius = 0.08;
  // The velocity is simulated this many times smaller than the viewport, the displacement this many
  resolution = 4;
  displacementResolution = 2;

  /**
   * Constructor for the Fluid class.
   * @param {Object} renderer - The WebGPURenderer.
   */
  constructor(renderer) {
    this.renderer = renderer;

    // Half floats, because velocities and pressures can be negative and bigger than 1
    const options = { type: THREE.HalfFloatType, depthBuffer: false };
    const target = () => new THREE.RenderTarget(1, 1, options);
    this.velocity = [target(), target()];
    this.pressure = [target(), target()];
    this.displacement = [target(), target()];
    this.divergence = target();
    this.curlTarget = target();

    this.uniforms = {
      texel: uniform(new THREE.Vector2()), // the size of a velocity texel, in screenUV units
      viewport: uniform(new THREE.Vector2()), // viewport size in CSS pixels
      mouse: uniform(new THREE.Vector2()), // 0 to 1 from the top left, like screenUV
      force: uniform(new THREE.Vector2()), // the mouse's movement this frame, in CSS pixels
      aspect: uniform(1),
      radius: uniform(this.radius),
      curl: uniform(this.curl),
      velocityDissipation: uniform(this.velocityDissipation),
      relax: uniform(this.relax),
      pressureDecay: uniform(this.pressureDecay),
      dt: uniform(1),
    };

    // The latest displacement, which the images read at their own pixels to know where their picture has been carried
    this.displacementNode = texture(this.displacement[0].texture, screenUV);

    this.createPasses();
  }

  /**
   * A pass: a quad over the whole target, with a material that computes one step of the simulation.
   * The textures a pass reads are built into its material, so every combination of textures it's used with
   * (the pairs swap every frame) gets a material of its own, made the first time it's needed.
   * @param {Function} build - Gets the textures by name and returns the step's output node.
   * @returns {Function} - Gets the textures by name and returns the quad to draw.
   */
  pass(build) {
    const variants = new Map();
    return (textures) => {
      const key = Object.values(textures)
        .map((value) => value.uuid)
        .join();
      if (!variants.has(key)) {
        const material = new THREE.NodeMaterial();
        // Write the values as they are, without blending them with what's in the target
        material.blending = THREE.NoBlending;
        material.depthTest = false;
        material.fragmentNode = Fn(() => build(textures))();
        variants.set(key, new THREE.QuadMesh(material));
      }
      return variants.get(key);
    };
  }

  /**
   * Builds the passes.
   * @returns {void}
   */
  createPasses() {
    const {
      texel,
      viewport,
      mouse,
      force,
      aspect,
      radius,
      curl,
      velocityDissipation,
      relax,
      pressureDecay,
      dt,
    } = this.uniforms;
    const st = screenUV;
    // The neighbouring points: left, right, up (on screen) and down
    const left = st.sub(vec2(texel.x, 0));
    const right = st.add(vec2(texel.x, 0));
    const up = st.sub(vec2(0, texel.y));
    const down = st.add(vec2(0, texel.y));
    // Reads a texture at a point
    const read = (value) => (point) => texture(value, point);

    // The mouse pushes the fluid where it is, the push fading out smoothly around it.
    this.splat = this.pass(({ velocity }) => {
      const toMouse = st.sub(mouse).mul(vec2(aspect, 1));
      const stir = exp(dot(toMouse, toMouse).div(radius.mul(radius)).negate());
      return vec4(texture(velocity, st).xy.add(force.mul(stir)), 0, 1);
    });

    // How much the fluid turns at every point (its curl), with y flipped to point up, as the formulas expect
    this.curlPass = this.pass(({ velocity }) => {
      const v = read(velocity);
      const value = v(left).y.sub(v(right).y).sub(v(up).x).add(v(down).x);
      return vec4(value.mul(0.5), 0, 0, 1);
    });

    // Vorticity confinement: pushes along every swirl, so swirls don't fade away into a smooth flow.
    this.vorticity = this.pass(({ velocity, curl: curlTexture }) => {
      const c = read(curlTexture);
      const push = vec2(abs(c(up).x).sub(abs(c(down).x)), abs(c(right).x).sub(abs(c(left).x))).mul(
        0.5,
      );
      const direction = push.div(length(push).add(0.0001)).mul(curl).mul(c(st).x);
      return vec4(texture(velocity, st).xy.add(direction.mul(dt)), 0, 1);
    });

    // How much fluid flows out of every point
    this.divergencePass = this.pass(({ velocity }) => {
      const v = read(velocity);
      return vec4(v(right).x.sub(v(left).x).add(v(down).y).sub(v(up).y).mul(0.5), 0, 0, 1);
    });

    // The solver starts from a part of the last frame's pressure.
    this.clearPass = this.pass(({ pressure }) =>
      vec4(texture(pressure, st).x.mul(pressureDecay), 0, 0, 1),
    );

    // One step of the pressure solve (Jacobi): run several times, it finds the pressure that cancels the outflow.
    this.jacobi = this.pass(({ pressure, divergence }) => {
      const p = read(pressure);
      const sum = p(left).x.add(p(right).x).add(p(up).x).add(p(down).x);
      return vec4(sum.sub(texture(divergence, st).x).mul(0.25), 0, 0, 1);
    });

    // Subtracting the pressure's slope leaves a flow that neither gathers nor thins out anywhere, like water.
    this.gradient = this.pass(({ velocity, pressure }) => {
      const p = read(pressure);
      const slope = vec2(p(right).x.sub(p(left).x), p(down).x.sub(p(up).x)).mul(0.5);
      return vec4(texture(velocity, st).xy.sub(slope), 0, 1);
    });

    // Advection: every point takes what was upstream of it, carried by the flow, a little faded.
    this.advect = this.pass(({ velocity }) => {
      const from = st.sub(texture(velocity, st).xy.mul(dt).div(viewport));
      return vec4(texture(velocity, from).xy.mul(velocityDissipation), 0, 1);
    });

    // The displacement map, carried along by the flow, plus this frame's movement, relaxing a little
    this.advectDisplacement = this.pass(({ velocity, displacement }) => {
      const moved = texture(velocity, st).xy.mul(dt);
      const from = st.sub(moved.div(viewport));
      return vec4(texture(displacement, from).xy.add(moved).mul(relax), 0, 1);
    });
  }

  /**
   * Matches the textures to the viewport.
   * @param {number} width - Viewport width in CSS pixels.
   * @param {number} height - Viewport height in CSS pixels.
   * @returns {void}
   */
  resize(width, height) {
    const w = Math.ceil(width / this.resolution);
    const h = Math.ceil(height / this.resolution);
    [...this.velocity, ...this.pressure, this.divergence, this.curlTarget].forEach((target) =>
      target.setSize(w, h),
    );
    this.displacement.forEach((target) =>
      target.setSize(
        Math.ceil(width / this.displacementResolution),
        Math.ceil(height / this.displacementResolution),
      ),
    );
    this.uniforms.texel.value.set(1 / w, 1 / h);
    this.uniforms.viewport.value.set(width, height);
    this.uniforms.aspect.value = width / height;
  }

  /**
   * Draws a pass, reading the given textures, into a target.
   * @param {Function} pass - The pass.
   * @param {Object} textures - The textures it reads, by name.
   * @param {Object} target - The render target to draw into.
   * @returns {void}
   */
  run(pass, textures, target) {
    this.renderer.setRenderTarget(target);
    pass(textures).render(this.renderer);
  }

  /**
   * Runs one frame of the simulation.
   * @param {Object} mouse - Mouse position in CSS pixels.
   * @param {Object} force - Mouse movement since the last frame, in CSS pixels (per frame at 60fps).
   * @param {number} dt - Duration of this frame relative to a frame at 60fps.
   * @returns {void}
   */
  step(mouse, force, dt) {
    const { uniforms, velocity, pressure, displacement } = this;
    const viewport = uniforms.viewport.value;
    uniforms.mouse.value.set(mouse.x / viewport.x, mouse.y / viewport.y);
    uniforms.force.value.set(force.x, force.y);
    uniforms.dt.value = dt;
    uniforms.velocityDissipation.value = Math.pow(this.velocityDissipation, dt);
    uniforms.relax.value = Math.pow(this.relax, dt);

    // Each pair is read from [0] and written to [1], then swapped, so [0] always holds the latest.
    const swap = (pair) => pair.reverse();

    this.run(this.splat, { velocity: velocity[0].texture }, velocity[1]);
    swap(velocity);
    this.run(this.curlPass, { velocity: velocity[0].texture }, this.curlTarget);
    this.run(
      this.vorticity,
      { velocity: velocity[0].texture, curl: this.curlTarget.texture },
      velocity[1],
    );
    swap(velocity);
    this.run(this.divergencePass, { velocity: velocity[0].texture }, this.divergence);
    this.run(this.clearPass, { pressure: pressure[0].texture }, pressure[1]);
    swap(pressure);
    for (let i = 0; i < this.pressureIterations; ++i) {
      this.run(
        this.jacobi,
        { pressure: pressure[0].texture, divergence: this.divergence.texture },
        pressure[1],
      );
      swap(pressure);
    }
    this.run(
      this.gradient,
      { velocity: velocity[0].texture, pressure: pressure[0].texture },
      velocity[1],
    );
    swap(velocity);
    this.run(this.advect, { velocity: velocity[0].texture }, velocity[1]);
    swap(velocity);
    this.run(
      this.advectDisplacement,
      { velocity: velocity[0].texture, displacement: displacement[0].texture },
      displacement[1],
    );
    swap(displacement);

    this.renderer.setRenderTarget(null);
    this.displacementNode.value = displacement[0].texture;
  }
}
