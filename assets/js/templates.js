/**
 * cliento - WhatsApp Message Template, Product & Smart WhatsApp Composer Manager
 * Features:
 * - Complete individually-separated Indonesian business & place categories
 * - Search, Sort (A-Z, Z-A, Tersimpan dulu), Scrollable box + Custom inline category creation
 * - Offered Products / Services catalog with prepared offering copy
 * - Smart WhatsApp Composer Popup triggered on WhatsApp icon/button click
 */

const INDONESIAN_BUSINESS_CATEGORIES = [
    // Kuliner & F&B
    'Kafe', 'Kedai Kopi', 'Restoran', 'Rumah Makan', 'Warung Makan', 'Warteg',
    'Warung Bakso', 'Warung Soto', 'Warung Mie Ayam', 'Warung Sate', 'Seafood',
    'Ayam Goreng & Geprek', 'Fast Food', 'Bakery', 'Toko Roti', 'Toko Kue',
    'Katering', 'Minuman Kekinian', 'Kedai Es Krim', 'Depot Air Minum',
    // Otomotif & Transportasi
    'Bengkel Mobil', 'Bengkel Motor', 'Bengkel Las', 'Cuci Mobil', 'Cuci Motor',
    'Toko Ban', 'Toko Velg', 'Toko Aki', 'Toko Sparepart Otomotif', 'Toko Oli',
    'Dealer Mobil', 'Dealer Motor', 'Showroom Mobil Bekas', 'Showroom Motor Bekas',
    'Rental Mobil', 'Rental Motor', 'Jasa Travel', 'Rental Bus Pariwisata', 'SPBU',
    // Jasa Perawatan, Servis & Kebersihan
    'Laundry', 'Laundry Sepatu', 'Cleaning Service', 'Sedot WC', 'Pest Control',
    'Service AC', 'Service Elektronik', 'Service Kulkas & Mesin Cuci',
    'Service Komputer', 'Service Laptop', 'Service HP', 'Tukang Kunci',
    // Kecantikan, Grooming & Kesehatan
    'Salon Kecantikan', 'Barbershop', 'Pangkas Rambut', 'Klinik Skincare',
    'Spa', 'Pijat Refleksi', 'Studio Nail Art', 'Studio Sulam Alis',
    'Rumah Sakit', 'RSIA', 'Puskesmas', 'Klinik Umum', 'Klinik Gigi',
    'Praktek Dokter', 'Praktek Bidan', 'Apotek', 'Toko Obat',
    'Laboratorium Medis', 'Optik', 'Fisioterapi', 'Khitan Center',
    // Pendidikan & Pelatihan
    'PAUD', 'TK', 'SD', 'SMP', 'SMA', 'SMK', 'Universitas', 'Politeknik',
    'Akademi', 'Bimbingan Belajar (Bimbel)', 'Les Privat', 'Kursus Bahasa',
    'Kursus Komputer', 'LPK / Pelatihan Kerja', 'Pondok Pesantren', 'SLB',
    // Perdagangan & Retail
    'Minimarket', 'Supermarket', 'Swalayan', 'Toko Sembako', 'Toko Kelontong',
    'Agen Grosir', 'Toko Pakaian', 'Butik', 'Distro', 'Konveksi', 'Penjahit',
    'Toko Hijab', 'Toko Sepatu', 'Toko Tas', 'Toko Kosmetik', 'Toko Parfum',
    'Toko Emas', 'Toko Jam Tangan', 'Toko Kacamata', 'Toko Elektronik',
    'Konter HP & Pulsa', 'Toko Komputer', 'Toko Bangunan', 'Toko Cat',
    'Toko Besi', 'Toko Kaca & Aluminium', 'Toko Furniture / Mebel',
    'Toko Buku', 'Toko ATK', 'Fotocopy', 'Percetakan', 'Sablon',
    'Pet Shop', 'Toko Pakan Ternak', 'Toko Pertanian', 'Toko Pupuk & Bibit',
    'Florist / Toko Bunga', 'Toko Mainan', 'Toko Alat Olahraga', 'Toko Alat Musik',
    'Toko Oleh-oleh', 'Toko Bahan Kue', 'Toko Sepeda', 'Toko Alat Kesehatan',
    'Toko Helm', 'Toko Ikan Hias', 'Toko Kerajinan',
    // Properti, Konstruksi & Akomodasi
    'Hotel', 'Villa', 'Resort', 'Guest House', 'Homestay', 'Kos-kosan',
    'Kontrakan', 'Apartemen', 'Developer Perumahan', 'Agen Properti',
    'Kontraktor Bangunan', 'Arsitek', 'Desain Interior', 'Mandor Renovasi',
    'Gudang / Warehouse',
    // Perusahaan, Jasa Profesional, Keuangan & Kreatif
    'Kantor PT', 'Kantor CV', 'Pabrik / Manufaktur', 'Distributor', 'Supplier',
    'Eksportir / Importir', 'Ekspedisi', 'Cargo', 'Notaris & PPAT',
    'Kantor Hukum / Advokat', 'Konsultan Pajak', 'Kantor Akuntan',
    'Konsultan Bisnis', 'Digital Agency', 'Software House', 'Studio Foto',
    'Jasa Fotografi', 'Wedding Organizer', 'Event Organizer', 'Sewa Alat Pesta',
    'Studio Musik', 'Coworking Space', 'Bank', 'BPR', 'Koperasi',
    'Pegadaian', 'Asuransi', 'Travel Umrah & Haji', 'Biro Wisata',
    // Agribisnis
    'Peternakan', 'Perikanan / Tambak', 'Pertanian / Perkebunan', 'Penggilingan Padi',
    // Olahraga, Wisata, Publik & Sosial
    'Gym & Fitness', 'Lapangan Futsal', 'Lapangan Badminton', 'Kolam Renang',
    'Tempat Wisata', 'Gedung Pertemuan', 'Masjid', 'Gereja', 'Vihara', 'Pura',
    'Panti Asuhan', 'Yayasan Sosial', 'Kantor Dinas', 'Kantor Kecamatan',
    'Kantor Kelurahan / Desa', 'Pasar Tradisional', 'Usaha Lokal / Umum'
];

