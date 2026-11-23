// Importing utilities from 'utils.js'
import { reducedMotion } from '../utils.js';
// The trail engine: it follows the pointer and says which image to show next, and where
import { Trail, fillPool } from '../trail.js';
import { Image } from '../image.js';

export class ImageTrail {
    // Class properties initialization
    DOM = {el: null}; // Object to hold DOM elements
    images = []; // Array to store Image objects
    visibleImagesCount = 0;
    // The total number of visible images
    visibleImagesTotal = 9;

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

        // Restriction on maximum visible images
        this.visibleImagesTotal = Math.min(this.visibleImagesTotal, this.images.length - 1);

        // The engine follows the pointer and calls showNextImage every time it has travelled far enough.
        // Here the trailing position keeps closer to the pointer than in most variations (0.3 instead of 0.1).
        this.trail = new Trail(this.DOM.el, {size: this.images.length, lag: 0.3, onImage: step => this.showNextImage(step)});
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
        
        ++this.visibleImagesCount;

        // Stop any ongoing GSAP animations on the target image element to prepare for new animations.
        gsap.killTweensOf(img.DOM.el);

        // With reduced motion, the image simply fades in at the mouse position, and stays like the others.
        if ( reducedMotion.matches ) {
            img.timeline = img.fade(to.x, to.y, zIndex, true);
        }
        else {
            // Random scale value
            const scaleValue = gsap.utils.random(0.5, 1.6,);

            img.timeline = gsap.timeline()
            .fromTo(img.DOM.el, {
                scale: scaleValue - Math.max(gsap.utils.random(0.2,0.6), 0),
                rotationZ: 0,
                opacity: 1,
                zIndex: zIndex,
                x: from.x,
                y: from.y
            }, {
                duration: 0.4,
                ease: 'power3',
                scale: scaleValue,
                rotationZ: gsap.utils.random(-3, 3),
                x: to.x,
                y: to.y
            }, 0);
        }

        // This block of code handles the situation where the number of images currently visible on the screen exceeds a predefined limit, 
        // which is set in [settings.visibleImagesTotal]. When there are too many images, it ensures that the oldest image (the "last in queue") 
        // is hidden to maintain the desired number of visible images.
        
        // Check if the count of visible images has exceeded the specified limit.
        if ( this.visibleImagesCount >= this.visibleImagesTotal ) {
            // Calculate the position of the image that is last in the visibility queue.
            // It's the oldest visible image and needs to be hidden next.
            const lastInQueue = this.trail.wrap(index - this.visibleImagesTotal);

            // Retrieve the Image object that needs to be hidden.
            const img = this.images[lastInQueue];

            // Animate the oldest visible image to gradually disappear, making room for new images in the scene (with reduced motion, it only fades).
            gsap.to(img.DOM.el, {
                duration: 0.4,
                ease: 'power4',
                opacity: 0,
                scale: reducedMotion.matches ? 1 : 1.3
            });
        }
    }
}