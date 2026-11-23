// Importing utilities from 'utils.js'
import { reducedMotion } from '../utils.js';
// The trail engine: it follows the pointer and says which image to show next, and where
import { Trail, fillPool } from '../trail.js';
// The WebGL stage: canvas, camera and planes, plus shader helpers shared by the WebGL variations
import { Stage, coverUV, roundedRect } from '../webgl/stage.js';
import * as THREE from 'three/webgpu';
import { uv, vec2, vec3, float, texture, uniform, attribute, positionGeometry, dot, sin, cos, clamp, oneMinus, vertexStage } from 'three/tsl';

// Size of a grain of dust, in pixels
const GRAIN = 4;

/**
 * A plane made of separate little squares (two triangles each), so every square can move on its own.
 * Every vertex also knows the center of its square ('cell') and a random number shared by the square ('seed').
 * Put together, the squares cover the plane exactly, so the image looks whole.
 * @param {number} columns - Squares across.
 * @param {number} rows - Squares down.
 * @returns {Object} - The geometry, 1×1 like a PlaneGeometry.
 */
const createDustGeometry = (columns, rows) => {
    const count = columns * rows * 6;
    const position = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);
    const cell = new Float32Array(count * 2);
    const seed = new Float32Array(count);

    let v = 0;
    for (let j = 0; j < rows; ++j) {
        for (let i = 0; i < columns; ++i) {
            const x0 = i / columns - 0.5, x1 = (i + 1) / columns - 0.5;
            const y0 = j / rows - 0.5, y1 = (j + 1) / rows - 0.5;
            const random = Math.random();
            // Two triangles, counter-clockwise
            for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y0], [x1, y1], [x0, y1]]) {
                position.set([x, y, 0], v * 3);
                uvs.set([x + 0.5, y + 0.5], v * 2);
                cell.set([(x0 + x1) / 2, (y0 + y1) / 2], v * 2);
                seed[v] = random;
                ++v;
            }
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute('cell', new THREE.BufferAttribute(cell, 2));
    geometry.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    return geometry;
};

/**
 * The dust material: the image gathers out of a cloud of grains blown in along the movement,
 * then comes apart into dust that the same wind carries off, starting at its trailing edge.
 * @param {Object} image - The texture, the image's aspect ratio, and the plane's width, height and corner radius in pixels.
 * @param {Object} uniforms - gather (1 to 0, the grains coming together), scatter (0 to 1, the grains blowing away), wind (the movement's direction, y up) and opacity.
 * @returns {Object} - The material.
 */
const createDustMaterial = (image, uniforms) => {
    const material = new THREE.MeshBasicNodeMaterial({transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide});
    const size = vec2(image.width, image.height);

    const cell = attribute('cell', 'vec2');
    const seed = attribute('seed', 'float');
    const wind = uniforms.wind;

    // The square's center in pixels, and how far back it sits along the wind: 0 on the leading edge, 1 on the trailing one
    const center = cell.mul(size);
    const extent = wind.x.abs().mul(image.width).add(wind.y.abs().mul(image.height)).mul(0.5);
    const behind = dot(center, wind.negate()).add(extent).div(extent.mul(2)).clamp(0, 1);

    // Scatter: the trailing edge goes first and the rest follows, each square a little early or late.
    // Every square has blown away completely by the time scatter reaches 1.
    const delay = oneMinus(behind).mul(0.55).add(seed.mul(0.3));
    const t = clamp(uniforms.scatter.mul(1.2).sub(delay).div(0.35), 0, 1);
    // Gather: the reverse, squares landing at slightly different times
    const g = clamp(uniforms.gather.mul(1.6).sub(seed.mul(0.6)), 0, 1);

    // Each square drifts on a curve of its own: along the wind, swirling a little sideways.
    const swirl = vec2(sin(seed.mul(41).add(t.mul(3))), cos(seed.mul(23).add(t.mul(2.5))));
    const blown = wind.mul(t.mul(170).add(t.mul(t).mul(220))).add(swirl.mul(t).mul(35)).add(vec2(0, t.mul(25)));
    // Before landing, squares are spread out behind the image, along where the movement came from.
    const arriving = wind.mul(g.mul(g).mul(-200)).add(swirl.mul(g).mul(90));

    // Squares shrink to grains and spin as they fly.
    const grain = float(1).sub(t.mul(0.7)).mul(float(1).sub(g.mul(0.6)));
    const angle = seed.sub(0.5).mul(t.add(g)).mul(6);
    const corner = positionGeometry.xy.sub(cell).mul(size).mul(grain);
    const turned = vec2(corner.x.mul(cos(angle)).sub(corner.y.mul(sin(angle))), corner.x.mul(sin(angle)).add(corner.y.mul(cos(angle))));

    material.positionNode = vec3(center.add(turned).add(blown).add(arriving).div(size), 0);

    // A square fades as it blows away (slowly at first, so it's seen travelling), and fades in as it lands.
    const alpha = vertexStage(float(1).sub(t.mul(t)).mul(float(1).sub(g)));

    const st = uv();
    material.colorNode = texture(image.texture, coverUV(st, image.width / image.height, image.imageAspect)).rgb;
    material.opacityNode = roundedRect(st, size, float(image.radius)).mul(alpha).mul(uniforms.opacity);

    return material;
};

