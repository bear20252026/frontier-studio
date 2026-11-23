// Importing utilities from 'utils.js'
import { reducedMotion } from '../utils.js';
// The trail engine: it follows the pointer and says which image to show next, and where
import { Trail, fillPool } from '../trail.js';
// The WebGL stage: canvas, camera and planes, plus shader helpers shared by the WebGL variations
import { Stage, coverUV, roundedRect } from '../webgl/stage.js';
import * as THREE from 'three/webgpu';
import { uv, vec2, vec3, float, texture, uniform, positionLocal, time, length, abs, min, max, dot, sin, cos, vertexStage } from 'three/tsl';

/**
 * The silk material: while the image glides, it behaves like a sheet of fabric pulled through the air by its leading edge.
 * The trailing part curls away and ripples, a wave runs across it from front to back, and light catches the folds.
 * At rest it's a flat, sharp image again.
 * @param {Object} image - The texture, the image's aspect ratio, and the plane's width, height and corner radius in pixels.
 * @param {Object} uniforms - velocity (the plane's movement per frame in pixels, y down), flutter (0 to 1, the ripple an image has when it's let go) and opacity.
 * @returns {Object} - The material.
 */
const createSilkMaterial = (image, uniforms) => {
    const material = new THREE.MeshBasicNodeMaterial({transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide});
    const size = vec2(image.width, image.height);

    // The movement in the plane's own axes (y up): how fast (0 to 1, full at 4 pixels per frame) and which way.
    // The tiny sideways nudge keeps the direction defined when the plane stands still.
    const velocity = vec2(uniforms.velocity.x, uniforms.velocity.y.negate());
    const speed = length(velocity);
    const direction = velocity.add(vec2(0.0001, 0)).normalize();
    // How much the fabric moves: with the speed, and never less than the flutter it's let go with
    const amount = max(min(speed.div(4), 1), uniforms.flutter);

    // Every point's distance behind the leading edge: 0 on the edge facing the movement, 1 on the trailing edge
    const p = positionLocal.xy.mul(size);
    const extent = abs(direction.x).mul(image.width).add(abs(direction.y).mul(image.height)).mul(0.5);
    const behind = dot(p, direction.negate()).add(extent).div(extent.mul(2)).clamp(0, 1);

    // A wave that runs from the leading edge to the trailing one
    const phase = behind.mul(7).sub(time.mul(9));

    // The trailing part curls away from the viewer and ripples, more the faster the plane goes...
    // (the distances are in proportion to the image's width, so a smaller image bends the same way)
    const z = amount.mul(behind.mul(behind).mul(image.width * -1.1).add(sin(phase).mul(behind).mul(image.width * 0.22)));
    // ...and lags behind, like fabric dragged through the air.
    const drag = direction.mul(amount.mul(behind).mul(behind).mul(image.width * -0.23));
    material.positionNode = vec3(positionLocal.xy.add(drag.div(size)), z);

    // Light catches the folds: bright and dark bands running with the wave, and a shadow where the fabric curls away.
    // Worked out per vertex, and blended across the triangles in between.
    const shade = vertexStage(float(1).add(cos(phase).mul(behind).mul(amount).mul(0.4)).sub(behind.mul(behind).mul(amount).mul(0.3)));

    const st = uv();
    material.colorNode = texture(image.texture, coverUV(st, image.width / image.height, image.imageAspect)).rgb.mul(shade);
    material.opacityNode = roundedRect(st, size, float(image.radius)).mul(uniforms.opacity);

    return material;
};

export class ImageTrail {
    // Class properties initialization
    DOM = {el: null}; // Object to hold DOM elements
    stage = null; // The WebGL stage
    planes = []; // Array to store the planes: mesh, uniforms, size and timeline of each image
    // Mouse distance from the previous trigger, required to show the next image
    threshold = 100;
    // Whether any plane was drawn in the last frame
    isDrawing = false;

    /**
     * Constructor for the ImageTrail class.
     * @param {HTMLElement} DOM_el - The parent DOM element containing all image elements.
     */
    constructor(DOM_el) {
        // Store the reference to the parent DOM element.
        this.DOM.el = DOM_el;
        // A perspective camera, so the fabric's curls have real depth
        this.stage = new Stage(this.DOM.el, {perspective: 1000});
    }

