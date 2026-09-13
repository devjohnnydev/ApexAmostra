const fs = require('fs');
let html = fs.readFileSync('admin.html', 'utf8');

// 1. Add preview to banner inputs
const regexBanner = /<div style="display:flex; width: 100%; max-width: 600px; gap: 10px;">([\s\S]*?)<input type="text" data-key="([^"]+)" id="([^"]+)" class="form-input banner-url-input"/g;

html = html.replace(regexBanner, (match, p1, key, id) => {
    return `<div style="display:flex; width: 100%; max-width: 600px; gap: 10px; align-items: center;">
                            <img id="prev_${id}" src="" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px; border: 1px solid #444; display: none;" alt="Preview">${p1}<input type="text" data-key="${key}" id="${id}" class="form-input banner-url-input preview-trigger" data-preview="prev_${id}"`;
});

// 2. Add preview to mat-image
html = html.replace(
    /<div style="display:flex; width: 100%; gap: 10px;">\s*<input type="text" id="mat-image"/g,
    `<div style="display:flex; width: 100%; gap: 10px; align-items: center;">
                                    <img id="prev_mat-image" src="" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px; border: 1px solid #444; display: none;" alt="Preview">
                                    <input type="text" id="mat-image" class="preview-trigger" data-preview="prev_mat-image"`
);

// 3. Add preview to sol-img
html = html.replace(
    /<div style="display:flex; width: 100%; gap: 10px;">\s*<input type="text" id="sol-img"/g,
    `<div style="display:flex; width: 100%; gap: 10px; align-items: center;">
                                    <img id="prev_sol-img" src="" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px; border: 1px solid #444; display: none;" alt="Preview">
                                    <input type="text" id="sol-img" class="preview-trigger" data-preview="prev_sol-img"`
);

// 4. Update gal-url to use preview-trigger class
html = html.replace(
    /<input type="text" id="gal-url" required placeholder="https:\/\/exemplo.com\/foto.jpg" style="flex:1;">/g,
    `<input type="text" id="gal-url" class="preview-trigger" data-preview="gal-preview-img" required placeholder="https://exemplo.com/foto.jpg" style="flex:1;">`
);


fs.writeFileSync('admin.html', html);
console.log('Previews added to admin.html');
