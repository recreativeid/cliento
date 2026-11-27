const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

console.log('--- Testing Templates Search/Sort, Products Manager, WA Composer & Peluang/Pitch Removal ---');

const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const styleCss = fs.readFileSync(path.join(__dirname, '../assets/css/style.css'), 'utf8');
const templatesJs = fs.readFileSync(path.join(__dirname, '../assets/js/templates.js'), 'utf8');
const scraperJs = fs.readFileSync(path.join(__dirname, '../assets/js/scraper.js'), 'utf8');
const dataManagerJs = fs.readFileSync(path.join(__dirname, '../assets/js/data_manager.js'), 'utf8');
const archivesJs = fs.readFileSync(path.join(__dirname, '../assets/js/archives.js'), 'utf8');

// 1. UI controls in index.html & style.css
assert.ok(indexHtml.includes('id="template-category-search"'), 'Category search input must exist');
assert.ok(indexHtml.includes('id="template-category-sort"'), 'Category sort select must exist');
assert.ok(indexHtml.includes('id="template-category-listbox"'), 'Scrollable category listbox must exist');
assert.ok(indexHtml.includes('id="template-category-new-input"') && indexHtml.includes('id="btn-save-new-category"'), 'Manual add category inputs must exist');
assert.ok(indexHtml.includes('id="product-name-input"') && indexHtml.includes('id="product-offer-input"') && indexHtml.includes('id="btn-save-product"'), 'Manual product & offer form must exist');
assert.ok(indexHtml.includes('id="modal-wa-composer"') && indexHtml.includes('id="btn-wa-comp-blank"') && indexHtml.includes('id="wa-comp-product-select"') && indexHtml.includes('id="wa-comp-product-sentence"') && indexHtml.includes('id="btn-wa-comp-insert-product"'), 'Smart WhatsApp composer popup controls must exist');
assert.ok(styleCss.includes('.tpl-cat-box') && styleCss.includes('overflow-y: auto'), 'Category listbox CSS must be moderately sized & scrollable');

// 2. Peluang & Pitch buttons must be removed across UI
assert.equal(scraperJs.includes('btn-open-gemini-pitch'), false, 'Peluang & Pitch button must be removed from Scraper results table');
assert.equal(scraperJs.includes('btn-mdb-pitch'), false, 'AI Pitch button must be removed from Master DB results table');
assert.equal(dataManagerJs.includes('> Peluang<'), false, 'Peluang button must be removed from DataManager table');
assert.equal(archivesJs.includes('btn-open-ai-pitch-card'), false, 'AI Pitch button must be removed from Archives cards');
assert.equal(indexHtml.includes('id="btn-jump-to-ai-pitch"'), false, 'Buat Pesan AI jump button must be removed');
assert.equal(indexHtml.includes('id="btn-open-ai-template-gen"'), false, 'Racik Template AI button must be removed');

// 3. Evaluate TemplateManager in VM
const store = {};
const domElements = {};
function makeEl(id, extra = {}) {
    const el = {
        id,
        value: '',
        innerHTML: '',
        textContent: '',
        style: {},
        dataset: {},
        options: [],
        classList: {
            set: new Set(),
            add(c) { this.set.add(c); },
            remove(c) { this.set.delete(c); },
            contains(c) { return this.set.has(c); }
        },
        listeners: {},
        addEventListener(evt, fn) { this.listeners[evt] = fn; },
        appendChild(child) { this.options.push(child); },
        querySelectorAll() { return []; },
        focus() {},
        scrollIntoView() {},
        ...extra
    };
    domElements[id] = el;
    return el;
}

['template-category-select', 'template-category-listbox', 'template-category-count',
 'template-active-badge', 'template-category-search', 'btn-clear-cat-search',
 'template-category-sort', 'template-category-new-input', 'btn-save-new-category',
 'template-body-input', 'template-greeting-select', 'wa-preview-text',
 'template-save-status', 'product-edit-id', 'product-name-input', 'product-offer-input',
 'btn-save-product', 'btn-cancel-product-edit', 'template-products-list',
 'template-product-count', 'modal-wa-composer', 'wa-comp-biz-name', 'wa-comp-biz-meta',
 'wa-comp-phone', 'wa-comp-message', 'wa-comp-status', 'wa-comp-tpl-search',
 'wa-comp-tpl-sort', 'wa-comp-tpl-list', 'wa-comp-product-select',
 'wa-comp-product-sentence', 'wa-comp-product-hint', 'btn-wa-comp-blank',
 'btn-wa-comp-insert-product', 'btn-wa-comp-copy', 'btn-wa-comp-send'].forEach(id => makeEl(id));

