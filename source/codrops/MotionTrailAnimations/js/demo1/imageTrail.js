// Importing utilities from 'utils.js'
import { reducedMotion } from '../utils.js';
// The trail engine: it follows the pointer and says which image to show next, and where
import { Trail, fillPool } from '../trail.js';
import { Image } from '../image.js';

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
        this.trail = new Trail(this.DOM.el, {size: this.images.length, onImage: step => this.showNextImage(step)});
    }

    /**
     * The `showNextImage` function is responsible for displaying, animating, and managing the next image in the sequence.
     * The engine (js/trail.js) calls it every time the pointer has travelled far enough, with the image to show and where.
     * @param {Object} step - index (which image), zIndex, from (the trailing position), to (where the image goes), lead (the pointer's lead over the trailing position, its direction and speed) and at ('to' in viewport pixels).
     * @returns {void} 
     */
    showNextImage({index, zIndex, from, to}) {
        // Retrieve the Image object for this step.
        const img = this.images[index];
        
        // Stop any ongoing GSAP animations on the target image element to prepare for new animations.
        gsap.killTweensOf(img.DOM.el);

        // With reduced motion, the image simply fades in and out at the mouse position.
        if ( reducedMotion.matches ) {
            img.timeline = img.fade(to.x, to.y, zIndex);
            return;
        }

        // Define GSAP timeline.
        img.timeline = gsap.timeline()
        // Animate position
        .fromTo(img.DOM.el, {
            opacity: 1,
            scale: 1,
            zIndex: zIndex,
            x: from.x,
            y: from.y
        }, {
            duration: 0.4,
            ease: 'power1',
            x: to.x,
            y: to.y
        }, 0)
        // then make it disappear
        .to(img.DOM.el, {
            duration: 0.4,
            ease: 'power3',
            opacity: 0,
            scale: 0.2
        }, 0.4)
    }
}