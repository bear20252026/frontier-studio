// Importing utilities from 'utils.js'
import { reducedMotion } from '../utils.js';
// The trail engine: it follows the pointer and says which image to show next, and where
import { Trail, fillPool } from '../trail.js';
import { Image } from '../image.js';

export class ImageTrail {
    // Class properties initialization
    DOM = {el: null}; // Object to hold DOM elements
    images = []; // Array to store Image objects
    lastAngle = 0; // track last image's angle

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
    showNextImage({index, zIndex, from, to, lead}) {
        // Calculate the horizontal and vertical distances between the current and last mouse positions.
        let dx = lead.x;
        let dy = lead.y;

        // Calculate angle in degrees
        this.angle = Math.atan2(dy, dx) * (180 / Math.PI);

        // Adjust angle here if necessary
        if (this.angle < 0) {
            this.angle += 360; // Normalize negative angles
        }

        // Optionally, adjust angles in specific quadrants if needed
        if (this.angle > 90 && this.angle <= 270) {
            this.angle += 180; // Flip the image if it is in the 2nd or 3rd quadrant
        }

        // Determine the movement direction
        const isMovingClockwise = this.angle >= this.lastAngle;

        // Store the current angle for the next mouse move event
        this.lastAngle = this.angle;

        // Adjust the startAngle based on movement direction
        let startAngle = isMovingClockwise ? this.angle - 10 : this.angle + 10;

        // Compute the Euclidean distance between the current and last mouse positions. This represents the direct line distance regardless of direction.
        let distance = Math.sqrt(dx * dx + dy * dy); // Calculate the distance
    
        // The next steps involve "normalizing" the distance vector. Normalization refers to adjusting the length of a vector to 1 while keeping its direction constant.
        // This is especially useful for simplifying calculations when you're only interested in vector direction and not its magnitude.

        // Check to avoid division by zero if the distance is not zero.
        if (distance !== 0) {
            dx /= distance; // Normalize the x component of the distance vector.
            dy /= distance; // Normalize the y component of the distance vector.
        }

        // The x and y components are now parts of a unit vector in the direction of the mouse movement.
        // However, we want the animation to be perceptible, so we scale the components by a factor.
        // Here, the factor is calculated based on the original distance, dividing it by a constant to lessen the effect, to avoid overly rapid movement.

        // Adjust the x and y components of the unit vector by scaling. 
        // The scaling factor is the original distance divided by 150, ensuring the movement is noticeable yet smooth.
        dx *= distance/150; // Scale the normalized x component.
        dy *= distance/150; // Scale the normalized y component.

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
        .fromTo(img.DOM.el, {
            opacity: 1,
            filter: 'brightness(80%)',
            scale: 0.1,
            zIndex: zIndex,
            x: from.x,
            y: from.y,
            rotation: startAngle
        }, {
            duration: 1,
            ease: 'power2',
            scale: 1,
            filter: 'brightness(100%)',
            x: to.x+ (dx*70),
            y: to.y+ (dy*70),
            rotation: this.lastAngle
        }, 0)
        // then make it disappear
        .to(img.DOM.el, {
            duration: 0.4,
            ease: 'expo',
            opacity: 0
        }, 0.5)
        .to(img.DOM.el, {
            duration: 1.5,
            ease: 'power4',
            x: "+=" + (dx * 120), // Adjust the multiplier as needed
            y: "+=" + (dy * 120),  // Adjust the multiplier as needed
        }, 0.05)
    }
}