const DEFAULT_TEMPLATE_BODY =
    'Hallo kak dgn pemilik/team manajemen {nama_tempat}? Kami dari tim cliento melihat potensi usaha {kategori} kakak di {alamat} sangat menarik. Boleh kami kirimkan detail penawaran singkat? Terima kasih!';

const TemplateManager = {
    categories: [],
    products: [],
    activeCategory: 'Kafe',
    templatesMap: {},
    categorySearch: '',
    categorySort: 'az',
    previewProductId: '',
    activeComposerItem: null,
    composerSearch: '',
    composerSort: 'match',
    composerSelectedCategory: null,

    async init() {
        await this.loadTemplates();
        this.renderCategorySelect();
        this.renderProductsList();
        this.bindEvents();
        this.bindComposerEvents();
    },

    isStaticHost() {
        return typeof window !== 'undefined' &&
            (window.location.hostname.includes('github.io') || window.location.protocol === 'file:');
    },

    getFetcher() {
        return (typeof window !== 'undefined' && window.appFetch) ? window.appFetch : fetch;
    },

    escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    buildDefaultCategories() {
        return INDONESIAN_BUSINESS_CATEGORIES.map((name, idx) => ({
            category_id: idx + 1,
            category_name: name,
            greeting_type: 'formal',
            message_body: DEFAULT_TEMPLATE_BODY,
            has_custom_template: false
        }));
    },

    normalizeLoadedData(categories, products) {
        const byName = new Map();

        this.buildDefaultCategories().forEach(c => {
            byName.set(c.category_name.toLowerCase(), c);
        });

        (categories || []).forEach(c => {
            const cName = String(c.category_name || c.name || '').trim();
            if (!cName) return;
            byName.set(cName.toLowerCase(), {
                category_id: c.category_id || c.id || Date.now(),
                category_name: cName,
                greeting_type: c.greeting_type || 'formal',
                message_body: c.message_body || DEFAULT_TEMPLATE_BODY,
                has_custom_template: Boolean(c.has_custom_template),
                updated_at: c.updated_at || null
            });
        });

        this.categories = Array.from(byName.values());
        this.templatesMap = {};
        this.categories.forEach(c => {
            this.templatesMap[c.category_name] = c;
        });

        if (!this.activeCategory || !this.templatesMap[this.activeCategory]) {
            this.activeCategory = this.categories.length ? this.categories[0].category_name : 'Kafe';
        }

        if (Array.isArray(products)) {
            this.products = products.map(p => ({
                id: String(p.id),
                name: String(p.name || '').trim(),
                offer_sentence: String(p.offer_sentence || '').trim()
            })).filter(p => p.name);
        }
    },

    async loadTemplates() {
        try {
            if (!this.isStaticHost()) {
                const res = await this.getFetcher()('api/templates.php?action=list');
                if (res && res.ok) {
                    const data = await res.json();
                    if (data.success && Array.isArray(data.categories)) {
                        this.normalizeLoadedData(data.categories, data.products || []);
                        return;
                    }
                }
            }
        } catch (e) {
            console.warn('Backend unavailable, using local templates & products:', e);
        }

        // Static / offline fallback with localStorage persistence
        let mergedCats = this.buildDefaultCategories();
        try {
            const savedCustom = JSON.parse(localStorage.getItem('cliento_static_templates') || '{}');
            const mapByLower = new Map(mergedCats.map(c => [c.category_name.toLowerCase(), c]));
            Object.keys(savedCustom).forEach(catName => {
                const entry = savedCustom[catName];
                if (!entry) return;
                mapByLower.set(catName.toLowerCase(), {
                    category_id: entry.category_id || Date.now(),
                    category_name: catName,
                    greeting_type: entry.greeting_type || 'formal',
                    message_body: entry.message_body || DEFAULT_TEMPLATE_BODY,
                    has_custom_template: true
                });
            });
            mergedCats = Array.from(mapByLower.values());
        } catch (_) {}

        let localProducts = [];
        try {
            const parsed = JSON.parse(localStorage.getItem('cliento_static_products') || '[]');
            if (Array.isArray(parsed)) localProducts = parsed;
        } catch (_) {}

        this.normalizeLoadedData(mergedCats, localProducts);
    },

    getFilteredSortedCategories(searchQuery = this.categorySearch, sortMode = this.categorySort, preferredCategory = '') {
        const q = String(searchQuery || '').trim().toLowerCase();
        const prefLower = String(preferredCategory || '').trim().toLowerCase();

        const filtered = (this.categories || []).filter(c => {
            if (!q) return true;
            return c.category_name.toLowerCase().includes(q) ||
                String(c.message_body || '').toLowerCase().includes(q);
        });

        filtered.sort((a, b) => {
            if (sortMode === 'match' && prefLower) {
                const aMatch = a.category_name.toLowerCase() === prefLower ||
                    a.category_name.toLowerCase().includes(prefLower) ||
                    prefLower.includes(a.category_name.toLowerCase());
                const bMatch = b.category_name.toLowerCase() === prefLower ||
                    b.category_name.toLowerCase().includes(prefLower) ||
                    prefLower.includes(b.category_name.toLowerCase());
                if (aMatch !== bMatch) return aMatch ? -1 : 1;
            }
            if (sortMode === 'saved' || sortMode === 'match') {
                if (Boolean(a.has_custom_template) !== Boolean(b.has_custom_template)) {
                    return a.has_custom_template ? -1 : 1;
                }
            }
            if (sortMode === 'za') {
                return b.category_name.localeCompare(a.category_name, 'id');
            }
            return a.category_name.localeCompare(b.category_name, 'id');
        });

        return filtered;
    },

    renderCategorySelect() {
        const selectEl = document.getElementById('template-category-select');
        if (selectEl) {
            selectEl.innerHTML = '';
            const sortedForSelect = this.getFilteredSortedCategories('', 'az');
            sortedForSelect.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.category_name;
                opt.textContent = c.category_name;
                if (c.category_name === this.activeCategory) opt.selected = true;
                selectEl.appendChild(opt);
            });
        }

        this.renderCategoryListBox();
        this.displayActiveTemplate();
    },

    renderCategoryListBox() {
        const listBox = document.getElementById('template-category-listbox');
        const countEl = document.getElementById('template-category-count');
        const activeBadge = document.getElementById('template-active-badge');
        if (activeBadge) {
            activeBadge.textContent = `Kategori: ${this.activeCategory || '-'}`;
        }
        if (!listBox) return;

        const filtered = this.getFilteredSortedCategories(this.categorySearch, this.categorySort);
        const rawSearch = String(this.categorySearch || '').trim();
        const exactMatch = rawSearch && (this.categories || []).some(
            c => c.category_name.toLowerCase() === rawSearch.toLowerCase()
        );

        if (countEl) {
            countEl.textContent = rawSearch
                ? `${filtered.length} cocok dari ${this.categories.length} kategori`
                : `${this.categories.length} kategori bisnis Indonesia`;
        }

        const rowsHtml = filtered.map(c => {
            const isActive = c.category_name === this.activeCategory;
            const badgeHtml = c.has_custom_template
                ? '<span class="tpl-cat-badge saved">Tersimpan</span>'
                : '<span class="tpl-cat-badge default">Default</span>';
            return `
                <button type="button" class="tpl-cat-item ${isActive ? 'active' : ''}" data-category="${this.escapeHtml(c.category_name)}" role="option" aria-selected="${isActive ? 'true' : 'false'}">
                    <span>${isActive ? '✓ ' : ''}${this.escapeHtml(c.category_name)}</span>
                    ${badgeHtml}
                </button>
            `;
        }).join('');

        let addInlineBanner = '';
        if (rawSearch && !exactMatch) {
            addInlineBanner = `
                <div style="padding: 8px; margin-top: 4px; background: #eff6ff; border: 1px dashed #60a5fa; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span style="font-size: 0.74rem; color: #1e3a8a;">${filtered.length === 0 ? `Kategori "<strong>${this.escapeHtml(rawSearch)}</strong>" belum ada.` : `Ingin pakai "<strong>${this.escapeHtml(rawSearch)}</strong>"?`}</span>
                    <button type="button" id="btn-inline-add-search-cat" class="btn btn-primary btn-sm" style="font-size: 0.71rem; padding: 4px 10px;">
                        <i class="fa-solid fa-plus"></i> Tambahkan "${this.escapeHtml(rawSearch)}"
                    </button>
                </div>
            `;
        }

        listBox.innerHTML = rowsHtml + addInlineBanner;

        if (typeof listBox.querySelectorAll === 'function') {
            listBox.querySelectorAll('.tpl-cat-item').forEach(btn => {
                btn.addEventListener('click', () => {
                    const cat = btn.getAttribute('data-category');
                    if (cat) this.selectCategory(cat);
                });
            });
            const inlineBtn = typeof listBox.querySelector === 'function' ? listBox.querySelector('#btn-inline-add-search-cat') : null;
            if (inlineBtn) {
                inlineBtn.addEventListener('click', () => this.addNewCategory(rawSearch));
            }
        }
    },

    selectCategory(categoryName) {
        this.activeCategory = categoryName;
        const selectEl = document.getElementById('template-category-select');
        if (selectEl) selectEl.value = categoryName;
        this.renderCategoryListBox();
        this.displayActiveTemplate();
    },

    displayActiveTemplate() {
        const tpl = this.templatesMap[this.activeCategory] || {
            category_name: this.activeCategory,
            greeting_type: 'formal',
            message_body: DEFAULT_TEMPLATE_BODY
        };

        const bodyInput = document.getElementById('template-body-input');
        const greetingSelect = document.getElementById('template-greeting-select');

        if (bodyInput) bodyInput.value = tpl.message_body || DEFAULT_TEMPLATE_BODY;
        if (greetingSelect) greetingSelect.value = tpl.greeting_type || 'formal';

        this.updateMockupPreview();
    },

    getSelectedPreviewProduct() {
        if (this.previewProductId) {
            const found = (this.products || []).find(p => String(p.id) === String(this.previewProductId));
            if (found) return found;
        }
        return (this.products && this.products.length > 0) ? this.products[0] : null;
    },

    prepareProductOfferSentence(product, item) {
        if (!product || !product.name) return '';
        const placeName = (item && item.name) ? item.name : 'usaha kakak';
        const rawSentence = String(product.offer_sentence || '').trim();
        const sentence = rawSentence || `Kebetulan kami menyediakan {nama_produk} yang cocok untuk membantu pengembangan usaha {nama_tempat}.`;
        return sentence
            .replace(/\{nama_produk\}/g, product.name)
            .replace(/\{produk\}/g, product.name)
            .replace(/\{nama_tempat\}/g, placeName);
    },

    resolveMessageVariables(rawText, item = {}, product = null) {
        const text = String(rawText || '');
        const prodName = product && product.name ? product.name : 'Paket Layanan Unggulan';
        const ratingVal = (item.rating && Number(item.rating) > 0) ? String(item.rating) : 'belum tersedia';
        return text
            .replace(/\{nama_tempat\}/g, item.name || 'Tempat Usaha')
            .replace(/\{kategori\}/g, item.category || this.activeCategory || 'Usaha Lokal')
            .replace(/\{alamat\}/g, item.address || 'lokasi Anda')
            .replace(/\{rating\}/g, ratingVal)
            .replace(/\{telepon\}/g, item.phone || '')
            .replace(/\{produk\}/g, prodName)
            .replace(/\{nama_produk\}/g, prodName);
    },

    updateMockupPreview() {
        const bodyInput = document.getElementById('template-body-input');
        const previewEl = document.getElementById('wa-preview-text');
        if (!bodyInput || !previewEl) return;

        const previewProd = this.getSelectedPreviewProduct();
        const sampleText = this.resolveMessageVariables(bodyInput.value || '', {
            name: 'Kopi Senja Utama',
            category: this.activeCategory || 'Kafe',
            address: 'Jl. Pemuda No. 45, Magelang',
            rating: '4.8',
            phone: '+62 812-3456-7890'
        }, previewProd);

        previewEl.innerHTML = this.escapeHtml(sampleText).replace(/\n/g, '<br>');
    },

    insertVariable(tag, targetInputId = 'template-body-input') {
        const bodyInput = document.getElementById(targetInputId);
        if (!bodyInput) return;

        const start = typeof bodyInput.selectionStart === 'number' ? bodyInput.selectionStart : bodyInput.value.length;
        const end = typeof bodyInput.selectionEnd === 'number' ? bodyInput.selectionEnd : bodyInput.value.length;
        const text = bodyInput.value || '';
        bodyInput.value = text.substring(0, start) + tag + text.substring(end);
        if (typeof bodyInput.selectionStart === 'number') {
            bodyInput.selectionStart = bodyInput.selectionEnd = start + tag.length;
        }
        if (typeof bodyInput.focus === 'function') bodyInput.focus();
        if (targetInputId === 'template-body-input') {
            this.updateMockupPreview();
        }
    },

    async saveCurrentTemplate() {
        const bodyInput = document.getElementById('template-body-input');
        const greetingSelect = document.getElementById('template-greeting-select');
        const statusEl = document.getElementById('template-save-status');
        if (!bodyInput) return;

        const payload = {
            category_name: this.activeCategory,
            greeting_type: greetingSelect ? greetingSelect.value : 'formal',
            message_body: bodyInput.value.trim(),
            has_custom_template: true
        };
        if (!payload.message_body) {
            alert('Isi pesan WhatsApp tidak boleh kosong.');
            return;
        }

        let savedRemote = false;
        try {
            if (!this.isStaticHost()) {
                const res = await this.getFetcher()('api/templates.php?action=save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (res && res.ok) {
                    const data = await res.json();
                    if (data.success) savedRemote = true;
                }
            }
        } catch (e) {
            console.warn('Backend unavailable, saving template to localStorage:', e);
        }

        const existingCat = (this.categories || []).find(c => c.category_name === this.activeCategory);
        if (existingCat) {
            existingCat.greeting_type = payload.greeting_type;
            existingCat.message_body = payload.message_body;
            existingCat.has_custom_template = true;
        } else {
            this.categories.push({ category_id: Date.now(), ...payload });
        }
        this.templatesMap[this.activeCategory] = existingCat || payload;

        if (!savedRemote) {
            try {
                const stored = JSON.parse(localStorage.getItem('cliento_static_templates') || '{}');
                stored[this.activeCategory] = payload;
                localStorage.setItem('cliento_static_templates', JSON.stringify(stored));
            } catch (_) {}
        }

        this.renderCategoryListBox();
        if (statusEl) {
            statusEl.textContent = savedRemote ? '✓ Template tersimpan!' : '✓ Template tersimpan (mode offline)!';
            statusEl.style.color = '#16a34a';
            setTimeout(() => { statusEl.textContent = ''; }, 3000);
        }
    },

    async addNewCategory(name) {
        const catName = String(name || '').trim();
        if (!catName) return;

        let addedRemote = false;
        try {
            if (!this.isStaticHost()) {
                const res = await this.getFetcher()('api/templates.php?action=create_category', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: catName })
                });
                if (res && res.ok) {
                    const data = await res.json();
                    if (data.success) {
                        addedRemote = true;
                    }
                }
            }
        } catch (e) {
            console.warn('Backend unavailable, adding category locally:', e);
        }

        const finalName = catName;
        if (!this.templatesMap[finalName]) {
            const newCat = {
                category_id: Date.now(),
                category_name: finalName,
                greeting_type: 'formal',
                message_body: DEFAULT_TEMPLATE_BODY,
                has_custom_template: true
            };
            this.categories.push(newCat);
            this.templatesMap[finalName] = newCat;
        }

        if (!addedRemote) {
            try {
                const stored = JSON.parse(localStorage.getItem('cliento_static_templates') || '{}');
                stored[finalName] = this.templatesMap[finalName];
                localStorage.setItem('cliento_static_templates', JSON.stringify(stored));
            } catch (_) {}
        }

        const newInput = document.getElementById('template-category-new-input');
        const searchInput = document.getElementById('template-category-search');
        const clearBtn = document.getElementById('btn-clear-cat-search');
        if (newInput) newInput.value = '';
        if (searchInput) searchInput.value = '';
        if (clearBtn) clearBtn.style.display = 'none';
        this.categorySearch = '';
        this.activeCategory = finalName;
        this.renderCategorySelect();

        if (window.ScraperClient?.showToast) {
            window.ScraperClient.showToast(`✓ Kategori "${finalName}" berhasil ditambahkan & dipilih!`);
        }
    },

    // ====================================================
    // PRODUCT / SERVICE OFFERINGS MANAGEMENT
    // ====================================================
    renderProductsList() {
        const container = document.getElementById('template-products-list');
        const countEl = document.getElementById('template-product-count');
        if (countEl) {
            countEl.textContent = `${this.products.length} produk`;
        }
        if (!container) return;

        if (!this.products.length) {
            container.innerHTML = `
                <div style="padding: 14px; text-align: center; font-size: 0.74rem; color: #64748b; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 8px;">
                    Belum ada produk didaftarkan. Tambahkan produk/jasa di atas agar bisa disisipkan saat chat WhatsApp.
                </div>
            `;
            return;
        }

        container.innerHTML = this.products.map(p => `
            <div class="tpl-product-item" data-product-id="${this.escapeHtml(p.id)}">
                <div style="min-width: 0; flex: 1;">
                    <div style="font-size: 0.78rem; font-weight: 700; color: #0f172a;">${this.escapeHtml(p.name)}</div>
                    <div style="font-size: 0.7rem; color: #475569; margin-top: 2px; line-height: 1.35;">${this.escapeHtml(p.offer_sentence || '-')}</div>
                </div>
                <div style="display: flex; gap: 4px; flex-shrink: 0; flex-wrap: wrap;">
                    <button type="button" class="btn btn-outline btn-sm btn-prod-preview" data-id="${this.escapeHtml(p.id)}" title="Pakai untuk pratinjau {produk}" style="font-size: 0.68rem; padding: 3px 7px; color: #059669; border-color: #a7f3d0;">Pakai</button>
                    <button type="button" class="btn btn-outline btn-sm btn-prod-edit" data-id="${this.escapeHtml(p.id)}" title="Ubah Produk" style="font-size: 0.68rem; padding: 3px 7px;"><i class="fa-solid fa-pen"></i></button>
                    <button type="button" class="btn btn-outline btn-sm btn-prod-del" data-id="${this.escapeHtml(p.id)}" title="Hapus Produk" style="font-size: 0.68rem; padding: 3px 7px; color: #dc2626; border-color: #fecaca;"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        `).join('');

        if (typeof container.querySelectorAll === 'function') {
            container.querySelectorAll('.btn-prod-preview').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.previewProductId = btn.getAttribute('data-id') || '';
                    const prod = this.products.find(x => String(x.id) === String(this.previewProductId));
                    if (prod) {
                        const bodyInput = document.getElementById('template-body-input');
                        if (bodyInput && !bodyInput.value.includes('{produk}') && !bodyInput.value.includes('{nama_produk}')) {
                            const sentence = this.prepareProductOfferSentence(prod, { name: '{nama_tempat}' });
                            bodyInput.value = (bodyInput.value.trim() ? bodyInput.value.trim() + '\n\n' : '') + sentence;
                        }
                        this.updateMockupPreview();
                    }
                });
            });

            container.querySelectorAll('.btn-prod-edit').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-id');
                    const prod = this.products.find(x => String(x.id) === String(id));
                    if (!prod) return;
                    const idEl = document.getElementById('product-edit-id');
                    const nameEl = document.getElementById('product-name-input');
                    const offerEl = document.getElementById('product-offer-input');
                    const saveBtn = document.getElementById('btn-save-product');
                    const cancelBtn = document.getElementById('btn-cancel-product-edit');
                    if (idEl) idEl.value = prod.id;
                    if (nameEl) nameEl.value = prod.name;
                    if (offerEl) offerEl.value = prod.offer_sentence || '';
                    if (saveBtn) saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Simpan Perubahan';
                    if (cancelBtn) cancelBtn.style.display = 'inline-flex';
                });
            });

            container.querySelectorAll('.btn-prod-del').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-id');
                    if (id) this.deleteProduct(id);
                });
            });
        }
    },

    resetProductForm() {
        const idEl = document.getElementById('product-edit-id');
        const nameEl = document.getElementById('product-name-input');
        const offerEl = document.getElementById('product-offer-input');
        const saveBtn = document.getElementById('btn-save-product');
        const cancelBtn = document.getElementById('btn-cancel-product-edit');
        if (idEl) idEl.value = '';
        if (nameEl) nameEl.value = '';
        if (offerEl) offerEl.value = '';
        if (saveBtn) saveBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Tambah Produk';
        if (cancelBtn) cancelBtn.style.display = 'none';
    },

    async saveProductFromForm() {
        const idEl = document.getElementById('product-edit-id');
        const nameEl = document.getElementById('product-name-input');
        const offerEl = document.getElementById('product-offer-input');
        const prodId = idEl ? idEl.value.trim() : '';
        const name = nameEl ? nameEl.value.trim() : '';
        let offerSentence = offerEl ? offerEl.value.trim() : '';

        if (!name) {
            alert('Nama produk atau layanan wajib diisi.');
            return;
        }
        if (!offerSentence) {
            offerSentence = `Kebetulan kami menyediakan ${name} yang dapat disesuaikan untuk membantu perkembangan usaha {nama_tempat}.`;
        }

        let savedProd = null;
        try {
            if (!this.isStaticHost()) {
                const res = await this.getFetcher()('api/templates.php?action=save_product', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: prodId, name, offer_sentence: offerSentence })
                });
                if (res && res.ok) {
                    const data = await res.json();
                    if (data.success && data.product) {
                        savedProd = {
                            id: String(data.product.id),
                            name: data.product.name,
                            offer_sentence: data.product.offer_sentence
                        };
                    }
                }
            }
        } catch (e) {
            console.warn('Backend unavailable, saving product to localStorage:', e);
        }

        if (!savedProd) {
            savedProd = {
                id: prodId || String(Date.now()),
                name,
                offer_sentence: offerSentence
            };
        }

        const existingIdx = this.products.findIndex(p => String(p.id) === String(savedProd.id));
        if (existingIdx >= 0) {
            this.products[existingIdx] = savedProd;
        } else {
            this.products.unshift(savedProd);
        }

        try {
            localStorage.setItem('cliento_static_products', JSON.stringify(this.products));
        } catch (_) {}

        this.resetProductForm();
        this.renderProductsList();
        this.updateMockupPreview();
        this.populateComposerProductSelect();

        if (window.ScraperClient?.showToast) {
            window.ScraperClient.showToast(`✓ Produk "${name}" berhasil disimpan!`);
        }
    },

    async deleteProduct(prodId) {
        try {
            if (!this.isStaticHost()) {
                await this.getFetcher()('api/templates.php?action=delete_product', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: prodId })
                });
            }
        } catch (e) {}

        this.products = this.products.filter(p => String(p.id) !== String(prodId));
        try {
            localStorage.setItem('cliento_static_products', JSON.stringify(this.products));
        } catch (_) {}

        this.renderProductsList();
        this.populateComposerProductSelect();
    },

    // ====================================================
    // WHATSAPP URL & PERSONALIZATION HELPERS
    // ====================================================
    formatWhatsAppDigits(rawPhone) {
        let phone = String(rawPhone || '').replace(/[^0-9]/g, '');
        if (!phone) return '';
        if (phone.startsWith('0')) {
            phone = '62' + phone.substring(1);
        } else if (!phone.startsWith('62') && phone.length >= 8) {
            phone = '62' + phone;
        }
        return phone;
    },

    findBestTemplateForItem(item) {
        const rawCat = String(item?.category || '').trim().toLowerCase();
        if (rawCat) {
            const exact = this.categories.find(c => c.category_name.toLowerCase() === rawCat);
            if (exact) return exact;
            const fuzzy = this.categories.find(c =>
                rawCat.includes(c.category_name.toLowerCase()) || c.category_name.toLowerCase().includes(rawCat)
            );
            if (fuzzy) return fuzzy;
        }
        const customFirst = this.categories.find(c => c.has_custom_template);
        return customFirst || this.categories[0] || {
            category_name: rawCat || 'Usaha Lokal',
            message_body: DEFAULT_TEMPLATE_BODY
        };
    },

    getPersonalizedMessage(item, explicitCategory = null, product = null) {
        const tpl = explicitCategory && this.templatesMap[explicitCategory]
            ? this.templatesMap[explicitCategory]
            : this.findBestTemplateForItem(item);
        return this.resolveMessageVariables(tpl?.message_body || DEFAULT_TEMPLATE_BODY, item, product);
    },

    buildWhatsAppSendUrl(rawPhone, messageText) {
        const phone = this.formatWhatsAppDigits(rawPhone);
        const encodedMsg = encodeURIComponent(String(messageText || '').trim());
        if (!phone) return `https://api.whatsapp.com/send?text=${encodedMsg}`;
        return `https://api.whatsapp.com/send?phone=${phone}&text=${encodedMsg}`;
    },

    getWhatsAppUrl(item) {
        const msg = this.getPersonalizedMessage(item);
        return this.buildWhatsAppSendUrl(item?.phone || '', msg);
    },

    // ====================================================
    // SMART WHATSAPP COMPOSER POPUP (#modal-wa-composer)
    // ====================================================
    openWhatsAppComposer(item) {
        this.activeComposerItem = item || {};
        const modal = document.getElementById('modal-wa-composer');
        if (!modal) {
            window.open(this.getWhatsAppUrl(item), '_blank', 'noopener');
            return;
        }

        const bizNameEl = document.getElementById('wa-comp-biz-name');
        const bizMetaEl = document.getElementById('wa-comp-biz-meta');
        const phoneEl = document.getElementById('wa-comp-phone');
        const msgEl = document.getElementById('wa-comp-message');
        const statusEl = document.getElementById('wa-comp-status');
        const tplSearchEl = document.getElementById('wa-comp-tpl-search');
        const tplSortEl = document.getElementById('wa-comp-tpl-sort');

        if (bizNameEl) bizNameEl.textContent = item.name || 'Calon Prospek';
        if (bizMetaEl) {
            const ratingTxt = (item.rating && Number(item.rating) > 0) ? `⭐ ${item.rating}` : 'Rating tidak tersedia';
            bizMetaEl.textContent = `${item.category || 'Usaha Lokal'} • ${item.address || 'Indonesia'} • ${ratingTxt}`;
        }
        if (phoneEl) {
            const clean = (item.phone && item.phone !== '-') ? item.phone : '';
            phoneEl.value = clean;
        }
        if (statusEl) statusEl.textContent = '';

        this.composerSearch = '';
        this.composerSort = 'match';
        if (tplSearchEl) tplSearchEl.value = '';
        if (tplSortEl) tplSortEl.value = 'match';

        const bestTpl = this.findBestTemplateForItem(item);
        this.composerSelectedCategory = bestTpl ? bestTpl.category_name : null;

        this.populateComposerProductSelect();
        this.renderComposerTemplatesList();

        if (msgEl) {
            const selectedProd = this.getSelectedComposerProduct();
            msgEl.value = this.getPersonalizedMessage(item, this.composerSelectedCategory, selectedProd);
        }

        modal.classList.add('active');
    },

    getSelectedComposerProduct() {
        const sel = document.getElementById('wa-comp-product-select');
        const pid = sel ? sel.value : '';
        if (!pid) return null;
        return this.products.find(p => String(p.id) === String(pid)) || null;
    },

    populateComposerProductSelect() {
        const sel = document.getElementById('wa-comp-product-select');
        const sentenceEl = document.getElementById('wa-comp-product-sentence');
        const hintEl = document.getElementById('wa-comp-product-hint');
        if (!sel) return;

        const prevVal = sel.value;
        sel.innerHTML = '<option value="">-- Pilih produk / layanan terdaftar --</option>';
        (this.products || []).forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            sel.appendChild(opt);
        });

        if (prevVal && this.products.some(p => String(p.id) === String(prevVal))) {
            sel.value = prevVal;
        }

        if (hintEl) {
            hintEl.textContent = this.products.length
                ? `${this.products.length} produk siap disisipkan`
                : 'Belum ada produk — tambah di menu Template Pesan';
        }

        if (sentenceEl) {
            const curProd = this.getSelectedComposerProduct();
            sentenceEl.value = curProd ? this.prepareProductOfferSentence(curProd, this.activeComposerItem || {}) : '';
        }
    },

    renderComposerTemplatesList() {
        const listEl = document.getElementById('wa-comp-tpl-list');
        if (!listEl) return;

        const preferredCat = this.activeComposerItem?.category || '';
        const list = this.getFilteredSortedCategories(this.composerSearch, this.composerSort, preferredCat);

        if (!list.length) {
            listEl.innerHTML = '<div style="padding: 10px; font-size: 0.72rem; color: #64748b; text-align: center;">Tidak ada template yang cocok dengan pencarian. Anda tetap bisa tulis pesan manual di bawah.</div>';
            return;
        }

        const prefLower = String(preferredCat || '').toLowerCase();
        listEl.innerHTML = list.map(c => {
            const isSelected = this.composerSelectedCategory === c.category_name;
            const isCatMatch = prefLower && (
                c.category_name.toLowerCase() === prefLower ||
                c.category_name.toLowerCase().includes(prefLower) ||
                prefLower.includes(c.category_name.toLowerCase())
            );
            const snippet = String(c.message_body || '').replace(/\s+/g, ' ').slice(0, 95);
            return `
                <button type="button" class="wa-comp-tpl-item ${isSelected ? 'active' : ''}" data-category="${this.escapeHtml(c.category_name)}">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px;">
                        <strong style="font-size: 0.75rem; color: #0f172a;">${isSelected ? '✓ ' : ''}${this.escapeHtml(c.category_name)}</strong>
                        <div style="display: flex; gap: 4px; flex-shrink: 0;">
                            ${isCatMatch ? '<span class="tpl-cat-badge" style="background:#dbeafe;color:#1d4ed8;">Cocok</span>' : ''}
                            ${c.has_custom_template ? '<span class="tpl-cat-badge saved">Kustom</span>' : '<span class="tpl-cat-badge default">Default</span>'}
                        </div>
                    </div>
                    <div style="font-size: 0.68rem; color: #64748b; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this.escapeHtml(snippet)}</div>
                </button>
            `;
        }).join('');

        if (typeof listEl.querySelectorAll === 'function') {
            listEl.querySelectorAll('.wa-comp-tpl-item').forEach(btn => {
                btn.addEventListener('click', () => {
                    const catName = btn.getAttribute('data-category');
                    if (!catName) return;
                    this.composerSelectedCategory = catName;
                    this.renderComposerTemplatesList();
                    const msgEl = document.getElementById('wa-comp-message');
                    const statusEl = document.getElementById('wa-comp-status');
                    const prod = this.getSelectedComposerProduct();
                    if (msgEl && this.activeComposerItem) {
                        msgEl.value = this.getPersonalizedMessage(this.activeComposerItem, catName, prod);
                    }
                    if (statusEl) {
                        statusEl.textContent = `Template "${catName}" dimuat (siap diedit manual)`;
                    }
                });
            });
        }
    },

    insertComposerProductIntoMessage() {
        const msgEl = document.getElementById('wa-comp-message');
        const sentenceEl = document.getElementById('wa-comp-product-sentence');
        const statusEl = document.getElementById('wa-comp-status');
        const prod = this.getSelectedComposerProduct();

        let textToInsert = sentenceEl ? sentenceEl.value.trim() : '';
        if (!textToInsert && prod) {
            textToInsert = this.prepareProductOfferSentence(prod, this.activeComposerItem || {});
        }
        if (!textToInsert) {
            alert('Pilih produk terlebih dahulu atau tulis kalimat penawaran produk.');
            return;
        }

        textToInsert = this.resolveMessageVariables(textToInsert, this.activeComposerItem || {}, prod);
        if (!msgEl) return;

        const current = msgEl.value || '';
        if (current.includes('{produk}') || current.includes('{nama_produk}')) {
            msgEl.value = current
                .replace(/\{produk\}/g, prod ? prod.name : textToInsert)
                .replace(/\{nama_produk\}/g, prod ? prod.name : textToInsert);
        } else {
            msgEl.value = current.trim() ? `${current.trim()}\n\n${textToInsert}` : textToInsert;
        }

        if (statusEl) {
            statusEl.textContent = prod ? `✓ Penawaran "${prod.name}" disisipkan ke pesan` : '✓ Kalimat penawaran disisipkan';
        }
    },

    insertComposerVariableValue(tag) {
        const item = this.activeComposerItem || {};
        const prod = this.getSelectedComposerProduct();
        const resolved = this.resolveMessageVariables(tag, {
            ...item,
            phone: document.getElementById('wa-comp-phone')?.value || item.phone || ''
        }, prod);
        this.insertVariable(resolved, 'wa-comp-message');
    },

    getFinalComposerMessage() {
        const msgEl = document.getElementById('wa-comp-message');
        const raw = msgEl ? msgEl.value : '';
        const item = this.activeComposerItem || {};
        const phoneVal = document.getElementById('wa-comp-phone')?.value || item.phone || '';
        const prod = this.getSelectedComposerProduct();
        return this.resolveMessageVariables(raw, { ...item, phone: phoneVal }, prod).trim();
    },

    bindEvents() {
        const selectEl = document.getElementById('template-category-select');
        if (selectEl && !selectEl.dataset.bound) {
            selectEl.dataset.bound = '1';
            selectEl.addEventListener('change', (e) => {
                this.selectCategory(e.target.value);
            });
        }

        const catSearchEl = document.getElementById('template-category-search');
        const clearSearchBtn = document.getElementById('btn-clear-cat-search');
        if (catSearchEl && !catSearchEl.dataset.bound) {
            catSearchEl.dataset.bound = '1';
            catSearchEl.addEventListener('input', (e) => {
                this.categorySearch = e.target.value;
                if (clearSearchBtn) clearSearchBtn.style.display = this.categorySearch ? 'inline-block' : 'none';
                this.renderCategoryListBox();
            });
        }
        if (clearSearchBtn && !clearSearchBtn.dataset.bound) {
            clearSearchBtn.dataset.bound = '1';
            clearSearchBtn.addEventListener('click', () => {
                this.categorySearch = '';
                if (catSearchEl) catSearchEl.value = '';
                clearSearchBtn.style.display = 'none';
                this.renderCategoryListBox();
            });
        }

        const catSortEl = document.getElementById('template-category-sort');
        if (catSortEl && !catSortEl.dataset.bound) {
            catSortEl.dataset.bound = '1';
            catSortEl.addEventListener('change', (e) => {
                this.categorySort = e.target.value || 'az';
                this.renderCategoryListBox();
            });
        }

        const newCatInput = document.getElementById('template-category-new-input');
        const saveNewCatBtn = document.getElementById('btn-save-new-category');
        if (saveNewCatBtn && !saveNewCatBtn.dataset.bound) {
            saveNewCatBtn.dataset.bound = '1';
            saveNewCatBtn.addEventListener('click', () => {
                if (newCatInput && newCatInput.value.trim()) {
                    this.addNewCategory(newCatInput.value);
                } else if (newCatInput) {
                    newCatInput.focus();
                }
            });
        }
        if (newCatInput && !newCatInput.dataset.bound) {
            newCatInput.dataset.bound = '1';
            newCatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && newCatInput.value.trim()) {
                    e.preventDefault();
                    this.addNewCategory(newCatInput.value);
                }
            });
        }

        const addCatHeaderBtn = document.getElementById('btn-add-category');
        if (addCatHeaderBtn && !addCatHeaderBtn.dataset.bound) {
            addCatHeaderBtn.dataset.bound = '1';
            addCatHeaderBtn.addEventListener('click', () => {
                if (newCatInput) {
                    newCatInput.focus();
                    newCatInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
        }

        const bodyInput = document.getElementById('template-body-input');
        if (bodyInput && !bodyInput.dataset.bound) {
            bodyInput.dataset.bound = '1';
            bodyInput.addEventListener('input', () => this.updateMockupPreview());
        }

        const greetingSelect = document.getElementById('template-greeting-select');
        if (greetingSelect && !greetingSelect.dataset.bound) {
            greetingSelect.dataset.bound = '1';
            greetingSelect.addEventListener('change', (e) => {
                const val = e.target.value;
                let greeting = 'Hallo kak dgn pemilik/team manajemen {nama_tempat}? ';
                if (val === 'humas') {
                    greeting = 'Selamat siang bapak/ibu bagian humas & manajemen {nama_tempat}. ';
                } else if (val === 'casual') {
                    greeting = 'Halo kak {nama_tempat}! Salam kenal dari tim cliento. ';
                }
                if (bodyInput) {
                    bodyInput.value = greeting + bodyInput.value.replace(/^Hallo kak [^?]+\? |^Selamat siang [^.]+\. |^Halo kak [^!]+\! /, '');
                    this.updateMockupPreview();
                }
            });
        }

        if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
            document.querySelectorAll('#view-templates .var-chip').forEach(chip => {
                if (chip.dataset.bound) return;
                chip.dataset.bound = '1';
                chip.addEventListener('click', () => {
                    const tag = chip.getAttribute('data-tag');
                    if (tag) this.insertVariable(tag, 'template-body-input');
                });
            });
        }

        const saveBtn = document.getElementById('btn-save-template');
        if (saveBtn && !saveBtn.dataset.bound) {
            saveBtn.dataset.bound = '1';
            saveBtn.addEventListener('click', () => this.saveCurrentTemplate());
        }

        const saveProdBtn = document.getElementById('btn-save-product');
        if (saveProdBtn && !saveProdBtn.dataset.bound) {
            saveProdBtn.dataset.bound = '1';
            saveProdBtn.addEventListener('click', () => this.saveProductFromForm());
        }

        const cancelProdBtn = document.getElementById('btn-cancel-product-edit');
        if (cancelProdBtn && !cancelProdBtn.dataset.bound) {
            cancelProdBtn.dataset.bound = '1';
            cancelProdBtn.addEventListener('click', () => this.resetProductForm());
        }
    },

    bindComposerEvents() {
        const searchEl = document.getElementById('wa-comp-tpl-search');
        if (searchEl && !searchEl.dataset.bound) {
            searchEl.dataset.bound = '1';
            searchEl.addEventListener('input', (e) => {
                this.composerSearch = e.target.value;
                this.renderComposerTemplatesList();
            });
        }

        const sortEl = document.getElementById('wa-comp-tpl-sort');
        if (sortEl && !sortEl.dataset.bound) {
            sortEl.dataset.bound = '1';
            sortEl.addEventListener('change', (e) => {
                this.composerSort = e.target.value || 'match';
                this.renderComposerTemplatesList();
            });
        }

        const blankBtn = document.getElementById('btn-wa-comp-blank');
        if (blankBtn && !blankBtn.dataset.bound) {
            blankBtn.dataset.bound = '1';
            blankBtn.addEventListener('click', () => {
                this.composerSelectedCategory = null;
                this.renderComposerTemplatesList();
                const msgEl = document.getElementById('wa-comp-message');
                const statusEl = document.getElementById('wa-comp-status');
                if (msgEl) {
                    msgEl.value = '';
                    msgEl.focus();
                }
                if (statusEl) statusEl.textContent = 'Mode tulis manual dari nol aktif';
            });
        }

        const prodSelect = document.getElementById('wa-comp-product-select');
        if (prodSelect && !prodSelect.dataset.bound) {
            prodSelect.dataset.bound = '1';
            prodSelect.addEventListener('change', () => {
                const prod = this.getSelectedComposerProduct();
                const sentenceEl = document.getElementById('wa-comp-product-sentence');
                if (sentenceEl) {
                    sentenceEl.value = prod ? this.prepareProductOfferSentence(prod, this.activeComposerItem || {}) : '';
                }
            });
        }

        const insertProdBtn = document.getElementById('btn-wa-comp-insert-product');
        if (insertProdBtn && !insertProdBtn.dataset.bound) {
            insertProdBtn.dataset.bound = '1';
            insertProdBtn.addEventListener('click', () => this.insertComposerProductIntoMessage());
        }

        if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
            document.querySelectorAll('.wa-comp-var-chip').forEach(chip => {
                if (chip.dataset.bound) return;
                chip.dataset.bound = '1';
                chip.addEventListener('click', () => {
                    const tag = chip.getAttribute('data-tag');
                    if (tag) this.insertComposerVariableValue(tag);
                });
            });
        }

        const copyBtn = document.getElementById('btn-wa-comp-copy');
        if (copyBtn && !copyBtn.dataset.bound) {
            copyBtn.dataset.bound = '1';
            copyBtn.addEventListener('click', () => {
                const msg = this.getFinalComposerMessage();
                if (!msg) {
                    alert('Isi pesan masih kosong.');
                    return;
                }
                navigator.clipboard?.writeText(msg);
                const statusEl = document.getElementById('wa-comp-status');
                if (statusEl) statusEl.textContent = '✓ Pesan disalin ke clipboard!';
                if (window.ScraperClient?.showToast) {
                    window.ScraperClient.showToast('✓ Pesan WhatsApp disalin ke clipboard!');
                }
            });
        }

        const saveTplBtn = document.getElementById('btn-wa-comp-save-tpl');
        if (saveTplBtn && !saveTplBtn.dataset.bound) {
            saveTplBtn.dataset.bound = '1';
            saveTplBtn.addEventListener('click', async () => {
                const msgEl = document.getElementById('wa-comp-message');
                const rawMsg = msgEl ? msgEl.value.trim() : '';
                if (!rawMsg) {
                    alert('Isi pesan masih kosong.');
                    return;
                }
                const targetCat = this.composerSelectedCategory || this.activeComposerItem?.category || this.activeCategory;
                this.activeCategory = targetCat;
                const editorBody = document.getElementById('template-body-input');
                if (editorBody) editorBody.value = rawMsg;
                await this.saveCurrentTemplate();
                const statusEl = document.getElementById('wa-comp-status');
                if (statusEl) statusEl.textContent = `✓ Tersimpan ke template "${targetCat}"!`;
            });
        }

        const sendBtn = document.getElementById('btn-wa-comp-send');
        if (sendBtn && !sendBtn.dataset.bound) {
            sendBtn.dataset.bound = '1';
            sendBtn.addEventListener('click', () => {
                const msg = this.getFinalComposerMessage();
                const rawPhone = document.getElementById('wa-comp-phone')?.value || this.activeComposerItem?.phone || '';
                const digits = this.formatWhatsAppDigits(rawPhone);
                if (!digits) {
                    alert('Masukkan nomor WhatsApp tujuan terlebih dahulu (contoh: 0812xxxxxxxx).');
                    document.getElementById('wa-comp-phone')?.focus();
                    return;
                }
                const url = this.buildWhatsAppSendUrl(digits, msg);
                window.open(url, '_blank', 'noopener');
            });
        }
    }
};

if (typeof window !== 'undefined') {
    window.TemplateManager = TemplateManager;
}
