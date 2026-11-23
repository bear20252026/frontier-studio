/**
 * Preloads images specified by the CSS selector: the source of an <img>, or the background image of any other element.
 * It also waits for the fonts, so the text doesn't change once the page is shown.
 * @function
 * @param {string} [selector='img'] - CSS selector for target images.
 * @returns {Promise} - Resolves when all specified images are loaded and decoded, and the fonts are ready.
 */
const preloadImages = (selector = 'img') => {
    // Collect the image URLs from the elements.
    const urls = [...document.querySelectorAll(selector)].map(el =>
        el instanceof HTMLImageElement ? el.currentSrc || el.src : backgroundImageUrl(el)
    ).filter(Boolean);

    return Promise.all([
        ...urls.map(url => {
            const img = new Image();
            img.src = url;
            // decode() resolves once the image is loaded and ready to be drawn. A broken image shouldn't keep the demo from starting, so its error is ignored.
            return img.decode().catch(() => {});
        }),
        document.fonts.ready
    ]);
};

/**
 * Reads the URL of an element's background image.
 * @function
 * @param {HTMLElement} el - The element.
 * @returns {string|undefined} - The absolute URL, or undefined if the element has no background image.
 */
const backgroundImageUrl = el => getComputedStyle(el).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];

/**
 * Media query for the visitor's reduced motion preference.
 * Check its 'matches' property every time an animation starts, so a change of the setting applies right away.
 */
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * Set the clip path for each of the clipInnerElements based on the provided grid dimensions.
 * @param {Array} clipInnerElements - The list of elements to set the clip paths on.
 * @param {number} numRows - The number of rows in the grid.
 * @param {number} numCols - The number of columns in the grid.
 */
const setClipPath = (clipInnerElements, numRows, numCols) => {
    if (clipInnerElements.length !== numRows * numCols) {
        console.error('Mismatch between provided grid dimensions and number of elements.');
        return;
    }

    for (let i = 0; i < numRows; i++) {
        for (let j = 0; j < numCols; j++) {
            const idx = i * numCols + j;

            const top = (100 / numRows) * i + '%';
            const bottom = (100 / numRows) * (i + 1) + '%';
            const left = (100 / numCols) * j + '%';
            const right = (100 / numCols) * (j + 1) + '%';

            const clipPathValue = `polygon(${left} ${top}, ${right} ${top}, ${right} ${bottom}, ${left} ${bottom})`;

            clipInnerElements[idx].style.clipPath = clipPathValue;
        }
    }
}

// Exporting utility functions for use in other modules.
export {
    preloadImages,
    backgroundImageUrl,
    reducedMotion,
    setClipPath
};
