// Importing utilities from 'utils.js'
import { reducedMotion } from '../utils.js';
// The trail engine: it follows the pointer and says which image to show next, and where
import { Trail, fillPool } from '../trail.js';
// The WebGL stage: canvas, camera and planes, plus shader helpers shared by the WebGL variations
import { Stage, coverUV } from '../webgl/stage.js';
import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  vec2,
  vec3,
  vec4,
  float,
  texture,
  uniform,
  screenUV,
  abs,
  min,
  max,
  clamp,
  length,
  exp,
  log,
  mix,
  smoothstep,
} from 'three/tsl';

// The reach of an image's goo, in pixels: two images merge once they're closer than about 1.4 times this
const GOO = 40;
// How blurry the goo gets, as a mipmap level of the textures (every level halves the sharpness)
const BLUR = 4.5;
// Where hidden images wait, far outside the viewport, so they don't touch anything
const AWAY = -100000;

/**
 * The color of an image at the point of it nearest to p (so outside the image, its edge color), blurred to the given level.
 * Reading a texture at an explicit level is also what allows it inside a branch.
 * @param {Object} image - The image: texture, aspect ratios and uniforms.
 * @param {Node} p - The pixel, in viewport pixels.
 * @param {Node} lod - How blurred: 0 is sharp, every 1 halves the sharpness.
 * @returns {Node} - The color.
 */
const sample = (image, p, lod) => {
  const { rect } = image.uniforms;
  const half = rect.zw;
  const inside = clamp(p.sub(rect.xy), half.negate(), half);
  // In the image's own coordinates, 0 to 1 with y up
  const st = vec2(
    inside.x.div(half.x.mul(2)).add(0.5),
    float(0.5).sub(inside.y.div(half.y.mul(2))),
  );
  return texture(image.texture, coverUV(st, image.width / image.height, image.imageAspect)).level(
    lod,
  ).rgb;
};

/**
 * The gooey material, drawn once over the whole viewport.
 * Every image radiates a field: 1 on its outline, stronger inside, fading out over 'GOO' pixels outside. Where the fields of
 * nearby images add up to 1 or more they form one shape, like drops of a liquid: a neck grows between two images as they come
 * close, thickens, and stretches thin before it snaps as they part.
 * Inside an image the topmost one shows, sharp, except where goo reaches in from a neighbour. The goo itself is blurred, the
 * colors of the nearby images running together, and an image blurs as it shrinks into a drop and melts into the others.
 * Images appear and leave by growing out of and shrinking into a drop, never by fading, so nothing shows through anything.
 * @param {Array} images - Per image: texture, imageAspect, width, height, radius, and uniforms rect (center x and y, half width and height, in viewport pixels, y down), order (higher is on top) and opacity.
 * @param {Object} viewport - Uniform with the viewport size in CSS pixels.
 * @returns {Object} - The material.
 */
