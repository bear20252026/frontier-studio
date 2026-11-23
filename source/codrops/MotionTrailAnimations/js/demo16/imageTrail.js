// Importing utilities from 'utils.js'
import { reducedMotion } from '../utils.js';
// The trail engine: it follows the pointer and says which image to show next, and where
import { Trail, fillPool } from '../trail.js';
// The WebGL stage: canvas, camera and planes, plus shader helpers shared by the WebGL variations
import { Stage, coverUV, roundedRect } from '../webgl/stage.js';
// The fluid the mouse stirs
import { Fluid } from './fluid.js';
import * as THREE from 'three/webgpu';
import { uv, vec2, vec3, float, texture, uniform, length, min, max } from 'three/tsl';

// Room around each image, in pixels, so its outline can be swirled out beyond its box
const PADDING = 70;

/**
 * The swirl material: every pixel shows the picture from where the fluid has carried it, so where the mouse's eddies turn,
 * the image twists into spirals, picture and outline alike, with the colors pulled slightly apart along the way.
 * @param {Object} image - The texture, the image's aspect ratio, and the image's width, height and corner radius in pixels.
 * @param {Object} uniforms - opacity.
 * @param {Object} displacement - The fluid's displacement map, as a texture node read at the pixel being drawn.
 * @returns {Object} - The material.
 */
const createSwirlMaterial = (image, uniforms, displacement) => {
    const material = new THREE.MeshBasicNodeMaterial({transparent: true, depthTest: false, depthWrite: false});

    const size = vec2(image.width, image.height);
    // The plane is bigger than the image by the padding on every side: these are the coordinates across the image itself.
    const padded = vec2(image.width + PADDING * 2, image.height + PADDING * 2);
    const st = uv().sub(0.5).mul(padded.div(size)).add(0.5);

    // How far the fluid has carried this pixel's picture (a little less than the water itself), in CSS pixels,
    // never more than 70 for a 165 pixel wide image (in proportion to the image's width, so a smaller image twists just as much)
    const scale = image.width / 165;
    const carried = displacement.xy.mul(0.6 * scale);
    const shove = carried.mul(min(float(1), float(70 * scale).div(max(length(carried), 0.001))));
    // In the image's coordinates, where y goes up
    const shift = vec2(shove.x, shove.y.negate()).div(size);

    // The picture comes from where it was carried from. Red is carried slightly further than green, blue slightly less.
    const sample = amount => texture(image.texture, coverUV(st.sub(shift.mul(amount)), image.width / image.height, image.imageAspect));
    material.colorNode = vec3(sample(1.08).r, sample(1).g, sample(0.92).b);

    // The outline is carried too, a little less than the picture.
    material.opacityNode = roundedRect(st.sub(shift.mul(0.85)), size, float(image.radius)).mul(uniforms.opacity);

    return material;
};

