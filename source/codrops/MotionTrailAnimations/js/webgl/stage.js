// three.js with its node materials: WebGPU where the browser has it, WebGL 2 everywhere else
import * as THREE from 'three/webgpu';
// TSL, three.js' shading language: shaders written as JavaScript, compiled to WGSL (WebGPU) or GLSL (WebGL 2)
import { Fn, vec2, float, abs, max, min, length, smoothstep } from 'three/tsl';
import { backgroundImageUrl } from '../utils.js';

/**
 * Coordinates for sampling an image so it covers the plane, like 'background-size: cover'.
 * @param {Node} st - Coordinates across the plane, 0 to 1.
 * @param {number} planeAspect - Width divided by height of the plane.
 * @param {number} imageAspect - Width divided by height of the image.
 * @returns {Node} - The coordinates in the image.
 */
export const coverUV = (st, planeAspect, imageAspect) => {
    const ratio = planeAspect / imageAspect;
    // Only the part of the image that fits the plane's shape is shown, centered.
    const scale = ratio > 1 ? vec2(1, 1 / ratio) : vec2(ratio, 1);
    return st.sub(0.5).mul(scale).add(0.5);
};

/**
 * Mask of a rounded rectangle filling the plane: 1 inside, 0 outside, smoothed over a pixel at the edge.
 * The same shape as the DOM images' 'border-radius'.
 * @param {Node} st - Coordinates across the plane, 0 to 1.
 * @param {Node} size - Size of the plane in pixels.
 * @param {Node} radius - Corner radius in pixels.
 * @returns {Node} - The mask value.
 */
export const roundedRect = Fn(([st, size, radius]) => {
    // Position from the plane's center, in pixels
    const p = st.sub(0.5).mul(size);
    // Signed distance to the edge of the rounded rectangle, negative inside
    const q = abs(p).sub(size.mul(0.5)).add(radius);
    const distance = length(max(q, 0)).add(min(max(q.x, q.y), 0)).sub(radius);
    return float(1).sub(smoothstep(-0.5, 0.5, distance));
});

/**
 * The Stage is the WebGL side of a page: a transparent canvas over the whole viewport, a camera that measures in CSS pixels,
 * and one plane per trail image. A plane at (x, -y) shows at viewport pixel (x, y), so planes go where the mouse is.
 * The camera is orthographic, or with the 'perspective' option, a perspective camera that sees the z = 0 plane at exactly
 * one CSS pixel per unit, like CSS 'perspective': planes bent or moved in z then show real depth.
 */
export class Stage {
    // Class property initialization with default values.
    DOM = {
        el: null,       // The content element, which holds the canvas.
        canvas: null    // The canvas the renderer draws on.
    };
    renderer = null;
    scene = new THREE.Scene();
    camera = null;
    // Distance of the perspective camera from the z = 0 plane, in pixels (0 for the orthographic camera)
    perspective = 0;
    // One square, shared by every plane; each plane scales it to its size.
    geometry = new THREE.PlaneGeometry(1, 1);
    // Viewport size in CSS pixels
    size = {width: 0, height: 0};
    // Textures by URL, so images showing the same picture share one
    textures = new Map();

    /**
     * Constructor for the Stage class.
     * @param {HTMLElement} DOM_el - The content element.
     * @param {Object} [options] - 'perspective': distance of a perspective camera in pixels, like CSS 'perspective'. Leave it out for an orthographic camera.
     */
    constructor(DOM_el, {perspective = 0} = {}) {
        this.DOM.el = DOM_el;
        this.perspective = perspective;
        this.camera = perspective ? new THREE.PerspectiveCamera() : new THREE.OrthographicCamera();
    }

    /**
     * Creates the renderer and adds its canvas to the page. It uses WebGPU if the browser has it and falls back to WebGL 2.
     * Throws if neither is available, so the page can fall back to a DOM trail.
     * @returns {Promise}
     */
    async init() {
        this.renderer = new THREE.WebGPURenderer({antialias: true, alpha: true});
        await this.renderer.init();
        // Sharp on high density screens, but never more than twice the CSS pixels
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x000000, 0);

        this.DOM.canvas = this.renderer.domElement;
        this.DOM.canvas.classList.add('content__canvas');
        this.DOM.el.appendChild(this.DOM.canvas);

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    /**
     * Matches the canvas and the camera to the viewport.
     * @returns {void}
     */
    resize() {
        this.size = {width: window.innerWidth, height: window.innerHeight};
        this.renderer.setSize(this.size.width, this.size.height);
        if ( this.perspective ) {
            // Looking at the middle of the viewport from 'perspective' pixels away, with the field of view that fits the viewport's height exactly
            const fov = 2 * Math.atan(this.size.height / 2 / this.perspective) * 180 / Math.PI;
            Object.assign(this.camera, {fov, aspect: this.size.width / this.size.height, near: 1, far: this.perspective * 4});
            this.camera.position.set(this.size.width / 2, -this.size.height / 2, this.perspective);
        }
        else {
            // x from 0 to the width, y from 0 down to minus the height
            Object.assign(this.camera, {left: 0, right: this.size.width, top: 0, bottom: -this.size.height, near: -1000, far: 1000});
        }
        this.camera.updateProjectionMatrix();
    }

    /**
     * Loads the picture of a '.content__img' element (its inner element's background image) as a texture,
     * and reads its size and corner radius from the CSS, so the plane matches the DOM image.
     * @param {HTMLElement} el - The '.content__img' element.
     * @returns {Promise<Object>} - The texture, the image's aspect ratio, and the plane's width, height and radius in pixels.
     */
    async loadImage(el) {
        const url = backgroundImageUrl(el.querySelector('.content__img-inner'));
        if ( !this.textures.has(url) ) {
            this.textures.set(url, new THREE.TextureLoader().loadAsync(url).then(texture => {
                texture.colorSpace = THREE.SRGBColorSpace;
                return texture;
            }));
        }
        const texture = await this.textures.get(url);
        return {
            texture,
            imageAspect: texture.image.width / texture.image.height,
            width: el.offsetWidth,
            height: el.offsetHeight,
            radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0
        };
    }

    /**
     * Adds a hidden plane with the given material. The plane is drawn on top of the planes with a lower 'renderOrder'.
     * @param {Object} material - A node material.
     * @param {number} width - Width in pixels.
     * @param {number} height - Height in pixels.
     * @param {Object} [geometry] - A 1×1 geometry to use instead of the plain square, like a subdivided plane for a material that bends it.
     * @returns {Object} - The mesh.
     */
    addPlane(material, width, height, geometry = this.geometry) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.scale.set(width, height, 1);
        mesh.visible = false;
        this.scene.add(mesh);
        return mesh;
    }

    /**
     * Compiles every plane's shaders before the page shows, so the first images don't stutter.
     * @returns {Promise}
     */
    async compile() {
        const meshes = this.scene.children;
        meshes.forEach(mesh => mesh.visible = true);
        await this.renderer.compileAsync(this.scene, this.camera);
        meshes.forEach(mesh => mesh.visible = false);
    }

    /**
     * Draws the scene.
     * @returns {void}
     */
    render() {
        this.renderer.render(this.scene, this.camera);
    }
}