const createGooeyMaterial = (images, viewport) => {
  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  material.colorNode = Fn(() => {
    // This pixel, in viewport pixels from the top left
    const p = screenUV.mul(viewport);
    const goo = float(GOO);

    const field = float(0).toVar(); // the images' fields added up
    const topIndex = float(-1).toVar(); // the topmost image this pixel is inside, if any
    const topOrder = float(-1).toVar();

    const distances = images.map((image, i) => {
      const { rect, order } = image.uniforms;
      const half = rect.zw;
      // Signed distance to the image's rounded rectangle (its corners round off completely as it shrinks into a drop)
      const radius = min(float(image.radius), min(half.x, half.y));
      const q = abs(p.sub(rect.xy)).sub(half).add(radius);
      const distance = length(max(q, 0))
        .add(min(max(q.x, q.y), 0))
        .sub(radius)
        .toVar();

      field.addAssign(exp(max(distance, goo.mul(-4)).div(goo).negate()));
      If(distance.lessThan(0).and(order.greaterThan(topOrder)), () => {
        topOrder.assign(order);
        topIndex.assign(i);
      });
      return distance;
    });

    const color = vec3(0).toVar();
    const gooeyness = float(1).toVar(); // 0 sharp, 1 all goo
    const opacity = float(1).toVar();

    // Far from every image the field is too weak to show, so the colors are skipped.
    If(field.greaterThan(0.3), () => {
      If(topIndex.greaterThanEqual(0), () => {
        images.forEach((image, i) => {
          If(topIndex.equal(i), () => {
            // The goo of the other images reaching in, near this image's edge only
            const others = float(0).toVar();
            images.forEach((other, j) => {
              if (j !== i) others.addAssign(exp(max(distances[j], 0).div(goo).negate()));
            });
            const nearEdge = float(1).sub(smoothstep(0, goo.mul(0.6), distances[i].negate()));
            // 0 at full size, nearly 1 once it's a drop
            const melt = float(1).sub(image.uniforms.rect.z.div(image.width / 2));
            gooeyness.assign(max(nearEdge.mul(clamp(others, 0, 1)), melt));
            color.assign(sample(image, p, gooeyness.mul(BLUR)));
            opacity.assign(image.uniforms.opacity);
          });
        });
      }).Else(() => {
        // In the goo between images: the nearby images' colors, blurred, mixed by the strength of their fields
        const sum = vec3(0).toVar();
        const weight = float(0).toVar();
        images.forEach((image, i) => {
          const w = exp(distances[i].div(goo).negate());
          If(w.greaterThan(0.02), () => {
            sum.addAssign(sample(image, p, float(BLUR)).mul(w));
            weight.addAssign(w);
          });
        });
        color.assign(sum.div(max(weight, 0.0001)));
      });
    });

    // The field turned back into a distance in pixels (exact around a single image), with the outline at 0.
    // The edge is smoothed over about a pixel, and softer where it's goo.
    const distance = log(max(field, 0.000001)).mul(goo).negate();
    const softness = mix(0.5, 2.5, gooeyness);
    const alpha = float(1)
      .sub(smoothstep(softness.negate(), softness, distance))
      .mul(opacity);
    return vec4(color, alpha);
  })();

  return material;
};

export class ImageTrail {
  // Class properties initialization
  DOM = { el: null }; // Object to hold DOM elements
  stage = null; // The WebGL stage
  surface = null; // The plane over the whole viewport that the material draws on
  viewport = uniform(new THREE.Vector2()); // Viewport size in CSS pixels
  images = []; // Array to store the images: position, scale, uniforms and timeline of each
  // Mouse distance from the previous trigger, required to show the next image
  threshold = 130;
  // Whether anything was drawn in the last frame
  isDrawing = false;

  /**
   * Constructor for the ImageTrail class.
   * @param {HTMLElement} DOM_el - The parent DOM element containing all image elements.
   */
  constructor(DOM_el) {
    // Store the reference to the parent DOM element.
    this.DOM.el = DOM_el;
    this.stage = new Stage(this.DOM.el);
  }

  /**
   * Sets up WebGL, loads the images, creates the surface, compiles the shader and starts the rendering loop.
   * Throws if neither WebGPU nor WebGL 2 is available.
   * @returns {Promise}
   */
  async init() {
    await this.stage.init();

    // Twelve images, a few more than there are pictures, so one is rarely taken back while it's still showing.
    // Not twenty like the others: the shader goes through every image for every pixel.
    this.images = await Promise.all(
      fillPool(this.DOM.el, 12).map(async (el) => {
        const image = await this.stage.loadImage(el);
        image.uniforms = {
          rect: uniform(new THREE.Vector4(AWAY, AWAY, 0, 0)),
          order: uniform(0),
          opacity: uniform(1),
        };
        // Position and scale, tweened by GSAP and copied into the rect uniform every frame
        image.state = { x: AWAY, y: AWAY, scale: 0 };
        image.timeline = null;
        image.visible = false;
        return image;
      }),
    );

    this.surface = this.stage.addPlane(createGooeyMaterial(this.images, this.viewport), 1, 1);
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Compiling hides every mesh afterwards, so show the surface again: it's always drawn, and the images in it come and go.
    await this.stage.compile();
    this.surface.visible = true;

    // The engine follows the pointer, calls showNextImage every time it has travelled far enough, and render every frame.
    this.trail = new Trail(this.DOM.el, {
      space: 'viewport',
      size: this.images.length,
      threshold: this.threshold,
      onImage: (step) => this.showNextImage(step),
      onFrame: () => this.render(),
    });
  }

