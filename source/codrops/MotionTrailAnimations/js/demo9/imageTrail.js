// Importing utilities from 'utils.js'
import { reducedMotion } from '../utils.js';
// The trail engine: it follows the pointer and says which image to show next, and where
import { Trail, fillPool } from '../trail.js';
import { Image } from '../image.js';

let winsize = {width: window.innerWidth, height: window.innerHeight};
window.addEventListener('resize', () => {
    winsize = {width: window.innerWidth, height: window.innerHeight};
});

export class ImageTrail {
    // Class properties initialization
    DOM = {el: null}; // Object to hold DOM elements
    images = []; // Array to store Image objects
    // Rotation and transform (z) values and cached values
    rotation = {x: 0, y: 0};
    cachedRotation = {...this.rotation};
    zValue = 0;
    cachedZValue = 0;
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
    showNextImage({index, zIndex, from, to, at}) {
        // Get the window's center coordinates
        const centerX = winsize.width / 2;
        const centerY = winsize.height / 2;

        // Calculate the image's position relative to the center of the window
        const relX = at.x - centerX;
        const relY = at.y - centerY;

        // Convert these distances into rotation values (these constants can be adjusted)
        // Here we're saying the full width/height of the window corresponds to a 30 degree rotation
        this.rotation.x = -(relY / centerY) * 30;
        this.rotation.y = (relX / centerX) * 30;
        // Cache these values
        this.cachedRotation = { ...this.rotation };

        // Calculate the distance of the mouse from the center.
        const distanceFromCenter = Math.sqrt(relX * relX + relY * relY);
        // Assuming the maximum distance is the diagonal of the screen.
        const maxDistance = Math.sqrt(centerX * centerX + centerY * centerY);
        // Calculate the proportion of the distance to the maximum possible (which is the diagonal).
        const proportion = distanceFromCenter / maxDistance;
        // Map this to the Z-axis range (-600 to 600). The overall range is 1200.
        this.zValue = proportion * 1200 - 600;
        // Cache this value
        this.cachedZValue = this.zValue;

        // Now, calculate brightness based on z-value. Assume the brightness should be between 0.5 and 1.5 for effect.
        // Normalize the zValue from range -600 to 600 to a range of 0.5 to 1.5 for brightness.
        // As the zValue increases, the brightness increases, meaning the object is closer and thus brighter.
        const normalizedZ = (this.zValue + 600) / 1200; // This will convert the range from -600 - 600 to 0 - 1.
        const brightness = 0.2 + (normalizedZ * 2.3); // This will map the 0 - 1 range into 0.5 - 2.5 (adjust if necessary).

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
        .set(this.DOM.el, {
            perspective: 1000
        }, 0)
        .fromTo(img.DOM.el, {
            opacity: 1,
            z: 0,
            scale: 1 + (this.cachedZValue / 1000),
            zIndex: zIndex,
            x: from.x,
            y: from.y,
            rotationX: this.cachedRotation.x,
            rotationY: this.cachedRotation.y,
            filter: `brightness(${brightness})`
        }, {
            duration: 1,
            ease: 'expo',
            scale: 1 + (this.zValue / 1000),
            x: to.x,
            y: to.y,
            rotationX: this.rotation.x,
            rotationY: this.rotation.y,
        }, 0)
        // then make it disappear
        .to(img.DOM.el, {
            duration: 0.4,
            ease: 'power2',
            opacity: 0,
            z: -800
        }, 0.3)
    }
}