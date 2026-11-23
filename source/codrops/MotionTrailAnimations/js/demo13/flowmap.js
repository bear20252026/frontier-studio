import * as THREE from 'three/webgpu';
import { Fn, vec2, vec4, texture, uniform, screenUV, exp, dot } from 'three/tsl';

/**
 * The flowmap records how the mouse stirs the screen, like a finger drawn through water.
 * It's a small texture over the viewport, drawn again on every frame: the previous flow fades a little,
 * and the mouse's latest movement is painted in around the mouse.
 * Red and green hold the flow's velocity in CSS pixels per frame, x to the right and y down.
 */
export class Flowmap {
    // How much of the flow remains after each frame (at 60fps): higher lets the wake linger longer
    dissipation = 0.96;
    // Radius of the mouse's stir, as a fraction of the viewport height
    radius = 0.06;
    // The texture is this many times smaller than the viewport (the flow is soft, so detail would be wasted)
    resolution = 8;

    /**
     * Constructor for the Flowmap class.
     * @param {Object} renderer - The WebGPURenderer.
     */
    constructor(renderer) {
        this.renderer = renderer;

        // Two textures take turns: every frame reads the last one and draws into the other.
        // Half floats, because velocities can be negative and bigger than 1.
        const options = {type: THREE.HalfFloatType, depthBuffer: false};
        this.targets = [new THREE.RenderTarget(1, 1, options), new THREE.RenderTarget(1, 1, options)];

        this.uniforms = {
            mouse: uniform(new THREE.Vector2()),    // Mouse position, 0 to 1 from the top left, like screenUV
            velocity: uniform(new THREE.Vector2()), // Mouse movement in this frame, in CSS pixels
            aspect: uniform(1),                     // Viewport width divided by height
            dissipation: uniform(this.dissipation), // The fade for this frame
            radius: uniform(this.radius)
        };

        // The flow before this frame, read at the pixel being drawn
        this.previous = texture(this.targets[0].texture, screenUV);
        // The latest flow, which the images read at their own pixels
        this.node = texture(this.targets[0].texture, screenUV);

        const material = new THREE.NodeMaterial();
        // Write the values as they are, without blending them with what's in the texture
        material.blending = THREE.NoBlending;
        material.fragmentNode = Fn(() => {
            const {mouse, velocity, aspect, dissipation, radius} = this.uniforms;
            // Distance to the mouse, with x scaled so the stir is round on any viewport shape
            const toMouse = screenUV.sub(mouse).mul(vec2(aspect, 1));
            // Strongest at the mouse, fading out smoothly around it
            const stir = exp(dot(toMouse, toMouse).div(radius.mul(radius)).negate());
            return vec4(this.previous.xy.mul(dissipation).add(velocity.mul(stir)), 0, 1);
        })();

        // A quad over the whole texture
        this.quad = new THREE.QuadMesh(material);
    }

    /**
     * Matches the textures to the viewport.
     * @param {number} width - Viewport width in CSS pixels.
     * @param {number} height - Viewport height in CSS pixels.
     * @returns {void}
     */
    resize(width, height) {
        this.targets.forEach(target => target.setSize(Math.ceil(width / this.resolution), Math.ceil(height / this.resolution)));
        this.uniforms.aspect.value = width / height;
    }

    /**
     * Draws the flow for this frame.
     * @param {Object} mouse - Mouse position in CSS pixels.
     * @param {Object} velocity - Mouse movement since the last frame, in CSS pixels (per frame at 60fps).
     * @param {Object} size - Viewport size in CSS pixels.
     * @param {number} dt - Duration of this frame relative to a frame at 60fps.
     * @returns {void}
     */
    update(mouse, velocity, size, dt) {
        this.uniforms.mouse.value.set(mouse.x / size.width, mouse.y / size.height);
        this.uniforms.velocity.value.set(velocity.x, velocity.y);
        // The same fade per second at any frame rate
        this.uniforms.dissipation.value = Math.pow(this.dissipation, dt);

        const [read, write] = this.targets;
        this.previous.value = read.texture;
        this.renderer.setRenderTarget(write);
        this.quad.render(this.renderer);
        this.renderer.setRenderTarget(null);

        // The texture just drawn holds the latest flow: the images read it now, and the next frame starts from it.
        this.targets = [write, read];
        this.node.value = write.texture;
    }
}