  /**
   * Stretches the surface over the whole viewport.
   * @returns {void}
   */
  resize() {
    const { width, height } = this.stage.size;
    this.viewport.value.set(width, height);
    this.surface.scale.set(width, height, 1);
    this.surface.position.set(width / 2, -height / 2, 0);
  }

  /**
   * The `render` function runs every frame, after the engine has shown any new images: it updates the images' uniforms, then draws the surface.
   * @returns {void}
   */
  render() {
    // With reduced motion images don't move, so they're spaced out enough not to overlap.
    this.trail.threshold = reducedMotion.matches ? this.images[0].height * 1.3 : this.threshold;

    // Copy every image's position and size into its uniform.
    this.images.forEach((image) => {
      const { x, y, scale } = image.state;
      image.uniforms.rect.value.set(x, y, (image.width / 2) * scale, (image.height / 2) * scale);
    });

    // Draw while any image is showing, plus one last frame to clear the canvas once they're all gone.
    const drawing = this.images.some((image) => image.visible);
    if (drawing || this.isDrawing) {
      this.stage.render();
    }
    this.isDrawing = drawing;
  }

  /**
   * The `showNextImage` function is responsible for displaying, animating, and managing the next image in the sequence.
   * The engine (js/trail.js) calls it every time the pointer has travelled far enough, with the image to show and where.
   * @param {Object} step - index (which image), zIndex, from (the trailing position) and to (where the image goes), in viewport pixels.
   * @returns {void}
   */
  showNextImage({ index, zIndex, from, to }) {
    // Retrieve the image for this step.
    const image = this.images[index];
    const { state, uniforms } = image;

    // Stop the image's ongoing animation and put it on top.
    image.timeline?.kill();
    image.visible = true;
    uniforms.order.value = zIndex;
    uniforms.opacity.value = 1;

    // Once gone, the image waits far away, so it doesn't pull on the others.
    const hide = () => {
      image.visible = false;
      Object.assign(state, { x: AWAY, y: AWAY, scale: 0 });
    };

    // With reduced motion, the image simply fades in and out at the mouse position.
    if (reducedMotion.matches) {
      Object.assign(state, { x: to.x, y: to.y, scale: 1 });
      image.timeline = gsap
        .timeline({ onComplete: hide })
        .fromTo(uniforms.opacity, { value: 0 }, { duration: 0.3, ease: 'power1', value: 1 }, 0)
        .to(uniforms.opacity, { duration: 0.6, ease: 'power1', value: 0 }, 0.5);
      return;
    }

    // Define GSAP timeline.
    image.timeline = gsap
      .timeline({ onComplete: hide })
      // Slide from the trailing position to the mouse...
      .fromTo(
        state,
        {
          x: from.x,
          y: from.y,
        },
        {
          duration: 1.1,
          ease: 'expo',
          x: to.x,
          y: to.y,
        },
        0,
      )
      // ...swelling out of a drop, with a liquid wobble
      .fromTo(
        state,
        {
          scale: 0.05,
        },
        {
          duration: 0.9,
          ease: 'elastic.out(1, 0.6)',
          scale: 1,
        },
        0,
      )
      // then shrink back into a drop that the others soak up
      .to(
        state,
        {
          duration: 0.7,
          ease: 'power2.in',
          scale: 0.02,
        },
        1,
      );
  }
}