const vmCtx = {
    window: { location: { hostname: 'recreativeid.github.io', protocol: 'https:' } },
    document: {
        getElementById: (id) => domElements[id] || null,
        createElement: () => makeEl('_tmp'),
        querySelectorAll: () => []
    },
    localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); }
    },
    console
};

vm.runInNewContext(templatesJs, vmCtx);
const TM = vmCtx.window.TemplateManager;

(async () => {
    await TM.init();

    // Check separated categories
    assert.ok(TM.categories.length >= 150, `Expected >=150 Indonesian categories, got ${TM.categories.length}`);
    assert.ok(TM.templatesMap['Laundry'], 'Laundry category must exist');
    assert.ok(TM.templatesMap['Bengkel Mobil'], 'Bengkel Mobil category must exist');
    assert.equal(TM.templatesMap['Bengkel & Laundry'], undefined, 'Bundled Bengkel & Laundry must NOT exist');

    // Search & Sort test
    const searched = TM.getFilteredSortedCategories('bengkel', 'az');
    assert.ok(searched.some(c => c.category_name === 'Bengkel Motor'));
    const sortedZa = TM.getFilteredSortedCategories('bengkel', 'za');
    assert.ok(sortedZa[0].category_name.localeCompare(sortedZa[sortedZa.length - 1].category_name, 'id') >= 0);

    // Custom category creation
    await TM.addNewCategory('Klinik Hewan Kustom');
    assert.ok(TM.templatesMap['Klinik Hewan Kustom'], 'Custom category must be created and selected');
    assert.equal(TM.activeCategory, 'Klinik Hewan Kustom');

    // Add manual product with default prepared offer sentence
    domElements['product-name-input'].value = 'Paket Website Sekolah';
    domElements['product-offer-input'].value = '';
    await TM.saveProductFromForm();
    assert.equal(TM.products.length, 1);
    assert.ok(TM.products[0].offer_sentence.includes('Paket Website Sekolah'));

    // Open WhatsApp composer popup on a scraped lead
    const sampleLead = {
        name: 'SD Harapan Bangsa',
        category: 'SD',
        address: 'Jl. Tentara Pelajar No. 10, Magelang',
        phone: '0812-3456-7890',
        rating: 4.8
    };
    TM.openWhatsAppComposer(sampleLead);
    assert.ok(domElements['modal-wa-composer'].classList.contains('active'), 'WhatsApp popup should become active');
    assert.ok(domElements['wa-comp-message'].value.includes('SD Harapan Bangsa'), 'Composer should auto-fill lead name');

    // Switch to Blank ("Tanpa Template / Buat dari Nol"), insert variable, and insert product offer
    domElements['btn-wa-comp-blank'].listeners.click();
    assert.equal(domElements['wa-comp-message'].value, '', 'Blank mode must clear textarea');
    TM.insertComposerVariableValue('Halo {nama_tempat} di {alamat}, ');
    assert.ok(domElements['wa-comp-message'].value.includes('Halo SD Harapan Bangsa di Jl. Tentara Pelajar No. 10, Magelang, '));

    domElements['wa-comp-product-select'].value = TM.products[0].id;
    domElements['wa-comp-product-sentence'].value = TM.prepareProductOfferSentence(TM.products[0], sampleLead);
    TM.insertComposerProductIntoMessage();
    const finalMsg = TM.getFinalComposerMessage();
    assert.ok(finalMsg.includes('SD Harapan Bangsa') && finalMsg.includes('Paket Website Sekolah'));

    const waUrl = TM.buildWhatsAppSendUrl(domElements['wa-comp-phone'].value, finalMsg);
    assert.ok(waUrl.startsWith('https://api.whatsapp.com/send?phone=6281234567890&text='), `Unexpected WA URL: ${waUrl}`);

    console.log('✓ All Template Category Search/Sort, Product Offerings & Smart WhatsApp Composer tests passed!');
})();
