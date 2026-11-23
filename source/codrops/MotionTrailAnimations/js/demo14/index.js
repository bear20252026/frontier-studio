// 'preloadImages' is a utility function that handles the preloading of images to ensure they are fully loaded before being used.
import { preloadImages } from '../utils.js';

// Preload all images
preloadImages('.content__img-inner').then(async () => {
    const content = document.querySelector('.content');

    try {
        // 'ImageTrail' draws the images with WebGL (WebGPU where available, WebGL 2 elsewhere).
        // It's imported here rather than at the top, so a browser that can't load three.js still gets a trail.
        const { ImageTrail } = await import('./imageTrail.js');
        const trail = new ImageTrail(content);
        // Loads the textures and compiles the shaders while the loader still shows.
        await trail.init();
    }
    catch (error) {
        // Without WebGPU or WebGL 2, fall back to the Classic trail, with the same images in the DOM.
        console.warn('WebGL is not available, showing the Classic trail instead.', error);
        document.querySelector('.content__canvas')?.remove();
        const { ImageTrail } = await import('../demo1/imageTrail.js');
        new ImageTrail(content);
    }

    // Once everything is ready, remove the 'loading' class from the body element.
    document.body.classList.remove('loading');
});
