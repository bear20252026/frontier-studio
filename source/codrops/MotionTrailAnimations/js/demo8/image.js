import { setClipPath} from '../utils.js';

export class Image {
    // Class property initialization with default values.
    // The DOM property holds references to the main and inner elements of the image component.
    DOM = {
        el: null,   // Holds the reference to the main DOM element with class 'content__img'.
        inner: null, // Holds the reference to the inner DOM element with class 'content__img-inner'.
        clipInnerElements: null // Holds the references to the inner clip DOM elements with class 'content__img-inner'.
    };
    // Property to hold the animation timeline for the image.
    timeline = null;
    // Number of clip path inner elements (rows and columns)
    clipRows = 3;
    clipColumns = 3
    clipCount = this.clipRows*this.clipColumns;

    /**
     * Constructor for the Image class. Initializes the instance and sets up DOM references.
     * @param {HTMLElement} DOM_el - The main DOM element for the image, expected to have a child with class 'content__img-inner'.
     */
    constructor(DOM_el) {
        // Assign the provided DOM element to the 'el' property of the 'DOM' object.
        this.DOM.el = DOM_el;
        // Find and assign the inner element (with class 'content__img-inner') to the 'inner' property of the 'DOM' object.
        this.DOM.inner = this.DOM.el.querySelector('.content__img-inner');

        // Create [this.clipCount] inner elements: Repeat the inner elements [this.clipCount] times
        for (let i = 1; i < this.clipCount; ++i) {
            let clonedDiv = this.DOM.inner.cloneNode(true);
            this.DOM.el.appendChild(clonedDiv);
        }
        this.DOM.el.classList.add('content__img--clip');
        this.DOM.clipInnerElements = this.DOM.el.children;
        setClipPath(this.DOM.clipInnerElements, this.clipRows, this.clipColumns)

        // Center the image on its x and y position, instead of placing it by its top left corner. This way it never needs measuring.
        gsap.set(this.DOM.el, {xPercent: -50, yPercent: -50});
    }

    /**
     * The fade method shows the image at the given position with a plain fade, and nothing else moving.
     * The trail uses it instead of its animation when the visitor prefers reduced motion.
     * @param {number} x - Horizontal position of the image's center.
     * @param {number} y - Vertical position of the image's center.
     * @param {number} zIndex - z-index for the image.
     * @returns {Object} - The GSAP timeline of the fade.
     */
    fade(x, y, zIndex) {
        // Put the clip pieces back together, in case an earlier animation broke them apart.
        gsap.killTweensOf([this.DOM.el, ...this.DOM.clipInnerElements]);
        gsap.set(this.DOM.clipInnerElements, {clearProps: 'transform,opacity'});

        return gsap.timeline()
        .set(this.DOM.el, {
            zIndex: zIndex,
            x: x,
            y: y
        }, 0)
        .fromTo(this.DOM.el, {
            opacity: 0
        }, {
            duration: 0.3,
            ease: 'power1',
            opacity: 1
        }, 0)
        // then make it disappear
        .to(this.DOM.el, {
            duration: 0.6,
            ease: 'power1',
            opacity: 0
        }, 0.5);
    }
}
