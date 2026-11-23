// Importing utilities from 'utils.js'
import { reducedMotion } from '../utils.js';
// The trail engine: it follows the pointer and says which image to show next, and where
import { Trail } from '../trail.js';
import { Image } from '../image.js';

/**
 * Unlike the other variations, this trail doesn't show one image after another: all ten images follow the mouse at once, as a tail.
 * The first image (the head) eases towards the mouse and records the path it takes. The others sit along that path at a fixed spacing,
 * each a little smaller, so the tail snakes through every curve the mouse draws.
 * When the mouse rests, the tail slides back into the head and fades out.
 * It uses the engine for the pointer and the frames only, except with reduced motion, where the engine shows one image at a time.
 */
export class ImageTrail {
    // Class properties initialization
    DOM = {el: null}; // Object to hold DOM elements
    images = []; // Array to store Image objects
    // How much of the remaining distance to the mouse the head covers per frame (at 60fps)
    follow = 0.3;
    // Distance between two images along the path, in pixels
    gap = 60;
    // The current spacing: it grows to the gap while the mouse moves, and shrinks to 0 when it rests
    spacing = {value: 0};
    // How much smaller each image is than the one ahead of it
    scaleStep = 0.05;
    // Seconds without mouse movement before the tail slides in and fades out
    restDelay = 0.35;
    // Visibility of the whole tail (0 to 1), tweened in and out
    presence = {value: 0};
    // Whether the tail is showing (or fading in)
    isShown = false;
    // Time of the last mouse movement, in seconds of GSAP's ticker
    lastMoveTime = 0;
    // The head's position, and the path it has taken (newest point first)
    head = {x: 0, y: 0};
    path = [];

    /**
     * Constructor for the ImageTrail class.
     * Initializes the instance, sets up the DOM elements, creates Image objects for each image element, and starts the trail engine.
     * @param {HTMLElement} DOM_el - The parent DOM element containing all image elements.
     */
    constructor(DOM_el) {
        // Store the reference to the parent DOM element.
        this.DOM.el = DOM_el;

        // Create and store Image objects for each image element found within the parent DOM element.
        this.images = [...this.DOM.el.querySelectorAll('.content__img')].map(img => new Image(img));

        // Each image keeps its own position and tilt. The head is on top, the end of the tail at the bottom.
        this.images.forEach((img, i) => {
            img.position = {x: 0, y: 0};
            img.tilt = 0;
            gsap.set(img.DOM.el, {zIndex: this.images.length - i, scale: 1 - i * this.scaleStep});
            // quickSetter skips GSAP's parsing, for values set on every frame.
            img.set = {
                x: gsap.quickSetter(img.DOM.el, 'x', 'px'),
                y: gsap.quickSetter(img.DOM.el, 'y', 'px'),
                rotation: gsap.quickSetter(img.DOM.el, 'rotation', 'deg'),
                opacity: gsap.quickSetter(img.DOM.el, 'opacity'),
                innerX: gsap.quickSetter(img.DOM.inner, 'x', 'px')
            };
        });

        // The engine follows the pointer and calls render every frame (and fadeImage, with reduced motion only).
        this.trail = new Trail(this.DOM.el, {
            size: this.images.length,
            onImage: step => this.fadeImage(step),
            onFrame: frame => this.render(frame)
        });
    }