    /**
     * Sets up WebGL, creates a plane for each image element, compiles the shaders and starts the rendering loop.
     * The canvas covers the viewport, so planes are placed at the mouse position directly (no offset to subtract).
     * Throws if neither WebGPU nor WebGL 2 is available.
     * @returns {Promise}
     */
    async init() {
        await this.stage.init();

        // A plane divided into 32×32 squares, so it can bend
        const geometry = new THREE.PlaneGeometry(1, 1, 32, 32);

        // Twice as many planes as there are pictures, so a plane is never taken back while it's still showing
        this.planes = await Promise.all(fillPool(this.DOM.el, 20).map(async el => {
            const image = await this.stage.loadImage(el);
            const uniforms = {
                velocity: uniform(new THREE.Vector2()),
                flutter: uniform(0),
                opacity: uniform(1)
            };
            const mesh = this.stage.addPlane(createSilkMaterial(image, uniforms), image.width, image.height, geometry);
            return {mesh, uniforms, width: image.width, height: image.height, timeline: null, previous: {x: 0, y: 0}};
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
     * The `render` function runs every frame, after the engine has shown any new images: it measures how fast every plane moves, then draws them.
     * @param {Object} frame - From the engine: dt (this frame's duration relative to a frame at 60fps).
     * @returns {void}
     */
    render({dt}) {
        // Each plane's velocity in pixels per frame (y down), eased so the fabric doesn't twitch. It's what bends the plane.
        const ease = 1 - Math.pow(0.65, dt);
        this.planes.forEach(plane => {
            if ( !plane.mesh.visible ) return;
            const {position} = plane.mesh;
            const velocity = plane.uniforms.velocity.value;
            velocity.x += ((position.x - plane.previous.x) / dt - velocity.x) * ease;
            velocity.y += ((plane.previous.y - position.y) / dt - velocity.y) * ease;
            plane.previous = {x: position.x, y: position.y};
        });

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
        mesh.rotation.z = 0;
        uniforms.velocity.value.set(0, 0);
        uniforms.flutter.value = 0;

        // With reduced motion, the image simply fades in and out at the mouse position, flat.
        if ( reducedMotion.matches ) {
            mesh.position.set(to.x, -to.y, 0);
            mesh.scale.set(width, height, 1);
            plane.previous = {x: mesh.position.x, y: mesh.position.y};
            plane.timeline = gsap.timeline({onComplete: () => mesh.visible = false})
            .fromTo(uniforms.opacity, {value: 0}, {duration: 0.3, ease: 'power1', value: 1}, 0)
            .to(uniforms.opacity, {duration: 0.6, ease: 'power1', value: 0}, 0.5);
            return;
        }

        // The image glides on past the mouse, along its movement: 2.5 times the mouse's lead, up to 380 pixels.
        const dx = lead.x;
        const dy = lead.y;
        const length = Math.max(Math.hypot(dx, dy), 1);
        const glide = Math.min(length * 2.5, 380) / length;

        mesh.position.set(from.x, -from.y, 0);
        plane.previous = {x: mesh.position.x, y: mesh.position.y};

        // Define GSAP timeline. The plane is hidden again once it has faded out.
        plane.timeline = gsap.timeline({onComplete: () => mesh.visible = false})
        .to(mesh.position, {
            duration: 2,
            ease: 'power2',
            x: to.x + dx * glide,
            y: -(to.y + dy * glide)
        }, 0)
        // a slight turn as it settles
        .to(mesh.rotation, {
            duration: 2,
            ease: 'power2',
            z: gsap.utils.random(-0.12, 0.12)
        }, 0)
        // The fabric ripples as it's let go, and settles.
        .fromTo(uniforms.flutter, {
            value: 1
        }, {
            duration: 2,
            ease: 'power1.inOut',
            value: 0
        }, 0)
        .fromTo(mesh.scale, {
            x: width * 0.85,
            y: height * 0.85
        }, {
            duration: 1,
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
            duration: 0.7,
            ease: 'power2.in',
            value: 0
        }, 1.1)
    }
}