export class ImageTrail {
    // Class properties initialization
    DOM = {el: null}; // Object to hold DOM elements
    stage = null; // The WebGL stage
    planes = []; // Array to store the planes: mesh, uniforms, size and timeline of each image
    // Mouse distance from the previous trigger, required to show the next image
    threshold = 110;
    // Whether any plane was drawn in the last frame
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
     * Sets up WebGL, creates a plane for each image element, compiles the shaders and starts the rendering loop.
     * The canvas covers the viewport, so planes are placed at the mouse position directly (no offset to subtract).
     * Throws if neither WebGPU nor WebGL 2 is available.
     * @returns {Promise}
     */
    async init() {
        await this.stage.init();

        // Twice as many images as there are pictures, so an image is never taken back while it's still showing
        const elements = fillPool(this.DOM.el, 20);
        // Every image has the same size, so they share one grid of grains.
        const geometry = createDustGeometry(Math.round(elements[0].offsetWidth / GRAIN), Math.round(elements[0].offsetHeight / GRAIN));

        this.planes = await Promise.all(elements.map(async el => {
            const image = await this.stage.loadImage(el);
            const uniforms = {
                gather: uniform(0),
                scatter: uniform(0),
                wind: uniform(new THREE.Vector2(1, 0)),
                opacity: uniform(1)
            };
            const mesh = this.stage.addPlane(createDustMaterial(image, uniforms), image.width, image.height, geometry);
            return {mesh, uniforms, width: image.width, height: image.height, timeline: null};
        }));

        await this.stage.compile();

        // The engine follows the pointer, calls showNextImage every time it has travelled far enough, and render every frame.
        this.trail = new Trail(this.DOM.el, {
            space: 'viewport',
            size: this.planes.length,
            threshold: this.threshold,
            onImage: step => this.showNextImage(step),
            onFrame: frame => this.render(frame)
        });
    }

    /**
     * The `render` function runs every frame, after the engine has shown any new images: it draws the planes.
     * @returns {void}
     */
    render() {
        // Draw while any plane is showing, plus one last frame to clear the canvas once they're all gone.
        const drawing = this.planes.some(plane => plane.mesh.visible);
        if ( drawing || this.isDrawing ) {
            this.stage.render();
        }
        this.isDrawing = drawing;
    }

    /**
     * The `showNextImage` function is responsible for displaying, animating, and managing the next image in the sequence.
     * The engine (js/trail.js) calls it every time the pointer has travelled far enough, with the image to show and where.
     * @param {Object} step - index (which plane), zIndex, from (the trailing position), to (where the image goes) and lead (the pointer's lead over the trailing position, its direction and speed), in viewport pixels.
     * @returns {void}
     */
    showNextImage({index, zIndex, from, to, lead}) {
        // Retrieve the plane for this step.
        const plane = this.planes[index];
        const {mesh, uniforms, width, height} = plane;

        // Stop the plane's ongoing animation, then draw it above the others.
        plane.timeline?.kill();
        mesh.renderOrder = zIndex;
        mesh.visible = true;
        mesh.scale.set(width, height, 1);
        uniforms.opacity.value = 1;

        // With reduced motion, the image simply fades in and out at the mouse position, whole.
        if ( reducedMotion.matches ) {
            uniforms.gather.value = 0;
            uniforms.scatter.value = 0;
            mesh.position.set(to.x, -to.y, 0);
            plane.timeline = gsap.timeline({onComplete: () => mesh.visible = false})
            .fromTo(uniforms.opacity, {value: 0}, {duration: 0.3, ease: 'power1', value: 1}, 0)
            .to(uniforms.opacity, {duration: 0.6, ease: 'power1', value: 0}, 0.5);
            return;
        }

        // The wind blows the way the mouse moves (in the plane's axes, where y goes up).
        const dx = lead.x;
        const dy = lead.y;
        const length = Math.hypot(dx, dy) || 1;
        uniforms.wind.value.set(dx / length, -dy / length);

        // Define GSAP timeline. The plane is hidden again once it has blown away.
        plane.timeline = gsap.timeline({onComplete: () => mesh.visible = false})
        .fromTo(mesh.position, {
            x: from.x,
            y: -from.y
        }, {
            duration: 1.2,
            ease: 'expo',
            x: to.x,
            y: -to.y
        }, 0)
        // Gather out of the dust
        .fromTo(uniforms.gather, {
            value: 1
        }, {
            duration: 0.9,
            ease: 'power3',
            value: 0
        }, 0)
        // then blow away
        .fromTo(uniforms.scatter, {
            value: 0
        }, {
            duration: 1.6,
            ease: 'power1.in',
            value: 1
        }, 0.75)
    }
}