    /**
     * The `render` function is the main rendering loop: it moves the head, records its path and places the other images along it.
     * @param {Object} frame - From the engine: dt (this frame's duration relative to a frame at 60fps) and moved (whether the pointer moved).
     * @returns {void}
     */
    render({dt, moved}) {
        // With reduced motion, images fade in and out where the mouse passes instead (the engine shows them).
        this.trail.spawning = reducedMotion.matches;
        if ( reducedMotion.matches ) return;

        // The mouse position in the content element's coordinates (none until the pointer shows up)
        const target = this.trail.position;
        if ( !target ) return;

        const now = gsap.ticker.time;

        if ( moved ) {
            // On the first movement (or once the tail has faded out), start everything at the mouse, so nothing flies in from elsewhere.
            if ( this.presence.value === 0 ) {
                this.head = {...target};
                this.path = [{...target}];
                this.images.forEach(img => {
                    img.position = {...target};
                    img.tilt = 0;
                });
            }
            this.lastMoveTime = now;
            this.show(true);
        }
        else if ( this.isShown && now - this.lastMoveTime > this.restDelay ) {
            this.show(false);
        }

        // Nothing to draw while the tail is hidden.
        if ( this.presence.value === 0 ) return;

        // Factors for this frame, so the tail behaves the same at any frame rate
        const follow = 1 - Math.pow(1 - this.follow, dt);
        const settle = 1 - Math.pow(0.5, dt);

        // The head eases towards the mouse, and its path gets a new point every 2 pixels.
        this.head.x += (target.x - this.head.x) * follow;
        this.head.y += (target.y - this.head.y) * follow;
        if ( Math.hypot(this.head.x - this.path[0].x, this.head.y - this.path[0].y) > 2 ) {
            this.path.unshift({...this.head});
        }
        this.trimPath();

        this.images.forEach((img, i) => {
            const previousX = img.position.x;

            // The image's place on the path; it settles there over a couple of frames, which rounds off sharp turns.
            const point = this.pointAlongPath(i * this.spacing.value);
            img.position.x += (point.x - img.position.x) * settle;
            img.position.y += (point.y - img.position.y) * settle;

            // Horizontal speed in pixels per frame: the image leans into the movement, and its picture lags behind a little.
            const speedX = (img.position.x - previousX) / dt;
            img.tilt += (gsap.utils.clamp(-20, 20, speedX * 0.9) - img.tilt) * settle;

            img.set.x(img.position.x);
            img.set.y(img.position.y);
            img.set.rotation(img.tilt);
            img.set.innerX(gsap.utils.clamp(-10, 10, -speedX * 0.4));
            // The tail thins out towards its end. The images behind the head only show while the tail is spread out:
            // they disappear in its last few pixels of sliding in, where the head covers them, so the head fades out alone.
            const spread = i === 0 ? 1 : gsap.utils.clamp(0, 1, (this.spacing.value - 4) / 16);
            img.set.opacity(this.presence.value * (1 - i * 0.06) * spread);
        });
    }

    /**
     * Finds the point at a given distance from the head, measured along its path.
     * @param {number} distance - Distance in pixels.
     * @returns {Object} - The point, or the oldest point of the path if it's shorter than the distance.
     */
    pointAlongPath(distance) {
        let previous = this.head;
        for (const point of this.path) {
            const segment = Math.hypot(point.x - previous.x, point.y - previous.y);
            if ( segment >= distance ) {
                const t = segment === 0 ? 0 : distance / segment;
                return {x: previous.x + (point.x - previous.x) * t, y: previous.y + (point.y - previous.y) * t};
            }
            distance -= segment;
            previous = point;
        }
        return previous;
    }

    /**
     * Drops the part of the path that's further from the head than the whole tail can reach.
     * @returns {void}
     */
    trimPath() {
        const reach = (this.images.length - 1) * this.gap + 20;
        let length = 0;
        let previous = this.head;
        for (let i = 0; i < this.path.length; ++i) {
            length += Math.hypot(this.path[i].x - previous.x, this.path[i].y - previous.y);
            previous = this.path[i];
            if ( length > reach ) {
                this.path.length = i + 1;
                return;
            }
        }
    }

    /**
     * Shows the tail, unfurling it along the path, or slides it back into the head and fades it out.
     * @param {boolean} visible - Whether the tail should show.
     * @returns {void}
     */
    show(visible) {
        if ( visible === this.isShown ) return;
        this.isShown = visible;

        // Coming in, the head fades in first and the tail unfurls from behind it once the head is solid.
        // Going out, the tail slides all the way into the head before the head fades.
        gsap.to(this.spacing, {
            duration: visible ? 0.6 : 0.7,
            delay: visible ? 0.15 : 0,
            ease: visible ? 'power2' : 'power3.inOut',
            value: visible ? this.gap : 0,
            overwrite: true
        });
        gsap.to(this.presence, {
            duration: visible ? 0.25 : 0.45,
            delay: visible ? 0 : 0.7,
            ease: visible ? 'power2' : 'power2.inOut',
            value: visible ? 1 : 0,
            overwrite: true,
            // Once faded out, render stops drawing, so hide every image fully here.
            onComplete: () => !visible && this.images.forEach(img => img.set.opacity(0))
        });
    }

    /**
     * With reduced motion, the images don't chase the mouse: the engine calls this every time it has moved far enough,
     * and the image fades in and out where it is.
     * @param {Object} step - From the engine: index (which image), zIndex and to (where the image goes).
     * @returns {void}
     */
    fadeImage({index, zIndex, to}) {
        const img = this.images[index];
        img.timeline = img.fade(to.x, to.y, zIndex);
    }
}
