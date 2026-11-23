
/**
 * Cuts a polygon with a straight line, keeping the part where (x * nx + y * ny) is at least 'limit'.
 * @function
 * @param {Array} points - The polygon's corners, [x, y] each.
 * @param {number} nx - The line's normal, x.
 * @param {number} ny - The line's normal, y.
 * @param {number} limit - Where the line is, measured along the normal.
 * @returns {Array} - The corners of the part that's kept.
 */
const cutPolygon = (points, nx, ny, limit) => {
    const kept = [];
    points.forEach((a, i) => {
        const b = points[(i + 1) % points.length];
        const da = a[0] * nx + a[1] * ny - limit;
        const db = b[0] * nx + b[1] * ny - limit;
        if ( da >= 0 ) kept.push(a);
        // The side from a to b crosses the line: keep the crossing point too.
        if ( (da >= 0) !== (db >= 0) ) {
            const t = da / (da - db);
            kept.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
    });
    return kept;
};

export class Image {
    // Class property initialization with default values.
    // The DOM property holds references to the main element of the image component and its slices.
    DOM = {
        el: null,       // Holds the reference to the main DOM element with class 'content__img'.
        slices: []      // Strips of the picture, side by side across the direction they're cut along.
    };
    // Property to hold the animation timeline for the image.
    timeline = null;
    // Number of slices
    slicesTotal = 12;
    // The angle the slices are cut at now, in radians
    angle = 0;
    // Size of the image in pixels
    size = {width: 0, height: 0};

    /**
     * Constructor for the Image class. Initializes the instance and makes the slices.
     * @param {HTMLElement} DOM_el - The main DOM element for the image, expected to have a child with class 'content__img-inner'.
     */
    constructor(DOM_el) {
        // Assign the provided DOM element to the 'el' property of the 'DOM' object.
        this.DOM.el = DOM_el;
        const inner = this.DOM.el.querySelector('.content__img-inner');
        this.size = {width: this.DOM.el.offsetWidth, height: this.DOM.el.offsetHeight};

        // Each slice is a copy of the inner element (the whole picture, with the image's rounded corners), clipped to its strip.
        for (let i = 0; i < this.slicesTotal; ++i) {
            this.DOM.slices.push(inner.cloneNode(true));
        }
        inner.replaceWith(...this.DOM.slices);
        this.cut(1, 0);

        // Center the image on its x and y position, instead of placing it by its top left corner. This way it never needs measuring.
        gsap.set(this.DOM.el, {xPercent: -50, yPercent: -50});
    }

    /**
     * Cuts the picture into strips that run along a direction, side by side across it.
     * @param {number} dx - The direction, x (a unit vector, with y going down).
     * @param {number} dy - The direction, y.
     * @returns {void}
     */
    cut(dx, dy) {
        // Cutting is the costly part (every slice gets a new clip path), so it's skipped when the angle has hardly changed.
        const angle = Math.atan2(dy, dx);
        const turn = Math.abs(Math.atan2(Math.sin(angle - this.angle), Math.cos(angle - this.angle)));
        if ( turn < 0.12 && this.DOM.slices[0].style.clipPath ) return;
        this.angle = angle;

        const {width, height} = this.size;
        // Across the direction
        const nx = -dy;
        const ny = dx;
        // The picture's corners, from its center, and how far it reaches across the direction either way
        const corners = [[-width / 2, -height / 2], [width / 2, -height / 2], [width / 2, height / 2], [-width / 2, height / 2]];
        const reach = Math.abs(nx) * width / 2 + Math.abs(ny) * height / 2;
        const strip = reach * 2 / this.slicesTotal;

        this.DOM.slices.forEach((slice, i) => {
            // The strip between two lines across the direction. Strips overlap by half a pixel, so no hairline shows between them.
            const start = -reach + i * strip - 0.5;
            const end = -reach + (i + 1) * strip + 0.5;
            const polygon = cutPolygon(cutPolygon(corners, nx, ny, start), -nx, -ny, -end);
            // In percentages of the image, from its top left
            slice.style.clipPath = `polygon(${polygon.map(([x, y]) => `${(x / width + 0.5) * 100}% ${(y / height + 0.5) * 100}%`).join(', ')})`;
        });
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
        // Put the slices back together.
        gsap.killTweensOf([this.DOM.el, ...this.DOM.slices]);
        gsap.set(this.DOM.slices, {x: 0, y: 0, opacity: 1});

        return gsap.timeline()
        .set(this.DOM.el, {
            zIndex: zIndex,
            scale: 1,
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
