/**
 * Makes sure the content element has at least 'size' images, by cloning the ones in the markup in order.
 * With more images than the trail has pictures, an image is never taken back while it's still showing, however fast the pointer moves.
 * @function
 * @param {HTMLElement} DOM_el - The content element.
 * @param {number} size - How many images there should be.
 * @returns {Array<HTMLElement>} - All the '.content__img' elements.
 */
const fillPool = (DOM_el, size) => {
    const originals = [...DOM_el.querySelectorAll('.content__img')];
    for (let i = originals.length; i < size; ++i) {
        DOM_el.appendChild(originals[i % originals.length].cloneNode(true));
    }
    return [...DOM_el.querySelectorAll('.content__img')];
};

/**
 * The trail engine every variation runs on.
 * It follows the pointer and keeps a trailing position that lags behind it. Every time the pointer has travelled 'threshold'
 * pixels it hands the variation the next image to show and where: evenly spaced along the way, however fast the pointer
 * moves and whatever the screen's refresh rate. The variation only decides how the image shows.
 */
export class Trail {
    // Pointer distance between two images, in pixels
    threshold = 80;
    // How much of the gap the trailing position closes every frame (at 60fps): lower makes it lag further behind
    lag = 0.1;
    // Images shown in one frame at most: a pointer that jumps further than that is caught up with instead
    maxPerFrame = 4;
    // Whether images are shown at all (a variation can switch it off)
    spawning = true;

    // The pointer, the trailing position and the point the last image was shown at, all in viewport pixels (null until the pointer shows up)
    pointer = null;
    trailing = null;
    last = null;
    // The pointer at the previous frame, for its movement
    previous = null;
    // Position of the content element in the viewport, for the 'content' space
    offset = {x: 0, y: 0};
    // Images shown so far, and the z-index of the last one (it only ever goes up, see AGENTS.md)
    count = 0;
    zIndex = 1;

    /**
     * Constructor for the Trail class. Starts following the pointer and runs on GSAP's ticker.
     * @param {HTMLElement} DOM_el - The content element.
     * @param {Object} options - The settings above (threshold, lag, maxPerFrame), plus:
     *   size: how many images to take turns with;
     *   space: 'content' (positions relative to the content element, for DOM images) or 'viewport' (for a canvas over the viewport);
     *   onImage(step): shows an image. 'step' has index (which image), zIndex, to (where the image goes), from (the trailing
     *     position, as far behind 'to' as it is behind the pointer), lead (the pointer's lead over the trailing position: its
     *     direction and how fast it goes) and at ('to' in viewport pixels);
     *   onFrame(frame): called every frame, after any images were shown. 'frame' has dt (this frame's duration relative to
     *     a frame at 60fps), moved (whether the pointer moved) and movement (the pointer's movement, per frame at 60fps);
     *   onReset(): called when the pointer starts over somewhere else (a new touch, or the mouse coming back into the page).
     */
    constructor(DOM_el, {size, space = 'content', threshold, lag, maxPerFrame, onImage, onFrame, onReset} = {}) {
        this.DOM = {el: DOM_el};
        this.size = size;
        this.space = space;
        if ( threshold !== undefined ) this.threshold = threshold;
        if ( lag !== undefined ) this.lag = lag;
        if ( maxPerFrame !== undefined ) this.maxPerFrame = maxPerFrame;
        this.onImage = onImage;
        this.onFrame = onFrame;
        this.onReset = onReset;

        // Wraps any number into the range of image positions, so the sequence starts over after the last image.
        this.wrap = gsap.utils.wrap(0, this.size);

        // Pointer events cover mouse, touch and pen alike.
        window.addEventListener('pointermove', ev => this.move(ev));
        // A new touch, or the mouse coming back into the page somewhere else: start over from there,
        // so the next image doesn't slide in from where the pointer was before.
        window.addEventListener('pointerdown', ev => this.reset(ev));
        document.documentElement.addEventListener('pointerenter', ev => this.reset(ev));

        // Measure where the content element is, and again whenever the window is resized.
        this.getOffset();
        window.addEventListener('resize', () => this.getOffset());

        // Start on the next microtask: waking GSAP's ticker runs its listeners right away,
        // and the variation should have the engine stored before its first frame.
        queueMicrotask(() => gsap.ticker.add(this.tick));
    }