export class ImageTrail {
    // Class properties initialization
    DOM = {el: null}; // Object to hold DOM elements
    stage = null; // The WebGL stage
    fluid = null; // The fluid the mouse stirs
    planes = []; // Array to store the planes: mesh, uniforms, size and timeline of each image
    // Mouse distance from the previous trigger, required to show the next image
    threshold = 90;
    // Whether anything was drawn in the last frame
    isDrawing = false;
    // The time the mouse last moved
    lastMoveTime = -Infinity;

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
     * Sets up WebGL and the fluid, creates a plane for each image element, compiles the shaders and starts the rendering loop.
     * The canvas covers the viewport, so planes are placed at the mouse position directly (no offset to subtract).
     * Throws if neither WebGPU nor WebGL 2 is available.
     * @returns {Promise}
     */
    async init() {
        await this.stage.init();

        this.fluid = new Fluid(this.stage.renderer);
        this.fluid.resize(this.stage.size.width, this.stage.size.height);
        window.addEventListener('resize', () => this.fluid.resize(this.stage.size.width, this.stage.size.height));

        // Twice as many planes as there are pictures, so a plane is never taken back while it's still showing
        this.planes = await Promise.all(fillPool(this.DOM.el, 20).map(async el => {
            const image = await this.stage.loadImage(el);
            const uniforms = {
                opacity: uniform(1)
            };
            // The plane's size includes the padding around the image.
            const width = image.width + PADDING * 2;
            const height = image.height + PADDING * 2;
            const mesh = this.stage.addPlane(createSwirlMaterial(image, uniforms, this.fluid.displacementNode), width, height);
            return {mesh, uniforms, width, height, timeline: null};
        }));

        await this.stage.compile();
        // Run one frame of the fluid while the loader still shows, so its passes are compiled too.
        this.fluid.step({x: 0, y: 0}, {x: 0, y: 0}, 1);

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
     * The `render` function runs every frame, after the engine has shown any new images: it stirs the fluid, then draws the planes.
     * @param {Object} frame - From the engine: dt, moved and movement (the pointer's movement this frame).
     * @returns {void}
     */
    render(frame) {
        this.stir(frame);

        // Draw while any plane is showing, plus one last frame to clear the canvas once they're all gone.
        const drawing = this.planes.some(plane => plane.mesh.visible);
        if ( drawing || this.isDrawing ) {
            this.stage.render();
        }
        this.isDrawing = drawing;
    }

    /**
     * The mouse's movement this frame stirs the fluid. With reduced motion there's no stir at all.
     * @param {Object} frame - From the engine: dt (this frame's duration relative to a frame at 60fps), moved, and movement (the pointer's movement this frame, per frame at 60fps).
     * @returns {void}
     */
    stir({dt, moved, movement}) {
        const now = gsap.ticker.time;
        if ( moved ) this.lastMoveTime = now;

        // The water has calmed and the pictures straightened out a few seconds after the mouse stops, so the fluid can rest until it moves again.
        if ( now - this.lastMoveTime < 4 ) {
            const force = reducedMotion.matches ? {x: 0, y: 0} : {
                x: gsap.utils.clamp(-80, 80, movement.x),
                y: gsap.utils.clamp(-80, 80, movement.y)
            };
            this.fluid.step(this.trail.pointer, force, dt);
        }
    }

    /**
     * The `showNextImage` function is responsible for displaying, animating, and managing the next image in the sequence.
     * The engine (js/trail.js) calls it every time the pointer has travelled far enough, with the image to show and where.
     * @param {Object} step - index (which plane), zIndex, from (the trailing position), to (where the image goes) and lead (the pointer's lead over the trailing position, its direction and speed), in viewport pixels.
     * @returns {void}
     */
    showNextImage({index, zIndex, from, to}) {
        // Retrieve the plane for this step.
        const plane = this.planes[index];
        const {mesh, uniforms, width, height} = plane;

        // Stop the plane's ongoing animation, then draw it above the others.
        plane.timeline?.kill();
        mesh.renderOrder = zIndex;
        mesh.visible = true;

        // With reduced motion, the image simply fades in and out at the mouse position.
        if ( reducedMotion.matches ) {
            mesh.position.set(to.x, -to.y, 0);
            mesh.scale.set(width, height, 1);
            plane.timeline = gsap.timeline({onComplete: () => mesh.visible = false})
            .fromTo(uniforms.opacity, {value: 0}, {duration: 0.3, ease: 'power1', value: 1}, 0)
            .to(uniforms.opacity, {duration: 0.6, ease: 'power1', value: 0}, 0.5);
            return;
        }

        // Define GSAP timeline. The plane is hidden again once it has faded out.
        plane.timeline = gsap.timeline({onComplete: () => mesh.visible = false})
        // Glide from the trailing position to the mouse, growing in
        .fromTo(mesh.position, {
            x: from.x,
            y: -from.y
        }, {
            duration: 0.9,
            ease: 'power3',
            x: to.x,
            y: -to.y
        }, 0)
        .fromTo(mesh.scale, {
            x: width * 0.7,
            y: height * 0.7
        }, {
            duration: 0.9,
            ease: 'power3',
            x: width,
            y: height
        }, 0)
        .fromTo(uniforms.opacity, {
            value: 0
        }, {
            duration: 0.3,
            ease: 'power1',
            value: 1
        }, 0)
        // then make it disappear
        .to(uniforms.opacity, {
            duration: 0.8,
            ease: 'power2.in',
            value: 0
        }, 1.1)
        .to(mesh.scale, {
            duration: 0.8,
            ease: 'power2.in',
            x: width * 0.85,
            y: height * 0.85
        }, 1.1)
    }
}
