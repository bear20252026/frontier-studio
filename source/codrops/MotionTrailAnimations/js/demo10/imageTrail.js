// Importing utilities from 'utils.js'
import { reducedMotion } from '../utils.js';
// The trail engine: it follows the pointer and says which image to show next, and where
import { Trail, fillPool } from '../trail.js';
// This demo's own Image, which cuts each picture into slices
import { Image } from './image.js';

export class ImageTrail {
    // Class properties initialization
    DOM = {el: null}; // Object to hold DOM elements
    images = []; // Array to store Image objects

    /**
     * Constructor for the ImageTrail class.
     * Initializes the instance, sets up the DOM elements, creates Image objects for each image element, and starts the trail engine.
     * @param {HTMLElement} DOM_el - The parent DOM element containing all image elements.
     */
    constructor(DOM_el) {
        // Store the reference to the parent DOM element.
        this.DOM.el = DOM_el;

        // Create and store Image objects for each image element: twice as many as there are pictures,
        // so an image is never taken back while it's still showing.
        this.images = fillPool(this.DOM.el, 20).map(img => new Image(img));

        // The engine follows the pointer and calls showNextImage every time it has travelled far enough.
        // Images a little further apart than in most variations, and at most two new ones per frame: every image is a dozen animated slices.
        this.trail = new Trail(this.DOM.el, {size: this.images.length, threshold: 100, maxPerFrame: 2, onImage: step => this.showNextImage(step)});
    }

    /**
     * The `showNextImage` function is responsible for displaying, animating, and managing the next image in the sequence.
     * The engine (js/trail.js) calls it every time the pointer has travelled far enough, with the image to show and where.
     * @param {Object} step - index (which image), zIndex, from (the trailing position), to (where the image goes), lead (the pointer's lead over the trailing position, its direction and speed) and at ('to' in viewport pixels).
     * @returns {void} 
     */
    showNextImage({index, zIndex, from, to, lead}) {
        // Retrieve the Image object for this step.
        const img = this.images[index];

        // Stop any ongoing GSAP animations on the image and its slices to prepare for new animations.
        gsap.killTweensOf([img.DOM.el, ...img.DOM.slices]);

        // With reduced motion, the image simply fades in and out at the mouse position.
        if ( reducedMotion.matches ) {
            img.timeline = img.fade(to.x, to.y, zIndex);
            return;
        }

        // The mouse's lead over the trailing position: the direction of the movement (straight to the right if there's hardly any)
        // and its length.
        const length = Math.hypot(lead.x, lead.y);
        const dx = length > 0.5 ? lead.x / length : 1;
        const dy = length > 0.5 ? lead.y / length : 0;
        // How far the slices lag behind along it: the movement's length, at least 30 pixels and at most 80
        const lag = gsap.utils.clamp(30, 80, length);

        // The slices run along the movement, at whatever angle, and lag along it.
        img.cut(dx, dy);
        const slices = img.DOM.slices;
        gsap.set(slices, {opacity: 1, x: 0, y: 0});

        // Define GSAP timeline.
        img.timeline = gsap.timeline()
        // Glide from the trailing position to the mouse
        .fromTo(img.DOM.el, {
            opacity: 0,
            scale: 0.92,
            zIndex: zIndex,
            x: from.x,
            y: from.y
        }, {
            duration: 0.9,
            ease: 'expo',
            scale: 1,
            x: to.x,
            y: to.y
        }, 0)
        .to(img.DOM.el, {
            duration: 0.25,
            ease: 'power1',
            opacity: 1
        }, 0)
        // The slices catch up from the middle outwards and wobble into place, so the picture bows and ripples like a flag.
        .fromTo(slices, {
            x: -dx * lag,
            y: -dy * lag
        }, {
            duration: 1.1,
            ease: 'elastic.out(1, 0.45)',
            x: 0,
            y: 0,
            stagger: {each: 0.016, from: 'center'}
        }, 0)
        // then they slide on in the same direction, the middle first, fading out
        .to(slices, {
            duration: 0.55,
            ease: 'power2.in',
            x: dx * lag * 0.8,
            y: dy * lag * 0.8,
            opacity: 0,
            stagger: {each: 0.014, from: 'center'}
        }, 0.8)
    }
}