    /**
     * The getOffset method stores the position of the content element in the viewport.
     * @returns {void}
     */
    getOffset() {
        const rect = this.DOM.el.getBoundingClientRect();
        this.offset = {x: rect.left, y: rect.top};
    }

    /**
     * Follows the pointer. The very first time it shows up, everything starts from there.
     * @param {PointerEvent} ev - The event.
     * @returns {void}
     */
    move(ev) {
        if ( !this.pointer ) {
            this.reset(ev);
            return;
        }
        this.pointer = {x: ev.clientX, y: ev.clientY};
    }

    /**
     * Starts over at the pointer: the trailing position, the last image's point and the movement start from there.
     * @param {PointerEvent} ev - The event.
     * @returns {void}
     */
    reset(ev) {
        this.pointer = {x: ev.clientX, y: ev.clientY};
        this.trailing = {...this.pointer};
        this.last = {...this.pointer};
        this.previous = {...this.pointer};
        this.onReset?.();
    }

    /**
     * Converts a point in viewport pixels into the trail's space.
     * @param {Object} point - x and y in viewport pixels.
     * @returns {Object} - x and y in the trail's space.
     */
    toSpace(point) {
        return this.space === 'content' ? {x: point.x - this.offset.x, y: point.y - this.offset.y} : {...point};
    }

    /**
     * The pointer in the trail's space (null until it shows up).
     * @returns {Object|null} - x and y.
     */
    get position() {
        return this.pointer && this.toSpace(this.pointer);
    }

    /**
     * Runs every frame: moves the trailing position, shows the images the pointer's way has earned, then calls onFrame.
     * @returns {void}
     */
    tick = () => {
        // The duration of this frame relative to a frame at 60fps
        const dt = gsap.ticker.deltaRatio(60);
        let movement = {x: 0, y: 0};
        let moved = false;

        if ( this.pointer ) {
            movement = {x: (this.pointer.x - this.previous.x) / dt, y: (this.pointer.y - this.previous.y) / dt};
            moved = this.pointer.x !== this.previous.x || this.pointer.y !== this.previous.y;
            this.previous = {...this.pointer};

            // The trailing position closes the same share of the gap per second at any refresh rate.
            const follow = 1 - Math.pow(1 - this.lag, dt);
            this.trailing.x += (this.pointer.x - this.trailing.x) * follow;
            this.trailing.y += (this.pointer.y - this.trailing.y) * follow;

            if ( this.spawning ) {
                this.spawn();
            }
            else {
                this.last = {...this.pointer};
            }
        }

        this.onFrame?.({dt, moved, movement});
    }

    /**
     * Shows an image every 'threshold' pixels along the straight line from the last image to the pointer.
     * @returns {void}
     */
    spawn() {
        const dx = this.pointer.x - this.last.x;
        const dy = this.pointer.y - this.last.y;
        let distance = Math.hypot(dx, dy);
        if ( distance < this.threshold ) return;

        const step = {x: dx / distance * this.threshold, y: dy / distance * this.threshold};
        for (let n = 0; distance >= this.threshold && n < this.maxPerFrame; ++n) {
            this.last = {x: this.last.x + step.x, y: this.last.y + step.y};
            distance -= this.threshold;
            this.show(this.last);
        }
        // Too far to fill in: catch up with the pointer.
        if ( distance >= this.threshold ) {
            this.last = {...this.pointer};
        }
    }

    /**
     * Hands the next image to the variation.
     * @param {Object} at - Where it goes, in viewport pixels.
     * @returns {void}
     */
    show(at) {
        const lead = {x: this.pointer.x - this.trailing.x, y: this.pointer.y - this.trailing.y};
        const to = this.toSpace(at);
        this.onImage?.({
            index: this.wrap(this.count++),
            zIndex: ++this.zIndex,
            to,
            from: {x: to.x - lead.x, y: to.y - lead.y},
            lead,
            at: {...at}
        });
    }
}

export { fillPool };
