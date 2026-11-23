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
        // Here the trailing position keeps closer to the pointer than in most variations (0.3 instead of 0.1).
        this.trail = new Trail(this.DOM.el, {size: this.images.length, lag: 0.3, onImage: step => this.showNextImage(step)});
    }

    /**
     * Based on the speed of the mouse, calculates a size value within a specific range.
     * The function maps the speed to a size multiplier, ensuring that higher speeds result in larger sizes.
     * It uses a maximum speed threshold to normalize the size adjustment.
     * 
     * @param {number} speed - The current speed of the mouse movement.
     * @param {number} minSize - The minimum size limit for the transformation.
     * @param {number} maxSize - The maximum size limit for the transformation.
     * @returns {number} - The adjusted size value.
     */
    mapSpeedToSize(speed, minSize, maxSize) {
        const maxSpeed = 200; 
        return minSize + (maxSize - minSize) * Math.min(speed / maxSpeed, 1);
    }

    /**
     * Determines the brightness level based on the mouse speed, staying within defined limits.
     * The faster the mouse movement, the higher the brightness, with a maximum speed threshold for normalization.
     * 
     * @param {number} speed - Current speed of the mouse movement.
     * @param {number} minBrightness - Minimum brightness level allowed.
     * @param {number} maxBrightness - Maximum brightness level allowed.
     * @returns {number} - The calculated brightness level.
     */
    mapSpeedToBrightness(speed, minBrightness, maxBrightness) {
        const maxSpeed = 70; 
        return minBrightness + (maxBrightness - minBrightness) * Math.min(speed / maxSpeed, 1);
    };

    /**
     * Adjusts the blur effect based on the current speed of the mouse, ensuring it remains within a specific range.
     * Higher speeds result in more blur. A maximum speed threshold is used for normalization purposes.
     * 
     * @param {number} speed - The current speed of the mouse movement.
     * @param {number} minBlur - The minimum blur effect allowed.
     * @param {number} maxBlur - The maximum blur effect allowed.
     * @returns {number} - The computed blur value.
     */
    mapSpeedToBlur(speed, minBlur, maxBlur) {
        const maxSpeed = 90; 
        return minBlur + (maxBlur - minBlur) * Math.min(speed / maxSpeed, 1);
    };

    /**
     * Modifies the grayscale level of an image based on the mouse's speed, within set minimum and maximum boundaries.
     * Faster movements lead to higher grayscale levels. A maximum speed is defined to normalize the grayscale adjustment.
     * 
     * @param {number} speed - The detected speed of the mouse movement.
     * @param {number} minGrayscale - The lowest permissible grayscale level.
     * @param {number} maxGrayscale - The highest permissible grayscale level.
     * @returns {number} - The adjusted grayscale level.
     */
    mapSpeedToGrayscale(speed, minGrayscale, maxGrayscale) {
        const maxSpeed = 90; 
        return minGrayscale + (maxGrayscale - minGrayscale) * Math.min(speed / maxSpeed, 1);
    };

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
        
        // Compute the Euclidean distance between the current and last mouse positions. This represents the direct line distance regardless of direction.
        let speed = Math.sqrt(dx * dx + dy * dy);

        // Retrieve the Image object for this step.
        const img = this.images[index];
        
        let scaleFactor = this.mapSpeedToSize(speed, 0.3, 2); // Assuming min scale of 0.3 and max scale of 2
        let brightnessValue = this.mapSpeedToBrightness(speed, 0, 1.3); // Assuming min brightness of 0 (0%) and max brightness of 1.3 (130%)
        let blurValue = this.mapSpeedToBlur(speed, 20, 0);
        let grayscaleValue = this.mapSpeedToGrayscale(speed, 600, 0);

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
            scale: 0,
            zIndex: zIndex,
            x: from.x,
            y: from.y
        }, {
            duration: 0.8,
            ease: 'power3',
            scale: scaleFactor,
            filter: `grayscale(${grayscaleValue*100}%) brightness(${brightnessValue*100}%) blur(${blurValue}px)`,
            x: to.x,
            y: to.y
        }, 0)
        /* Inner image */
        .fromTo(img.DOM.inner, {
            scale: 2
        }, {
            duration: 0.8,
            ease: 'power3',
            scale: 1
        }, 0)
        /* Inner image */
        // then make it disappear
        .to(img.DOM.el, {
            duration: 0.4,
            ease: 'power3.in',
            opacity: 0,
            scale: 0.2
        }, 0.45);
    }
}