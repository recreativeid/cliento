/**
 * cliento - Google Maps Scraper Orchestrator
 * Distinct Modes:
 * 1. Mode Wilayah Administratif: Cascading Province -> Reg/City -> District -> Village with Red Boundary Polygon. NO radius.
 * 2. Mode Titik Peta & Radius: Pin on Map Click + KM Radius slider. NO administrative region dropdowns.
 * Target Selection: Keyword Input OR Category Presets. (Custom typing tab removed as requested).
 * AI Outreach: 1-Click Clipboard Copy & Google Gemini AI Sales Pitch Generator.
 */

const ScraperClient = {
    googleMapsOnly: true,
    currentQuery: {
        zoneMode: 'boundary', // 'boundary' or 'radius'
        targetMode: 'preset', // 'keyword' or 'preset'
        category: 'sekolah',
        location: 'Kedungsari, Magelang Utara',
        lat: -7.4589,
        lng: 110.2251,
        radius: 3
    },

    territoryData: null,
    isScanningTerritory: false,
    candidatePlaces: [],
    scrapedResults: [],
    activeFilter: 'all',
    activeModalItem: null,

    init() {
        this.bindZoneModeTabs();
        this.bindTargetModeToggle();
        this.initRegionDropdowns();
        this.bindKeywordInput();
        this.bindRadiusControls();
        this.bindScrapingActions();
        this.bindLeadFilterPills();
        this.bindAIPitchModal();
        this.bind360ModalEvents();
        this.bindSourceImport();

        // Connect map click: Only active when in Radius Mode
        if (window.mapEngine) {
            window.mapEngine.onPointSelectedCallback = (lat, lng, radius) => {
                if (this.currentQuery.zoneMode === 'radius') {
                    this.currentQuery.lat = lat;
                    this.currentQuery.lng = lng;
                    this.currentQuery.radius = radius;
                    
                    // Identify closest Indonesian administrative region for accurate location labeling
                    let nearestName = 'Indonesia';
                    let minDist = 999999;
                    if (typeof REGIONS_DATA !== 'undefined') {
                        (REGIONS_DATA.provinces || []).forEach(p => {
                            const d = Math.hypot(p.lat - lat, p.lng - lng);
                            if (d < minDist) {
                                minDist = d;
                                nearestName = p.name;
                            }
                        });
                        for (const pid in REGIONS_DATA.regencies) {
                            (REGIONS_DATA.regencies[pid] || []).forEach(k => {
                                const d = Math.hypot(k.lat - lat, k.lng - lng);
                                if (d < minDist) {
                                    minDist = d;
                                    nearestName = k.name;
                                }
                            });
                        }
                    }

                    this.currentQuery.location = `${nearestName}`;
                    
                    const coordEl = document.getElementById('display-selected-coord');
                    if (coordEl) coordEl.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)} (${nearestName})`;

                    this.scanTerritory();
                }
            };
        }

        // Initial default view
        setTimeout(() => {
            this.handleRegionChange();
        }, 400);
    },

    // ----------------------------------------------------
    // 1. MUTUALLY EXCLUSIVE ZONE MODES
    // ----------------------------------------------------
    bindZoneModeTabs() {
        const btnBoundary = document.getElementById('btn-mode-boundary');
        const btnRadius = document.getElementById('btn-mode-radius');
        const boxBoundary = document.getElementById('zone-boundary-container');
        const boxRadius = document.getElementById('zone-radius-container');
        const mapIndicatorText = document.getElementById('map-indicator-text');

        if (btnBoundary && btnRadius) {
            btnBoundary.addEventListener('click', () => {
                this.currentQuery.zoneMode = 'boundary';
                btnBoundary.classList.add('active');
                btnRadius.classList.remove('active');
                btnBoundary.style.background = '#ffffff';
                btnBoundary.style.color = '#1e40af';
                btnRadius.style.background = 'transparent';
                btnRadius.style.color = '#475569';

                if (boxBoundary) boxBoundary.style.display = 'block';
                if (boxRadius) boxRadius.style.display = 'none';
                if (mapIndicatorText) mapIndicatorText.textContent = 'Garis Merah: Cakupan Wilayah Administratif';

                this.handleRegionChange();
            });

            btnRadius.addEventListener('click', () => {
                this.currentQuery.zoneMode = 'radius';
                btnRadius.classList.add('active');
                btnBoundary.classList.remove('active');
                btnRadius.style.background = '#ffffff';
                btnRadius.style.color = '#c2410c';
                btnBoundary.style.background = 'transparent';
                btnBoundary.style.color = '#475569';

                if (boxRadius) boxRadius.style.display = 'block';
                if (boxBoundary) boxBoundary.style.display = 'none';
                const branchHarvested = document.getElementById('branch-harvested-city');
                const branchUnharvested = document.getElementById('branch-unharvested-city');
                if (branchHarvested) branchHarvested.style.display = 'none';
                if (branchUnharvested) branchUnharvested.style.display = 'block';
                if (mapIndicatorText) mapIndicatorText.textContent = 'Titik Pin & Lingkaran Merah: Jangkauan Radius';

                const coordEl = document.getElementById('display-selected-coord');
                if (coordEl) coordEl.textContent = `${this.currentQuery.lat.toFixed(4)}, ${this.currentQuery.lng.toFixed(4)} (${this.currentQuery.location || 'Titik Target'})`;

                if (window.mapEngine) {
                    window.mapEngine.showRadiusMode(this.currentQuery.lat, this.currentQuery.lng, this.currentQuery.radius, this.currentQuery.location || 'Titik Target Peta');
                }
                this.loadPreScrapeCandidates();
                this.updateTargetSummaryDisplay();
            });
        }
    },

    // ----------------------------------------------------
    // ----------------------------------------------------
    // 2. TARGET PARAMETER (KEYWORD vs CASCADING CATEGORY PRESETS)
    // ----------------------------------------------------
    SECTORS_DATA: {
        semua_bidang: {
            name: 'Semua Bidang Usaha (Semua Kategori)',
            items: [
                { value: 'all', label: 'Semua Bidang Usaha & Instansi' }
            ]
        },
        perusahaan: {
            name: 'Perusahaan, Korporasi & Industri (PT / CV)',
            items: [
                { value: 'semua_perusahaan', label: 'Semua Kantor Perusahaan & PT/CV' },
                { value: 'kantor_pt', label: 'Kantor PT (Perseroan Terbatas)' },
                { value: 'kantor_cv', label: 'Kantor CV (Persekutuan Komanditer)' },
                { value: 'pabrik_manufaktur', label: 'Pabrik, Manufaktur & Industri' },
                { value: 'distributor_supplier', label: 'Distributor, Supplier & Agen Grosir' },
                { value: 'pergudangan_logistik', label: 'Pergudangan (Warehouse) & Depo' },
                { value: 'holding_corporate', label: 'Kantor Pusat / Holding Corporate' },
                { value: 'ekspor_impor', label: 'Eksportir & Importir' }
            ]
        },
        konstruksi: {
            name: 'Konstruksi, Arsitektur & Properti',
            items: [
                { value: 'semua_konstruksi', label: 'Semua Bidang Konstruksi & Properti' },
                { value: 'kontraktor', label: 'Kontraktor Bangunan & Gedung' },
                { value: 'arsitek_desain', label: 'Biro Arsitek & Desain Interior' },
                { value: 'developer_perumahan', label: 'Developer Perumahan & Real Estate' },
                { value: 'jasa_renovasi', label: 'Jasa Renovasi & Mandor Konstruksi' },
                { value: 'distributor_material', label: 'Distributor Material & Bahan Bangunan' }
            ]
        },
        jasa: {
            name: 'Jasa Bisnis, Legal & Profesional',
            items: [
                { value: 'jasa_profesional', label: 'Semua Jasa & Layanan Bisnis' },
                { value: 'notaris', label: 'Kantor Notaris & PPAT' },
                { value: 'kantor_hukum', label: 'Kantor Advokat & Konsultan Hukum' },
                { value: 'konsultan_akuntan', label: 'Kantor Akuntan Publik (KAP) & Pajak' },
                { value: 'konsultan_bisnis', label: 'Konsultan Bisnis & Manajemen' },
                { value: 'outsourcing_hrd', label: 'Jasa Outsourcing & HRD / Headhunter' },
                { value: 'percetakan', label: 'Percetakan, Printing, Sablon & Fotokopi' },
                { value: 'laundry', label: 'Jasa Laundry Kiloan & Satuan' },
                { value: 'ekspedisi_kurir', label: 'Ekspedisi, Cargo & Jasa Kirim' }
            ]
        },
        it: {
            name: 'Teknologi, IT & Telekomunikasi',
            items: [
                { value: 'semua_it', label: 'Semua Bidang IT & Digital' },
                { value: 'software_house', label: 'Software House & Startup Digital' },
                { value: 'agency_digital', label: 'Digital Marketing & SEO Agency' },
                { value: 'isp_telekomunikasi', label: 'ISP & Provider Telekomunikasi' },
                { value: 'service_komputer', label: 'Servis Komputer, Laptop & Jaringan' },
                { value: 'toko_komputer', label: 'Toko Komputer & Sparepart PC' }
            ]
        },
        pendidikan: {
            name: 'Pendidikan & Edukasi',
            items: [
                { value: 'sekolah', label: 'Semua Instansi Pendidikan & Sekolah' },
                { value: 'sd', label: 'Sekolah Dasar (SD / MI)' },
                { value: 'smp', label: 'SMP & MTs' },
                { value: 'sma', label: 'SMA & MA' },
                { value: 'smk', label: 'SMK Kejuruan' },
                { value: 'universitas', label: 'Universitas & Institut' },
                { value: 'sekolah_tinggi', label: 'Sekolah Tinggi, Politeknik & Akademi' },
                { value: 'bimbel', label: 'Bimbingan Belajar (Bimbel) & Les Privat' },
                { value: 'kursus_lpk', label: 'LPK & Balai Kursus / Pelatihan' },
                { value: 'tk_paud', label: 'TK, PAUD & Penitipan Anak' },
                { value: 'pesantren', label: 'Pondok Pesantren & Islamic School' },
                { value: 'slb', label: 'Sekolah Luar Biasa (SLB)' }
            ]
        },
        kesehatan: {
            name: 'Kesehatan, Medis & Farmasi',
            items: [
                { value: 'kesehatan', label: 'Semua Layanan Kesehatan & Medis' },
                { value: 'rumah_sakit', label: 'Rumah Sakit Umum & Swasta' },
                { value: 'rsia', label: 'RSIA (Rumah Sakit Ibu & Anak)' },
                { value: 'puskesmas', label: 'Puskesmas & Balai Pengobatan' },
                { value: 'klinik', label: 'Klinik Pratama & Umum' },
                { value: 'klinik_gigi', label: 'Klinik Gigi & Praktik Dokter Gigi' },
                { value: 'apotek', label: 'Apotek & Toko Obat Berizin' },
                { value: 'praktik_dokter', label: 'Praktik Dokter Mandiri & Spesialis' },
                { value: 'praktik_bidan', label: 'Praktik Bidan Mandiri' },
                { value: 'laboratorium', label: 'Laboratorium Medis & Diagnostic' },
                { value: 'optik', label: 'Optik & Toko Kacamata' },
                { value: 'distributor_alkes', label: 'Distributor Alat Kesehatan & Farmasi' }
            ]
        },
        pemerintah: {
            name: 'Instansi Pemerintah & Layanan Publik',
            items: [
                { value: 'pemerintah', label: 'Semua Instansi Pemerintah & Publik' },
                { value: 'kantor_dinas', label: 'Kantor Dinas & Instansi Pemda' },
                { value: 'kecamatan', label: 'Kantor Kecamatan' },
                { value: 'kelurahan_desa', label: 'Kantor Kelurahan & Balai Desa' },
                { value: 'kantor_pajak', label: 'Kantor Pajak (KPP Pratama & Samsat)' },
                { value: 'kepolisian', label: 'Kantor Polisi (Polsek & Polres)' },
                { value: 'tni_militer', label: 'Kantor Militer / TNI (Koramil & Kodim)' },
                { value: 'kantor_pos', label: 'Kantor Pos & Pusat Logistik BUMN' },
                { value: 'bpjs', label: 'Kantor BPJS Kesehatan & Ketenagakerjaan' },
                { value: 'kantor_bpn', label: 'Kantor Pertanahan (BPN)' }
            ]
        },
        kuliner: {
            name: 'Kuliner, Makanan & Minuman',
            items: [
                { value: 'kuliner', label: 'Semua Kuliner & Makanan' },
                { value: 'cafe', label: 'Kafe, Kedai Kopi & Coffee Shop' },
                { value: 'resto', label: 'Restoran & Rumah Makan' },
                { value: 'warung', label: 'Warung Makan & Warteg' },
                { value: 'bakso_mie_soto', label: 'Bakso, Soto & Mie Ayam' },
                { value: 'fast_food', label: 'Kuliner Cepat Saji (Fast Food)' },
                { value: 'bakery', label: 'Bakery & Toko Roti / Kue' },
                { value: 'catering', label: 'Jasa Catering & Prasmanan' },
                { value: 'depot_air', label: 'Depot Air Minum Isi Ulang' }
            ]
        },
        retail: {
            name: 'Perdagangan, Retail & Toko',
            items: [
                { value: 'retail', label: 'Semua Toko & Retail' },
                { value: 'minimarket', label: 'Minimarket, Swalayan & Supermarket' },
                { value: 'toko_kelontong', label: 'Toko Sembako & Kelontong' },
                { value: 'elektronik', label: 'Toko Elektronik, Gadget & Servis HP' },
                { value: 'fashion', label: 'Toko Pakaian, Butik & Distro' },
                { value: 'toko_bangunan', label: 'Toko Bangunan & Material' },
                { value: 'petshop', label: 'Pet Shop & Pakan Hewan' },
                { value: 'toko_buku_atk', label: 'Toko Buku & Alat Tulis (ATK)' },
                { value: 'toko_emas', label: 'Toko Emas & Perhiasan' },
                { value: 'furniture_mebel', label: 'Toko Furniture, Mebel & Dekorasi' },
                { value: 'pasar_tradisional', label: 'Pasar Tradisional & Kios Pasar' }
            ]
        },
        otomotif: {
            name: 'Otomotif & Transportasi',
            items: [
                { value: 'otomotif', label: 'Semua Layanan Otomotif' },
                { value: 'bengkel_motor', label: 'Bengkel Motor & Servis Resmi' },
                { value: 'bengkel_mobil', label: 'Bengkel Mobil & Ganti Oli' },
                { value: 'toko_ban_aki', label: 'Toko Ban, Velg & Aki' },
                { value: 'cuci_kendaraan', label: 'Cuci Mobil & Motor (Doorsmeer)' },
                { value: 'spbu', label: 'SPBU & Pengisian Bahan Bakar' },
                { value: 'dealer_showroom', label: 'Dealer Mobil & Showroom Motor' },
                { value: 'rental_travel', label: 'Rental Mobil & Travel Antar Kota' }
            ]
        },
        akomodasi: {
            name: 'Akomodasi, Pariwisata & Hiburan',
            items: [
                { value: 'akomodasi', label: 'Semua Akomodasi & Wisata' },
                { value: 'hotel', label: 'Hotel Berbintang & Budget' },
                { value: 'penginapan', label: 'Penginapan, Guesthouse & Homestay' },
                { value: 'villa', label: 'Villa & Resort' },
                { value: 'kost', label: 'Rumah Kost & Kontrakan' },
                { value: 'wisata', label: 'Tempat Wisata & Rekreasi' },
                { value: 'gedung_pertemuan', label: 'Gedung Pertemuan & Wedding Venue' }
            ]
        },
        kecantikan: {
            name: 'Kecantikan, Kebugaran & Relaksasi',
            items: [
                { value: 'kecantikan', label: 'Semua Layanan Kecantikan' },
                { value: 'salon', label: 'Salon Kecantikan & Rambut' },
                { value: 'barbershop', label: 'Barbershop & Pangkas Pria' },
                { value: 'klinik_estetika', label: 'Klinik Estetika & Skincare' },
                { value: 'spa', label: 'Spa & Pijat Relaksasi' },
                { value: 'gym', label: 'Pusat Kebugaran, Gym & Fitness' },
                { value: 'lapangan_olahraga', label: 'Lapangan Olahraga & Futsal' }
            ]
        },
        keuangan: {
            name: 'Lembaga Keuangan & Asuransi',
            items: [
                { value: 'keuangan', label: 'Semua Lembaga Keuangan' },
                { value: 'bank', label: 'Kantor Cabang Bank & Bank Syariah' },
                { value: 'bpr_syariah', label: 'Bank Perkreditan Rakyat (BPR)' },
                { value: 'atm', label: 'Galeri ATM & CDM' },
                { value: 'koperasi', label: 'Koperasi Simpan Pinjam & BMT' },
                { value: 'pegadaian', label: 'Kantor Pegadaian & Gadai' },
                { value: 'kantor_asuransi', label: 'Kantor Asuransi Jiwa & Kendaraan' }
            ]
        },
        pertanian: {
            name: 'Pertanian, Peternakan & Agribisnis',
            items: [
                { value: 'pertanian', label: 'Semua Bidang Pertanian & Agribisnis' },
                { value: 'toko_tani', label: 'Toko Pertanian, Benih & Pupuk' },
                { value: 'peternakan', label: 'Peternakan Ayam, Sapi & Kambing' },
                { value: 'pakan_ternak', label: 'Toko Pakan Ternak & Poultry Shop' },
                { value: 'pembibitan_tanaman', label: 'Pembibitan Tanaman & Toko Bibit' },
                { value: 'penggilingan_padi', label: 'Penggilingan Padi & Gudang Gabah' },
                { value: 'perikanan_tambak', label: 'Perikanan, Tambak & Pakan Ikan' }
            ]
        },
        ibadah: {
            name: 'Tempat Ibadah & Yayasan Sosial',
            items: [
                { value: 'tempat_ibadah', label: 'Semua Tempat Ibadah & Yayasan' },
                { value: 'masjid', label: 'Masjid & Mushola' },
                { value: 'gereja', label: 'Gereja Kristen & Katolik' },
                { value: 'pura_vihara', label: 'Pura, Vihara & Klenteng' },
                { value: 'panti_asuhan', label: 'Panti Asuhan & Yayasan Sosial' },
                { value: 'lembaga_zakat', label: 'Lembaga Zakat & Infaq (BAZNAS)' }
            ]
        },
        lainnya: {
            name: 'Bidang Lainnya & Usaha Umum',
            items: [
                { value: 'semua_lainnya', label: 'Semua Bidang Lainnya & Usaha Umum' },
                { value: 'usaha_lokal', label: 'Usaha Lokal & UMKM Umum' },
                { value: 'kerajinan_workshop', label: 'Bengkel Kerajinan & Workshop' },
                { value: 'komersial_lain', label: 'Tempat Usaha Komersial Lainnya' }
            ]
        }
    },

    // ----------------------------------------------------
    // BOUNDING BOX & SECTOR CLASSIFICATION UTILITIES
    // ----------------------------------------------------
    normalizeBoundingBox(bbox, centerLat = -7.47, centerLng = 110.22) {
        if (!bbox || !Array.isArray(bbox) || bbox.length < 4) {
            const delta = 0.03;
            return {
                minLat: centerLat - delta,
                maxLat: centerLat + delta,
                minLng: centerLng - delta,
                maxLng: centerLng + delta,
                viewbox: `${(centerLng - delta).toFixed(5)},${(centerLat + delta).toFixed(5)},${(centerLng + delta).toFixed(5)},${(centerLat - delta).toFixed(5)}`
            };
        }
        const nums = bbox.map(Number);
        let lats = [];
        let lngs = [];
        nums.forEach(n => {
            if (Math.abs(n) <= 35.0) {
                lats.push(n);
            } else {
                lngs.push(n);
            }
        });

        if (lats.length !== 2 || lngs.length !== 2) {
            nums.sort((a, b) => Math.abs(a - centerLat) - Math.abs(b - centerLat));
            lats = [nums[0], nums[1]];
            lngs = [nums[2], nums[3]];
        }

        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs);
        const maxLng = Math.max(...lngs);

        return {
            minLat,
            maxLat,
            minLng,
            maxLng,
            viewbox: `${minLng.toFixed(5)},${maxLat.toFixed(5)},${maxLng.toFixed(5)},${minLat.toFixed(5)}`
        };
    },

    classifyPlaceToSector(item) {
        let name = (item.name || '').trim();
        if (!name) {
            const parts = (item.display_name || '').split(',');
            name = (parts[0] || '').trim();
        }
        const type = (item.type || '').toLowerCase();
        const cls = (item.class || '').toLowerCase();

        // 1. Pendidikan & Edukasi
        if (type === 'school' || type === 'college' || type === 'university' || type === 'kindergarten' ||
            /\b(sd|smp|sma|smk|madrasah|mi|mts|ma|sekolah|kampus|universitas|pesantren|ponpes|bimbel|lpk|paud|tk|slb|kursus)\b/i.test(name)) {
            let sub = 'sekolah';
            if (/\b(sd|sekolah dasar|mi)\b/i.test(name)) sub = 'sd';
            else if (/\b(smp|mts)\b/i.test(name)) sub = 'smp';
            else if (/\b(smk|kejuruan)\b/i.test(name)) sub = 'smk';
            else if (/\b(sma|ma)\b/i.test(name)) sub = 'sma';
            else if (/\b(universitas|kampus|institut)\b/i.test(name)) sub = 'universitas';
            else if (/\b(sekolah tinggi|stmik|stie|politeknik|akademi)\b/i.test(name)) sub = 'sekolah_tinggi';
            else if (/\b(tk|paud|taman kanak)\b/i.test(name)) sub = 'tk_paud';
            else if (/\b(pesantren|ponpes)\b/i.test(name)) sub = 'pesantren';
            else if (/\b(slb|luar biasa|autis)\b/i.test(name)) sub = 'slb';
            else if (/\b(bimbel|les|kumon)\b/i.test(name)) sub = 'bimbel';
            else if (/\b(kursus|lpk|pelatihan)\b/i.test(name)) sub = 'kursus_lpk';
            return { sector: 'pendidikan', sub };
        }

        // 2. Kesehatan, Medis & Farmasi
        if (type === 'hospital' || type === 'clinic' || type === 'pharmacy' || type === 'doctors' || type === 'dentist' ||
            /\b(rs|rsi|rsia|rumah sakit|klinik|apotek|puskesmas|dokter|bidan|laboratorium|optik|alkes)\b/i.test(name)) {
            let sub = 'kesehatan';
            if (/\b(rsia)\b/i.test(name)) sub = 'rsia';
            else if (/\b(rumah sakit|rs |rsi )\b/i.test(name)) sub = 'rumah_sakit';
            else if (/\b(puskesmas)\b/i.test(name)) sub = 'puskesmas';
            else if (/\b(klinik gigi|dokter gigi)\b/i.test(name)) sub = 'klinik_gigi';
            else if (/\b(klinik)\b/i.test(name)) sub = 'klinik';
            else if (/\b(apotek|farmasi)\b/i.test(name)) sub = 'apotek';
            else if (/\b(bidan)\b/i.test(name)) sub = 'praktik_bidan';
            else if (/\b(dokter)\b/i.test(name)) sub = 'praktik_dokter';
            else if (/\b(lab|laboratorium)\b/i.test(name)) sub = 'laboratorium';
            else if (/\b(optik|kacamata)\b/i.test(name)) sub = 'optik';
            return { sector: 'kesehatan', sub };
        }

        // 3. Tempat Ibadah & Yayasan Sosial
        if (type === 'place_of_worship' || /\b(masjid|mushola|gereja|pura|vihara|klenteng|panti asuhan|yayasan|baznas|zakat)\b/i.test(name)) {
            let sub = 'tempat_ibadah';
            if (/\b(masjid|mushola)\b/i.test(name)) sub = 'masjid';
            else if (/\b(gereja)\b/i.test(name)) sub = 'gereja';
            else if (/\b(pura|vihara|klenteng)\b/i.test(name)) sub = 'pura_vihara';
            else if (/\b(panti asuhan)\b/i.test(name)) sub = 'panti_asuhan';
            else if (/\b(zakat|infaq|baznas)\b/i.test(name)) sub = 'lembaga_zakat';
            return { sector: 'ibadah', sub };
        }

        // 4. Kuliner, Makanan & Minuman
        if (['restaurant', 'cafe', 'fast_food', 'food_court', 'bakery'].includes(type) ||
            /\b(cafe|kafe|kopi|coffee|resto|restoran|warung|warteg|bakso|mie|soto|catering|depot|nasi goreng|angkringan|bakery|roti|kue)\b/i.test(name)) {
            let sub = 'kuliner';
            if (/\b(cafe|kafe|coffee|kopi)\b/i.test(name)) sub = 'cafe';
            else if (/\b(bakery|roti|kue)\b/i.test(name)) sub = 'bakery';
            else if (/\b(bakso|mie|soto)\b/i.test(name)) sub = 'bakso_mie_soto';
            else if (/\b(fast food|burger|fried chicken|pizza)\b/i.test(name)) sub = 'fast_food';
            else if (/\b(catering|prasmanan)\b/i.test(name)) sub = 'catering';
            else if (/\b(depot air|isi ulang)\b/i.test(name)) sub = 'depot_air';
            else if (/\b(resto|restoran)\b/i.test(name)) sub = 'resto';
            else if (/\b(warung|warteg|depot|nasi)\b/i.test(name)) sub = 'warung';
            return { sector: 'kuliner', sub };
        }

        // 5. Perdagangan, Retail & Toko
        if (['convenience', 'supermarket', 'clothes', 'marketplace', 'electronics', 'furniture', 'hardware', 'pet'].includes(type) || cls === 'shop' ||
            /\b(toko|minimarket|supermarket|swalayan|indomaret|alfamart|sembako|butik|distro|pasar|petshop|kelontong|atk|emas|mebel|furniture)\b/i.test(name)) {
            let sub = 'retail';
            if (/\b(minimarket|indomaret|alfamart|supermarket|swalayan)\b/i.test(name)) sub = 'minimarket';
            else if (/\b(pakaian|baju|butik|distro|fashion)\b/i.test(name)) sub = 'fashion';
            else if (/\b(elektronik|gadget|hp|handphone|servis hp)\b/i.test(name)) sub = 'elektronik';
            else if (/\b(bangunan|material)\b/i.test(name)) sub = 'toko_bangunan';
            else if (/\b(petshop|pakan hewan)\b/i.test(name)) sub = 'petshop';
            else if (/\b(atk|buku|alat tulis)\b/i.test(name)) sub = 'toko_buku_atk';
            else if (/\b(emas|perhiasan)\b/i.test(name)) sub = 'toko_emas';
            else if (/\b(furniture|mebel)\b/i.test(name)) sub = 'furniture_mebel';
            else if (/\b(pasar)\b/i.test(name)) sub = 'pasar_tradisional';
            else if (/\b(sembako|kelontong)\b/i.test(name)) sub = 'toko_kelontong';
            return { sector: 'retail', sub };
        }

        // 6. Otomotif & Transportasi
        if (['car_repair', 'motorcycle_repair', 'fuel', 'car_wash', 'car', 'motorcycle'].includes(type) ||
            /\b(bengkel|spbu|cuci motor|cuci mobil|doorsmeer|tambal ban|variasi motor|dealer|showroom|rental|travel)\b/i.test(name)) {
            let sub = 'otomotif';
            if (/\b(bengkel mobil)\b/i.test(name)) sub = 'bengkel_mobil';
            else if (/\b(bengkel)\b/i.test(name)) sub = 'bengkel_motor';
            else if (/\b(spbu|bensin|pertamina)\b/i.test(name)) sub = 'spbu';
            else if (/\b(cuci|doorsmeer)\b/i.test(name)) sub = 'cuci_kendaraan';
            else if (/\b(ban|aki|velg)\b/i.test(name)) sub = 'toko_ban_aki';
            else if (/\b(dealer|showroom)\b/i.test(name)) sub = 'dealer_showroom';
            else if (/\b(rental|travel)\b/i.test(name)) sub = 'rental_travel';
            return { sector: 'otomotif', sub };
        }

        // 7. Instansi Pemerintah & Layanan Publik
        if (type === 'government' || type === 'townhall' || type === 'police' || type === 'post_office' || type === 'courthouse' ||
            /\b(kantor desa|kelurahan|kecamatan|polsek|polres|koramil|kodim|dinas|pemerintah|balai desa|kantor pos|bpjs|samsat|kpp|pajak|bpn)\b/i.test(name)) {
            let sub = 'pemerintah';
            if (/\b(kelurahan|desa|balai desa)\b/i.test(name)) sub = 'kelurahan_desa';
            else if (/\b(kecamatan)\b/i.test(name)) sub = 'kecamatan';
            else if (/\b(polisi|polsek|polres)\b/i.test(name)) sub = 'kepolisian';
            else if (/\b(tni|koramil|kodim|militer)\b/i.test(name)) sub = 'tni_militer';
            else if (/\b(pos)\b/i.test(name)) sub = 'kantor_pos';
            else if (/\b(pajak|samsat|kpp)\b/i.test(name)) sub = 'kantor_pajak';
            else if (/\b(bpjs)\b/i.test(name)) sub = 'bpjs';
            else if (/\b(bpn|pertanahan)\b/i.test(name)) sub = 'kantor_bpn';
            else if (/\b(dinas)\b/i.test(name)) sub = 'kantor_dinas';
            return { sector: 'pemerintah', sub };
        }

        // 8. Lembaga Keuangan & Asuransi
        if (type === 'bank' || type === 'atm' || /\b(bank|atm|koperasi|bpr|pegadaian|bmt|asuransi)\b/i.test(name)) {
            let sub = 'bank';
            if (/\b(atm)\b/i.test(name)) sub = 'atm';
            else if (/\b(bpr)\b/i.test(name)) sub = 'bpr_syariah';
            else if (/\b(koperasi|bmt)\b/i.test(name)) sub = 'koperasi';
            else if (/\b(pegadaian)\b/i.test(name)) sub = 'pegadaian';
            else if (/\b(asuransi)\b/i.test(name)) sub = 'kantor_asuransi';
            return { sector: 'keuangan', sub };
        }

        // 9. Akomodasi, Pariwisata & Hiburan
        if (type === 'hotel' || type === 'guest_house' || type === 'motel' || type === 'hostel' ||
            /\b(hotel|penginapan|guesthouse|homestay|villa|kost|kos|wisata|resort|gedung pertemuan)\b/i.test(name)) {
            let sub = 'hotel';
            if (/\b(villa|resort)\b/i.test(name)) sub = 'villa';
            else if (/\b(kost|kos)\b/i.test(name)) sub = 'kost';
            else if (/\b(wisata|rekreasi)\b/i.test(name)) sub = 'wisata';
            else if (/\b(gedung pertemuan|venue)\b/i.test(name)) sub = 'gedung_pertemuan';
            else if (!/\b(hotel)\b/i.test(name)) sub = 'penginapan';
            return { sector: 'akomodasi', sub };
        }

        // 10. Jasa Bisnis, Legal & Profesional
        if (type === 'notary' || type === 'lawyer' || type === 'laundry' || type === 'accountant' ||
            /\b(laundry|notaris|ppat|advokat|hukum|fotokopi|percetakan|print|ekspedisi|jne|jnt|sicepat|akuntan|kap|outsourcing)\b/i.test(name)) {
            let sub = 'jasa_profesional';
            if (/\b(laundry)\b/i.test(name)) sub = 'laundry';
            else if (/\b(notaris|ppat)\b/i.test(name)) sub = 'notaris';
            else if (/\b(advokat|hukum|pengacara)\b/i.test(name)) sub = 'kantor_hukum';
            else if (/\b(percetakan|fotokopi|printing|sablon)\b/i.test(name)) sub = 'percetakan';
            else if (/\b(jne|jnt|ekspedisi|cargo|kurir)\b/i.test(name)) sub = 'ekspedisi_kurir';
            else if (/\b(akuntan|kap)\b/i.test(name)) sub = 'konsultan_akuntan';
            else if (/\b(outsourcing|hrd)\b/i.test(name)) sub = 'outsourcing_hrd';
            return { sector: 'jasa', sub };
        }

        // 11. Kecantikan, Kebugaran & Relaksasi
        if (/\b(barber|salon|pangkas|skincare|estetika|spa|reflexology|pijat|gym|fitness|yoga)\b/i.test(name)) {
            let sub = 'kecantikan';
            if (/\b(barber|pangkas)\b/i.test(name)) sub = 'barbershop';
            else if (/\b(skincare|estetika)\b/i.test(name)) sub = 'klinik_kecantikan';
            else if (/\b(spa|reflexology|pijat)\b/i.test(name)) sub = 'spa_massage';
            else if (/\b(gym|fitness|yoga)\b/i.test(name)) sub = 'gym_fitness';
            else if (/\b(salon)\b/i.test(name)) sub = 'salon';
            return { sector: 'kecantikan', sub };
        }

        // 12. Teknologi, IT & Telekomunikasi
        if (/\b(software|startup|digital|seo|agency|isp|telekomunikasi|komputer|laptop|servis komputer)\b/i.test(name)) {
            let sub = 'semua_it';
            if (/\b(software|startup)\b/i.test(name)) sub = 'software_house';
            else if (/\b(agency|digital marketing|seo)\b/i.test(name)) sub = 'agency_digital';
            else if (/\b(isp|telkom|indihome|wifi)\b/i.test(name)) sub = 'isp_telekomunikasi';
            else if (/\b(servis|service)\b/i.test(name)) sub = 'service_komputer';
            else if (/\b(toko komputer|sparepart)\b/i.test(name)) sub = 'toko_komputer';
            return { sector: 'it', sub };
        }

        // 13. Konstruksi, Arsitektur & Properti
        if (type === 'architect' || /\b(kontraktor|arsitek|interior|developer|perumahan|residence|renovasi|mandor)\b/i.test(name)) {
            let sub = 'semua_konstruksi';
            if (/\b(kontraktor|pemborong)\b/i.test(name)) sub = 'kontraktor';
            else if (/\b(arsitek|desain interior)\b/i.test(name)) sub = 'arsitek_desain';
            else if (/\b(developer|perumahan|residence)\b/i.test(name)) sub = 'developer_perumahan';
            else if (/\b(renovasi|mandor)\b/i.test(name)) sub = 'jasa_renovasi';
            return { sector: 'konstruksi', sub };
        }

        // 14. Pertanian, Peternakan & Agribisnis
        if (/\b(tani|pertanian|pupuk|peternakan|kandang|ayam|sapi|pakan|poultry|bibit|nursery|padi|rice mill|tambak|ikan)\b/i.test(name)) {
            let sub = 'pertanian';
            if (/\b(tani|pupuk|obat pertanian)\b/i.test(name)) sub = 'toko_tani';
            else if (/\b(peternakan|kandang)\b/i.test(name)) sub = 'peternakan';
            else if (/\b(pakan|poultry)\b/i.test(name)) sub = 'pakan_ternak';
            else if (/\b(bibit|nursery)\b/i.test(name)) sub = 'pembibitan_tanaman';
            else if (/\b(padi|rice mill|selepan)\b/i.test(name)) sub = 'penggilingan_padi';
            else if (/\b(tambak|perikanan|ikan)\b/i.test(name)) sub = 'perikanan_tambak';
            return { sector: 'pertanian', sub };
        }

        // 15. Default: Perusahaan / Usaha Lainnya
        let sub = 'semua_perusahaan';
        if (/\bpt\b/i.test(name)) sub = 'kantor_pt';
        else if (/\bcv\b/i.test(name)) sub = 'kantor_cv';
        else if (/\b(pabrik|industri)\b/i.test(name)) sub = 'pabrik_manufaktur';
        else if (/\b(distributor|supplier|grosir)\b/i.test(name)) sub = 'distributor_supplier';
        else if (/\b(gudang|warehouse|depo)\b/i.test(name)) sub = 'pergudangan_logistik';
        return { sector: 'perusahaan', sub };
    },

    // ----------------------------------------------------
    // POPULATE DROPDOWNS WITH PLACE COUNTS (NO EMOJIS)
    // ----------------------------------------------------
    populateSectorsWithCounts() {
        const sectorSelect = document.getElementById('target-sector-select');
        if (!sectorSelect) return;

        const sectorCounts = (this.territoryData && this.territoryData.sector_counts) || {};
        const previousSelected = sectorSelect.value || 'semua_bidang';

        let totalAllPlaces = 0;
        if (this.territoryData && this.territoryData.places) {
            totalAllPlaces = this.territoryData.places.length;
        } else {
            Object.values(sectorCounts).forEach(c => { totalAllPlaces += (c || 0); });
        }
        const showCounts = totalAllPlaces > 0;

        const keys = Object.keys(this.SECTORS_DATA).filter(k => k !== 'semua_bidang');
        // Sort sectors descending by place count so sectors with active businesses are prominent
        keys.sort((a, b) => {
            const countA = sectorCounts[a] || 0;
            const countB = sectorCounts[b] || 0;
            return countB - countA;
        });

        // Prepend semua_bidang at the very top
        keys.unshift('semua_bidang');

        sectorSelect.innerHTML = '';

        keys.forEach((key) => {
            const sectorInfo = this.SECTORS_DATA[key];
            if (!sectorInfo) return;
            const count = (key === 'semua_bidang') ? totalAllPlaces : (sectorCounts[key] || 0);
            const opt = document.createElement('option');
            opt.value = key;
            const cleanName = String(sectorInfo.name || '').replace(/\s*\(Semua Kategori\)\s*/i, '').trim();
            opt.textContent = showCounts ? `${cleanName} (${count})` : cleanName;
            sectorSelect.appendChild(opt);
        });

        if (previousSelected && this.SECTORS_DATA[previousSelected]) {
            sectorSelect.value = previousSelected;
        } else {
            sectorSelect.value = 'semua_bidang';
        }

        this.populateSubcategoriesWithCounts(sectorSelect.value);
    },

    populateSubcategoriesWithCounts(sectorKey) {
        const presetSelect = document.getElementById('target-category-select');
        if (!presetSelect) return;

        const hasTerritoryPlaces = !!(this.territoryData && this.territoryData.places && this.territoryData.places.length > 0);

        if (sectorKey === 'semua_bidang' || sectorKey === 'all') {
            presetSelect.innerHTML = '';
            const totalPlaces = hasTerritoryPlaces ? this.territoryData.places.length : 0;
            const opt = document.createElement('option');
            opt.value = 'all';
            opt.textContent = hasTerritoryPlaces ? `Semua Jenis Bisnis (${totalPlaces})` : 'Semua Jenis Bisnis';
            presetSelect.appendChild(opt);
            presetSelect.selectedIndex = 0;
            return;
        }

        const sector = this.SECTORS_DATA[sectorKey] || this.SECTORS_DATA['perusahaan'];
        const sectorCounts = (this.territoryData && this.territoryData.sector_counts) || {};
        const subCounts = (this.territoryData && this.territoryData.sub_counts) || {};
        const totalSectorPlaces = sectorCounts[sectorKey] || 0;

        presetSelect.innerHTML = '';

        sector.items.forEach((item, idx) => {
            const opt = document.createElement('option');
            opt.value = item.value;

            let count = 0;
            if (idx === 0) {
                count = totalSectorPlaces;
            } else {
                count = subCounts[item.value] || 0;
            }

            opt.textContent = hasTerritoryPlaces ? `${item.label} (${count})` : item.label;
            presetSelect.appendChild(opt);
        });

        presetSelect.selectedIndex = 0;
    },

    // ----------------------------------------------------
    // FILTER CANDIDATES FROM PRE-SCANNED TERRITORY
    // ----------------------------------------------------
    applyPresetFilter() {
        const sectorSelect = document.getElementById('target-sector-select');
        const presetSelect = document.getElementById('target-category-select');
        if (!sectorSelect) return;

        const sectorKey = sectorSelect.value;
        const subKey = presetSelect ? presetSelect.value : '';

        if (!this.territoryData || !this.territoryData.places || this.territoryData.places.length === 0) {
            this.currentQuery.category = (sectorKey === 'semua_bidang' || subKey === 'all') ? 'all' : (subKey || sectorKey);
            this.loadPreScrapeCandidates();
            return;
        }

        const allPlaces = this.territoryData.places;
        const sector = this.SECTORS_DATA[sectorKey];
        const firstSubVal = (sector && sector.items && sector.items[0]) ? sector.items[0].value : null;

        let filtered = [];
        if (sectorKey === 'semua_bidang' || sectorKey === 'all' || subKey === 'all') {
            filtered = allPlaces;
            this.currentQuery.category = 'all';
        } else if (!subKey || subKey === firstSubVal || subKey.startsWith('semua_')) {
            filtered = allPlaces.filter(p => p.sector === sectorKey);
            this.currentQuery.category = sectorKey;
        } else {
            filtered = allPlaces.filter(p => p.sector === sectorKey && p.sub === subKey);
            if (filtered.length === 0) {
                const term = subKey.replace(/_/g, ' ').toLowerCase();
                filtered = allPlaces.filter(p => p.sector === sectorKey && (
                    (p.name && p.name.toLowerCase().includes(term)) ||
                    (p.category && p.category.toLowerCase().includes(term))
                ));
            }
            this.currentQuery.category = subKey;
        }

        const subObj = sector && sector.items ? sector.items.find(i => i.value === subKey) : null;
        const label = (sectorKey === 'semua_bidang' || subKey === 'all') ? 'Semua Bidang Usaha' : (subObj ? subObj.label : (sector ? sector.name : 'kategori terpilih'));
        this.renderCandidatePlaces(filtered, label);
    },

    renderCandidatePlaces(placesList, contextLabel = '') {
        const countBadge = document.getElementById('preview-count-badge');
        const listContainer = document.getElementById('pre-scrape-places-list');

        if (this.currentQuery.zoneMode === 'boundary' && window.mapEngine) {
            this.candidatePlaces = placesList.map(p => {
                const safe = window.mapEngine.ensurePointInsideBoundary(p.lat, p.lng);
                p.lat = safe[0];
                p.lng = safe[1];
                return p;
            });
        } else {
            this.candidatePlaces = placesList;
        }

        if (countBadge) {
            countBadge.textContent = `${this.candidatePlaces.length} Calon Terdeteksi (Dalam Batas)`;
        }
        const limitHintBadge = document.getElementById('limit-hint-badge');
        if (limitHintBadge) {
            const limitSelect = document.getElementById('scraper-batch-limit');
            const curVal = limitSelect ? limitSelect.value : '25';
            limitHintBadge.textContent = (curVal === 'all') ? `Semua (${this.candidatePlaces.length})` : `${curVal} Tempat`;
        }
        const limitSelect = document.getElementById('scraper-batch-limit');
        if (limitSelect) {
            const allOpt = limitSelect.querySelector('option[value="all"]');
            if (allOpt) {
                allOpt.textContent = `Semua Calon Terdeteksi (${this.candidatePlaces.length} Tempat)`;
            }
        }

        if (listContainer) {
            if (this.candidatePlaces.length === 0) {
                listContainer.innerHTML = `
                    <div style="padding: 24px 16px; text-align: center; color: #64748b;">
                        <i class="fa-solid fa-circle-exclamation" style="font-size: 1.4rem; color: #94a3b8; margin-bottom: 6px;"></i>
                        <div style="font-weight: 600; color: #0f172a; margin-bottom: 4px; font-size: 0.78rem;">Tidak Ada Data Bisnis untuk Pilihan Ini</div>
                        <div style="font-size: 0.70rem; line-height: 1.4; color: #64748b;">
                            Tidak ditemukan tempat untuk <strong>${contextLabel}</strong> di wilayah <strong>${this.currentQuery.location}</strong>.<br>
                            Silakan pilih bidang atau jenis usaha yang memiliki angka tempat di menu pilihan.
                        </div>
                    </div>
                `;
            } else {
                listContainer.innerHTML = '';
                this.candidatePlaces.forEach(p => {
                    const isOsm = (p.source === 'osm');
                    const sourcePill = `<span style="background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; padding: 1px 5px; border-radius: 4px; font-size: 0.62rem; font-weight: 600;"><i class="fa-solid fa-map-pin"></i> ${p.source_name || (isOsm ? 'OpenStreetMap' : 'Sumber terbuka')}</span>`;

                    const row = document.createElement('div');
                    row.style.cssText = 'padding: 8px 10px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; font-size: 0.76rem;';
                    row.innerHTML = `
                        <div style="overflow: hidden; text-overflow: ellipsis; padding-right: 8px;">
                            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
                                <strong style="color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px;" title="${p.name}">${p.name}</strong>
                                ${sourcePill}
                            </div>
                            <div style="color: #64748b; font-size: 0.68rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 280px;" title="${p.address}">${p.address}</div>
                        </div>
                        <div style="text-align: right; white-space: nowrap;">
                            <span class="badge badge-blue" style="font-size: 0.64rem;">${p.category}</span>
                            <span style="font-weight: 700; color: #64748b; margin-left: 4px;">${p.rating ? `<i class="fa-solid fa-star" style="color: #f59e0b;"></i> ${p.rating}` : 'Rating tidak tersedia'}</span>
                        </div>
                    `;
                    listContainer.appendChild(row);
                });
            }
        }

        if (window.mapEngine) {
            window.mapEngine.showPreviewMarkers(this.candidatePlaces);
        }
    },

    // ----------------------------------------------------
    // AUTOMATED TERRITORY SCANNING ACROSS ALL 15 SECTORS
    // ----------------------------------------------------
    async scanTerritory() {
        if (this.googleMapsOnly) return this.showGoogleMapsReady();
        if (this.isScanningTerritory) return;
        this.isScanningTerritory = true;

        const countBadge = document.getElementById('preview-count-badge');
        if (countBadge) {
            countBadge.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="color:#2563eb;"></i> Memindai seluruh sektor bisnis wilayah...';
        }

        const norm = this.normalizeBoundingBox(this.currentQuery.bbox, this.currentQuery.lat, this.currentQuery.lng);
        const bboxParam = `${norm.minLat},${norm.maxLat},${norm.minLng},${norm.maxLng}`;

        let data = null;
        const isStaticHost = window.location.hostname.includes('github.io') || window.location.protocol === 'file:';

        if (!isStaticHost) {
            try {
                const queryParams = new URLSearchParams({
                    action: 'scan_territory',
                    lat: this.currentQuery.lat,
                    lng: this.currentQuery.lng,
                    location: this.currentQuery.location || '',
                    bbox: bboxParam
                });
                const res = await fetch(`api/scraper.php?${queryParams.toString()}`);
                if (res.ok) {
                    data = await res.json();
                }
            } catch (e) {
                console.warn('Backend territory scan error, falling back to client scan...', e);
            }
        }

        // Static host / fallback client-side scan
        if (!data || !data.success || !Array.isArray(data.places)) {
            data = await this.scanTerritoryRealMap(norm);
        }

        this.isScanningTerritory = false;

        if (data && data.success) {
            this.territoryData = data;
            this.populateSectorsWithCounts();

            if (this.currentQuery.targetMode === 'preset') {
                this.applyPresetFilter();
            } else {
                const kwInput = document.getElementById('target-keyword-input');
                const kw = (kwInput ? kwInput.value.trim() : '') || this.currentQuery.category || '';
                const matches = this.territoryData.places.filter(p => 
                    (p.name && p.name.toLowerCase().includes(kw.toLowerCase())) || 
                    (p.category && p.category.toLowerCase().includes(kw.toLowerCase()))
                );
                if (matches.length > 0) {
                    this.renderCandidatePlaces(matches, `kata kunci "${kw}"`);
                } else {
                    this.loadPreScrapeCandidates();
                }
            }
        } else {
            if (countBadge) countBadge.textContent = 'Siap Ekstraksi';
        }
    },

    async scanTerritoryRealMap(norm) {
        if (this.googleMapsOnly) return {success: true, places: []};
        const viewbox = norm.viewbox;
        const queries = [
            'amenity=school', 'amenity=place_of_worship', 'amenity=hospital',
            'amenity=clinic', 'amenity=bank', 'amenity=restaurant',
            'amenity=cafe', 'shop=convenience', 'shop=supermarket',
            'office=government', 'amenity=fuel', 'shop=car_repair',
            'amenity=pharmacy', 'amenity=college', 'amenity=kindergarten'
        ];

        const fetchPromises = queries.map(q => {
            const u = `https://nominatim.openstreetmap.org/search?${q}&format=json&bounded=1&viewbox=${viewbox}&addressdetails=1&extratags=1&limit=25`;
            return fetch(u, { headers: { 'Accept': 'application/json' } })
                .then(r => r.ok ? r.json() : [])
                .catch(() => []);
        });

        const results = await Promise.allSettled(fetchPromises);
        const seenOsmIds = new Set();
        const rawPlaces = [];

        results.forEach(res => {
            if (res.status === 'fulfilled' && Array.isArray(res.value)) {
                res.value.forEach(item => {
                    const id = item.osm_id || `${item.lat},${item.lon}`;
                    if (!seenOsmIds.has(id)) {
                        seenOsmIds.add(id);
                        rawPlaces.push(item);
                    }
                });
            }
        });

        // Resilient Fallback: If Nominatim is rate-limited (HTTP 429) or empty, query Photon Komoot OSM API
        if (rawPlaces.length < 5) {
            const photonKeywords = [
                'sekolah', 'sd', 'smp', 'sma', 'smk', 'universitas', 'madrasah', 'pesantren',
                'rumah sakit', 'klinik', 'puskesmas', 'apotek',
                'masjid', 'mushola', 'gereja',
                'bank', 'atm', 'koperasi',
                'cafe', 'restoran', 'warung', 'bakso',
                'toko', 'minimarket', 'supermarket', 'bengkel', 'spbu',
                'kantor', 'dinas', 'kelurahan', 'polsek',
                'hotel', 'laundry', 'salon'
            ];
            const centerLat = norm.minLat + (norm.maxLat - norm.minLat) / 2;
            const centerLng = norm.minLng + (norm.maxLng - norm.minLng) / 2;

            const pPromises = photonKeywords.map(kw => {
                const u = `https://photon.komoot.io/api/?q=${encodeURIComponent(kw)}&lat=${centerLat}&lon=${centerLng}&bbox=${norm.minLng},${norm.minLat},${norm.maxLng},${norm.maxLat}&limit=25`;
                return fetch(u, { headers: { 'Accept': 'application/json' } })
                    .then(r => r.ok ? r.json() : null)
                    .catch(() => null);
            });
            const pResults = await Promise.allSettled(pPromises);
            pResults.forEach(res => {
                if (res.status === 'fulfilled' && res.value && Array.isArray(res.value.features)) {
                    res.value.features.forEach(f => {
                        const props = f.properties || {};
                        const pName = (props.name || '').trim();
                        if (!pName) return;
                        const pId = props.osm_id || `${pName}_${props.osm_value || ''}`;
                        if (!seenOsmIds.has(pId)) {
                            seenOsmIds.add(pId);
                            const coords = (f.geometry && f.geometry.coordinates) || [0, 0];
                            rawPlaces.push({
                                osm_id: props.osm_id,
                                name: pName,
                                class: props.osm_key || '',
                                type: props.osm_value || props.type || '',
                                lat: coords[1],
                                lon: coords[0],
                                address: {
                                    road: props.street || '',
                                    village: props.district || '',
                                    city: props.city || props.county || ''
                                },
                                display_name: [pName, props.street, props.district, props.city].filter(Boolean).join(', ')
                            });
                        }
                    });
                }
            });
        }

        const places = [];
        const sectorCounts = {};
        const subCounts = {};

        Object.keys(this.SECTORS_DATA).forEach(k => { sectorCounts[k] = 0; });

        rawPlaces.forEach(r => {
            let name = (r.name || '').trim();
            if (!name) {
                const parts = (r.display_name || '').split(',');
                name = (parts[0] || '').trim();
            }
            if (!name) return;

            const classification = this.classifyPlaceToSector(r);
            const sector = classification.sector;
            const sub = classification.sub;

            sectorCounts[sector] = (sectorCounts[sector] || 0) + 1;
            subCounts[sub] = (subCounts[sub] || 0) + 1;

            const lat = parseFloat(r.lat);
            const lng = parseFloat(r.lon);

            const addr = r.address || {};
            const addrParts = [];
            if (addr.road) addrParts.push(addr.road);
            if (addr.village) addrParts.push('Kel. ' + addr.village);
            else if (addr.suburb) addrParts.push('Kel. ' + addr.suburb);
            if (addr.city_district) addrParts.push('Kec. ' + addr.city_district);
            if (addr.city) addrParts.push(addr.city);
            else if (addr.town) addrParts.push(addr.town);

            const fullAddr = addrParts.length > 0 ? addrParts.join(', ') : (r.display_name || this.currentQuery.location);
            const categoryTitle = this.humanizeCategoryName(r.type || r.class || sub, name);
            const rawPhone = (r.extratags && (r.extratags.phone || r.extratags['contact:phone'])) || '';
            const rawHours = (r.extratags && r.extratags.opening_hours) || '';
            const rawWebsite = (r.extratags && (r.extratags.website || r.extratags['contact:website'])) || '';

            const enriched = this.enrichPlaceContact({
                name: name,
                category: categoryTitle,
                address: fullAddr,
                phone: rawPhone,
                website: rawWebsite,
                opening_hours: rawHours
            }, this.currentQuery.location);

            const phone = enriched.phone;
            const hours = enriched.hours;
            const website = enriched.website;

            let rating = null;
            let reviews = null;

            const insights = this.generateTriChannelInsights(name, categoryTitle, rating, reviews, phone, lat, lng);

            places.push({
                id: places.length + 1,
                osm_id: r.osm_id,
                name: name,
                sector: sector,
                sub: sub,
                category: categoryTitle,
                address: fullAddr,
                phone: phone,
                lat: lat,
                lng: lng,
                social_media: website,
                opening_hours: hours,
                rating: rating,
                reviews_count: reviews,
                status: 'none',
                source: 'osm',
                source_name: 'OpenStreetMap',
                source_type: 'Peta Spasial Nyata',
                source_color: '#16a34a',
                source_icon: 'fa-map-location-dot',
                insights: insights
            });
        });

        return {
            success: true,
            total_places: places.length,
            sector_counts: sectorCounts,
            sub_counts: subCounts,
            places: places
        };
    },

    bindTargetModeToggle() {
        const btnKeyword = document.getElementById('btn-toggle-keyword');
        const btnPreset = document.getElementById('btn-toggle-preset');
        const boxKeyword = document.getElementById('target-keyword-box');
        const boxPreset = document.getElementById('target-preset-box');
        const keywordInput = document.getElementById('target-keyword-input');
        const sectorSelect = document.getElementById('target-sector-select');
        const presetSelect = document.getElementById('target-category-select');

        // Ensure both category and optional keyword are cleanly accessible
        if (boxPreset) boxPreset.style.display = 'block';
        if (boxKeyword) boxKeyword.style.display = 'block';

        // Populate initial categories (without misleading (0) counts when unscanned)
        if (sectorSelect && presetSelect) {
            this.populateSectorsWithCounts();
        }

        if (sectorSelect) {
            sectorSelect.addEventListener('change', () => {
                if (keywordInput && keywordInput.value.trim()) {
                    keywordInput.value = '';
                }
                this.currentQuery.targetMode = 'preset';
                this.populateSubcategoriesWithCounts(sectorSelect.value);
                this.currentQuery.category = presetSelect ? presetSelect.value : sectorSelect.value;
                this.applyPresetFilter();
                this.updateTargetSummaryDisplay();
            });
        }

        if (presetSelect) {
            presetSelect.addEventListener('change', () => {
                if (keywordInput && keywordInput.value.trim()) {
                    keywordInput.value = '';
                }
                this.currentQuery.targetMode = 'preset';
                this.currentQuery.category = presetSelect.value;
                this.applyPresetFilter();
                this.updateTargetSummaryDisplay();
            });
        }

        if (btnKeyword && btnPreset) {
            btnKeyword.addEventListener('click', () => {
                this.currentQuery.targetMode = 'keyword';
                if (keywordInput) keywordInput.focus();
                this.updateTargetSummaryDisplay();
            });

            btnPreset.addEventListener('click', () => {
                this.setTargetInputMode('search');
                if (keywordInput) keywordInput.value = '';
                this.applyPresetFilter();
                this.updateTargetSummaryDisplay();
            });
        }

        const btnUrlBatch = document.getElementById('btn-toggle-url-batch');
        const urlInput = document.getElementById('gmaps-url-batch-input');
        if (btnUrlBatch) {
            btnUrlBatch.addEventListener('click', () => this.setTargetInputMode('url_batch'));
        }
        if (urlInput) {
            urlInput.addEventListener('input', () => this.updateUrlBatchCounter());
        }
    },

    parseGoogleMapsUrls(rawText) {
        const lines = String(rawText || '').split(/[\r\n,]+/);
        const urls = [];
        const seen = new Set();
        for (const raw of lines) {
            const line = raw.trim();
            if (!line) continue;
            try {
                const parsed = new URL(line);
                if (!['http:', 'https:'].includes(parsed.protocol)) continue;
                const host = parsed.hostname.toLowerCase();
                const isMaps = /^(?:www\.|maps\.)?google\.(com|co\.id)$/.test(host) || host === 'maps.app.goo.gl' || host === 'goo.gl';
                if (!isMaps || seen.has(parsed.href)) continue;
                seen.add(parsed.href);
                urls.push(parsed.href);
            } catch (_) {}
        }
        return urls;
    },

    updateUrlBatchCounter() {
        const input = document.getElementById('gmaps-url-batch-input');
        const badge = document.getElementById('gmaps-url-batch-count');
        const summaryEl = document.getElementById('summary-active-target');
        const urls = this.parseGoogleMapsUrls(input?.value || '');
        if (badge) {
            badge.textContent = `${urls.length} link valid`;
            badge.className = urls.length > 0 ? 'badge badge-green' : 'badge badge-blue';
        }
        if (this.currentQuery.targetMode === 'url_batch' && summaryEl) {
            summaryEl.textContent = `Ekstrak Langsung ${urls.length} Link Google Maps (Ala Amapulse)`;
        }
        return urls;
    },

    setTargetInputMode(mode) {
        const btnPreset = document.getElementById('btn-toggle-preset');
        const btnUrl = document.getElementById('btn-toggle-url-batch');
        const boxPreset = document.getElementById('target-preset-box');
        const boxUrls = document.getElementById('target-urls-box');
        const wilayahSec = document.getElementById('step-wilayah-section');
        const btnLabel = document.getElementById('main-execute-btn-label');

        if (mode === 'url_batch') {
            this.currentQuery.targetMode = 'url_batch';
            if (boxPreset) boxPreset.style.display = 'none';
            if (boxUrls) boxUrls.style.display = 'block';
            if (btnPreset) btnPreset.classList.remove('active');
            if (btnUrl) btnUrl.classList.add('active');
            if (wilayahSec) {
                wilayahSec.style.opacity = '0.45';
                wilayahSec.style.pointerEvents = 'none';
            }
            if (btnLabel) btnLabel.textContent = 'Ekstrak Data Semua Link (Ala Amapulse)';
            this.updateUrlBatchCounter();
        } else {
            this.currentQuery.targetMode = (document.getElementById('target-keyword-input')?.value?.trim()) ? 'keyword' : 'preset';
            if (boxPreset) boxPreset.style.display = 'block';
            if (boxUrls) boxUrls.style.display = 'none';
            if (btnPreset) btnPreset.classList.add('active');
            if (btnUrl) btnUrl.classList.remove('active');
            if (wilayahSec) {
                wilayahSec.style.opacity = '1';
                wilayahSec.style.pointerEvents = 'auto';
            }
            const checkedEngine = document.querySelector('input[name="scrape_engine"]:checked')?.value || 'hybrid';
            const labelMap = {
                hybrid: 'Mulai Cari Leads (Maps + Sosmed WA)',
                cloud: 'Mulai Ekstraksi Cloud API Estafet',
                local: 'Jalankan Mesin Lokal Chrome Laptop',
                dorking: 'Buru Nomor WA Sosmed Saja',
                extension: 'Buka Google Maps & Siapkan Ekstensi'
            };
            if (btnLabel) btnLabel.textContent = labelMap[checkedEngine] || labelMap.hybrid;
            this.updateTargetSummaryDisplay();
        }
    },

    bindKeywordInput() {
        const input = document.getElementById('target-keyword-input');
        const btnSearch = document.getElementById('btn-trigger-search');
        if (!input) return;

        const applyKeywordOrFallback = () => {
            const val = input.value.trim();
            if (val) {
                this.currentQuery.targetMode = 'keyword';
                this.currentQuery.category = val;
                this.loadPreScrapeCandidates();
            } else {
                this.currentQuery.targetMode = 'preset';
                this.applyPresetFilter();
            }
            this.updateTargetSummaryDisplay();
        };

        let debounce = null;
        input.addEventListener('input', () => {
            clearTimeout(debounce);
            debounce = setTimeout(applyKeywordOrFallback, 300);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                clearTimeout(debounce);
                applyKeywordOrFallback();
            }
        });

        if (btnSearch) {
            btnSearch.addEventListener('click', async (e) => {
                e.preventDefault();
                clearTimeout(debounce);
                const origHtml = btnSearch.innerHTML;
                btnSearch.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                btnSearch.disabled = true;
                try {
                    applyKeywordOrFallback();
                } finally {
                    btnSearch.innerHTML = origHtml;
                    btnSearch.disabled = false;
                }
            });
        }
    },

    // ----------------------------------------------------
    // 3. CASCADING ADMINISTRATIVE REGIONS
    // ----------------------------------------------------
    initRegionDropdowns() {
        const provSelect = document.getElementById('filter-provinsi');
        if (!provSelect) return;

        provSelect.innerHTML = '<option value="">-- Pilih Provinsi --</option>';
        if (typeof REGIONS_DATA !== 'undefined' && REGIONS_DATA.provinces) {
            REGIONS_DATA.provinces.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                if (p.id === '33') opt.selected = true; // default Jawa Tengah
                provSelect.appendChild(opt);
            });
        }

        this.populateRegencies('33');

        const kabSelect = document.getElementById('filter-kabupaten');
        const kecSelect = document.getElementById('filter-kecamatan');
        const kelSelect = document.getElementById('filter-kelurahan');

        provSelect.addEventListener('change', () => {
            this.populateRegencies(provSelect.value);
            this.handleRegionChange();
        });
        if (kabSelect) {
            kabSelect.addEventListener('change', () => {
                this.populateDistricts(kabSelect.value);
                this.handleRegionChange();
            });
        }
        if (kecSelect) {
            kecSelect.addEventListener('change', () => {
                this.populateVillages(kecSelect.value);
                this.handleRegionChange();
            });
        }
        if (kelSelect) {
            kelSelect.addEventListener('change', () => this.handleRegionChange());
        }

        const badgeGarisMerah = document.getElementById('badge-garis-merah');
        if (badgeGarisMerah) {
            badgeGarisMerah.addEventListener('click', () => {
                if (window.mapEngine && window.mapEngine.boundaryLayer) {
                    window.mapEngine.map.fitBounds(window.mapEngine.boundaryLayer.getBounds(), { padding: [40, 40] });
                } else {
                    this.handleRegionChange();
                }
            });
        }

        this.updateTargetSummaryDisplay();
    },

    populateRegencies(provId) {
        const kabSelect = document.getElementById('filter-kabupaten');
        const kecSelect = document.getElementById('filter-kecamatan');
        const kelSelect = document.getElementById('filter-kelurahan');
        if (!kabSelect) return;

        kabSelect.innerHTML = '<option value="">-- Pilih Kabupaten/Kota --</option>';
        if (kecSelect) kecSelect.innerHTML = '<option value="">-- Semua Kecamatan --</option>';
        if (kelSelect) kelSelect.innerHTML = '<option value="">-- Semua Kelurahan --</option>';

        // Center coordinates on the selected province
        if (typeof REGIONS_DATA !== 'undefined' && REGIONS_DATA.provinces) {
            const pObj = REGIONS_DATA.provinces.find(p => p.id === provId);
            if (pObj) {
                this.currentQuery.lat = pObj.lat;
                this.currentQuery.lng = pObj.lng;
                if (pObj.bbox) this.currentQuery.bbox = pObj.bbox;
            }
        }

        const regList = (typeof REGIONS_DATA !== 'undefined' && REGIONS_DATA.regencies[provId]) ? REGIONS_DATA.regencies[provId] : [];
        let defaultSelectedId = null;

        // Map ready Master Database regions
        const readyMap = {};
        if (window.MasterDB && Array.isArray(window.MasterDB.readyRegions)) {
            window.MasterDB.readyRegions.forEach(r => {
                const clean = r.name.toLowerCase().replace(/^(kabupaten|kota)\s+/i, '').trim();
                readyMap[clean] = r.total_places;
            });
        }

        regList.forEach((k, idx) => {
            const opt = document.createElement('option');
            opt.value = k.id;
            const cleanK = k.name.toLowerCase().replace(/^(kabupaten|kota)\s+/i, '').trim();
            if (readyMap[cleanK]) {
                opt.textContent = `${k.name} [Database Siap: ${readyMap[cleanK].toLocaleString()}]`;
            } else {
                opt.textContent = k.name;
            }
            if (provId === '33' && k.id === '3371') {
                opt.selected = true;
                defaultSelectedId = k.id;
            } else if (provId !== '33' && idx === 0) {
                opt.selected = true;
                defaultSelectedId = k.id;
            }
            kabSelect.appendChild(opt);
        });

        if (!defaultSelectedId && regList.length > 0) {
            defaultSelectedId = regList[0].id;
        }

        if (defaultSelectedId) {
            kabSelect.value = defaultSelectedId;
            const activeReg = regList.find(k => k.id === defaultSelectedId);
            if (activeReg) {
                this.currentQuery.lat = activeReg.lat;
                this.currentQuery.lng = activeReg.lng;
                if (activeReg.bbox) this.currentQuery.bbox = activeReg.bbox;
            }
            this.populateDistricts(defaultSelectedId);
        } else {
            kabSelect.value = '';
            this.populateDistricts('');
        }
    },

    populateDistricts(regId) {
        const kabSelect = document.getElementById('filter-kabupaten');
        const regName = kabSelect?.options[kabSelect.selectedIndex]?.text || '';
        const kecSelect = document.getElementById('filter-kecamatan');
        const kelSelect = document.getElementById('filter-kelurahan');
        if (!kecSelect) return;

        kecSelect.innerHTML = '<option value="">-- Semua Kecamatan --</option>';
        if (kelSelect) kelSelect.innerHTML = '<option value="">-- Semua Kelurahan --</option>';

        // Sync coordinates with selected regency
        if (regId && typeof REGIONS_DATA !== 'undefined' && REGIONS_DATA.regencies) {
            for (const pid in REGIONS_DATA.regencies) {
                const found = REGIONS_DATA.regencies[pid].find(k => k.id === regId);
                if (found) {
                    this.currentQuery.lat = found.lat;
                    this.currentQuery.lng = found.lng;
                    if (found.bbox) this.currentQuery.bbox = found.bbox;
                    break;
                }
            }
        }

        let distList = (typeof REGIONS_DATA !== 'undefined' && REGIONS_DATA.districts && REGIONS_DATA.districts[regId]) ? REGIONS_DATA.districts[regId] : [];
        
        // Dynamic fallback subdistricts for ANY regency in Indonesia
        if ((!distList || distList.length === 0) && regName && !regName.startsWith('--')) {
            const cleanReg = regName.replace(/^(Kabupaten|Kota)\s+/i, '');
            const cLat = this.currentQuery.lat;
            const cLng = this.currentQuery.lng;
            distList = [
                { id: regId + '01', name: cleanReg + ' Pusat / Kota', lat: cLat, lng: cLng },
                { id: regId + '02', name: cleanReg + ' Utara', lat: cLat + 0.03, lng: cLng },
                { id: regId + '03', name: cleanReg + ' Selatan', lat: cLat - 0.03, lng: cLng },
                { id: regId + '04', name: cleanReg + ' Barat', lat: cLat, lng: cLng - 0.03 },
                { id: regId + '05', name: cleanReg + ' Timur', lat: cLat, lng: cLng + 0.03 }
            ];
        }

        let activeDistId = null;
        distList.forEach((d, idx) => {
            const opt = document.createElement('option');
            opt.value = d.id;
            opt.textContent = d.name;
            if (regId === '3371' && d.id === '337103') {
                opt.selected = true;
                activeDistId = d.id;
            } else if (regId !== '3371' && idx === 0) {
                opt.selected = true;
                activeDistId = d.id;
            }
            kecSelect.appendChild(opt);
        });

        if (!activeDistId && distList.length > 0) {
            activeDistId = distList[0].id;
        }

        if (activeDistId) {
            kecSelect.value = activeDistId;
            const activeDist = distList.find(d => d.id === activeDistId);
            if (activeDist && activeDist.lat) {
                this.currentQuery.lat = activeDist.lat;
                this.currentQuery.lng = activeDist.lng;
            }
            this.populateVillages(activeDistId);
        } else {
            kecSelect.value = '';
            this.populateVillages('');
        }
    },

    populateVillages(distId) {
        const kecSelect = document.getElementById('filter-kecamatan');
        const distName = kecSelect?.options[kecSelect.selectedIndex]?.text || '';
        const kelSelect = document.getElementById('filter-kelurahan');
        if (!kelSelect) return;

        kelSelect.innerHTML = '<option value="">-- Semua Kelurahan/Desa --</option>';
        let vList = (typeof REGIONS_DATA !== 'undefined' && REGIONS_DATA.villages && REGIONS_DATA.villages[distId]) ? REGIONS_DATA.villages[distId] : [];
        if ((!vList || vList.length === 0) && distName && !distName.startsWith('--')) {
            const cleanDist = distName.replace(/^(Kecamatan)\s+/i, '');
            const cLat = this.currentQuery.lat;
            const cLng = this.currentQuery.lng;
            vList = [
                { id: distId + '01', name: cleanDist + ' 1', lat: cLat + 0.008, lng: cLng + 0.008 },
                { id: distId + '02', name: cleanDist + ' 2', lat: cLat - 0.008, lng: cLng - 0.008 },
                { id: distId + '03', name: cleanDist + ' 3', lat: cLat + 0.005, lng: cLng - 0.005 }
            ];
        }
        vList.forEach((v) => {
            const opt = document.createElement('option');
            opt.value = v.id;
            opt.textContent = v.name;
            kelSelect.appendChild(opt);
        });
        kelSelect.value = ''; // Default to '-- Semua Kelurahan/Desa --' so entire kecamatan is covered!
    },

    async handleRegionChange() {
        if (this.currentQuery.zoneMode !== 'boundary') return;

        const provSelect = document.getElementById('filter-provinsi');
        const kabSelect = document.getElementById('filter-kabupaten');
        const kecSelect = document.getElementById('filter-kecamatan');
        const kelSelect = document.getElementById('filter-kelurahan');

        const provId = provSelect?.value || '';
        const kabId = kabSelect?.value || '';
        const kecId = kecSelect?.value || '';
        const kelId = kelSelect?.value || '';

        const provName = provSelect?.options[provSelect.selectedIndex]?.text || '';
        const kabName = kabSelect?.options[kabSelect.selectedIndex]?.text || '';
        const kecName = kecSelect?.options[kecSelect.selectedIndex]?.text || '';
        const kelName = kelSelect?.options[kelSelect.selectedIndex]?.text || '';

        const locationParts = [kelName, kecName, kabName, provName].map(x => (x || '').replace(/\s*\[.*?\]\s*/g, '').trim()).filter(x => x && !x.startsWith('--'));
        const locationStr = locationParts.join(', ') || 'Indonesia';
        this.currentQuery.location = locationStr;

        // 1. Immediately resolve geographic boundaries from local REGIONS_DATA
        let targetScope = null;
        let targetLabel = locationStr;

        if (typeof REGIONS_DATA !== 'undefined') {
            // Priority A: Kelurahan
            if (kelId && REGIONS_DATA.villages && REGIONS_DATA.villages[kecId]) {
                const found = REGIONS_DATA.villages[kecId].find(v => v.id === kelId);
                if (found) {
                    targetScope = found;
                    targetLabel = `${found.name}, ${kecName && !kecName.startsWith('--') ? kecName : ''}`;
                }
            }
            // Priority B: Kecamatan
            if (!targetScope && kecId && REGIONS_DATA.districts && REGIONS_DATA.districts[kabId]) {
                const found = REGIONS_DATA.districts[kabId].find(d => d.id === kecId);
                if (found) {
                    targetScope = found;
                    targetLabel = `Kecamatan ${found.name}, ${kabName && !kabName.startsWith('--') ? kabName : ''}`;
                }
            }
            // Priority C: Kabupaten / Kota
            if (!targetScope && kabId && REGIONS_DATA.regencies) {
                for (const pid in REGIONS_DATA.regencies) {
                    const found = REGIONS_DATA.regencies[pid].find(k => k.id === kabId);
                    if (found) {
                        targetScope = found;
                        targetLabel = `${found.name}, ${provName && !provName.startsWith('--') ? provName : ''}`;
                        break;
                    }
                }
            }
            // Priority D: Provinsi
            if (!targetScope && provId && REGIONS_DATA.provinces) {
                const found = REGIONS_DATA.provinces.find(p => p.id === provId);
                if (found) {
                    targetScope = found;
                    targetLabel = `Provinsi ${found.name}`;
                }
            }
        }

        // Apply coordinates and draw the red boundary polygon immediately
        if (targetScope) {
            this.currentQuery.lat = targetScope.lat;
            this.currentQuery.lng = targetScope.lng;

            if (targetScope.bbox && targetScope.bbox.length === 4) {
                this.currentQuery.bbox = targetScope.bbox;
            } else {
                const delta = kelId ? 0.008 : (kecId ? 0.022 : (kabId ? 0.065 : 0.40));
                this.currentQuery.bbox = [
                    targetScope.lat - delta,
                    targetScope.lng - delta,
                    targetScope.lat + delta,
                    targetScope.lng + delta
                ];
            }

            if (window.mapEngine) {
                window.mapEngine.showBoundaryMode(this.currentQuery.bbox, null, targetLabel);
            }
        } else if (this.currentQuery.lat && this.currentQuery.lng) {
            const delta = 0.025;
            this.currentQuery.bbox = [
                this.currentQuery.lat - delta,
                this.currentQuery.lng - delta,
                this.currentQuery.lat + delta,
                this.currentQuery.lng + delta
            ];
            if (window.mapEngine) {
                window.mapEngine.showBoundaryMode(this.currentQuery.bbox, null, locationStr);
            }
        }

        // Update badge UI indicator
        const badgeGarisMerah = document.getElementById('badge-garis-merah');
        if (badgeGarisMerah) {
            badgeGarisMerah.innerHTML = `<span style="display:inline-block; width:8px; height:8px; background:#dc2626; border-radius:50%;"></span> <span>Batas Merah: ${targetLabel}</span>`;
            badgeGarisMerah.style.background = '#fef2f2';
            badgeGarisMerah.style.borderColor = '#f87171';
            badgeGarisMerah.style.color = '#dc2626';
        }

        // 2. Asynchronous boundary fetch (if backend API available)
        const isStaticHost = window.location.hostname.includes('github.io') || window.location.protocol === 'file:';
        if (!isStaticHost) {
            const searchScope = kelName && !kelName.startsWith('--') ? `${kelName}, ${kecName}` : (kecName && !kecName.startsWith('--') ? `${kecName}, ${kabName}` : (kabName && !kabName.startsWith('--') ? kabName : provName));
            try {
                const res = await fetch(`api/regions.php?action=boundary&q=${encodeURIComponent(searchScope)}&lat=${this.currentQuery.lat}&lng=${this.currentQuery.lng}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && window.mapEngine) {
                        this.currentQuery.lat = data.lat;
                        this.currentQuery.lng = data.lng;
                        this.currentQuery.bbox = data.boundingbox;
                        window.mapEngine.showBoundaryMode(data.boundingbox, data.geojson, data.name || targetLabel);
                    }
                }
            } catch (e) {
                // Silently preserve local boundary
            }
        }

        await this.scanTerritory();

        // 3. Check Master Database for existing harvested data
        this.checkMasterDbStatus();
        this.updateTargetSummaryDisplay();
    },

    // ----------------------------------------------------
    // 4. RADIUS CONTROLS
    // ----------------------------------------------------
    bindRadiusControls() {
        const slider = document.getElementById('unified-radius-slider');
        const display = document.getElementById('radius-km-display');

        if (slider) {
            slider.addEventListener('input', () => {
                const val = parseFloat(slider.value);
                if (display) display.textContent = `${val} KM`;
                this.currentQuery.radius = val;
                if (this.currentQuery.zoneMode === 'radius' && window.mapEngine) {
                    window.mapEngine.updateRadius(val);
                }
                this.scanTerritory();
                this.updateTargetSummaryDisplay();
            });
        }
    },

    // ----------------------------------------------------
    // 5. CANDIDATE PREVIEW & STATIC ENGINE HELPERS
    // ----------------------------------------------------
    // Deterministic hash function for consistent field enrichment
    hashString(str) {
        let hash = 0;
        if (!str || str.length === 0) return 12345678;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    },

    // Intelligent Business Contact & Operational Hours Enrichment
    enrichPlaceContact(item, contextLoc) {
        const name = (item.name || '').trim();
        const cat = (item.category || '').toLowerCase();
        const addr = (item.address || contextLoc || '').trim();
        const seed = this.hashString(name.toLowerCase() + '|' + addr.toLowerCase());

        // 1. WhatsApp / Phone Resolution — ONLY use real phone from source, DO NOT fabricate fake numbers!
        let phone = (item.phone || '').trim();
        if (!phone || phone === '-' || phone === 'null' || phone === 'undefined' || phone.length < 6) {
            phone = '';
        }

        // 2. Website & Social Media Resolution — ONLY use real data from source, DO NOT fabricate fake URLs!
        let website = (item.social_media || item.website || '').trim();
        if (!website || website === '-' || website === 'null' || website === 'undefined' || !website.includes('.')) {
            website = '';
        }

        // 3. Operating Hours Resolution — ONLY use real data from source, DO NOT fabricate fake schedules!
        let hours = (item.opening_hours || '').trim();
        if (!hours || hours === '-' || hours === 'null' || hours === 'undefined') {
            hours = '';
        }

        return { phone, website, hours };
    },

    generateTriChannelInsights(baseName, categoryTitle, rating, reviews, phoneNum, itemLat, itemLng, source = 'osm') {
        return {
            triple_verified: false,
            verification_score: 'Data sesuai sumber; belum diverifikasi independen',
            provenance: { source_name: 'OpenStreetMap', source_type: source, source_url: 'https://www.openstreetmap.org/', license: 'ODbL 1.0' },
            channel_alpha: { title: 'OpenStreetMap', rating: rating || null, reviews_count: reviews || null, status: 'Tercantum pada sumber', popularity_score: 'Tidak tersedia', summary: 'Data OSM tidak mencakup rating dan ulasan Google.' },
            channel_beta: { sentiment_positive: phoneNum && phoneNum !== '-' ? 'Nomor tercantum' : 'Nomor tidak tersedia', price_tier: 'Tidak tersedia', satisfaction_grade: 'Tidak dinilai', recommendation_rate: 'Perlu verifikasi manual', summary: 'Nomor telepon pada sumber tidak membuktikan akun WhatsApp aktif.' },
            channel_gamma: { gps_accuracy: 'Tidak dinilai', zoning: 'Sesuai sumber', road_access: 'Tidak dinilai', cadastral_status: 'Perlu pemeriksaan peta', summary: 'Koordinat mengikuti sumber.' }
        };
    },
    humanizeCategoryName(type, name = '') {
        const map = {
            hospital: 'Rumah Sakit',
            clinic: 'Klinik Kesehatan',
            pharmacy: 'Apotek & Farmasi',
            doctors: 'Praktik Dokter',
            dentist: 'Praktik Dokter Gigi',
            school: 'Sekolah',
            college: 'Kampus / Akademi',
            university: 'Universitas',
            kindergarten: 'Taman Kanak-kanak / PAUD',
            driving_school: 'Sekolah Mengemudi',
            language_school: 'Kursus Bahasa',
            music_school: 'Sekolah Musik',
            post_office: 'Kantor Pos',
            police: 'Kantor Polisi',
            townhall: 'Kantor Pemerintahan / Kelurahan',
            government: 'Instansi Pemerintah',
            office: 'Kantor & Perusahaan',
            bank: 'Bank & ATM',
            restaurant: 'Restoran & Kuliner',
            cafe: 'Cafe & Coffee Shop',
            fast_food: 'Kuliner Cepat Saji',
            bakery: 'Toko Roti & Bakery',
            car_repair: 'Bengkel Mobil',
            motorcycle_repair: 'Bengkel Motor',
            hotel: 'Hotel & Penginapan',
            guest_house: 'Penginapan / Homestay',
            supermarket: 'Supermarket',
            convenience: 'Minimarket',
            marketplace: 'Pasar Tradisional',
            clothes: 'Toko Pakaian & Fashion',
            laundry: 'Jasa Laundry',
            hairdresser: 'Salon & Barbershop',
            beauty: 'Klinik Kecantikan & Spa'
        };
        if (map[type]) return map[type];
        return type ? (type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ')) : 'Usaha Lokal';
    },

    getCategoryTaxonomy(keyword) {
        const k = (keyword || '').toLowerCase().trim();

        // 1. Perusahaan, Korporasi & Industri (PT / CV)
        if (['kantor_pt'].includes(k) || /\b(kantor pt|pt |perseroan terbatas)\b/i.test(k)) {
            return {
                title: 'Kantor PT (Perseroan Terbatas)',
                amenities: [],
                offices: ['company', 'corporate'],
                shops: [],
                tourism: [],
                keywords: ['PT', 'Perseroan Terbatas']
            };
        }
        if (['kantor_cv'].includes(k) || /\b(kantor cv|cv |commanditaire vennootschap|persekutuan komanditer)\b/i.test(k)) {
            return {
                title: 'Kantor CV (Persekutuan Komanditer)',
                amenities: [],
                offices: ['company', 'commercial'],
                shops: [],
                tourism: [],
                keywords: ['CV', 'Persekutuan Komanditer']
            };
        }
        if (['pabrik_manufaktur'].includes(k) || /\b(pabrik|manufaktur|industri|factory|manufacture)\b/i.test(k)) {
            return {
                title: 'Pabrik & Industri Manufaktur',
                amenities: [],
                offices: ['company'],
                shops: [],
                tourism: [],
                keywords: ['Pabrik', 'Industri', 'Manufaktur']
            };
        }
        if (['distributor_supplier'].includes(k) || /\b(distributor|supplier|agen grosir|suplier|wholesaler)\b/i.test(k)) {
            return {
                title: 'Distributor, Supplier & Agen Grosir',
                amenities: [],
                offices: ['commercial', 'company'],
                shops: ['wholesale'],
                tourism: [],
                keywords: ['Distributor', 'Supplier', 'Grosir', 'Agen']
            };
        }
        if (['pergudangan_logistik'].includes(k) || /\b(gudang|pergudangan|warehouse|depo|depot)\b/i.test(k)) {
            return {
                title: 'Pergudangan (Warehouse) & Depo',
                amenities: [],
                offices: ['logistics', 'company'],
                shops: [],
                tourism: [],
                keywords: ['Gudang', 'Pergudangan', 'Logistik', 'Depo']
            };
        }
        if (['holding_corporate'].includes(k) || /\b(holding|head office|kantor pusat|corporate)\b/i.test(k)) {
            return {
                title: 'Kantor Pusat / Holding Corporate',
                amenities: [],
                offices: ['corporate', 'company'],
                shops: [],
                tourism: [],
                keywords: ['Holding', 'Kantor Pusat', 'Head Office']
            };
        }
        if (['ekspor_impor'].includes(k) || /\b(ekspor|impor|export|import)\b/i.test(k)) {
            return {
                title: 'Eksportir & Importir',
                amenities: [],
                offices: ['company', 'commercial'],
                shops: [],
                tourism: [],
                keywords: ['Ekspor', 'Impor', 'Export Import']
            };
        }
        if (['semua_perusahaan', 'perusahaan'].includes(k) || /\b(perusahaan|korporasi|kantor pt|kantor cv)\b/i.test(k)) {
            return {
                title: 'Semua Kantor Perusahaan & PT/CV',
                amenities: [],
                offices: ['company', 'corporate', 'commercial'],
                shops: [],
                tourism: [],
                keywords: ['PT', 'CV', 'Perusahaan', 'Kantor']
            };
        }

        // 2. Konstruksi, Arsitektur & Properti
        if (['kontraktor'].includes(k) || /\b(kontraktor|pemborong|general contractor)\b/i.test(k)) {
            return {
                title: 'Kontraktor Bangunan & Gedung',
                amenities: [],
                offices: ['company', 'engineer'],
                shops: [],
                tourism: [],
                keywords: ['Kontraktor', 'Pemborong', 'Konstruksi']
            };
        }
        if (['arsitek_desain'].includes(k) || /\b(arsitek|desain interior|arsitektur)\b/i.test(k)) {
            return {
                title: 'Biro Arsitek & Desain Interior',
                amenities: [],
                offices: ['architect', 'company'],
                shops: [],
                tourism: [],
                keywords: ['Arsitek', 'Desain Interior', 'Studio Arsitektur']
            };
        }
        if (['developer_perumahan'].includes(k) || /\b(developer|pengembang perumahan|real estate|residence)\b/i.test(k)) {
            return {
                title: 'Developer Perumahan & Real Estate',
                amenities: [],
                offices: ['estate_agent', 'company'],
                shops: [],
                tourism: [],
                keywords: ['Developer', 'Perumahan', 'Property', 'Real Estate']
            };
        }
        if (['jasa_renovasi'].includes(k) || /\b(renovasi|tukang bangunan|mandor)\b/i.test(k)) {
            return {
                title: 'Jasa Renovasi & Mandor',
                amenities: [],
                offices: ['company'],
                shops: [],
                tourism: [],
                keywords: ['Renovasi', 'Mandor', 'Tukang Bangunan']
            };
        }
        if (['distributor_material'].includes(k) || /\b(distributor material|semen|besi baja|bahan bangunan)\b/i.test(k)) {
            return {
                title: 'Distributor Material Bangunan',
                amenities: [],
                offices: ['company'],
                shops: ['hardware', 'trade'],
                tourism: [],
                keywords: ['Distributor Material', 'Besi Baja', 'Semen']
            };
        }
        if (['semua_konstruksi', 'konstruksi'].includes(k) || /\b(konstruksi|properti|arsitektur)\b/i.test(k)) {
            return {
                title: 'Semua Bidang Konstruksi & Properti',
                amenities: [],
                offices: ['architect', 'engineer', 'company'],
                shops: ['hardware'],
                tourism: [],
                keywords: ['Kontraktor', 'Konstruksi', 'Arsitek', 'Developer']
            };
        }

        // 3. Jasa Bisnis, Legal & Profesional
        if (['notaris'].includes(k) || /\b(notaris|ppat)\b/i.test(k)) {
            return {
                title: 'Kantor Notaris & PPAT',
                amenities: [],
                offices: ['notary', 'lawyer'],
                shops: [],
                tourism: [],
                keywords: ['Notaris', 'PPAT']
            };
        }
        if (['kantor_hukum'].includes(k) || /\b(advokat|pengacara|kantor hukum|law firm|konsultan hukum)\b/i.test(k)) {
            return {
                title: 'Kantor Advokat & Konsultan Hukum',
                amenities: [],
                offices: ['lawyer'],
                shops: [],
                tourism: [],
                keywords: ['Advokat', 'Pengacara', 'Konsultan Hukum', 'Law Firm']
            };
        }
        if (['konsultan_akuntan'].includes(k) || /\b(akuntan|kap|konsultan pajak|audit)\b/i.test(k)) {
            return {
                title: 'Kantor Akuntan Publik (KAP) & Pajak',
                amenities: [],
                offices: ['accountant'],
                shops: [],
                tourism: [],
                keywords: ['Akuntan Publik', 'KAP', 'Konsultan Pajak']
            };
        }
        if (['konsultan_bisnis'].includes(k) || /\b(konsultan bisnis|konsultan manajemen)\b/i.test(k)) {
            return {
                title: 'Konsultan Bisnis & Manajemen',
                amenities: [],
                offices: ['consulting', 'company'],
                shops: [],
                tourism: [],
                keywords: ['Konsultan Bisnis', 'Konsultan Manajemen']
            };
        }
        if (['outsourcing_hrd'].includes(k) || /\b(outsourcing|hrd|headhunter|penyalur tenaga kerja)\b/i.test(k)) {
            return {
                title: 'Jasa Outsourcing & HRD',
                amenities: [],
                offices: ['employment_agency', 'company'],
                shops: [],
                tourism: [],
                keywords: ['Outsourcing', 'Penyalur Kerja', 'HRD']
            };
        }
        if (['percetakan'].includes(k) || /\b(percetakan|digital printing|printing|sablon|fotokopi|fotocopy)\b/i.test(k)) {
            return {
                title: 'Percetakan & Digital Printing',
                amenities: [],
                offices: [],
                shops: ['copyshop', 'print_shop'],
                tourism: [],
                keywords: ['Percetakan', 'Digital Printing', 'Sablon', 'Fotokopi']
            };
        }
        if (['laundry'].includes(k) || /\b(laundry|cuci baju|dry cleaning|cuci kiloan)\b/i.test(k)) {
            return {
                title: 'Jasa Laundry Kiloan & Satuan',
                amenities: [],
                offices: [],
                shops: ['laundry', 'dry_cleaning'],
                tourism: [],
                keywords: ['Laundry', 'Cuci Kering', 'Laundry Kiloan']
            };
        }
        if (['ekspedisi_kurir'].includes(k) || /\b(ekspedisi|cargo|jne|jnt|sicepat|pos|tiki|wahana|j&t)\b/i.test(k)) {
            return {
                title: 'Ekspedisi, Cargo & Jasa Kirim',
                amenities: ['post_office'],
                offices: ['logistics'],
                shops: [],
                tourism: [],
                keywords: ['JNE', 'J&T', 'SiCepat', 'Cargo', 'Ekspedisi', 'Wahana']
            };
        }
        if (['jasa_profesional', 'jasa'].includes(k) || /\b(jasa profesional|layanan bisnis)\b/i.test(k)) {
            return {
                title: 'Semua Jasa & Layanan Bisnis',
                amenities: [],
                offices: ['lawyer', 'notary', 'accountant', 'company'],
                shops: ['copyshop', 'laundry'],
                tourism: [],
                keywords: ['Notaris', 'Advokat', 'Konsultan', 'Jasa', 'Percetakan']
            };
        }

        // 4. Teknologi, IT & Telekomunikasi
        if (['software_house'].includes(k) || /\b(software house|web dev|developer aplikasi|software)\b/i.test(k)) {
            return {
                title: 'Software House & Startup Digital',
                amenities: [],
                offices: ['it', 'company'],
                shops: [],
                tourism: [],
                keywords: ['Software House', 'Web Development', 'Aplikasi Mobile']
            };
        }
        if (['agency_digital'].includes(k) || /\b(agency|digital marketing|seo agency|creative agency)\b/i.test(k)) {
            return {
                title: 'Digital Marketing & SEO Agency',
                amenities: [],
                offices: ['advertising', 'it'],
                shops: [],
                tourism: [],
                keywords: ['Digital Marketing', 'Agency', 'SEO Agency', 'Creative Agency']
            };
        }
        if (['isp_telekomunikasi'].includes(k) || /\b(isp|internet provider|indihome|biznet|myrepublic|telkomsel|xl|provider)\b/i.test(k)) {
            return {
                title: 'ISP & Provider Telekomunikasi',
                amenities: [],
                offices: ['telecommunication', 'company'],
                shops: [],
                tourism: [],
                keywords: ['Telkom', 'IndiHome', 'Biznet', 'MyRepublic', 'Internet Provider']
            };
        }
        if (['service_komputer'].includes(k) || /\b(service komputer|servis laptop|perbaikan komputer)\b/i.test(k)) {
            return {
                title: 'Servis Komputer, Laptop & Jaringan',
                amenities: [],
                offices: [],
                shops: ['computer'],
                tourism: [],
                keywords: ['Service Laptop', 'Servis Komputer', 'Perbaikan Komputer']
            };
        }
        if (['toko_komputer'].includes(k) || /\b(toko komputer|rakitan pc|sparepart pc|laptop)\b/i.test(k)) {
            return {
                title: 'Toko Komputer & Sparepart PC',
                amenities: [],
                offices: [],
                shops: ['computer'],
                tourism: [],
                keywords: ['Toko Komputer', 'Rakitan PC', 'Laptop Bekas']
            };
        }
        if (['semua_it', 'it'].includes(k) || /\b(teknologi|informasi|startup)\b/i.test(k)) {
            return {
                title: 'Semua Bidang IT & Digital',
                amenities: [],
                offices: ['it', 'telecommunication', 'company'],
                shops: ['computer'],
                tourism: [],
                keywords: ['Software House', 'IT Consultant', 'Digital Agency', 'Web Developer']
            };
        }

        // 5. Pendidikan & Edukasi
        if (['sd', 'sekolah dasar'].includes(k) || /\b(sd|sekolah dasar|mi|madrasah ibtidaiyah)\b/i.test(k)) {
            return {
                title: 'Sekolah Dasar (SD / MI)',
                amenities: ['school'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['SD', 'Sekolah Dasar', 'MI']
            };
        }
        if (['smp', 'sekolah menengah'].includes(k) || /\b(smp|mts|madrasah tsanawiyah)\b/i.test(k)) {
            return {
                title: 'SMP & MTs',
                amenities: ['school'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['SMP', 'MTs']
            };
        }
        if (['sma'].includes(k) || /\b(sma|madrasah aliyah|ma)\b/i.test(k)) {
            return {
                title: 'SMA & MA',
                amenities: ['school'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['SMA', 'Madrasah Aliyah', 'Sekolah Menengah Atas']
            };
        }
        if (['smk'].includes(k) || /\b(smk|kejuruan)\b/i.test(k)) {
            return {
                title: 'SMK Kejuruan',
                amenities: ['school'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['SMK', 'Sekolah Menengah Kejuruan']
            };
        }
        if (['sekolah_tinggi', 'politeknik', 'akademi'].includes(k) || /\b(sekolah tinggi|stmik|stie|politeknik|akademi)\b/i.test(k)) {
            return {
                title: 'Sekolah Tinggi, Politeknik & Akademi',
                amenities: ['college', 'university'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['Sekolah Tinggi', 'STMIK', 'STIE', 'Politeknik', 'Akademi']
            };
        }
        if (['universitas', 'kampus'].includes(k) || /\b(universitas|kampus|institut)\b/i.test(k)) {
            return {
                title: 'Universitas & Institut',
                amenities: ['university', 'college'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['Universitas', 'Institut', 'Kampus']
            };
        }
        if (['bimbel'].includes(k) || /\b(bimbel|les|bimbingan belajar)\b/i.test(k)) {
            return {
                title: 'Bimbingan Belajar & Les Privat',
                amenities: ['language_school', 'music_school'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['Bimbel', 'Bimbingan Belajar', 'Les Privat', 'Kumon', 'Ganesha']
            };
        }
        if (['kursus_lpk', 'kursus', 'lpk'].includes(k) || /\b(kursus|lpk|pelatihan)\b/i.test(k)) {
            return {
                title: 'LPK & Kursus Pelatihan',
                amenities: ['language_school', 'driving_school', 'music_school'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['LPK', 'Kursus', 'Pelatihan', 'Sekolah Mengemudi']
            };
        }
        if (['tk_paud', 'tk', 'paud'].includes(k) || /\b(tk|paud|taman kanak|ra)\b/i.test(k)) {
            return {
                title: 'TK & PAUD',
                amenities: ['kindergarten'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['TK', 'PAUD', 'Taman Kanak-kanak']
            };
        }
        if (['pesantren'].includes(k) || /\b(pesantren|pondok pesantren|ponpes)\b/i.test(k)) {
            return {
                title: 'Pondok Pesantren',
                amenities: ['school'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['Pondok Pesantren', 'Ponpes', 'Pesantren']
            };
        }
        if (['slb'].includes(k) || /\b(slb|luar biasa)\b/i.test(k)) {
            return {
                title: 'Sekolah Luar Biasa (SLB)',
                amenities: ['school'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['SLB', 'Sekolah Luar Biasa', 'Autis']
            };
        }
        if (['sekolah', 'pendidikan'].includes(k) || /(sekolah|edukasi|pendidikan|school|education)/i.test(k)) {
            return {
                title: 'Semua Instansi Pendidikan',
                amenities: ['school', 'kindergarten', 'college', 'university'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['sekolah', 'SD', 'SMP', 'SMA', 'SMK', 'Madrasah', 'Bimbel', 'Universitas', 'Ponpes']
            };
        }

        // 6. Kesehatan, Medis & Farmasi
        if (['rumah_sakit'].includes(k) || /\b(rumah sakit|rs|rsud|hospital)\b/i.test(k)) {
            return {
                title: 'Rumah Sakit',
                amenities: ['hospital'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['Rumah Sakit', 'RSUD', 'RS']
            };
        }
        if (['rsia'].includes(k) || /\b(rsia|ibu dan anak|rumah bersalin)\b/i.test(k)) {
            return {
                title: 'RSIA (Rumah Sakit Ibu & Anak)',
                amenities: ['hospital', 'clinic'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['RSIA', 'Rumah Sakit Ibu dan Anak', 'Rumah Bersalin']
            };
        }
        if (['klinik_gigi'].includes(k) || /\b(klinik gigi|dokter gigi|dental)\b/i.test(k)) {
            return {
                title: 'Klinik Gigi & Praktik Dokter Gigi',
                amenities: ['dentist', 'clinic'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['Klinik Gigi', 'Dokter Gigi', 'Dental']
            };
        }
        if (['klinik'].includes(k) || /\b(klinik|clinic)\b/i.test(k)) {
            return {
                title: 'Klinik Pratama & Umum',
                amenities: ['clinic', 'doctors'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['Klinik', 'Klinik Pratama', 'Balai Pengobatan']
            };
        }
        if (['puskesmas'].includes(k) || /\b(puskesmas)\b/i.test(k)) {
            return {
                title: 'Puskesmas',
                amenities: ['clinic', 'hospital'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['Puskesmas', 'Puskesmas Pembantu']
            };
        }
        if (['apotek'].includes(k) || /\b(apotek|farmasi|obat|pharmacy)\b/i.test(k)) {
            return {
                title: 'Apotek & Toko Obat',
                amenities: ['pharmacy'],
                offices: [],
                shops: ['chemist'],
                tourism: [],
                keywords: ['Apotek', 'Farmasi', 'Toko Obat']
            };
        }
        if (['praktik_dokter'].includes(k) || /\b(praktik dokter|dokter spesialis)\b/i.test(k)) {
            return {
                title: 'Praktik Dokter Mandiri',
                amenities: ['doctors'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['Praktik Dokter', 'Dokter Spesialis', 'dr.']
            };
        }
        if (['praktik_bidan'].includes(k) || /\b(praktik bidan|bidan mandiri)\b/i.test(k)) {
            return {
                title: 'Praktik Bidan Mandiri',
                amenities: ['clinic'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['Bidan', 'Praktik Bidan', 'Rumah Bersalin']
            };
        }
        if (['laboratorium'].includes(k) || /\b(laboratorium|lab medis|prodia)\b/i.test(k)) {
            return {
                title: 'Laboratorium Medis',
                amenities: ['clinic', 'hospital'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['Laboratorium', 'Lab Klinik', 'Prodia']
            };
        }
        if (['optik'].includes(k) || /\b(optik|kacamata)\b/i.test(k)) {
            return {
                title: 'Optik & Toko Kacamata',
                amenities: [],
                offices: [],
                shops: ['optician'],
                tourism: [],
                keywords: ['Optik', 'Toko Kacamata']
            };
        }
        if (['distributor_alkes'].includes(k) || /\b(alkes|alat kesehatan|distributor farmasi)\b/i.test(k)) {
            return {
                title: 'Distributor Alat Kesehatan & Farmasi',
                amenities: [],
                offices: ['company'],
                shops: ['medical_supply', 'wholesale'],
                tourism: [],
                keywords: ['Alkes', 'Alat Kesehatan', 'Distributor Farmasi']
            };
        }
        if (['kesehatan'].includes(k) || /(kesehatan|medis|health|dokter|bidan)/i.test(k)) {
            return {
                title: 'Layanan Kesehatan & Medis',
                amenities: ['hospital', 'clinic', 'pharmacy', 'doctors', 'dentist'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['Rumah Sakit', 'RSUD', 'Klinik', 'Apotek', 'Puskesmas', 'Dokter']
            };
        }

        // 7. Instansi Pemerintah & Layanan Publik
        if (['kantor_dinas'].includes(k) || /(kantor_dinas|dinas|pemda)/i.test(k)) {
            return {
                title: 'Kantor Dinas & Instansi',
                amenities: ['townhall'],
                offices: ['government'],
                shops: [],
                tourism: [],
                keywords: ['Dinas', 'Kantor Dinas', 'BPKAD', 'Bappeda']
            };
        }
        if (['kecamatan'].includes(k) || /\b(kecamatan|kantor camat)\b/i.test(k)) {
            return {
                title: 'Kantor Kecamatan',
                amenities: ['townhall'],
                offices: ['government'],
                shops: [],
                tourism: [],
                keywords: ['Kantor Kecamatan', 'Kecamatan']
            };
        }
        if (['kelurahan_desa'].includes(k) || /\b(kelurahan|desa|balai desa)\b/i.test(k)) {
            return {
                title: 'Kantor Kelurahan & Desa',
                amenities: ['townhall'],
                offices: ['government'],
                shops: [],
                tourism: [],
                keywords: ['Kantor Kelurahan', 'Balai Desa', 'Kelurahan', 'Desa']
            };
        }
        if (['kantor_pajak'].includes(k) || /(kantor_pajak|pajak|kpp|samsat)/i.test(k)) {
            return {
                title: 'Kantor Pajak & Samsat',
                amenities: ['townhall'],
                offices: ['government'],
                shops: [],
                tourism: [],
                keywords: ['KPP', 'Kantor Pajak', 'Samsat']
            };
        }
        if (['kepolisian', 'polisi'].includes(k) || /(kepolisian|polisi|polsek|polres)/i.test(k)) {
            return {
                title: 'Kantor Polisi (Polsek & Polres)',
                amenities: ['police'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['Polsek', 'Polres', 'Kantor Polisi', 'Polda']
            };
        }
        if (['tni_militer', 'tni'].includes(k) || /(tni|koramil|kodim|secaba|rindam)/i.test(k)) {
            return {
                title: 'Kantor Militer & TNI',
                amenities: ['police', 'townhall'],
                offices: ['government'],
                shops: [],
                tourism: [],
                keywords: ['Koramil', 'Kodim', 'TNI', 'Secaba', 'Rindam']
            };
        }
        if (['kantor_pos'].includes(k) || /(kantor_pos|pos)/i.test(k)) {
            return {
                title: 'Kantor Pos & Logistik',
                amenities: ['post_office'],
                offices: ['logistics'],
                shops: [],
                tourism: [],
                keywords: ['Kantor Pos', 'Pos Indonesia']
            };
        }
        if (['bpjs'].includes(k) || /\b(bpjs|bpjs kesehatan|bpjs ketenagakerjaan)\b/i.test(k)) {
            return {
                title: 'Kantor BPJS Kesehatan & Ketenagakerjaan',
                amenities: ['townhall'],
                offices: ['government', 'company'],
                shops: [],
                tourism: [],
                keywords: ['BPJS Kesehatan', 'BPJS Ketenagakerjaan', 'BPJS']
            };
        }
        if (['kantor_bpn'].includes(k) || /\b(bpn|pertanahan)\b/i.test(k)) {
            return {
                title: 'Kantor Pertanahan (BPN)',
                amenities: ['townhall'],
                offices: ['government'],
                shops: [],
                tourism: [],
                keywords: ['BPN', 'Badan Pertanahan', 'Kantor Pertanahan']
            };
        }
        if (['pemerintah'].includes(k) || /(pemerintah|instansi|kantor|government)/i.test(k)) {
            return {
                title: 'Instansi Pemerintah & Kantor',
                amenities: ['townhall', 'police', 'post_office', 'courthouse'],
                offices: ['government'],
                shops: [],
                tourism: [],
                keywords: ['Kantor', 'Dinas', 'Kecamatan', 'Kelurahan', 'Polsek', 'Polres']
            };
        }

        // 8. Kuliner, Makanan & Minuman
        if (['cafe'].includes(k) || /\b(cafe|kafe|kopi|coffee|warkop)\b/i.test(k)) {
            return {
                title: 'Kafe & Coffee Shop',
                amenities: ['cafe'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['Cafe', 'Kopi', 'Coffee', 'Kafe', 'Warkop']
            };
        }
        if (['resto'].includes(k) || /\b(resto|restoran|rumah makan)\b/i.test(k)) {
            return {
                title: 'Restoran & Rumah Makan',
                amenities: ['restaurant', 'fast_food', 'food_court'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['Restoran', 'Rumah Makan', 'Resto']
            };
        }
        if (['warung'].includes(k) || /\b(warung|warteg|warung makan)\b/i.test(k)) {
            return {
                title: 'Warung Makan & Warteg',
                amenities: ['restaurant', 'fast_food'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['Warung Makan', 'Warteg', 'Warung Nasi']
            };
        }
        if (['bakso_mie_soto'].includes(k) || /\b(bakso|soto|mie ayam|mie ramen)\b/i.test(k)) {
            return {
                title: 'Bakso, Soto & Mie Ayam',
                amenities: ['restaurant', 'fast_food'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['Bakso', 'Soto', 'Mie Ayam']
            };
        }
        if (['fast_food'].includes(k) || /\b(fast food|fried chicken|burger)\b/i.test(k)) {
            return {
                title: 'Kuliner Cepat Saji (Fast Food)',
                amenities: ['fast_food'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['Fried Chicken', 'Burger', 'Fast Food', 'Rocket Chicken']
            };
        }
        if (['bakery'].includes(k) || /\b(bakery|roti|kue|pastry)\b/i.test(k)) {
            return {
                title: 'Bakery & Toko Roti',
                amenities: [],
                offices: [],
                shops: ['bakery', 'pastry'],
                tourism: [],
                keywords: ['Bakery', 'Toko Roti', 'Kue']
            };
        }
        if (['catering'].includes(k) || /\b(catering|katering|prasmanan)\b/i.test(k)) {
            return {
                title: 'Jasa Catering & Prasmanan',
                amenities: [],
                offices: ['company'],
                shops: [],
                tourism: [],
                keywords: ['Catering', 'Katering', 'Prasmanan']
            };
        }
        if (['depot_air'].includes(k) || /\b(depot air|air isi ulang|galon)\b/i.test(k)) {
            return {
                title: 'Depot Air Minum Isi Ulang',
                amenities: [],
                offices: [],
                shops: ['water'],
                tourism: [],
                keywords: ['Depot Air', 'Air Isi Ulang', 'Depot Galon']
            };
        }
        if (['kuliner'].includes(k) || /(kuliner|makan)/i.test(k)) {
            return {
                title: 'Kuliner & Tempat Makan',
                amenities: ['restaurant', 'fast_food', 'cafe'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['Warung', 'Rumah Makan', 'Bakso', 'Mie', 'Soto', 'Kuliner']
            };
        }

        // 9. Perdagangan, Retail & Toko
        if (['minimarket'].includes(k) || /\b(minimarket|indomaret|alfamart|supermarket|swalayan)\b/i.test(k)) {
            return {
                title: 'Minimarket & Supermarket',
                amenities: [],
                offices: [],
                shops: ['convenience', 'supermarket'],
                tourism: [],
                keywords: ['Indomaret', 'Alfamart', 'Minimarket', 'Supermarket', 'Swalayan']
            };
        }
        if (['toko_kelontong'].includes(k) || /\b(kelontong|sembako|toko sembako)\b/i.test(k)) {
            return {
                title: 'Toko Sembako & Kelontong',
                amenities: [],
                offices: [],
                shops: ['convenience', 'general'],
                tourism: [],
                keywords: ['Toko Sembako', 'Toko Kelontong', 'Agen Sembako']
            };
        }
        if (['elektronik'].includes(k) || /\b(elektronik|gadget|toko hp|konter pulsa)\b/i.test(k)) {
            return {
                title: 'Toko Elektronik, Gadget & HP',
                amenities: [],
                offices: [],
                shops: ['electronics', 'mobile_phone'],
                tourism: [],
                keywords: ['Toko Elektronik', 'Toko HP', 'Konter Pulsa', 'Servis HP']
            };
        }
        if (['fashion'].includes(k) || /\b(fashion|baju|butik|distro|pakaian)\b/i.test(k)) {
            return {
                title: 'Toko Pakaian, Butik & Distro',
                amenities: [],
                offices: [],
                shops: ['clothes', 'boutique'],
                tourism: [],
                keywords: ['Toko Baju', 'Butik', 'Distro', 'Fashion']
            };
        }
        if (['toko_bangunan'].includes(k) || /\b(toko bangunan|material bangunan|tb )\b/i.test(k)) {
            return {
                title: 'Toko Bangunan & Material',
                amenities: [],
                offices: [],
                shops: ['hardware', 'doityourself', 'trade'],
                tourism: [],
                keywords: ['Toko Bangunan', 'TB', 'Material Bangunan']
            };
        }
        if (['petshop'].includes(k) || /\b(petshop|pet shop|pakan kucing|pakan burung)\b/i.test(k)) {
            return {
                title: 'Pet Shop & Pakan Hewan',
                amenities: [],
                offices: [],
                shops: ['pet'],
                tourism: [],
                keywords: ['Pet Shop', 'Pakan Kucing', 'Pakan Burung']
            };
        }
        if (['toko_buku_atk'].includes(k) || /\b(toko buku|atk|alat tulis)\b/i.test(k)) {
            return {
                title: 'Toko Buku & Alat Tulis (ATK)',
                amenities: [],
                offices: [],
                shops: ['books', 'stationery'],
                tourism: [],
                keywords: ['Toko ATK', 'Toko Buku', 'Fotocopy & ATK']
            };
        }
        if (['toko_emas'].includes(k) || /\b(toko emas|perhiasan)\b/i.test(k)) {
            return {
                title: 'Toko Emas & Perhiasan',
                amenities: [],
                offices: [],
                shops: ['jewelry'],
                tourism: [],
                keywords: ['Toko Emas', 'Perhiasan Emas']
            };
        }
        if (['furniture_mebel'].includes(k) || /\b(mebel|furniture|springbed)\b/i.test(k)) {
            return {
                title: 'Toko Furniture, Mebel & Dekorasi',
                amenities: [],
                offices: [],
                shops: ['furniture'],
                tourism: [],
                keywords: ['Mebel', 'Toko Furniture', 'Kasur Springbed']
            };
        }
        if (['pasar_tradisional'].includes(k) || /\b(pasar|pasar tradisional)\b/i.test(k)) {
            return {
                title: 'Pasar Tradisional & Kios Pasar',
                amenities: ['marketplace'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['Pasar', 'Pasar Tradisional']
            };
        }
        if (['retail'].includes(k) || /(toko|retail)/i.test(k)) {
            return {
                title: 'Retail & Toko',
                amenities: [],
                offices: [],
                shops: ['convenience', 'supermarket', 'general', 'clothes', 'electronics'],
                tourism: [],
                keywords: ['Toko', 'Minimarket', 'Supermarket', 'Grosir']
            };
        }

        // 10. Otomotif & Transportasi
        if (['bengkel_motor'].includes(k) || /\b(bengkel motor|ahass|servis motor|tambal ban)\b/i.test(k)) {
            return {
                title: 'Bengkel Motor & Servis Resmi',
                amenities: [],
                offices: [],
                shops: ['motorcycle_repair', 'motorcycle'],
                tourism: [],
                keywords: ['Bengkel Motor', 'AHASS', 'Yamaha Servis', 'Tambal Ban']
            };
        }
        if (['bengkel_mobil'].includes(k) || /\b(bengkel mobil|ganti oli|tune up|bengkel ac mobil)\b/i.test(k)) {
            return {
                title: 'Bengkel Mobil & Ganti Oli',
                amenities: [],
                offices: [],
                shops: ['car_repair', 'car_parts'],
                tourism: [],
                keywords: ['Bengkel Mobil', 'Ganti Oli', 'Tune Up', 'Bengkel AC Mobil']
            };
        }
        if (['toko_ban_aki'].includes(k) || /\b(toko ban|toko aki|spooring|balancing)\b/i.test(k)) {
            return {
                title: 'Toko Ban, Velg & Aki',
                amenities: [],
                offices: [],
                shops: ['tyres', 'car_parts'],
                tourism: [],
                keywords: ['Toko Ban', 'Toko Aki', 'Spooring', 'Balancing']
            };
        }
        if (['cuci_kendaraan'].includes(k) || /\b(cuci mobil|cuci motor|car wash|doorsmeer)\b/i.test(k)) {
            return {
                title: 'Cuci Mobil & Motor (Doorsmeer)',
                amenities: ['car_wash'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['Cuci Mobil', 'Cuci Motor', 'Car Wash', 'Doorsmeer']
            };
        }
        if (['spbu'].includes(k) || /\b(spbu|pertamina|pom bensin|shell)\b/i.test(k)) {
            return {
                title: 'SPBU & Pengisian Bahan Bakar',
                amenities: ['fuel'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['SPBU', 'Pertamina', 'Pom Bensin']
            };
        }
        if (['dealer_showroom'].includes(k) || /\b(dealer|showroom mobil|showroom motor)\b/i.test(k)) {
            return {
                title: 'Dealer Mobil & Showroom Motor',
                amenities: [],
                offices: [],
                shops: ['car', 'motorcycle'],
                tourism: [],
                keywords: ['Dealer', 'Showroom Motor', 'Showroom Mobil']
            };
        }
        if (['rental_travel'].includes(k) || /\b(rental mobil|sewa mobil|travel antar kota)\b/i.test(k)) {
            return {
                title: 'Rental Mobil & Travel Antar Kota',
                amenities: [],
                offices: ['travel_agent'],
                shops: [],
                tourism: [],
                keywords: ['Rental Mobil', 'Sewa Mobil', 'Agen Travel', 'Travel Antar Kota']
            };
        }
        if (['otomotif'].includes(k) || /(otomotif|bengkel)/i.test(k)) {
            return {
                title: 'Semua Layanan Otomotif',
                amenities: ['fuel', 'car_wash'],
                offices: [],
                shops: ['car_repair', 'motorcycle_repair', 'car', 'motorcycle'],
                tourism: [],
                keywords: ['Bengkel', 'Otomotif', 'Servis Mobil', 'Servis Motor', 'SPBU']
            };
        }

        // 11. Akomodasi, Pariwisata & Hiburan
        if (['hotel'].includes(k) || /\b(hotel|city hotel|hotel bintang)\b/i.test(k)) {
            return {
                title: 'Hotel Berbintang & Budget',
                amenities: [],
                offices: [],
                shops: [],
                tourism: ['hotel'],
                keywords: ['Hotel', 'City Hotel', 'Hotel Bintang']
            };
        }
        if (['penginapan'].includes(k) || /\b(penginapan|homestay|guesthouse|reddoorz|oyo)\b/i.test(k)) {
            return {
                title: 'Penginapan, Guesthouse & Homestay',
                amenities: [],
                offices: [],
                shops: [],
                tourism: ['guest_house', 'hostel', 'motel'],
                keywords: ['Penginapan', 'Homestay', 'Guesthouse', 'RedDoorz', 'OYO']
            };
        }
        if (['villa'].includes(k) || /\b(villa|resort|glamping)\b/i.test(k)) {
            return {
                title: 'Villa & Resort',
                amenities: [],
                offices: [],
                shops: [],
                tourism: ['chalet', 'hotel'],
                keywords: ['Villa', 'Resort', 'Glamping']
            };
        }
        if (['kost'].includes(k) || /\b(kost|kos|kontrakan)\b/i.test(k)) {
            return {
                title: 'Rumah Kost & Kontrakan',
                amenities: [],
                offices: [],
                shops: [],
                tourism: ['guest_house'],
                keywords: ['Kost', 'Kos Putra', 'Kos Putri', 'Kontrakan']
            };
        }
        if (['wisata'].includes(k) || /\b(wisata|taman rekreasi|objek wisata)\b/i.test(k)) {
            return {
                title: 'Tempat Wisata & Rekreasi',
                amenities: [],
                offices: [],
                shops: [],
                tourism: ['attraction', 'theme_park', 'viewpoint'],
                keywords: ['Wisata', 'Objek Wisata', 'Taman Rekreasi']
            };
        }
        if (['gedung_pertemuan'].includes(k) || /\b(gedung pertemuan|ballroom|convention hall|wedding venue)\b/i.test(k)) {
            return {
                title: 'Gedung Pertemuan & Wedding Venue',
                amenities: ['events_venue', 'community_centre'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['Gedung Pertemuan', 'Ballroom', 'Convention Hall', 'Wedding Venue']
            };
        }
        if (['akomodasi'].includes(k) || /(hotel|penginapan|homestay|villa|kost|wisata)/i.test(k)) {
            return {
                title: 'Semua Akomodasi & Wisata',
                amenities: [],
                offices: [],
                shops: [],
                tourism: ['hotel', 'guest_house', 'hostel', 'motel', 'theme_park'],
                keywords: ['Hotel', 'Penginapan', 'Homestay', 'Villa', 'Kost', 'Wisata']
            };
        }

        // 12. Kecantikan, Kebugaran & Relaksasi
        if (['salon'].includes(k) || /\b(salon|salon rambut|mua)\b/i.test(k)) {
            return {
                title: 'Salon Kecantikan & Rambut',
                amenities: [],
                offices: [],
                shops: ['hairdresser', 'beauty'],
                tourism: [],
                keywords: ['Salon Kecantikan', 'Salon Rambut', 'MUA']
            };
        }
        if (['barbershop'].includes(k) || /\b(barber|barbershop|pangkas pria|cukur)\b/i.test(k)) {
            return {
                title: 'Barbershop & Pangkas Pria',
                amenities: [],
                offices: [],
                shops: ['hairdresser'],
                tourism: [],
                keywords: ['Barbershop', 'Pangkas Rambut', 'Cukur Rambut']
            };
        }
        if (['klinik_estetika'].includes(k) || /\b(klinik estetika|klinik kecantikan|skincare|natasha|erha)\b/i.test(k)) {
            return {
                title: 'Klinik Estetika & Skincare',
                amenities: ['clinic'],
                offices: [],
                shops: ['beauty'],
                tourism: [],
                keywords: ['Klinik Estetika', 'Klinik Kecantikan', 'Skincare', 'Natasha', 'Erha']
            };
        }
        if (['spa'].includes(k) || /\b(spa|refleksi|reflexology|massage|pijat)\b/i.test(k)) {
            return {
                title: 'Spa & Pijat Relaksasi',
                amenities: ['spa'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['Spa', 'Pijat Refleksi', 'Reflexology', 'Massage']
            };
        }
        if (['gym'].includes(k) || /\b(gym|fitness|pusat kebugaran)\b/i.test(k)) {
            return {
                title: 'Pusat Kebugaran, Gym & Fitness',
                amenities: [],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['Gym', 'Fitness', 'Pusat Kebugaran']
            };
        }
        if (['lapangan_olahraga'].includes(k) || /\b(futsal|badminton|gor|lapangan)\b/i.test(k)) {
            return {
                title: 'Lapangan Olahraga & Futsal',
                amenities: [],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['Futsal', 'Badminton', 'Gor Olahraga']
            };
        }
        if (['kecantikan'].includes(k) || /(salon|barber|barbershop|rambut|kecantikan|skincare|spa|gym)/i.test(k)) {
            return {
                title: 'Semua Layanan Kecantikan & Kebugaran',
                amenities: ['spa'],
                offices: [],
                shops: ['beauty', 'hairdresser'],
                tourism: [],
                keywords: ['Salon', 'Barbershop', 'Pangkas Rambut', 'Skincare', 'Spa', 'Gym']
            };
        }

        // 13. Lembaga Keuangan & Asuransi
        if (['bpr_syariah'].includes(k) || /\b(bpr|bank syariah|perkreditan rakyat)\b/i.test(k)) {
            return {
                title: 'Bank Perkreditan Rakyat (BPR) & Syariah',
                amenities: ['bank'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['BPR', 'Bank Perkreditan Rakyat', 'Bank Syariah']
            };
        }
        if (['bank'].includes(k) || /\b(bank|mandiri|bca|bri|bni|bsi|jateng)\b/i.test(k)) {
            return {
                title: 'Kantor Cabang Bank',
                amenities: ['bank'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['Bank Mandiri', 'Bank BCA', 'Bank BRI', 'Bank BNI', 'Bank Jateng', 'Bank BSI']
            };
        }
        if (['atm'].includes(k) || /\b(atm|tarik tunai|cdm)\b/i.test(k)) {
            return {
                title: 'Galeri ATM & CDM',
                amenities: ['atm'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['ATM', 'Galeri ATM', 'Tarik Tunai']
            };
        }
        if (['koperasi'].includes(k) || /\b(koperasi|ksp|bmt)\b/i.test(k)) {
            return {
                title: 'Koperasi Simpan Pinjam & BMT',
                amenities: [],
                offices: ['financial'],
                shops: [],
                tourism: [],
                keywords: ['Koperasi', 'KSP', 'BMT', 'Koperasi Simpan Pinjam']
            };
        }
        if (['pegadaian'].includes(k) || /\b(pegadaian|gadai|pusat gadai)\b/i.test(k)) {
            return {
                title: 'Kantor Pegadaian & Gadai',
                amenities: [],
                offices: ['financial'],
                shops: [],
                tourism: [],
                keywords: ['Pegadaian', 'Gadai', 'Pusat Gadai']
            };
        }
        if (['kantor_asuransi'].includes(k) || /\b(asuransi|prudential|allianz|axa|bumiputera)\b/i.test(k)) {
            return {
                title: 'Kantor Asuransi Jiwa & Kendaraan',
                amenities: [],
                offices: ['insurance'],
                shops: [],
                tourism: [],
                keywords: ['Asuransi', 'Prudential', 'Allianz', 'AXA', 'Bumiputera']
            };
        }
        if (['keuangan'].includes(k) || /(bank|keuangan|koperasi|pegadaian)/i.test(k)) {
            return {
                title: 'Semua Lembaga Keuangan',
                amenities: ['bank', 'atm'],
                offices: ['financial'],
                shops: [],
                tourism: [],
                keywords: ['Bank', 'BPR', 'Koperasi', 'Pegadaian', 'Asuransi']
            };
        }

        // 14. Pertanian, Peternakan & Agribisnis
        if (['toko_tani'].includes(k) || /\b(toko tani|toko pertanian|pupuk|obat pertanian|benih)\b/i.test(k)) {
            return {
                title: 'Toko Pertanian, Benih & Pupuk',
                amenities: [],
                offices: [],
                shops: ['agrarian', 'garden_centre'],
                tourism: [],
                keywords: ['Toko Tani', 'Toko Pertanian', 'Pupuk', 'Obat Pertanian', 'Benih']
            };
        }
        if (['peternakan'].includes(k) || /\b(peternakan|kandang ayam|peternakan sapi|farm)\b/i.test(k)) {
            return {
                title: 'Peternakan Ayam, Sapi & Kambing',
                amenities: [],
                offices: ['company'],
                shops: [],
                tourism: [],
                keywords: ['Peternakan', 'Kandang Ayam', 'Peternakan Sapi', 'Farm']
            };
        }
        if (['pakan_ternak'].includes(k) || /\b(pakan ternak|poultry shop|pakan ayam|konsentrat)\b/i.test(k)) {
            return {
                title: 'Toko Pakan Ternak & Poultry Shop',
                amenities: [],
                offices: [],
                shops: ['animal_feed', 'pet'],
                tourism: [],
                keywords: ['Pakan Ternak', 'Poultry Shop', 'Pakan Ayam', 'Konsentrat']
            };
        }
        if (['pembibitan_tanaman'].includes(k) || /\b(pembibitan|bibit tanaman|nursery|tanaman hias)\b/i.test(k)) {
            return {
                title: 'Pembibitan Tanaman & Toko Bibit',
                amenities: [],
                offices: [],
                shops: ['garden_centre'],
                tourism: [],
                keywords: ['Bibit Tanaman', 'Nursery', 'Tanaman Hias', 'Bibit Buah']
            };
        }
        if (['penggilingan_padi'].includes(k) || /\b(penggilingan padi|rice mill|selepan padi|gudang gabah)\b/i.test(k)) {
            return {
                title: 'Penggilingan Padi & Gudang Gabah',
                amenities: [],
                offices: ['company'],
                shops: [],
                tourism: [],
                keywords: ['Penggilingan Padi', 'Rice Mill', 'Selepan Padi', 'Gudang Gabah']
            };
        }
        if (['perikanan_tambak'].includes(k) || /\b(perikanan|tambak|budidaya ikan|pakan ikan)\b/i.test(k)) {
            return {
                title: 'Perikanan, Tambak & Pakan Ikan',
                amenities: [],
                offices: [],
                shops: ['fishing', 'pet'],
                tourism: [],
                keywords: ['Budidaya Ikan', 'Tambak', 'Bibit Ikan', 'Pakan Ikan']
            };
        }
        if (['pertanian'].includes(k) || /(tani|pertanian|peternakan|agribisnis)/i.test(k)) {
            return {
                title: 'Semua Bidang Pertanian & Agribisnis',
                amenities: [],
                offices: ['company'],
                shops: ['agrarian', 'pet', 'garden_centre'],
                tourism: [],
                keywords: ['Toko Pertanian', 'Pupuk', 'Pakan Ternak', 'Peternakan', 'Penggilingan Padi']
            };
        }

        // 15. Tempat Ibadah & Yayasan Sosial
        if (['masjid'].includes(k) || /\b(masjid|mushola|masjid jami)\b/i.test(k)) {
            return {
                title: 'Masjid & Mushola',
                amenities: ['place_of_worship'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['Masjid', 'Mushola', 'Masjid Jami']
            };
        }
        if (['gereja'].includes(k) || /\b(gereja|gbi|hkbp|katolik|protestan)\b/i.test(k)) {
            return {
                title: 'Gereja Kristen & Katolik',
                amenities: ['place_of_worship'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['Gereja', 'Gereja Katolik', 'Gereja Kristen', 'GBI', 'HKBP']
            };
        }
        if (['pura_vihara'].includes(k) || /\b(pura|vihara|klenteng)\b/i.test(k)) {
            return {
                title: 'Pura, Vihara & Klenteng',
                amenities: ['place_of_worship'],
                offices: [],
                shops: [],
                tourism: [],
                keywords: ['Pura', 'Vihara', 'Klenteng']
            };
        }
        if (['panti_asuhan'].includes(k) || /\b(panti asuhan|yayasan yatim|lksa)\b/i.test(k)) {
            return {
                title: 'Panti Asuhan & Yayasan Sosial',
                amenities: ['social_facility'],
                offices: ['charity', 'ngo'],
                shops: [],
                tourism: [],
                keywords: ['Panti Asuhan', 'Yayasan Yatim', 'LKSA']
            };
        }
        if (['lembaga_zakat'].includes(k) || /\b(zakat|baznas|lazismu|lazisnu|dompet dhuafa|rumah zakat)\b/i.test(k)) {
            return {
                title: 'Lembaga Zakat & Infaq',
                amenities: [],
                offices: ['charity', 'ngo'],
                shops: [],
                tourism: [],
                keywords: ['BAZNAS', 'LAZISMU', 'LAZISNU', 'Dompet Dhuafa', 'Rumah Zakat']
            };
        }
        if (['tempat_ibadah', 'ibadah'].includes(k) || /(ibadah|religi|yayasan)/i.test(k)) {
            return {
                title: 'Semua Tempat Ibadah & Yayasan',
                amenities: ['place_of_worship', 'social_facility'],
                offices: ['charity'],
                shops: [],
                tourism: [],
                keywords: ['Masjid', 'Gereja', 'Pura', 'Vihara', 'Panti Asuhan']
            };
        }

        // Default Fallback
        return {
            title: k.charAt(0).toUpperCase() + k.slice(1),
            amenities: [],
            offices: ['company'],
            shops: [],
            tourism: [],
            keywords: [k]
        };
    },

    async fetchRealMapPlaces(queryObj) {
        if (this.googleMapsOnly) return [];
        const q = ((queryObj && queryObj.category) || 'semua_perusahaan').trim();
        const loc = (queryObj && queryObj.location) || 'Indonesia';
        const centerLat = parseFloat(queryObj && queryObj.lat) || -7.4705;
        const centerLng = parseFloat(queryObj && queryObj.lng) || 110.2178;
        const radius = parseFloat(queryObj && queryObj.radius) || 5;

        let bbox = null;
        if (queryObj && queryObj.bbox) {
            bbox = typeof queryObj.bbox === 'string' ? queryObj.bbox.split(',').map(Number) : queryObj.bbox;
        }
        const norm = this.normalizeBoundingBox(bbox, centerLat, centerLng);
        const viewbox = norm.viewbox;
        const taxonomy = this.getCategoryTaxonomy(q);

        try {
            let rawList = [];
            const seenOsmIds = new Set();

            const fetchPromises = [];

            // 1. Query structured amenities
            if (taxonomy.amenities && taxonomy.amenities.length > 0) {
                taxonomy.amenities.forEach(amenity => {
                    const u = `https://nominatim.openstreetmap.org/search?amenity=${encodeURIComponent(amenity)}&format=json&bounded=1&viewbox=${viewbox}&addressdetails=1&extratags=1&limit=20`;
                    fetchPromises.push(fetch(u, { headers: { 'Accept': 'application/json' } }).then(r => r.ok ? r.json() : []).catch(() => []));
                });
            }

            // 2. Query structured offices (PT, CV, Corporate, Government, etc.)
            if (taxonomy.offices && taxonomy.offices.length > 0) {
                taxonomy.offices.forEach(off => {
                    const u = `https://nominatim.openstreetmap.org/search?office=${encodeURIComponent(off)}&format=json&bounded=1&viewbox=${viewbox}&addressdetails=1&extratags=1&limit=20`;
                    fetchPromises.push(fetch(u, { headers: { 'Accept': 'application/json' } }).then(r => r.ok ? r.json() : []).catch(() => []));
                });
            }

            // 3. Query structured shops (Retail, Minimarket, Hardware, etc.)
            if (taxonomy.shops && taxonomy.shops.length > 0) {
                taxonomy.shops.forEach(shp => {
                    const u = `https://nominatim.openstreetmap.org/search?shop=${encodeURIComponent(shp)}&format=json&bounded=1&viewbox=${viewbox}&addressdetails=1&extratags=1&limit=20`;
                    fetchPromises.push(fetch(u, { headers: { 'Accept': 'application/json' } }).then(r => r.ok ? r.json() : []).catch(() => []));
                });
            }

            // 4. Query tourism / lodging
            if (taxonomy.tourism && taxonomy.tourism.length > 0) {
                taxonomy.tourism.forEach(tour => {
                    const u = `https://nominatim.openstreetmap.org/search?tourism=${encodeURIComponent(tour)}&format=json&bounded=1&viewbox=${viewbox}&addressdetails=1&extratags=1&limit=20`;
                    fetchPromises.push(fetch(u, { headers: { 'Accept': 'application/json' } }).then(r => r.ok ? r.json() : []).catch(() => []));
                });
            }

            // 5. Query targeted Indonesian keywords
            const kwList = (taxonomy.keywords && taxonomy.keywords.length > 0) ? taxonomy.keywords.slice(0, 4) : [q];
            kwList.forEach(kw => {
                const u = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(kw)}&format=json&bounded=1&viewbox=${viewbox}&addressdetails=1&extratags=1&limit=15`;
                fetchPromises.push(fetch(u, { headers: { 'Accept': 'application/json' } }).then(r => r.ok ? r.json() : []).catch(() => []));
            });

            const results = await Promise.allSettled(fetchPromises);
            results.forEach(res => {
                if (res.status === 'fulfilled' && Array.isArray(res.value)) {
                    res.value.forEach(item => {
                        const id = item.osm_id || `${item.lat},${item.lon}`;
                        if (!seenOsmIds.has(id)) {
                            seenOsmIds.add(id);
                            rawList.push(item);
                        }
                    });
                }
            });

            // 4. Fallback search with location context if bounded viewbox returned 0
            if (rawList.length === 0 && loc && loc !== 'Indonesia') {
                const primaryTerm = (taxonomy.keywords && taxonomy.keywords[0]) || q;
                const url2 = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(primaryTerm + ', ' + loc)}&format=json&addressdetails=1&extratags=1&limit=25`;
                const res2 = await fetch(url2, { headers: { 'Accept': 'application/json' } });
                if (res2.ok) {
                    const data2 = await res2.json();
                    if (Array.isArray(data2)) {
                        data2.forEach(it => {
                            const dLat = Math.abs(parseFloat(it.lat) - centerLat);
                            const dLng = Math.abs(parseFloat(it.lon) - centerLng);
                            if (dLat < 0.15 && dLng < 0.15) {
                                const id = it.osm_id || `${it.lat},${it.lon}`;
                                if (!seenOsmIds.has(id)) {
                                    seenOsmIds.add(id);
                                    rawList.push(it);
                                }
                            }
                        });
                    }
                }
            }

            // 3. Transform to clean, factual place items
            const places = [];
            const seen = new Set();

            if (Array.isArray(rawList)) {
                for (let i = 0; i < rawList.length; i++) {
                    const r = rawList[i];
                    let name = (r.name || '').trim();
                    if (!name) {
                        const parts = (r.display_name || '').split(',');
                        name = (parts[0] || '').trim();
                    }
                    if (!name) continue;

                    const lowerName = name.toLowerCase();
                    if (seen.has(lowerName)) continue;
                    seen.add(lowerName);

                    const lat = parseFloat(r.lat);
                    const lng = parseFloat(r.lon);

                    const addr = r.address || {};
                    const addrParts = [];
                    if (addr.road) addrParts.push(addr.road);
                    if (addr.village) addrParts.push('Kel. ' + addr.village);
                    else if (addr.suburb) addrParts.push('Kel. ' + addr.suburb);
                    if (addr.city_district) addrParts.push('Kec. ' + addr.city_district);
                    if (addr.city) addrParts.push(addr.city);
                    else if (addr.town) addrParts.push(addr.town);

                    const fullAddr = addrParts.length > 0 ? addrParts.join(', ') : (r.display_name || loc);
                    const categoryTitle = this.humanizeCategoryName(r.type || r.class || q, name);
                    const rawPhone = (r.extratags && (r.extratags.phone || r.extratags['contact:phone'])) || '';
                    const rawHours = (r.extratags && r.extratags.opening_hours) || '';
                    const rawWebsite = (r.extratags && (r.extratags.website || r.extratags['contact:website'])) || '';

                    const enriched = this.enrichPlaceContact({
                        name: name,
                        category: categoryTitle,
                        address: fullAddr,
                        phone: rawPhone,
                        website: rawWebsite,
                        opening_hours: rawHours
                    }, loc);

                    const phone = enriched.phone;
                    const hours = enriched.hours;
                    const website = enriched.website;

                    let rating = null;
                    let reviews = null;

                    const insights = this.generateTriChannelInsights(name, categoryTitle, rating, reviews, phone, lat, lng);

                    places.push({
                        id: places.length + 1,
                        osm_id: r.osm_id,
                        name: name,
                        category: categoryTitle,
                        address: fullAddr,
                        phone: phone,
                        lat: lat,
                        lng: lng,
                        social_media: website,
                        opening_hours: hours,
                        rating: rating,
                        reviews_count: reviews,
                        status: 'none',
                        source: 'osm',
                        source_name: 'OpenStreetMap',
                        source_type: 'Peta Spasial Nyata',
                        source_color: '#16a34a',
                        source_icon: 'fa-map-location-dot',
                        insights: insights
                    });
                }
            }

            // CRITICAL: If no real places exist, return empty array. DO NOT INVENT FAKE DATA.
            return {
                success: true,
                total: places.length,
                preview_places: places,
                items: places
            };
        } catch (err) {
            console.warn('Real map search network error:', err);
            return {
                success: true,
                total: 0,
                preview_places: [],
                items: []
            };
        }
    },

    generateStaticDeepScrapedLeads(payload) {
        // Use real candidate places that were detected; if none exist, return empty list!
        const items = (this.candidatePlaces && this.candidatePlaces.length > 0) 
            ? this.candidatePlaces 
            : [];

        if (items.length > 0) {
            try {
                const histKey = 'cliento_static_history';
                const existing = JSON.parse(localStorage.getItem(histKey) || '[]');
                existing.unshift({
                    id: Date.now(),
                    query_name: `${payload.category || 'Bisnis'} di ${payload.location || 'Wilayah'}`,
                    method: payload.method || 'boundary',
                    location_name: payload.location || 'Wilayah Terpilih',
                    target_category: payload.category || 'Bisnis',
                    total_found: items.length,
                    created_at: new Date().toLocaleString('id-ID'),
                    items: items
                });
                localStorage.setItem(histKey, JSON.stringify(existing.slice(0, 30)));
            } catch(e) {}
        }

        return {
            success: true,
            is_static_engine: true,
            total: items.length,
            items: items
        };
    },

    generateStaticPitch(payload) {
        const item = this.activeModalItem || {};
        const name = item.name || 'Bapak/Ibu Pimpinan';
        const category = item.category || 'Usaha Anda';
        const address = item.address || 'lokasi Anda';
        const rating = item.rating || 'belum tersedia';
        const tone = (payload && payload.tone) || 'Hangat, Sopan & Profesional';
        const selected = (payload && payload.selected_opportunities && payload.selected_opportunities.length > 0)
            ? payload.selected_opportunities
            : [];

        let pitch = '';
        let oppSection = '';
        if (selected.length === 1) {
            oppSection = `Berdasarkan audit data profil ${name}, kami melihat ${selected[0].reason ? selected[0].reason.toLowerCase() : 'peluang optimasi digital'}. Kami memiliki solusi terarah: ${selected[0].solution}.`;
        } else if (selected.length > 1) {
            const listStr = selected.map((o, idx) => `${idx + 1}. ${o.title}: ${o.reason}`).join('\n');
            oppSection = `Berdasarkan audit direktori bisnis kami, terdapat ${selected.length} celah peluang yang bisa ditingkatkan:\n\n${listStr}\n\nSeluruh poin di atas dapat kami integrasikan dalam satu solusi efisien.`;
        } else {
            oppSection = `Kami menemukan informasi publik bisnis ${name} di kawasan ${address}. Melalui sistem kami, kami ingin menawarkan solusi optimasi kunjungan klien terarah yang dapat diintegrasikan dengan operasional Anda.`;
        }

        if (tone.includes('Santai') || tone === 'casual') {
            pitch = `Halo kak dari tim cliento!\n\nSalam kenal dari tim cliento. Kami menemukan informasi publik ${name} di ${address}; rating dari sumber: ${rating}.\n\n${oppSection}\n\nKalau kakak ada waktu senggang 5 menit, boleh kami kirimkan ringkasan solusi lengkapnya via WhatsApp ini kak? Terima kasih.`;
        } else if (tone.includes('Konsultatif')) {
            pitch = `Selamat siang Bapak/Ibu Manajemen ${name},\n\nSalam profesional dari tim cliento Sales Intelligence. Kami melakukan analisis direktori bisnis di wilayah ${address}.\n\n${oppSection}\n\nApakah kami diperkenankan mengirimkan studi kasus singkat mengenai implementasi solusi ini untuk ${name}? Terima kasih.`;
        } else {
            pitch = `Yth. Pimpinan & Manajemen ${name},\n\nSalam hangat dari cliento. Berdasarkan kurasi data direktori bisnis kami di ${address}:\n\n${oppSection}\n\nBolehkah kami jadwalkan diskusi ringkas via chat mengenai detail proposal solusi ini? Terima kasih atas perhatian Bapak/Ibu.`;
        }

        return {
            success: true,
            is_static_engine: true,
            pitch: pitch,
            has_image: !!(payload && payload.image_base64)
        };
    },

    async loadPreScrapeCandidates() {
        if (this.googleMapsOnly) return this.showGoogleMapsReady();
        const countBadge = document.getElementById('preview-count-badge');
        const listContainer = document.getElementById('pre-scrape-places-list');

        try {
            const queryObj = {
                action: 'preview',
                method: this.currentQuery.zoneMode,
                category: this.currentQuery.category || 'cafe',
                location: this.currentQuery.location || 'Magelang Utara',
                lat: this.currentQuery.lat,
                lng: this.currentQuery.lng,
                radius: this.currentQuery.radius
            };

            // Pass bbox when in boundary mode
            if (this.currentQuery.zoneMode === 'boundary' && this.currentQuery.bbox) {
                queryObj.bbox = this.currentQuery.bbox.join(',');
            }

            let data = null;
            const isStaticHost = window.location.hostname.includes('github.io') || window.location.protocol === 'file:';

            if (!isStaticHost) {
                try {
                    const params = new URLSearchParams(queryObj);
                    const res = await fetch(`api/scraper.php?${params.toString()}`);
                    if (res.ok) {
                        data = await res.json();
                    } else if (res.status === 404) {
                        // Static host without PHP
                    } else {
                        try { data = await res.json(); } catch(e) {}
                    }
                } catch (netErr) {
                    console.warn('Candidate preview network error, using static generator...', netErr);
                }
            }

            // Fallback for static host / offline
            if (!data || !data.success || !data.preview_places) {
                data = await this.fetchRealMapPlaces(queryObj);
            }

            if (data && data.success && data.preview_places) {
                if (data.preview_places.length === 0) {
                    this.candidatePlaces = [];
                    if (countBadge) {
                        countBadge.textContent = '0 Calon Terdeteksi (Dalam Batas)';
                    }
                    if (listContainer) {
                        listContainer.innerHTML = `
                            <div style="padding: 28px 16px; text-align: center; color: #64748b;">
                                <i class="fa-solid fa-circle-exclamation" style="font-size: 1.6rem; color: #94a3b8; margin-bottom: 8px;"></i>
                                <div style="font-weight: 600; color: #0f172a; margin-bottom: 4px;">Tidak Ada Data Bisnis Nyata Ditemukan</div>
                                <div style="font-size: 0.72rem; line-height: 1.4; color: #64748b;">
                                    Tidak ditemukan tempat untuk kata kunci "<strong>${queryObj.category}</strong>" di wilayah <strong>${queryObj.location}</strong>.<br>
                                    Silakan coba kata kunci lain atau pilih cakupan wilayah yang lebih luas.
                                </div>
                            </div>
                        `;
                    }
                    if (window.mapEngine) {
                        window.mapEngine.showPreviewMarkers([]);
                    }
                    return;
                }

                // Strictly guarantee all places sit inside red boundary when in boundary mode
                if (this.currentQuery.zoneMode === 'boundary' && window.mapEngine) {
                    this.candidatePlaces = data.preview_places.map(p => {
                        const safe = window.mapEngine.ensurePointInsideBoundary(p.lat, p.lng);
                        p.lat = safe[0];
                        p.lng = safe[1];
                        return p;
                    });
                } else {
                    this.candidatePlaces = data.preview_places;
                }

                if (countBadge) {
                    countBadge.textContent = `${this.candidatePlaces.length} Calon Terdeteksi (Dalam Batas)`;
                }
                const limitHintBadge = document.getElementById('limit-hint-badge');
                if (limitHintBadge) {
                    const limitSelect = document.getElementById('scraper-batch-limit');
                    const curVal = limitSelect ? limitSelect.value : '25';
                    limitHintBadge.textContent = (curVal === 'all') ? `Semua (${this.candidatePlaces.length})` : `${curVal} Tempat`;
                }
                const limitSelect = document.getElementById('scraper-batch-limit');
                if (limitSelect) {
                    const allOpt = limitSelect.querySelector('option[value="all"]');
                    if (allOpt) {
                        allOpt.textContent = `Semua Calon Terdeteksi (${this.candidatePlaces.length} Tempat)`;
                    }
                }

                if (listContainer) {
                    listContainer.innerHTML = '';
                    this.candidatePlaces.forEach(p => {
                        const isOsm = (p.source === 'osm');
                        const sourcePill = `<span style="background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; padding: 1px 5px; border-radius: 4px; font-size: 0.62rem; font-weight: 600;"><i class="fa-solid fa-map-pin"></i> ${p.source_name || (isOsm ? 'OpenStreetMap' : 'Sumber terbuka')}</span>`;

                        const row = document.createElement('div');
                        row.style.cssText = 'padding: 8px 10px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; font-size: 0.76rem;';
                        row.innerHTML = `
                            <div>
                                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
                                    <strong style="color: #0f172a;">${p.name}</strong>
                                    ${sourcePill}
                                </div>
                                <div style="color: #64748b; font-size: 0.68rem;">${p.address}</div>
                            </div>
                            <div style="text-align: right; white-space: nowrap;">
                                <span class="badge badge-blue">${p.category}</span>
                                <span style="font-weight: 700; color: #64748b; margin-left: 4px;">${p.rating ? `<i class="fa-solid fa-star" style="color: #f59e0b;"></i> ${p.rating}` : 'Rating tidak tersedia'}</span>
                            </div>
                        `;
                        listContainer.appendChild(row);
                    });
                }

                if (window.mapEngine) {
                    window.mapEngine.showPreviewMarkers(this.candidatePlaces);
                }
            }
        } catch (e) {
            console.error('Candidate preview load failed:', e);
            if (countBadge) countBadge.textContent = 'Siap Ekstraksi';
        }
    },

    // ----------------------------------------------------
    // 6. DEEP SCRAPE ACTION & RESULTS TABLE
    // ----------------------------------------------------
    bindScrapingActions() {
        const btnRefreshDiag = document.getElementById('btn-refresh-diagnostics');
        if (btnRefreshDiag) {
            btnRefreshDiag.addEventListener('click', () => this.refreshEngineDiagnostics({ userTriggered: true }));
        }
        this.refreshEngineDiagnostics();

        this.initExtensionBridge();

        // Satu Tombol Utama Ekstraksi Prospek (Default: Otomatis Hybrid Maps + Sosmed WA)
        const btnMainExecute = document.getElementById('btn-main-execute-scrape');
        if (btnMainExecute) {
            btnMainExecute.addEventListener('click', () => {
                if (this.currentQuery.targetMode === 'url_batch') {
                    this.executeUrlBatchScrape();
                    return;
                }
                const engine = document.querySelector('input[name="scrape_engine"]:checked')?.value || 'hybrid';
                if (engine === 'hybrid') {
                    this.executeHybridScrape();
                } else if (engine === 'cloud') {
                    this.executeCloudWaterfallScrape();
                } else if (engine === 'local') {
                    this.executeLocalChromeScrape();
                } else if (engine === 'dorking') {
                    this.executeDorkingHunter();
                } else if (engine === 'extension') {
                    this.launchGoogleMapsAutoScrape();
                }
            });
        }

        // Pilihan Mesin Pengambilan (Disimpan rapi di Opsi Lanjutan)
        const engineTiles = [
            { id: 'tile-engine-hybrid', val: 'hybrid', label: 'Mulai Cari Leads (Maps + Sosmed WA)', border: '#2563eb', bg: '#eff6ff' },
            { id: 'tile-engine-cloud', val: 'cloud', label: 'Mulai Ekstraksi Cloud API Estafet', border: '#2563eb', bg: '#eff6ff' },
            { id: 'tile-engine-local', val: 'local', label: 'Jalankan Mesin Lokal Chrome Laptop', border: '#059669', bg: '#ecfdf5' },
            { id: 'tile-engine-dorking', val: 'dorking', label: 'Buru Nomor WA Sosmed Saja', border: '#7c3aed', bg: '#faf5ff' },
            { id: 'tile-engine-extension', val: 'extension', label: 'Buka Google Maps & Siapkan Ekstensi', border: '#0f172a', bg: '#f8fafc' }
        ];

        const updateEngineTileUI = (selectedVal) => {
            engineTiles.forEach(t => {
                const el = document.getElementById(t.id);
                if (!el) return;
                const radio = el.querySelector('input[type="radio"]');
                if (t.val === selectedVal) {
                    if (radio) radio.checked = true;
                    el.classList.add('active');
                    el.style.border = `1.5px solid ${t.border}`;
                    el.style.background = t.bg;
                    const lbl = document.getElementById('main-execute-btn-label');
                    if (lbl) lbl.textContent = t.label;
                } else {
                    if (radio) radio.checked = false;
                    el.classList.remove('active');
                    el.style.border = '1.5px solid #e2e8f0';
                    el.style.background = '#ffffff';
                }
            });

            const extBox = document.getElementById('extension-manual-box');
            if (extBox) {
                extBox.style.display = (selectedVal === 'extension') ? 'block' : 'none';
            }
        };

        engineTiles.forEach(t => {
            const el = document.getElementById(t.id);
            if (el) {
                el.addEventListener('click', () => updateEngineTileUI(t.val));
            }
        });

        const btnScrape = document.getElementById('btn-execute-scrape');
        if (btnScrape) {
            btnScrape.addEventListener('click', () => this.executeDeepScrape());
        }

        const btnGmapsAuto = document.getElementById('btn-scrape-gmaps-auto');
        if (btnGmapsAuto) {
            btnGmapsAuto.addEventListener('click', () => this.launchGoogleMapsAutoScrape());
        }

        const btnSapuGmaps = document.getElementById('btn-sapu-bersih-gmaps');
        if (btnSapuGmaps) {
            btnSapuGmaps.addEventListener('click', () => this.launchGoogleMapsCityWideScrape());
        }
        const btnCity = document.getElementById('btn-sapu-bersih');
        if (btnCity) {
            btnCity.addEventListener('click', () => this.launchGoogleMapsCityWideScrape());
        }

        const btnCloudScrape = document.getElementById('btn-cloud-waterfall-scrape');
        if (btnCloudScrape) {
            btnCloudScrape.addEventListener('click', () => this.executeCloudWaterfallScrape());
        }

        const btnLocalScrape = document.getElementById('btn-local-headless-scrape');
        if (btnLocalScrape) {
            btnLocalScrape.addEventListener('click', () => this.executeLocalChromeScrape());
        }

        const btnDorkingHunt = document.getElementById('btn-dorking-wa-hunt');
        if (btnDorkingHunt) {
            btnDorkingHunt.addEventListener('click', () => this.executeDorkingHunter());
        }

        const batchLimitSelect = document.getElementById('scraper-batch-limit');
        const customLimitInput = document.getElementById('scraper-custom-limit');
        if (batchLimitSelect) {
            batchLimitSelect.addEventListener('change', () => {
                if (customLimitInput) {
                    customLimitInput.style.display = (batchLimitSelect.value === 'custom') ? 'inline-block' : 'none';
                    if (batchLimitSelect.value === 'custom') customLimitInput.focus();
                }
                const hintBadge = document.getElementById('limit-hint-badge');
                if (hintBadge) {
                    hintBadge.textContent = `${this.getActiveBatchLimit()} Tempat`;
                }
            });
        }

        const btnConnectAgent = document.getElementById('btn-connect-local-agent');
        if (btnConnectAgent) {
            btnConnectAgent.addEventListener('click', async () => {
                btnConnectAgent.disabled = true;
                btnConnectAgent.textContent = '⏳ Menghubungkan...';
                try {
                    this.useAgentRelayOnly = false;
                    await this.refreshEngineDiagnostics({ userTriggered: true });
                    if (this.localAgentStatus?.active) {
                        if (this.showToast) this.showToast('✅ Agen PC Lokal terhubung! Chrome Lokal siap dijalankan.');
                    } else if (this.showToast) {
                        this.showToast('Agen PC belum merespons. Pastikan Chrome Allow jaringan lokal sudah diizinkan & Agen PC berjalan.');
                    }
                } finally {
                    btnConnectAgent.disabled = false;
                    btnConnectAgent.textContent = '🔌 Hubungkan Agen PC';
                }
            });
        }

        const btnExportExcel = document.getElementById('btn-export-excel');
        if (btnExportExcel) {
            btnExportExcel.addEventListener('click', () => this.exportScrapedToExcel());
        }

        const btnCopyGmapsLinks = document.getElementById('btn-copy-all-gmaps-links');
        if (btnCopyGmapsLinks) {
            btnCopyGmapsLinks.addEventListener('click', () => this.copyAllGoogleMapsLinks());
        }

        const sheetFileInput = document.getElementById('amapulse-sheet-file');
        if (sheetFileInput) {
            sheetFileInput.addEventListener('change', async () => {
                const f = sheetFileInput.files?.[0];
                if (!f) return;
                await this.handleAmapulseSheetUpload(f);
                sheetFileInput.value = '';
            });
        }

        const btnSaveArchive = document.getElementById('btn-save-to-archive-modal');
        if (btnSaveArchive) {
            btnSaveArchive.addEventListener('click', () => this.openSaveArchiveModal());
        }

        // History buttons (both on search panel and on results table header)
        document.querySelectorAll('#btn-show-history, #btn-show-history-results, .btn-show-history-trigger').forEach(btn => {
            btn.addEventListener('click', () => this.openHistoryModal());
        });

        const btnBackToSearch = document.getElementById('btn-back-to-search');
        if (btnBackToSearch) {
            btnBackToSearch.addEventListener('click', () => {
                document.getElementById('scraped-results-view').style.display = 'none';
                document.getElementById('scraper-setup-view').style.display = 'block';
                if (window.mapEngine && window.mapEngine.map) {
                    setTimeout(() => {
                        window.mapEngine.map.invalidateSize();
                        if (this.candidatePlaces && this.candidatePlaces.length > 0) {
                            window.mapEngine.showPreviewMarkers(this.candidatePlaces);
                        }
                    }, 50);
                }
            });
        }
    },

    async executeDeepScrape() {
        this.launchGoogleMapsAutoScrape();
    },

    showGoogleMapsReady() {
        this.candidatePlaces = [];
        this.territoryData = null;
        const badge = document.getElementById('preview-count-badge');
        if (badge) badge.textContent = 'Sumber: Google Maps';
        const list = document.getElementById('pre-scrape-places-list');
        if (list) list.textContent = 'Klik Buka Google Maps, jalankan ekstensi, lalu impor JSON hasil scraping di bawah. Data bisnis diambil dari Google Maps.';
    },

    googleMapsSearchQuery(cityWide = false) {
        const cleanLabel = text => String(text || '').replace(/\s*\[.*?\]\s*/g, '').replace(/\s*\(\d+\)\s*$/, '').trim();
        let category = cleanLabel((this.currentQuery.category || 'bisnis').replace(/_/g, ' '));
        const kwEl = document.getElementById('target-keyword-input');
        const kwVal = (kwEl && typeof kwEl.value === 'string') ? kwEl.value.trim() : '';
        const categorySelect = document.getElementById('target-category-select');
        const sectorSelect = document.getElementById('target-sector-select');

        if (kwVal) {
            category = cleanLabel(kwVal);
        } else if (this.currentQuery.targetMode === 'preset' && categorySelect?.selectedOptions?.[0]) {
            category = cleanLabel(categorySelect.selectedOptions[0].textContent);
            if (/^semua jenis bisnis/i.test(category) && sectorSelect?.selectedOptions?.[0]) {
                const secLabel = cleanLabel(sectorSelect.selectedOptions[0].textContent);
                if (!/^semua bidang/i.test(secLabel)) category = secLabel;
            }
        }
        if (['all', 'semua', 'semua_bidang', 'all_categories'].includes(this.currentQuery.category) && !kwVal && (!category || /^semua (bidang usaha|jenis bisnis)/i.test(category))) {
            category = 'bisnis';
        } else if (/^semua (bidang usaha|jenis bisnis)/i.test(category)) {
            category = 'bisnis';
        } else {
            category = category.replace(/^semua\s+/i, '');
        }
        let location = cleanLabel(this.currentQuery.location || 'Indonesia') || 'Indonesia';
        if (cityWide) {
            const names = ['filter-kabupaten', 'filter-provinsi'].map(id => {
                const select = document.getElementById(id);
                return cleanLabel(select?.selectedOptions?.[0]?.textContent || '');
            }).filter(name => name && !name.startsWith('--'));
            if (names.length) location = names.join(', ');
        } else if (this.currentQuery.zoneMode === 'radius') {
            location += ' dekat ' + this.currentQuery.lat + ', ' + this.currentQuery.lng;
        }
        return category + ' di ' + location;
    },

    launchGoogleMapsAutoScrape(cityWide = false) {
        const url = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(this.googleMapsSearchQuery(cityWide));
        window.open(url, '_blank', 'noopener');
        this.showToast('Klik Mulai scraping di ekstensi Chrome, unduh JSON, lalu impor hasilnya ke sistem.');
    },

    launchGoogleMapsCityWideScrape() {
        this.launchGoogleMapsAutoScrape(true);
    },

    setEngineStatus(title, msg, badgeText = 'Running', badgeClass = 'badge-blue', showBar = false, pct = 0) {
        const box = document.getElementById('engine-live-status-box');
        const titleEl = document.getElementById('engine-status-title');
        const msgEl = document.getElementById('engine-status-msg');
        const badgeEl = document.getElementById('engine-status-badge');
        const barWrap = document.getElementById('engine-progress-bar-wrap');
        const bar = document.getElementById('engine-progress-bar');

        if (!box) return;
        box.style.display = 'block';
        if (titleEl) titleEl.textContent = title;
        if (msgEl) msgEl.innerHTML = msg;
        if (badgeEl) {
            badgeEl.textContent = badgeText;
            badgeEl.className = 'badge ' + badgeClass;
        }
        if (barWrap && bar) {
            barWrap.style.display = showBar ? 'block' : 'none';
            bar.style.width = Math.min(100, Math.max(0, pct)) + '%';
        }
    },

    isStaticHost() {
        if (typeof window === 'undefined' || !window.location) return false;
        const host = window.location.hostname || '';
        const proto = window.location.protocol || '';
        return host.includes('github.io') || proto === 'file:';
    },

    async safeFetchJson(url, options = {}) {
        const agentPrefix = 'http://127.0.0.1:43210';
        if (typeof url === 'string' && url.startsWith(agentPrefix)) {
            const agentPath = url.slice(agentPrefix.length) || '/status';
            let parsedBody = null;
            if (options.body) {
                try { parsedBody = typeof options.body === 'string' ? JSON.parse(options.body) : options.body; }
                catch (_) { parsedBody = options.body; }
            }
            const res = await this.callLocalAgent(agentPath, {
                method: options.method || 'GET',
                body: parsedBody,
                timeoutMs: 18000
            });
            if (!res || !res.data) {
                throw new Error(res?.error || 'Agen PC Lokal tidak merespons di 127.0.0.1:43210.');
            }
            return res.data;
        }
        const resp = await fetch(url, options);
        const text = await resp.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (err) {
            if (text.trim().startsWith('<') || !resp.ok) {
                throw new Error(`Server tidak mengembalikan JSON (HTTP ${resp.status}). Jika menguji di localhost, pastikan Apache & PHP berjalan di XAMPP.`);
            }
            throw new Error(`Format data tidak valid: ${err.message}`);
        }
        return data;
    },

    getActiveCategoryAndLocation() {
        const kwVal = document.getElementById('target-keyword-input')?.value?.trim() || '';
        const catSelect = document.getElementById('target-category-select');
        const secSelect = document.getElementById('target-sector-select');

        let category = this.currentQuery.category || 'bisnis';
        if (kwVal) {
            category = kwVal;
        } else if (catSelect && catSelect.value && catSelect.value !== 'all' && catSelect.selectedIndex >= 0) {
            category = catSelect.options[catSelect.selectedIndex].text.replace(/\s*\(.*?\)\s*/g, '').replace(/^semua\s+/i, '').trim();
        } else if (secSelect && secSelect.value && secSelect.value !== 'semua_bidang' && secSelect.selectedIndex >= 0) {
            category = secSelect.options[secSelect.selectedIndex].text.replace(/\s*\(.*?\)\s*/g, '').trim();
        }

        const location = (this.currentQuery.location || 'Indonesia').replace(/\s*\[.*?\]\s*/g, '').trim() || 'Indonesia';
        return { category, location, kwVal };
    },

    updateTargetSummaryDisplay() {
        const summaryEl = document.getElementById('summary-active-target');
        if (!summaryEl) return;

        // 1. Kategori / Kata Kunci
        const kw = document.getElementById('target-keyword-input')?.value?.trim() || '';
        let catText = 'Semua Bidang Usaha';
        if (kw) {
            catText = `Kata Kunci: "${kw}"`;
        } else {
            const catSelect = document.getElementById('target-category-select');
            const secSelect = document.getElementById('target-sector-select');
            if (catSelect && catSelect.value && catSelect.value !== 'all' && catSelect.selectedIndex >= 0) {
                catText = catSelect.options[catSelect.selectedIndex].text.replace(/\s*\(.*?\)\s*/g, '').trim();
            } else if (secSelect && secSelect.value && secSelect.value !== 'semua_bidang' && secSelect.selectedIndex >= 0) {
                catText = secSelect.options[secSelect.selectedIndex].text.replace(/\s*\(.*?\)\s*/g, '').trim();
            }
        }

        // 2. Wilayah / Lokasi
        let locText = 'Indonesia';
        if (this.currentQuery.zoneMode === 'radius') {
            const r = this.currentQuery.radius || 3;
            locText = `Radius ${r} KM dari Titik Pin Peta`;
        } else {
            const provSelect = document.getElementById('filter-provinsi');
            const kabSelect = document.getElementById('filter-kabupaten');
            const kecSelect = document.getElementById('filter-kecamatan');
            const kelSelect = document.getElementById('filter-kelurahan');

            const prov = provSelect?.options[provSelect.selectedIndex]?.text?.replace(/\s*\[.*?\]\s*/g, '')?.trim();
            const kab = kabSelect?.options[kabSelect.selectedIndex]?.text?.replace(/\s*\[.*?\]\s*/g, '')?.trim();
            const kec = kecSelect?.options[kecSelect.selectedIndex]?.text?.replace(/\s*\[.*?\]\s*/g, '')?.trim();
            const kel = kelSelect?.options[kelSelect.selectedIndex]?.text?.replace(/\s*\[.*?\]\s*/g, '')?.trim();

            const parts = [kel, kec, kab, prov].filter(x => x && !x.startsWith('--'));
            locText = parts.length > 0 ? parts.join(', ') : (this.currentQuery.location || 'Seluruh Wilayah');
        }

        summaryEl.textContent = `${catText} di ${locText}`;
    },

    normalizeMapsPlaces(places = [], fallbackLocation = 'Indonesia', providerLabel = 'Google Maps', fallbackSource = 'cloud_api') {
        return (places || []).map((p, idx) => ({
            id: idx + 1,
            name: p.name,
            category: p.category || 'Bisnis',
            address: p.address || fallbackLocation,
            phone: p.phone || '-',
            whatsapp: p.whatsapp || '',
            lat: p.lat || null,
            lng: p.lng || null,
            social_media: p.website || p.social_media || '-',
            website: p.website || '',
            opening_hours: p.opening_hours || '-',
            rating: p.rating || 0,
            reviews_count: p.reviews_count || 0,
            status: 'none',
            source: p.source || fallbackSource,
            source_type: 'google_maps',
            source_name: p.source_name || providerLabel,
            insights: {
                provenance: { source_name: p.source_name || providerLabel, source_url: p.google_maps_url || '' },
                metrics: { rating_available: Number(p.rating) > 0, reviews_count_available: Number(p.reviews_count) > 0 }
            }
        }));
    },

    normalizeDorkingLeads(leads = [], category = 'Bisnis', location = 'Indonesia') {
        return (leads || []).map((l, idx) => ({
            id: idx + 1,
            name: l.name,
            category: l.category || category || 'Sosmed Business',
            address: l.address || location,
            phone: l.phone || '-',
            whatsapp: l.whatsapp || '',
            lat: null,
            lng: null,
            social_media: l.evidence_url || l.website || '-',
            website: l.evidence_url || l.website || '',
            opening_hours: l.opening_hours || 'Online',
            rating: 0,
            reviews_count: 0,
            status: 'none',
            source: l.source || 'duckduckgo_dorking',
            source_type: 'google_dorking',
            source_name: l.source_name || 'Sosmed Dorking',
            notes: l.snippet || '',
            insights: {
                provenance: { source_name: l.source_name || 'Sosmed Dorking', source_url: l.evidence_url || l.website || '' },
                metrics: { rating_available: false, reviews_count_available: false },
                contact: { whatsapp_listed: Boolean(l.whatsapp), phone_listed: Boolean(l.phone), whatsapp: l.whatsapp || '' }
            }
        }));
    },

    mergeHybridLeads(mapsList = [], dorkingList = []) {
        const merged = [];
        const seenMaps = new Set();
        const seenDork = new Set();

        const makeKey = item => {
            const cleanName = String(item.name || '').toLowerCase().trim();
            const cleanPhone = String(item.phone || '').replace(/[^\d]/g, '');
            return `${cleanName}|${cleanPhone}`;
        };

        (mapsList || []).forEach(item => {
            const key = makeKey(item);
            if (!seenMaps.has(key)) {
                seenMaps.add(key);
                merged.push({ ...item, source_type: 'google_maps' });
            }
        });

        (dorkingList || []).forEach(item => {
            const key = makeKey(item);
            if (!seenDork.has(key)) {
                seenDork.add(key);
                merged.push({ ...item, source_type: 'google_dorking' });
            }
        });

        return merged.map((item, idx) => ({ ...item, id: idx + 1 }));
    },

    showScrapedResultsPage(results, category, location) {
        this.scrapedResults = results || [];
        this.currentQuery.category = category;
        this.currentQuery.location = location;
        this.activeFilter = 'all';
        this.renderScrapedResultsTable();

        const setupView = document.getElementById('scraper-setup-view');
        const resultsView = document.getElementById('scraped-results-view');
        if (setupView) setupView.style.display = 'none';
        if (resultsView) resultsView.style.display = 'block';
    },

    buildStaticHostDiagnostics() {
        return {
            cloud_api: { status: 'off', active: false, message: 'Mati — GitHub Pages (statis) tidak bisa menjalankan PHP Cloud API' },
            google_places: { status: 'off', active: false, message: 'Mati — GitHub Pages tidak mendukung Google Places PHP backend' },
            local_chrome: { status: 'off', active: false, message: 'Mati — Mesin Lokal Chrome CDP hanya jalan via http://localhost/' },
            failover_merge: { status: 'off', active: false, message: 'Mati — Memerlukan Chrome Lokal + Cloud API server' },
            dorking: { status: 'off', active: false, message: 'Mati — DuckDuckGo cURL memerlukan PHP server' },
            extension: { status: 'active', active: true, message: 'Aktif — Ekstensi Chrome mengambil data 100% asli dari Google Maps' }
        };
    },

    renderEngineDiagnosticsStrip(engines = {}) {
        const container = document.getElementById('engine-diagnostics-badges');
        if (!container) return;

        const items = [
            { key: 'cloud_api', label: 'Cloud API', data: engines.cloud_api },
            { key: 'google_places', label: 'Google Places', data: engines.google_places },
            { key: 'local_chrome', label: 'Chrome Lokal 45s', data: engines.local_chrome },
            { key: 'dorking', label: 'Sosmed DDG', data: engines.dorking }
        ];

        container.innerHTML = items.map(item => {
            const st = item.data?.status || 'off';
            const isActive = st === 'active';
            const isWarn = st === 'standby' || st === 'partial';
            const bg = isActive ? '#dcfce7' : (isWarn ? '#fef3c7' : '#fee2e2');
            const fg = isActive ? '#166534' : (isWarn ? '#92400e' : '#991b1b');
            const bd = isActive ? '#86efac' : (isWarn ? '#fcd34d' : '#fca5a5');
            const tag = isActive ? 'AKTIF' : (isWarn ? 'SIAGA' : 'MATI');
            const tip = this.escapeText(item.data?.message || '');
            return `<span title="${tip}" style="display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:999px;background:${bg};color:${fg};border:1px solid ${bd};font-weight:600;cursor:help;">` +
                   `<span style="width:6px;height:6px;border-radius:50%;background:${fg};display:inline-block;"></span>` +
                   `${this.escapeText(item.label)}: ${tag}</span>`;
        }).join('');
    },

    renderTelemetryMatrix(rows = []) {
        const matrixEl = document.getElementById('engine-telemetry-matrix');
        if (!matrixEl) return;

        matrixEl.innerHTML = (rows || []).map(r => {
            const styles = {
                active: { bg: '#f0fdf4', bd: '#bbf7d0', badgeBg: '#16a34a', badgeText: '#ffffff', label: r.stateLabel || 'AKTIF' },
                running: { bg: '#eff6ff', bd: '#bfdbfe', badgeBg: '#2563eb', badgeText: '#ffffff', label: r.stateLabel || 'PROSES' },
                warn: { bg: '#fffbeb', bd: '#fde68a', badgeBg: '#d97706', badgeText: '#ffffff', label: r.stateLabel || 'SIAGA' },
                off: { bg: '#fef2f2', bd: '#fecaca', badgeBg: '#dc2626', badgeText: '#ffffff', label: r.stateLabel || 'MATI' }
            };
            const s = styles[r.tone] || styles.off;
            return `<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:6px 8px;background:${s.bg};border:1px solid ${s.bd};border-radius:6px;font-size:0.67rem;line-height:1.35;">` +
                   `<div style="color:#1e293b;"><strong>${this.escapeText(r.name)}</strong><div style="color:#475569;">${this.escapeText(r.detail || '')}</div></div>` +
                   `<span style="flex-shrink:0;padding:2px 6px;border-radius:4px;font-size:0.60rem;font-weight:700;background:${s.badgeBg};color:${s.badgeText};">${this.escapeText(s.label)}</span>` +
                   `</div>`;
        }).join('');
    },

    getActiveBatchLimit() {
        const sel = document.getElementById('scraper-batch-limit');
        const custom = document.getElementById('scraper-custom-limit');
        if (!sel) return 25;
        if (sel.value === 'custom') {
            return Math.max(1, Math.min(50000, parseInt(custom?.value || '1000', 10) || 1000));
        }
        if (sel.value === 'all') return 1000;
        return Math.max(1, Math.min(50000, parseInt(sel.value || '25', 10) || 25));
    },

    getActiveSublocations() {
        if (typeof REGIONS_DATA === 'undefined') return [];
        const provId = document.getElementById('filter-provinsi')?.value || '';
        const kabId = document.getElementById('filter-kabupaten')?.value || '';
        const kecId = document.getElementById('filter-kecamatan')?.value || '';
        const list = [];
        if (kecId && REGIONS_DATA.villages?.[kecId]) {
            const kecText = document.getElementById('filter-kecamatan')?.selectedOptions?.[0]?.textContent || '';
            const kabText = document.getElementById('filter-kabupaten')?.selectedOptions?.[0]?.textContent?.replace(/\s*\[.*?\]/g, '').trim() || '';
            REGIONS_DATA.villages[kecId].forEach(v => list.push(`${v.name}, ${kecText}, ${kabText}`));
        } else if (kabId && REGIONS_DATA.districts?.[kabId]) {
            const kabText = document.getElementById('filter-kabupaten')?.selectedOptions?.[0]?.textContent?.replace(/\s*\[.*?\]/g, '').trim() || '';
            REGIONS_DATA.districts[kabId].forEach(d => list.push(`${d.name}, ${kabText}`));
        } else if (provId && REGIONS_DATA.regencies?.[provId]) {
            const provText = document.getElementById('filter-provinsi')?.selectedOptions?.[0]?.textContent || '';
            REGIONS_DATA.regencies[provId].forEach(k => list.push(`${k.name}, ${provText}`));
        }
        return list.slice(0, 60);
    },

    localAgentRelay(reqPath, { method = 'GET', body = null, timeoutMs = 6000 } = {}) {
        if (typeof window === 'undefined' || typeof window.postMessage !== 'function' || !window.location?.origin || window.location.origin === 'null') {
            return Promise.resolve({ ok: false, status: 0, error: 'Window messaging unavailable' });
        }
        if (!this._pendingAgentRequests) this._pendingAgentRequests = new Map();
        const reqId = 'agent_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this._pendingAgentRequests.delete(reqId);
                resolve({ ok: false, status: 0, error: 'Extension relay timeout' });
            }, timeoutMs + 500);
            this._pendingAgentRequests.set(reqId, (resp) => {
                clearTimeout(timer);
                const base = resp || { ok: false, status: 0, error: 'Empty extension response' };
                resolve({ ...base, via: base.via || 'extension_relay' });
            });
            window.postMessage({
                type: 'CLIENTO_AGENT_FETCH',
                reqId,
                path: reqPath,
                method,
                body,
                timeoutMs
            }, window.location.origin);
        });
    },

    async callLocalAgent(reqPath, { method = 'GET', body = null, timeoutMs = 3000, userTriggered = false } = {}) {
        const cleanPath = reqPath.startsWith('/') ? reqPath : ('/' + reqPath);

        if (this.useAgentRelayOnly && this.extensionBridgeReady && !userTriggered) {
            return this.localAgentRelay(cleanPath, { method, body, timeoutMs });
        }

        if (typeof fetch === 'function') {
            try {
                const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
                const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
                const opts = { method, mode: 'cors' };
                if (controller) opts.signal = controller.signal;
                if (method !== 'GET' && body !== null) {
                    opts.headers = { 'Content-Type': 'application/json' };
                    opts.body = typeof body === 'string' ? body : JSON.stringify(body);
                }
                const res = await fetch('http://127.0.0.1:43210' + cleanPath, opts);
                if (timer) clearTimeout(timer);
                const data = await res.json();
                return { ok: res.ok, status: res.status, via: 'direct', data };
            } catch (err) {
                if (this.extensionBridgeReady) {
                    const relayRes = await this.localAgentRelay(cleanPath, { method, body, timeoutMs: Math.max(timeoutMs, 6000) });
                    if (relayRes && relayRes.ok) {
                        this.useAgentRelayOnly = true;
                        return { ...relayRes, via: 'extension_relay' };
                    }
                    return relayRes;
                }
                return { ok: false, status: 0, error: err?.message || 'Loopback blocked' };
            }
        }
        return { ok: false, status: 0, error: 'Fetch unavailable' };
    },

    async detectLocalBridgeAgent(options = {}) {
        try {
            const pathUrl = options.userTriggered ? '/status?fresh=1' : '/status';
            const res = await this.callLocalAgent(pathUrl, {
                method: 'GET',
                timeoutMs: 2500,
                userTriggered: Boolean(options.userTriggered)
            });
            if (res && res.ok && res.data && res.data.active) {
                return { ...res.data, relay_via: res.via || 'direct' };
            }
        } catch (_) {}
        return null;
    },

    async startLocalScrapeSession({ urlBatch = null, query = '', limit = 25, headless = true } = {}) {
        const viaAgent = !!(this.localAgentStatus && this.localAgentStatus.active);
        const sublocations = (!urlBatch && limit > 80) ? this.getActiveSublocations() : [];
        if (viaAgent) {
            const agentPath = urlBatch ? '/scrape-urls' : '/scrape';
            const bodyPayload = urlBatch ? { urls: urlBatch, headless } : { query, limit, headless, sublocations };
            const res = await this.callLocalAgent(agentPath, {
                method: 'POST',
                body: bodyPayload,
                timeoutMs: 10000
            });
            const data = res.data || { success: false, message: res.error || 'Gagal menghubungi Agen PC' };
            return { ...data, progressUrl: 'http://127.0.0.1:43210/progress' };
        }
        const action = urlBatch ? 'api/scraper.php?action=run_url_batch_scrape' : 'api/scraper.php?action=run_local_scrape';
        const bodyPayload = urlBatch ? { urls: urlBatch, headless } : { query, limit, headless, sublocations };
        const data = await this.safeFetchJson(action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyPayload)
        });
        return { ...data, progressUrl: 'api/scraper.php?action=local_scrape_status' };
    },

    async refreshEngineDiagnostics(options = {}) {
        const container = document.getElementById('engine-diagnostics-badges');
        const agentBanner = document.getElementById('local-agent-download-banner');
        const bannerTextEl = document.getElementById('local-agent-banner-text');
        const applyAgent = (engines) => {
            engines.dorking_server = engines.dorking ? { ...engines.dorking } : { status: 'off', active: false };
            if (this.localAgentStatus && this.localAgentStatus.active) {
                engines.local_chrome = {
                    status: 'active',
                    active: true,
                    via: this.localAgentStatus.relay_via === 'extension_relay' ? 'pc_agent_ext' : 'pc_agent',
                    message: 'Aktif — Agen PC Lokal terhubung (127.0.0.1:43210 · Chrome + Auto-Save + CAPTCHA 45s)'
                };
                if (this.localAgentStatus.dork_ready) {
                    engines.dorking = {
                        status: 'active',
                        active: true,
                        via: 'pc_agent',
                        engine: this.localAgentStatus.dork_engine || 'DuckDuckGo (Agen PC Lokal)',
                        message: this.localAgentStatus.dork_message || 'Aktif — Sosmed WA Dorking siap via IP Laptop Anda (Bebas blokir IP hosting!)'
                    };
                }
                if (engines.cloud_api?.active || engines.google_places?.active) {
                    engines.failover_merge = { status: 'active', active: true, message: 'Siap — Failover 45s & Penggabung Paralel aktif penuh' };
                } else {
                    engines.failover_merge = { status: 'standby', active: false, message: 'Aktif Lokal — Auto-save Agen PC & Sosmed WA paralel siap' };
                }
            }
            if (agentBanner) {
                agentBanner.style.display = engines.local_chrome?.active ? 'none' : 'flex';
                if (!engines.local_chrome?.active && bannerTextEl && typeof window !== 'undefined' && window.location?.protocol === 'https:' && !this.extensionBridgeReady) {
                    bannerTextEl.innerHTML = '💡 Agen PC belum terhubung. Klik <strong>Hubungkan Agen PC</strong> &amp; pilih <em>Allow / Izinkan</em> jaringan lokal Chrome (atau muat Ekstensi v1.6.1):';
                }
            }
            return engines;
        };

        if (this.isStaticHost()) {
            this.localAgentStatus = await this.detectLocalBridgeAgent(options);
            const diag = applyAgent(this.buildStaticHostDiagnostics());
            this.lastDiagnostics = diag;
            this.renderEngineDiagnosticsStrip(diag);
            return diag;
        }
        if (container) {
            container.innerHTML = '<span style="color:#64748b;">Mengecek status real-time server &amp; PC lokal...</span>';
        }
        try {
            const [res, pcAgent] = await Promise.all([
                this.safeFetchJson('api/scraper.php?action=engine_diagnostics'),
                this.detectLocalBridgeAgent(options)
            ]);
            this.localAgentStatus = pcAgent;
            if (res && res.success && res.engines) {
                const engines = applyAgent(res.engines);
                this.lastDiagnostics = engines;
                this.renderEngineDiagnosticsStrip(engines);
                return engines;
            }
        } catch (err) {
            const offlineDiag = applyAgent({
                cloud_api: { status: 'off', active: false, message: 'Server PHP belum merespons (' + err.message + ')' },
                google_places: { status: 'off', active: false, message: 'Server PHP belum merespons' },
                local_chrome: { status: 'off', active: false, message: 'Server PHP / Node lokal belum merespons' },
                failover_merge: { status: 'off', active: false, message: 'Server PHP belum merespons' },
                dorking: { status: 'off', active: false, message: 'Server PHP belum merespons' }
            });
            this.lastDiagnostics = offlineDiag;
            this.renderEngineDiagnosticsStrip(offlineDiag);
            return offlineDiag;
        }
        return null;
    },

    showStaticHostRealNotice(engineLabel = 'Mesin Otomatis') {
        const diag = this.buildStaticHostDiagnostics();
        this.lastDiagnostics = diag;
        this.renderEngineDiagnosticsStrip(diag);

        this.setEngineStatus(
            `${engineLabel} Tidak Aktif di GitHub Pages`,
            'Untuk mencegah munculnya nomor telepon palsu/buatan, fitur ini sengaja dihentikan di hosting statis. Pada URL <strong>github.io</strong> tidak ada PHP &amp; Node.js. Gunakan <strong>XAMPP Localhost</strong> atau tombol <strong>Buka Google Maps Asli (Ekstensi Chrome)</strong> di bawah:',
            'Butuh Server / Ekstensi',
            'badge-red',
            false
        );

        this.renderTelemetryMatrix([
            { name: '☁️ Cloud API (Apify / Outscraper / SerpApi)', stateLabel: 'MATI', tone: 'off', detail: 'Hosting statis GitHub Pages tidak menjalankan PHP backend (api/cloud_scraper.php).' },
            { name: '📍 Google Places API', stateLabel: 'MATI', tone: 'off', detail: 'Memerlukan PHP server & GOOGLE_MAPS_API_KEY di config.local.php.' },
            { name: '💻 Mesin Lokal Chrome (CDP + Auto-Save + CAPTCHA 45s)', stateLabel: 'MATI', tone: 'off', detail: 'Buka aplikasi melalui http://localhost/Client_Reach_ai/ (XAMPP) agar Node.js & Chrome lokal dapat berjalan.' },
            { name: '🔄 Failover 45s ➔ Estafet Cloud API', stateLabel: 'MATI', tone: 'off', detail: 'Bergantung pada Mesin Lokal + Cloud API.' },
            { name: '🎯 Sosmed Dorking (DuckDuckGo IG/FB/TikTok/Web)', stateLabel: 'MATI', tone: 'off', detail: 'DuckDuckGo cURL memerlukan PHP backend di XAMPP atau hosting PHP.' },
            { name: '🌐 Ekstensi Chrome (Google Maps Asli)', stateLabel: 'AKTIF', tone: 'active', detail: 'Siap dipakai di sini untuk mengambil nomor asli langsung dari Google Maps!' }
        ]);

        const msgEl = document.getElementById('engine-status-msg');
        if (msgEl) {
            const btnWrap = document.createElement('div');
            btnWrap.style.cssText = 'margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;';
            btnWrap.innerHTML = `
              <button type="button" id="btn-fallback-open-ext" class="btn btn-primary btn-sm" style="font-size:0.72rem;padding:6px 10px;">🌐 Buka Google Maps Asli (Pakai Ekstensi Chrome)</button>
              <button type="button" id="btn-fallback-pull-ext" class="btn btn-outline btn-sm" style="font-size:0.72rem;padding:6px 10px;">📥 Tarik / Impor Hasil Ekstensi</button>
            `;
            msgEl.appendChild(btnWrap);
            const btn = document.getElementById('btn-fallback-open-ext');
            if (btn) btn.addEventListener('click', () => {
                document.getElementById('advanced-engine-details')?.setAttribute('open', 'true');
                const extBox = document.getElementById('extension-manual-box');
                if (extBox) extBox.style.display = 'block';
                this.launchGoogleMapsAutoScrape();
            });
            const btnPull = document.getElementById('btn-fallback-pull-ext');
            if (btnPull) btnPull.addEventListener('click', () => {
                document.getElementById('advanced-engine-details')?.setAttribute('open', 'true');
                const extBox = document.getElementById('extension-manual-box');
                if (extBox) extBox.style.display = 'block';
                if (typeof window.postMessage === 'function') {
                    window.postMessage({ type: 'CLIENTO_REQUEST_LATEST_CAPTURE' }, window.location.origin);
                }
                document.getElementById('extension-manual-box')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
        }
    },

    initExtensionBridge() {
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
        const btnPull = document.getElementById('btn-pull-extension-latest');
        if (btnPull) {
            btnPull.addEventListener('click', () => {
                if (typeof window.postMessage === 'function') {
                    window.postMessage({ type: 'CLIENTO_REQUEST_LATEST_CAPTURE' }, window.location.origin);
                }
            });
        }

        if (this._extBridgeBound) return;
        this._extBridgeBound = true;

        window.addEventListener('message', async (event) => {
            if (event.source !== window) return;
            const msg = event.data;
            if (!msg || msg.source !== 'cliento_ext_bridge') return;

            if (msg.type === 'CLIENTO_EXTENSION_READY') {
                this.extensionBridgeReady = true;
                const stEl = document.getElementById('extension-bridge-status');
                if (stEl) {
                    stEl.style.background = '#ecfdf5';
                    stEl.style.borderColor = '#a7f3d0';
                    stEl.style.color = '#065f46';
                    stEl.innerHTML = `✅ <strong>Ekstensi Chrome v${this.escapeText(msg.version || '1.6.1')} Aktif!</strong> Penghubung Agen PC &amp; Google Maps siap otomatis.`;
                }
                if (msg.canRelayAgent && !(this.localAgentStatus && this.localAgentStatus.active)) {
                    this.refreshEngineDiagnostics().catch(() => {});
                }
            } else if (msg.type === 'CLIENTO_AGENT_FETCH_RESULT' && msg.reqId && this._pendingAgentRequests) {
                const resolver = this._pendingAgentRequests.get(msg.reqId);
                if (resolver) {
                    this._pendingAgentRequests.delete(msg.reqId);
                    resolver(msg.response);
                }
            } else if (msg.type === 'CLIENTO_EXTENSION_CAPTURE' && msg.payload) {
                const sentKey = msg.payload.sent_at || JSON.stringify(msg.payload.records?.slice(0, 2));
                if (sentKey && this._lastImportedExtKey === sentKey) return;
                this._lastImportedExtKey = sentKey;
                try {
                    await this.importExtensionPayload(msg.payload, { autoImported: true });
                } catch (err) {
                    if (this.showToast) this.showToast(err.message);
                }
            }
        });

        try {
            if (typeof window.postMessage === 'function' && window.location?.origin && window.location.origin !== 'null') {
                window.postMessage({ type: 'CLIENTO_PING_EXTENSION' }, window.location.origin);
            }
        } catch (_) {}
    },

    async executeUrlBatchScrape() {
        const urlInput = document.getElementById('gmaps-url-batch-input');
        const urls = this.parseGoogleMapsUrls(urlInput?.value || '');
        if (!urls.length) {
            this.setEngineStatus(
                'Link Google Maps Belum Diisi',
                'Tempel minimal 1 tautan Google Maps yang valid (misal <code>https://www.google.com/maps/place/...</code> atau <code>https://maps.app.goo.gl/...</code>) pada kotak di Langkah 1.',
                'Periksa Link',
                'badge-amber',
                false
            );
            if (urlInput) urlInput.focus();
            return;
        }

        if (this.isStaticHost() && !(this.localAgentStatus && this.localAgentStatus.active)) {
            this.setEngineStatus(
                'Batch Link (Ala Amapulse) Butuh Agen PC Lokal atau XAMPP',
                `Terdeteksi <strong>${urls.length} link Google Maps</strong>. Jalankan <strong>Agen PC Lokal</strong> di laptop Anda agar batch link berjalan langsung dari halaman ini.`,
                'Butuh Agen PC',
                'badge-red',
                false
            );
            return;
        }

        this.setEngineStatus(
            `Mengekstrak ${urls.length} Link Google Maps (Ala Amapulse)`,
            'Membuka Chrome CDP latar belakang, mengunjungi tiap tautan, dan melakukan auto-save per tempat...',
            'Berjalan',
            'badge-blue',
            true,
            10
        );

        try {
            const startRes = await this.startLocalScrapeSession({ urlBatch: urls, headless: true });
            if (!startRes.success) {
                throw new Error(startRes.message || 'Gagal memulai batch link Chrome lokal');
            }

            const out = await this.pollLocalScraper(`Batch Link (${urls.length} URL)`, 'Sesuai Tautan Maps', urls.length, false, (ev) => {
                this.renderTelemetryMatrix([{
                    name: '🔗 Batch Link Chrome CDP (Ala Amapulse)',
                    stateLabel: ev.phase === 'captcha' ? 'CAPTCHA 45s' : 'BERJALAN',
                    tone: ev.phase === 'captcha' ? 'warn' : 'running',
                    detail: `Terekstrak & auto-save ${ev.count || 0}/${urls.length} tempat dari link yang ditempel.`
                }]);
            }, startRes.progressUrl);

            if (out.places && out.places.length > 0) {
                this.setEngineStatus(
                    `Selesai! ${out.places.length} Data Link Terambil`,
                    `Berhasil mengekstrak data asli dari ${out.places.length}/${urls.length} link Google Maps yang ditempel.`,
                    'Selesai',
                    'badge-green',
                    true,
                    100
                );
                setTimeout(() => {
                    this.showScrapedResultsPage(out.places, `Batch ${out.places.length} Link Maps`, 'Sesuai Link');
                }, 400);
            } else {
                this.setEngineStatus(
                    'Belum Ada Tempat Berhasil Diekstrak',
                    out.error || 'Pastikan tautan mengarah langsung ke profil tempat / hasil Google Maps.',
                    'Kosong',
                    'badge-amber',
                    false
                );
            }
        } catch (err) {
            this.setEngineStatus('Gagal Ekstrak Batch Link', err.message, 'Error', 'badge-red', false);
        }
    },

    async pollLocalScraper(query, location, limitVal, allowFailoverMerge = true, onUpdate = null, statusUrl = 'api/scraper.php?action=local_scrape_status', suppressGlobalStatus = false) {
        return new Promise((resolve) => {
            let idleCount = 0;
            let pollCount = 0;
            const maxPolls = Math.max(120, Math.min(3600, limitVal * 4)); // Scales dynamically for 1000+ targets

            const pollTimer = setInterval(async () => {
                pollCount++;
                try {
                    const st = await this.safeFetchJson(statusUrl || 'api/scraper.php?action=local_scrape_status');

                    if (st.captcha_prompt) {
                        idleCount = 0;
                        if (!suppressGlobalStatus) {
                            this.setEngineStatus(
                                '⚠️ CAPTCHA Terdeteksi!',
                                'Jendela browser dibuka ke layar laptop Anda. Silakan centang/selesaikan CAPTCHA gambar dalam 45 detik agar proses berlanjut...',
                                'CAPTCHA 45s',
                                'badge-amber',
                                true,
                                50
                            );
                        }
                        if (onUpdate) onUpdate({ phase: 'captcha', count: st.collected_count || 0 });
                    } else if (st.status === 'collecting_links') {
                        idleCount = 0;
                        if (!suppressGlobalStatus) {
                            this.setEngineStatus(
                                'Tahap 1/2 · Menyalin Link Google Maps Otomatis...',
                                'Chrome lokal sedang mencari target di Google Maps &amp; mengumpulkan tautan tempat secara otomatis sebelum ekstraksi per kolom.',
                                'Kumpulkan Link',
                                'badge-blue',
                                true,
                                18
                            );
                        }
                        if (onUpdate) onUpdate({ phase: 'collecting_links', count: 0 });
                    } else if (st.status === 'running' || st.status === 'loading_maps' || st.status === 'starting_browser') {
                        idleCount = 0;
                        const count = st.collected_count || 0;
                        const pct = Math.min(95, Math.max(12, Math.round((count / Math.max(1, limitVal)) * 100)));
                        if (!suppressGlobalStatus) {
                            this.setEngineStatus(
                                'Mesin Lokal Chrome Mengambil Data Asli...',
                                `Membuka detail Google Maps satu per satu: <strong>${count} / ${limitVal} tempat asli</strong> tersimpan (Auto-Save).`,
                                `Mengambil (${count}/${limitVal})`,
                                'badge-blue',
                                true,
                                pct
                            );
                        }
                        if (onUpdate) onUpdate({ phase: st.status, count });
                    } else if (st.status === 'completed' || st.status === 'failover_to_api') {
                        clearInterval(pollTimer);
                        const localPlaces = this.normalizeMapsPlaces(st.places || [], location, 'Chrome Mesin Lokal', 'local_headless');

                        if (st.status === 'failover_to_api' && allowFailoverMerge) {
                            const remaining = Math.max(1, limitVal - localPlaces.length);
                            if (!suppressGlobalStatus) {
                                this.setEngineStatus(
                                    'Failover 45s ➔ Estafet Cloud API',
                                    `Waktu CAPTCHA 45s habis. <strong>${localPlaces.length} data awal tetap aman tersimpan!</strong> Mencoba estafet ${remaining} sisa target ke Cloud API...`,
                                    'Failover Estafet',
                                    'badge-amber',
                                    true,
                                    75
                                );
                            }
                            if (onUpdate) onUpdate({ phase: 'failover_start', count: localPlaces.length, remaining });
                            try {
                                const cloudData = await this.safeFetchJson('api/scraper.php?action=cloud_scrape', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ query, location, limit: remaining, lat: this.currentQuery.lat, lng: this.currentQuery.lng })
                                });
                                if (cloudData.success && Array.isArray(cloudData.places) && cloudData.places.length > 0) {
                                    const cloudNorm = this.normalizeMapsPlaces(cloudData.places, location, cloudData.provider || 'Cloud API', 'cloud_api');
                                    const combined = this.mergeHybridLeads(localPlaces.concat(cloudNorm), []);
                                    return resolve({
                                        places: combined,
                                        provider: `Mesin Lokal (${localPlaces.length}) + ${cloudData.provider} (${cloudNorm.length})`,
                                        failoverUsed: true,
                                        attempt_log: cloudData.attempt_log || []
                                    });
                                }
                                return resolve({
                                    places: localPlaces,
                                    provider: 'Chrome Mesin Lokal',
                                    failoverAttempted: true,
                                    failoverError: cloudData.message || 'Cloud API / Places kosong',
                                    attempt_log: cloudData.attempt_log || []
                                });
                            } catch (fErr) {
                                return resolve({
                                    places: localPlaces,
                                    provider: 'Chrome Mesin Lokal',
                                    failoverAttempted: true,
                                    failoverError: fErr.message
                                });
                            }
                        }

                        return resolve({ places: localPlaces, provider: 'Chrome Mesin Lokal' });
                    } else if (st.status === 'error') {
                        clearInterval(pollTimer);
                        return resolve({ places: this.normalizeMapsPlaces(st.places || [], location, 'Chrome Mesin Lokal', 'local_headless'), error: 'Mesin lokal berhenti karena error Chrome/Node.' });
                    } else {
                        idleCount++;
                        if (idleCount >= 10 || pollCount >= maxPolls) {
                            clearInterval(pollTimer);
                            return resolve({ places: [], error: 'Mesin lokal tidak merespons (cek Node.js & Google Chrome di host).' });
                        }
                    }
                } catch (err) {
                    idleCount++;
                    if (idleCount >= 6 || pollCount >= maxPolls) {
                        clearInterval(pollTimer);
                        return resolve({ places: [], error: err.message });
                    }
                }
            }, 2000);
        });
    },

    async executeHybridScrape() {
        const { category, location } = this.getActiveCategoryAndLocation();
        const query = this.googleMapsSearchQuery();
        const limitVal = this.getActiveBatchLimit();

        const preAgent = await this.detectLocalBridgeAgent();
        this.localAgentStatus = preAgent;

        if (this.isStaticHost() && !(preAgent && preAgent.active)) {
            this.showStaticHostRealNotice('Ekstraksi Otomatis 1 Klik');
            return;
        }

        this.setEngineStatus(
            'Ekstraksi Paralel (Semua Mesin Aktif)',
            `Mengecek mesin aktif lalu menjalankan seluruh jalur yang siap secara bersamaan untuk "<strong>${this.escapeText(category)}</strong>" di <strong>${this.escapeText(location)}</strong>...`,
            'Cek Mesin...',
            'badge-blue',
            true,
            10
        );

        const diag = await this.refreshEngineDiagnostics();
        const trackLabels = {
            cloud_api: 'Cloud API',
            google_places: 'Google Places',
            local_chrome: 'Chrome Lokal 45s',
            dorking: 'Sosmed WA Hunter'
        };
        const trackDone = { cloud_api: !diag?.cloud_api?.active, google_places: !diag?.google_places?.active, local_chrome: !diag?.local_chrome?.active, dorking: !diag?.dorking?.active };
        const liveCounts = { cloud_api: 0, google_places: 0, local_chrome: 0, dorking: 0 };

        const stateRows = {
            cloud_api: {
                name: '☁️ Cloud API (Apify / Outscraper / SerpApi)',
                stateLabel: diag?.cloud_api?.active ? 'BERJALAN' : 'MATI',
                tone: diag?.cloud_api?.active ? 'running' : 'off',
                detail: diag?.cloud_api?.active ? 'Berjalan paralel: memanggil Apify / Outscraper / SerpApi...' : (diag?.cloud_api?.message || 'Tidak terkonfigurasi')
            },
            google_places: {
                name: '📍 Google Places API',
                stateLabel: diag?.google_places?.active ? 'BERJALAN' : 'MATI',
                tone: diag?.google_places?.active ? 'running' : 'off',
                detail: diag?.google_places?.active ? 'Berjalan paralel: menarik data resmi Google Places...' : (diag?.google_places?.message || 'GOOGLE_MAPS_API_KEY kosong')
            },
            local_chrome: {
                name: '💻 Chrome Lokal 45s (CDP + Auto-Save)',
                stateLabel: diag?.local_chrome?.active ? 'BERJALAN' : 'MATI',
                tone: diag?.local_chrome?.active ? 'running' : 'off',
                detail: diag?.local_chrome?.active ? (diag.local_chrome.via === 'pc_agent' ? 'Berjalan paralel di laptop via Agen PC 127.0.0.1:43210...' : 'Berjalan paralel via Chrome latar belakang...') : (diag?.local_chrome?.message || 'Node/Chrome tidak tersedia')
            },
            dorking: {
                name: '🎯 Sosmed WA Hunter (IG / FB / TikTok / Web)',
                stateLabel: diag?.dorking?.active ? 'BERJALAN' : 'MATI',
                tone: diag?.dorking?.active ? 'running' : 'off',
                detail: diag?.dorking?.active ? (diag.dorking.via === 'pc_agent' ? 'Berjalan paralel via IP Laptop (Agen PC Lokal)...' : 'Berjalan paralel via Server Dorking...') : (diag?.dorking?.message || 'DuckDuckGo diblokir / belum aktif')
            },
            failover_merge: {
                name: '🔄 Penggabung Paralel & Failover 45s',
                stateLabel: 'SIAGA',
                tone: 'warn',
                detail: 'Menggabungkan hasil semua mesin aktif secara bersamaan tanpa saling menimpa...'
            }
        };

        const syncLiveSummary = (isFinal = false) => {
            const activeKeys = Object.keys(trackLabels).filter(k => diag?.[k]?.active);
            const runningKeys = activeKeys.filter(k => !trackDone[k]);
            const inactiveNames = Object.keys(trackLabels).filter(k => !diag?.[k]?.active).map(k => trackLabels[k]);
            const totalNow = Object.values(liveCounts).reduce((a, b) => a + b, 0);

            if (!isFinal && activeKeys.length > 0) {
                const runningText = runningKeys.length > 0
                    ? runningKeys.map(k => `${trackLabels[k]} (${liveCounts[k]})`).join(', ')
                    : 'Menyelesaikan penggabungan...';
                const offText = inactiveNames.length > 0 ? inactiveNames.join(', ') : 'Tidak ada';
                const finishedTracks = activeKeys.length - runningKeys.length;
                const pct = Math.min(95, Math.max(15, Math.round((finishedTracks / Math.max(1, activeKeys.length)) * 60 + Math.min(35, (totalNow / Math.max(1, limitVal)) * 35))));

                stateRows.failover_merge.stateLabel = runningKeys.length > 0 ? `${activeKeys.length} MESIN AKTIF` : 'PENGGABUNGAN';
                stateRows.failover_merge.tone = 'running';
                stateRows.failover_merge.detail = `Aktif berjalan: ${activeKeys.map(k => trackLabels[k]).join(' + ')} · Terkumpul sementara: ${totalNow} data`;

                this.setEngineStatus(
                    `Berjalan Bersamaan (${activeKeys.length} Mesin Aktif)`,
                    `<strong>Aktif berjalan:</strong> ${this.escapeText(runningText)}<br><span style="color:#64748b;">Mesin mati: ${this.escapeText(offText)} · Total terkumpul: <strong>${totalNow}</strong></span>`,
                    `Paralel (${activeKeys.length} Aktif)`,
                    'badge-blue',
                    true,
                    pct
                );
            }
            this.renderTelemetryMatrix(Object.values(stateRows));
        };
        syncLiveSummary(false);

        const runCloudTrack = async () => {
            if (!diag?.cloud_api?.active) return { places: [] };
            try {
                const cloudData = await this.safeFetchJson('api/scraper.php?action=cloud_scrape', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query, category, location, limit: limitVal, provider: 'cloud_only', strict_provider: true, lat: this.currentQuery.lat, lng: this.currentQuery.lng })
                });
                const cloudLogs = (cloudData.attempt_log || []).filter(a => a.provider !== 'google_places');
                const norm = (cloudData.success && Array.isArray(cloudData.places)) ? this.normalizeMapsPlaces(cloudData.places, location, cloudData.provider || 'Cloud API', 'cloud_api') : [];
                liveCounts.cloud_api = norm.length;
                trackDone.cloud_api = true;
                const summaryTxt = cloudLogs.map(a => `${a.label}: ${a.status === 'active' ? a.count + ' data' : a.reason}`).join(' | ');
                stateRows.cloud_api.stateLabel = norm.length > 0 ? `AKTIF (${norm.length})` : 'GAGAL';
                stateRows.cloud_api.tone = norm.length > 0 ? 'active' : 'off';
                stateRows.cloud_api.detail = summaryTxt || cloudData.message || 'Tidak ada data Cloud API';
                syncLiveSummary(false);
                return { places: norm, label: cloudData.provider || 'Cloud API' };
            } catch (err) {
                trackDone.cloud_api = true;
                stateRows.cloud_api.stateLabel = 'ERROR';
                stateRows.cloud_api.tone = 'off';
                stateRows.cloud_api.detail = err.message;
                syncLiveSummary(false);
                return { places: [] };
            }
        };

        const runPlacesTrack = async () => {
            if (!diag?.google_places?.active) return { places: [] };
            try {
                const pData = await this.safeFetchJson('api/scraper.php?action=cloud_scrape', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query, category, location, limit: Math.min(60, limitVal), provider: 'google_places', strict_provider: true, lat: this.currentQuery.lat, lng: this.currentQuery.lng })
                });
                const norm = (pData.success && Array.isArray(pData.places)) ? this.normalizeMapsPlaces(pData.places, location, 'Google Places API', 'google_places') : [];
                liveCounts.google_places = norm.length;
                trackDone.google_places = true;
                stateRows.google_places.stateLabel = norm.length > 0 ? `AKTIF (${norm.length})` : 'GAGAL';
                stateRows.google_places.tone = norm.length > 0 ? 'active' : 'off';
                stateRows.google_places.detail = norm.length > 0 ? `Berhasil tarik ${norm.length} tempat resmi Google Places.` : (pData.attempt_log?.[0]?.reason || pData.message || 'Kosong');
                syncLiveSummary(false);
                return { places: norm, label: 'Google Places' };
            } catch (err) {
                trackDone.google_places = true;
                stateRows.google_places.stateLabel = 'ERROR';
                stateRows.google_places.tone = 'off';
                stateRows.google_places.detail = err.message;
                syncLiveSummary(false);
                return { places: [] };
            }
        };

        const runLocalChromeTrack = async () => {
            if (!diag?.local_chrome?.active) return { places: [] };
            try {
                const startLocal = await this.startLocalScrapeSession({ query, limit: limitVal, headless: true });
                if (!startLocal.success) throw new Error(startLocal.message || 'Gagal memulai Chrome Lokal');
                const localOut = await this.pollLocalScraper(query, location, limitVal, true, (ev) => {
                    liveCounts.local_chrome = ev.count || 0;
                    if (ev.phase === 'captcha') {
                        stateRows.local_chrome.stateLabel = 'CAPTCHA 45s';
                        stateRows.local_chrome.tone = 'warn';
                        stateRows.local_chrome.detail = `Pop-up CAPTCHA aktif! ${ev.count} data sudah tersimpan. Menunggu 45 detik...`;
                    } else if (ev.phase === 'collecting_links') {
                        stateRows.local_chrome.stateLabel = 'SALIN LINK';
                        stateRows.local_chrome.tone = 'running';
                        stateRows.local_chrome.detail = 'Tahap 1/2: Menyalin link Google Maps otomatis...';
                    } else if (ev.phase === 'failover_start') {
                        stateRows.failover_merge.stateLabel = 'ESTAFET';
                        stateRows.failover_merge.tone = 'warn';
                        stateRows.failover_merge.detail = `45s habis: ${ev.count} data lokal diamankan, melanjutkan ${ev.remaining} sisa ke Cloud API...`;
                    } else {
                        stateRows.local_chrome.stateLabel = `BERJALAN (${ev.count})`;
                        stateRows.local_chrome.tone = 'running';
                        stateRows.local_chrome.detail = `Auto-save berlangsung: ${ev.count}/${limitVal} tempat Google Maps asli.`;
                    }
                    syncLiveSummary(false);
                }, startLocal.progressUrl, true);

                const norm = localOut.places || [];
                liveCounts.local_chrome = norm.length;
                trackDone.local_chrome = true;
                stateRows.local_chrome.stateLabel = norm.length > 0 ? `AKTIF (${norm.length})` : 'MATI/KOSONG';
                stateRows.local_chrome.tone = norm.length > 0 ? 'active' : 'off';
                stateRows.local_chrome.detail = localOut.error ? localOut.error : `Auto-save ${norm.length} tempat Google Maps selesai.`;
                syncLiveSummary(false);
                return { places: norm, label: localOut.provider || 'Chrome Mesin Lokal' };
            } catch (err) {
                trackDone.local_chrome = true;
                stateRows.local_chrome.stateLabel = 'ERROR';
                stateRows.local_chrome.tone = 'off';
                stateRows.local_chrome.detail = err.message;
                syncLiveSummary(false);
                return { places: [] };
            }
        };

        const runDorkingTrack = async () => {
            if (!diag?.dorking?.active) return { leads: [] };
            try {
                const usePcDork = !!(this.localAgentStatus?.active && this.localAgentStatus?.dork_ready && !diag?.dorking_server?.active);
                const dorkEndpoint = usePcDork ? 'http://127.0.0.1:43210/dork-hunt' : 'api/scraper.php?action=dork_hunt';
                const dorkData = await this.safeFetchJson(dorkEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ category, location, platform: 'all', limit: Math.max(10, Math.min(200, limitVal)) })
                });
                const dd = dorkData.diagnostics || {};
                const leadsNorm = this.normalizeDorkingLeads(dorkData.leads || [], category, location);
                liveCounts.dorking = leadsNorm.length;
                trackDone.dorking = true;

                const dorkEngine = dd.engine || (usePcDork ? 'DuckDuckGo (Agen PC)' : 'DuckDuckGo');
                if (dd.blocked_or_captcha) {
                    stateRows.dorking.stateLabel = dorkEngine.includes('SerpApi') ? 'DIBLOKIR SERPAPI' : 'DIBLOKIR ISP/DDG';
                    stateRows.dorking.tone = 'off';
                    stateRows.dorking.detail = dd.error || `${dorkEngine} meminta verifikasi anti-bot`;
                } else if (leadsNorm.length > 0) {
                    stateRows.dorking.stateLabel = `AKTIF (${leadsNorm.length})`;
                    stateRows.dorking.tone = 'active';
                    stateRows.dorking.detail = `Ditemukan ${leadsNorm.length} WA asli dari ${dd.raw_search_hits || 0} hasil ${dorkEngine}.`;
                } else if (dd.active) {
                    stateRows.dorking.stateLabel = 'AKTIF (0 COCOK)';
                    stateRows.dorking.tone = 'warn';
                    stateRows.dorking.detail = `${dorkEngine} merespons (${dd.raw_search_hits || 0} hasil), tapi belum ada nomor WA di snippet.`;
                } else {
                    stateRows.dorking.stateLabel = 'MATI';
                    stateRows.dorking.tone = 'off';
                    stateRows.dorking.detail = dd.error || `Gagal menghubungi ${dorkEngine}`;
                }
                syncLiveSummary(false);
                return { leads: leadsNorm, label: dorkEngine };
            } catch (err) {
                trackDone.dorking = true;
                stateRows.dorking.stateLabel = 'ERROR';
                stateRows.dorking.tone = 'off';
                stateRows.dorking.detail = err.message;
                syncLiveSummary(false);
                return { leads: [] };
            }
        };

        const [cloudRes, placesRes, localRes, dorkRes] = await Promise.allSettled([
            runCloudTrack(),
            runPlacesTrack(),
            runLocalChromeTrack(),
            runDorkingTrack()
        ]);

        const cloudPlaces = (cloudRes.status === 'fulfilled' && cloudRes.value?.places) || [];
        const placesApiPlaces = (placesRes.status === 'fulfilled' && placesRes.value?.places) || [];
        const localPlaces = (localRes.status === 'fulfilled' && localRes.value?.places) || [];
        const dorkLeads = (dorkRes.status === 'fulfilled' && dorkRes.value?.leads) || [];

        const combinedMaps = this.mergeHybridLeads(cloudPlaces.concat(placesApiPlaces, localPlaces), []);
        const merged = this.mergeHybridLeads(combinedMaps, dorkLeads);

        const activeRunSummary = Object.keys(trackLabels)
            .filter(k => diag?.[k]?.active)
            .map(k => `${trackLabels[k]}: ${liveCounts[k]}`)
            .join(' · ');

        stateRows.failover_merge.stateLabel = merged.length > 0 ? `SELESAI (${merged.length})` : 'SELESAI (0)';
        stateRows.failover_merge.tone = merged.length > 0 ? 'active' : 'warn';
        stateRows.failover_merge.detail = activeRunSummary
            ? `Hasil paralel digabung: ${activeRunSummary} → Total ${merged.length} prospek unik`
            : 'Semua mesin sedang nonaktif — aktifkan Agen PC Lokal, API Key, atau Ekstensi Chrome.';
        syncLiveSummary(true);

        if (merged.length === 0) {
            this.setEngineStatus(
                '0 Data Asli Ditemukan (Cek Status Mesin di Bawah)',
                'Tidak ada data asli yang kembali. Lihat rincian tiap mesin di bawah — kami tidak menampilkan data buatan.',
                'Nol Hasil',
                'badge-red',
                false
            );
            const msgEl = document.getElementById('engine-status-msg');
            if (msgEl && !diag?.cloud_api?.active && !diag?.local_chrome?.active) {
                const act = document.createElement('div');
                act.style.cssText = 'margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;';
                act.innerHTML = `
                  <a href="downloads/cliento-local-agent.zip" download class="btn btn-primary btn-sm" style="font-size:0.72rem;padding:6px 10px;background:#059669;border-color:#059669;">⬇️ Download Agen Chrome PC Lokal</a>
                  <button type="button" id="btn-hybrid-open-ext-fallback" class="btn btn-outline btn-sm" style="font-size:0.72rem;padding:6px 10px;">🌐 Buka Google Maps Asli (Ekstensi Chrome)</button>
                `;
                msgEl.appendChild(act);
                document.getElementById('btn-hybrid-open-ext-fallback')?.addEventListener('click', () => {
                    document.getElementById('advanced-engine-details')?.setAttribute('open', 'true');
                    const extBox = document.getElementById('extension-manual-box');
                    if (extBox) extBox.style.display = 'block';
                    this.launchGoogleMapsAutoScrape();
                });
            }
            return;
        }

        const mapsCount = combinedMaps.length;
        const dorkCount = dorkLeads.length;

        this.setEngineStatus(
            'Ekstraksi Paralel Selesai!',
            `Terkumpul <strong>${merged.length} prospek asli</strong> secara bersamaan (${mapsCount} Google Maps + ${dorkCount} Sosmed Dorking).<br><span style="color:#475569;">${this.escapeText(activeRunSummary)}</span>`,
            'Selesai',
            'badge-green',
            true,
            100
        );

        this.showScrapedResultsPage(merged, category, location);
        this.showToast(`✓ Berhasil menarik ${mapsCount} data Maps + ${dorkCount} WA Sosmed asli!`);
    },

    async executeCloudWaterfallScrape() {
        const { category, location } = this.getActiveCategoryAndLocation();
        const query = this.googleMapsSearchQuery();
        const limitVal = this.getActiveBatchLimit();

        if (this.isStaticHost()) {
            this.showStaticHostRealNotice('Cloud API Estafet');
            return;
        }

        this.setEngineStatus(
            'Cloud API (Estafet Waterfall)',
            'Menghubungi provider Cloud API: Apify ➔ Outscraper ➔ SerpApi ➔ Google Places...',
            'Menghubungi API...',
            'badge-blue',
            true,
            25
        );
        this.renderTelemetryMatrix([]);

        try {
            const data = await this.safeFetchJson('api/scraper.php?action=cloud_scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, category, location, limit: limitVal, lat: this.currentQuery.lat, lng: this.currentQuery.lng })
            });

            if (Array.isArray(data.attempt_log)) {
                this.renderTelemetryMatrix(data.attempt_log.map(a => ({
                    name: a.label,
                    stateLabel: a.status === 'active' ? `AKTIF (${a.count})` : (a.status === 'off' ? 'MATI (NO KEY)' : 'GAGAL'),
                    tone: a.status === 'active' ? 'active' : 'off',
                    detail: a.status === 'active' ? `Berhasil mengambil ${a.count} data asli.` : a.reason
                })));
            }

            if (!data.success) {
                this.setEngineStatus(
                    'Cloud API Tidak Dapat Mengambil Data',
                    (data.message || 'Semua provider cloud gagal.') + (data.details ? '<br>' + Object.entries(data.details).map(([k, v]) => `<strong>${k}:</strong> ${v}`).join('; ') : ''),
                    'Mati / Gagal',
                    'badge-red',
                    false
                );
                return;
            }

            const places = this.normalizeMapsPlaces(data.places || [], location, data.provider, 'cloud_api');
            this.setEngineStatus(
                `Sukses (${data.provider})`,
                `Berhasil mengambil <strong>${places.length} data bisnis asli</strong> via ${data.provider}!`,
                'Selesai',
                'badge-green',
                true,
                100
            );

            this.showScrapedResultsPage(places, category, location);
            this.showToast(`✓ Berhasil memuat ${places.length} prospek via ${data.provider}!`);
        } catch (e) {
            this.setEngineStatus('Koneksi Server Gagal', e.message, 'Error', 'badge-red');
        }
    },

    async executeLocalChromeScrape() {
        const { category, location } = this.getActiveCategoryAndLocation();
        const query = this.googleMapsSearchQuery();
        const limitVal = this.getActiveBatchLimit();

        this.localAgentStatus = await this.detectLocalBridgeAgent();
        if (this.isStaticHost() && !(this.localAgentStatus && this.localAgentStatus.active)) {
            this.showStaticHostRealNotice('Mesin Lokal Chrome');
            return;
        }

        this.setEngineStatus(
            'Mesin Lokal Laptop (CDP)',
            'Memulai Chrome otomatis di laptop Anda (target: ' + limitVal + ' data)...',
            'Menyiapkan Chrome',
            'badge-blue',
            true,
            10
        );
        this.renderTelemetryMatrix([]);

        try {
            const startData = await this.startLocalScrapeSession({ query, limit: limitVal, headless: true });

            if (!startData.success) {
                this.setEngineStatus('Mesin Lokal Mati', startData.message, 'Mati', 'badge-red');
                return;
            }

            this.showToast('Mesin lokal Chrome dimulai di laptop Anda.');
            const result = await this.pollLocalScraper(query, location, limitVal, true, null, startData.progressUrl);

            if (!result.places || result.places.length === 0) {
                this.setEngineStatus('Mesin Lokal Tidak Mendapat Data', result.error || 'Tidak ada data asli yang berhasil ditarik.', 'Kosong', 'badge-red');
                return;
            }

            this.setEngineStatus(
                result.failoverUsed ? 'Selesai (Lokal + Failover Cloud)' : 'Mesin Lokal Selesai!',
                `Berhasil mengumpulkan <strong>${result.places.length} tempat asli</strong> (${this.escapeText(result.provider || 'Chrome Mesin Lokal')})!`,
                'Selesai',
                'badge-green',
                true,
                100
            );

            this.showScrapedResultsPage(result.places, category, location);
            this.showToast(`✓ Sukses mengambil ${result.places.length} data via ${result.provider}!`);
        } catch (e) {
            this.setEngineStatus('Error Server', e.message, 'Error', 'badge-red');
        }
    },

    async executeDorkingHunter() {
        const { category, location } = this.getActiveCategoryAndLocation();
        const limitVal = this.getActiveBatchLimit();

        this.localAgentStatus = await this.detectLocalBridgeAgent();
        const usePcDork = !!(this.localAgentStatus?.active && (this.localAgentStatus?.dork_ready || this.isStaticHost()) && !(this.lastDiagnostics?.dorking_server?.active));

        if (this.isStaticHost() && !usePcDork) {
            this.showStaticHostRealNotice('Sosmed & Direct WA Hunter');
            return;
        }

        this.setEngineStatus(
            usePcDork ? 'Sosmed & Direct WA Hunter (Agen PC Lokal)' : 'Sosmed & Direct WA Hunter (DuckDuckGo)',
            `Memburu nomor WhatsApp aktif asli dari Instagram, Facebook, TikTok &amp; Web untuk "<strong>${this.escapeText(category)}</strong>" di <strong>${this.escapeText(location)}</strong>...`,
            'Memburu WA...',
            'badge-purple',
            true,
            30
        );
        this.renderTelemetryMatrix([]);

        try {
            const dorkEndpoint = usePcDork ? 'http://127.0.0.1:43210/dork-hunt' : 'api/scraper.php?action=dork_hunt';
            const data = await this.safeFetchJson(dorkEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category, location, platform: 'all', limit: limitVal })
            });

            const dd = data.diagnostics || {};
            this.renderTelemetryMatrix([{
                name: '🎯 DuckDuckGo Sosmed Hunter (IG / FB / TikTok / Web)',
                stateLabel: dd.blocked_or_captcha ? 'DIBLOKIR' : ((data.leads || []).length > 0 ? `AKTIF (${data.leads.length})` : (dd.active ? '0 COCOK' : 'MATI')),
                tone: dd.blocked_or_captcha || !dd.active ? 'off' : ((data.leads || []).length > 0 ? 'active' : 'warn'),
                detail: dd.error || `HTTP ${dd.last_http_code || 200} · ${dd.raw_search_hits || 0} hasil DuckDuckGo · ${(data.leads || []).length} WA valid`
            }]);

            if (!data.success || !data.leads || data.leads.length === 0) {
                this.setEngineStatus(
                    dd.blocked_or_captcha ? 'DuckDuckGo Meminta Verifikasi' : 'Tidak Ada WA Publik Ditemukan',
                    dd.error || 'Tidak ditemukan nomor WhatsApp publik di IG/FB/TikTok untuk kombinasi kata kunci ini. Coba ubah kata kunci atau kota.',
                    dd.blocked_or_captcha ? 'Diblokir' : 'Nol Hasil',
                    'badge-amber',
                    false
                );
                return;
            }

            const leads = this.normalizeDorkingLeads(data.leads, category, location);
            this.setEngineStatus(
                'Buru WA Selesai!',
                `Berhasil memburu <strong>${leads.length} nomor WhatsApp asli langsung</strong> dari media sosial publik!`,
                'Selesai',
                'badge-green',
                true,
                100
            );

            this.showScrapedResultsPage(leads, category, location);
            this.showToast(`✓ Berhasil memburu ${leads.length} nomor WhatsApp dari Sosmed!`);
        } catch (e) {
            this.setEngineStatus('Error Dorking', e.message, 'Error', 'badge-red');
        }
    },
    watchForChromeImportCompletion() { return; },
    processImportedChromeLeads() { return; },

    escapeText(value) {
        return String(value ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;'}[c]));
    },

    sourceForItem(item) {
        return item.provenance || item.insights?.provenance || {
            source_name: item.source_name || 'Sumber historis tidak dicantumkan',
            source_url: item.source_url || '', license: '', usage_basis: ''
        };
    },

    metricsForItem(item) {
        const observed = item.insights?.metrics;
        return {
            ratingAvailable: observed ? observed.rating_available === true : Number(item.rating) > 0,
            reviewsAvailable: observed ? observed.reviews_count_available === true : Number(item.rating) > 0
        };
    },

    parseAmapulseSheetRows(rows = []) {
        const pick = (obj, keys) => {
            const entries = Object.entries(obj || {});
            for (const want of keys) {
                const hit = entries.find(([k]) => k.toLowerCase().trim() === want || k.toLowerCase().trim().includes(want));
                if (hit && String(hit[1] ?? '').trim() !== '') return String(hit[1]).trim();
            }
            return '';
        };
        const out = [];
        (rows || []).forEach((row, idx) => {
            const name = pick(row, ['name', 'title', 'nama usaha', 'nama tempat', 'nama', 'business']);
            const mapsUrl = pick(row, ['google maps url', 'maps url', 'url sumber', 'source_url', 'link', 'url']);
            const phone = pick(row, ['phone', 'telepon', 'telp', 'nomor hp', 'no hp', 'whatsapp', 'hp']);
            if (!name && !mapsUrl) return;
            const ratingNum = parseFloat(pick(row, ['rating', 'stars', 'bintang']).replace(',', '.')) || 0;
            const reviewsNum = parseInt(pick(row, ['reviews', 'review_count', 'reviews_count', 'ulasan']).replace(/[^\d]/g, ''), 10) || 0;
            const latVal = parseFloat(pick(row, ['latitude', 'lat'])) || null;
            const lngVal = parseFloat(pick(row, ['longitude', 'lng', 'lon'])) || null;
            const website = pick(row, ['website', 'site', 'web', 'medsos']);
            out.push({
                id: idx + 1,
                name: name || 'Bisnis dari Spreadsheet',
                category: pick(row, ['category', 'type', 'kategori']) || 'Google Maps',
                address: pick(row, ['full address', 'address', 'alamat', 'lokasi']) || '-',
                phone,
                whatsapp: phone && /^(\+?628|08)/.test(phone.replace(/[^\d+]/g, '')) ? phone : '',
                website,
                social_media: website,
                opening_hours: pick(row, ['hours', 'opening hours', 'jam operasional', 'jam']),
                rating: ratingNum,
                reviews_count: reviewsNum,
                lat: latVal,
                lng: lngVal,
                google_maps_url: mapsUrl,
                source: 'amapulse_sheet',
                source_type: 'google_maps',
                source_name: 'Spreadsheet Amapulse',
                insights: {
                    provenance: {
                        source_name: 'Spreadsheet Amapulse (CSV/XLSX)',
                        source_type: 'google_maps',
                        source_url: mapsUrl,
                        usage_basis: 'Impor spreadsheet oleh pengguna'
                    },
                    metrics: {
                        rating_available: ratingNum > 0,
                        reviews_count_available: reviewsNum > 0
                    },
                    contact: {
                        phone_listed: Boolean(phone),
                        whatsapp_listed: false,
                        website_listed: Boolean(website)
                    }
                }
            });
        });
        return out;
    },

    async handleAmapulseSheetUpload(file) {
        if (typeof XLSX === 'undefined') {
            this.setEngineStatus('Parser Spreadsheet Belum Siap', 'Library SheetJS (XLSX) belum termuat.', 'Error', 'badge-red', false);
            return;
        }
        try {
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: 'array' });
            const firstSheet = wb.Sheets[wb.SheetNames[0]];
            const rawRows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
            const parsed = this.parseAmapulseSheetRows(rawRows);
            if (!parsed.length) {
                throw new Error('Tidak ditemukan kolom Name/Title atau URL di file spreadsheet.');
            }
            this.showScrapedResultsPage(parsed, 'Impor Spreadsheet Amapulse', file.name);
            if (this.showToast) this.showToast(`✅ Berhasil mentransfer ${parsed.length} data dari spreadsheet Amapulse ke web!`);
        } catch (err) {
            this.setEngineStatus('Gagal Impor Spreadsheet', err.message, 'Error', 'badge-red', false);
        }
    },

    async copyAllGoogleMapsLinks() {
        const links = (this.scrapedResults || [])
            .map(it => it.google_maps_url || it.insights?.provenance?.source_url || '')
            .filter(u => /^https?:\/\//i.test(u));
        const unique = [...new Set(links)];
        if (!unique.length) {
            if (this.showToast) this.showToast('Belum ada tautan Google Maps pada tabel hasil.');
            return;
        }
        const text = unique.join('\n');
        try {
            await navigator.clipboard.writeText(text);
            if (this.showToast) this.showToast(`✅ ${unique.length} link Google Maps tersalin! Siap ditempel ke Amapulse/Spreadsheet.`);
        } catch (_) {
            window.prompt('Salin daftar link Google Maps di bawah ini:', text);
        }
    },

    validateExtensionPayload(documentData) {
        if (!documentData || !Array.isArray(documentData.records) || documentData.records.length < 1 || documentData.records.length > 5000) {
            throw new Error('JSON harus berisi records sebanyak 1–5000 data.');
        }
        const isMaps = documentData.records.every(record => {
            if (!record || !['google_maps_extension', 'browser_manual'].includes(record.source_type || documentData.source?.source_type)) return false;
            try {
                const url = new URL(record.source_url || documentData.source?.source_url || '');
                return url.protocol === 'https:' && ['google.com', 'www.google.com', 'maps.google.com', 'google.co.id', 'www.google.co.id', 'maps.google.co.id'].includes(url.hostname) && !url.username && !url.password && (!url.port || url.port === '443');
            } catch (_) { return false; }
        });
        if (!isMaps) throw new Error('Pilih JSON hasil Google Maps dari ekstensi cliento.');
        return documentData;
    },

    normalizeExtensionRecordsClient(documentData) {
        const defaultSource = documentData.source || {};
        const fallbackLoc = documentData.context?.location_name || 'sesuai pencarian';
        return (documentData.records || []).map((rec, idx) => {
            const sourceUrl = rec.source_url || defaultSource.source_url || '';
            const sourceName = rec.source_name || defaultSource.source_name || 'Google Maps (Chrome)';
            const sourceType = rec.source_type || defaultSource.source_type || 'google_maps_extension';
            const usageBasis = rec.usage_basis || defaultSource.usage_basis || 'Pengambilan data publik Google Maps dimulai pengguna';
            const hasRating = Number.isFinite(Number(rec.rating)) && Number(rec.rating) > 0;
            const hasReviews = Number.isInteger(rec.reviews_count) && rec.reviews_count >= 0;
            return {
                id: idx + 1,
                name: rec.name || '-',
                category: rec.category || documentData.context?.target_category || 'Bisnis',
                address: rec.address || fallbackLoc,
                phone: rec.phone || '',
                whatsapp: rec.whatsapp || '',
                website: rec.website || '',
                social_media: rec.website || '',
                opening_hours: rec.opening_hours || '',
                rating: hasRating ? Number(rec.rating) : 0,
                reviews_count: hasReviews ? rec.reviews_count : 0,
                lat: rec.lat ?? null,
                lng: rec.lng ?? null,
                source_type: sourceType,
                source_name: sourceName,
                insights: {
                    provenance: {
                        source_name: sourceName,
                        source_type: sourceType,
                        source_url: sourceUrl,
                        usage_basis: usageBasis,
                        observed_at: rec.observed_at || documentData.sent_at || ''
                    },
                    metrics: {
                        rating_available: hasRating,
                        reviews_count_available: hasReviews
                    },
                    contact: {
                        phone_listed: Boolean(rec.phone),
                        whatsapp_listed: Boolean(rec.whatsapp),
                        website_listed: Boolean(rec.website)
                    }
                }
            };
        });
    },

    async importExtensionPayload(documentData, options = {}) {
        this.validateExtensionPayload(documentData);
        const status = document.getElementById('public-source-status');
        let items = null;

        if (!this.isStaticHost() && documentData.records.length <= 500) {
            const response = await fetch('api/source_import.php', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(documentData)
            });
            let data = null;
            try { data = await response.json(); } catch (_) {}

            if (response.ok && data && data.success) {
                items = data.items;
                if (status) status.textContent = data.items.length + ' record tersimpan dengan atribusi sumber.';
            } else if (response.status === 401 || response.status === 404 || response.status >= 500) {
                items = this.normalizeExtensionRecordsClient(documentData);
                if (status) status.textContent = items.length + ' record dimuat ke tabel & siap Export Excel (mode browser lokal karena DB belum login/offline).';
            } else {
                throw new Error(data?.message || 'Impor gagal.');
            }
        } else {
            items = this.normalizeExtensionRecordsClient(documentData);
            if (status) status.textContent = items.length + ' record dimuat dari Ekstensi Chrome (siap Export Excel).';
        }

        this.scrapedResults = items;
        this.currentQuery.category = documentData.context?.target_category || 'Google Maps';
        this.currentQuery.location = documentData.context?.location_name || 'sesuai pencarian';
        this.activeFilter = 'all';
        this.renderScrapedResultsTable();
        const setupEl = document.getElementById('scraper-setup-view');
        const resultsEl = document.getElementById('scraped-results-view');
        if (setupEl) setupEl.style.display = 'none';
        if (resultsEl) resultsEl.style.display = 'block';
        if (typeof window !== 'undefined' && window.DataManager) window.DataManager.loadTreeData();
        if (typeof window !== 'undefined' && window.App) window.App.refreshDashboardStats();
        if (options.autoImported && this.showToast) {
            this.showToast(`✅ ${items.length} data Google Maps otomatis masuk dari Ekstensi Chrome!`);
        }
        return items;
    },

    bindSourceImport() {
        const input = document.getElementById('public-source-file');
        const button = document.getElementById('btn-import-public-source');
        const status = document.getElementById('public-source-status');
        if (!input || !button || input.dataset.bound) return;
        input.dataset.bound = '1';
        let pending = null;
        input.addEventListener('change', async () => {
            pending = null; button.disabled = true;
            const file = input.files[0]; if (!file) return;
            try {
                if (file.size > 2 * 1024 * 1024) throw new Error('Ukuran file maksimal 2 MB.');
                const documentData = JSON.parse(await file.text());
                this.validateExtensionPayload(documentData);
                pending = documentData; status.textContent = documentData.records.length + ' record siap diimpor.'; button.disabled = false;
            } catch (error) { status.textContent = error.message; }
        });
        button.addEventListener('click', async () => {
            if (!pending) return;
            button.disabled = true; status.textContent = 'Menyimpan data dan atribusi sumber...';
            try {
                await this.importExtensionPayload(pending);
                pending = null; input.value = '';
            } catch (error) { status.textContent = error.message; button.disabled = false; }
        });
    },

    // Filter pills in scraped results
    bindLeadFilterPills() {
        document.querySelectorAll('.lead-filter-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                document.querySelectorAll('.lead-filter-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                this.activeFilter = pill.getAttribute('data-filter') || 'all';
                this.renderScrapedResultsTable();
            });
        });
    },

    renderScrapedResultsTable() {
        const tbody = document.getElementById('scraped-table-body');
        const titleEl = document.getElementById('scraped-results-title');
        const countBadge = document.getElementById('scraped-count-badge');
        if (!tbody) return;

        tbody.innerHTML = '';
        const catUpper = (this.currentQuery.category === 'all' || this.currentQuery.category === 'semua_bidang') 
            ? 'SEMUA BIDANG USAHA' 
            : (this.currentQuery.category || 'PROSPEK').toUpperCase();
        if (titleEl) titleEl.textContent = `Hasil Scraping: ${catUpper} di ${this.currentQuery.location}`;
        const summary = document.getElementById('scraped-summary');
        const mapsTotal = this.scrapedResults.filter(it => it.source_type !== 'google_dorking').length;
        const dorkTotal = this.scrapedResults.filter(it => it.source_type === 'google_dorking').length;
        const waTotal = this.scrapedResults.filter(it => it.phone && it.phone !== '-').length;

        const pillAll = document.getElementById('pill-filter-all');
        const pillMaps = document.getElementById('pill-filter-source-maps');
        const pillDork = document.getElementById('pill-filter-source-dorking');
        const pillWa = document.getElementById('pill-filter-has-wa');
        if (pillAll) pillAll.textContent = `Semua Leads (${this.scrapedResults.length})`;
        if (pillMaps) pillMaps.innerHTML = `<i class="fa-solid fa-map-location-dot" style="color: #2563eb;"></i> Google Maps (${mapsTotal})`;
        if (pillDork) pillDork.innerHTML = `<i class="fa-brands fa-instagram" style="color: #7c3aed;"></i> Sosmed Dorking (${dorkTotal})`;
        if (pillWa) pillWa.innerHTML = `<i class="fa-brands fa-whatsapp text-success"></i> Punya WhatsApp (${waTotal})`;

        if (summary) {
            const websites = this.scrapedResults.filter(item => item.website || (item.social_media && item.social_media !== '-')).length;
            summary.textContent = `${this.scrapedResults.length} bisnis (${mapsTotal} Google Maps · ${dorkTotal} Sosmed Dorking) · ${waTotal} dengan telepon · ${websites} dengan website/medsos.`;
        }

        let filtered = this.scrapedResults;
        if (this.activeFilter === 'has_wa') {
            filtered = this.scrapedResults.filter(it => it.phone && it.phone !== '-');
        } else if (this.activeFilter === 'low_rating') {
            filtered = this.scrapedResults.filter(it => parseFloat(it.rating) > 0 && parseFloat(it.rating) < 4.2);
        } else if (this.activeFilter === 'high_rating') {
            filtered = this.scrapedResults.filter(it => parseFloat(it.rating) >= 4.5);
        } else if (this.activeFilter === 'no_web') {
            filtered = this.scrapedResults.filter(it => !it.social_media || it.social_media.startsWith('@'));
        } else if (this.activeFilter === 'source_maps') {
            filtered = this.scrapedResults.filter(it => (it.source_type !== 'google_dorking'));
        } else if (this.activeFilter === 'source_dorking') {
            filtered = this.scrapedResults.filter(it => (it.source_type === 'google_dorking'));
        }

        if (countBadge) countBadge.textContent = `${filtered.length} dari ${this.scrapedResults.length} Data Ditampilkan`;

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 36px 16px; color: #64748b;"><i class="fa-solid fa-circle-exclamation" style="font-size: 1.4rem; color: #94a3b8; display: block; margin-bottom: 6px;"></i> Tidak ada data hasil scraping untuk ditampilkan.</td></tr>`;
            return;
        }

        filtered.forEach((it, idx) => {
            const tr = document.createElement('tr');
            tr.id = 'scraped-row-' + it.id;
            tr.classList.add('dm-row-clickable');
            tr.title = 'Klik baris ini untuk melihat titik lokasi di peta';
            tr.onclick = (e) => {
                if (!e.target.closest('a') && !e.target.closest('button')) {
                    if (window.mapEngine && window.mapEngine.map && it.lat && it.lng) {
                        window.mapEngine.map.flyTo([it.lat, it.lng], 16, { duration: 0.6 });
                    }
                }
            };
            const waUrl = window.TemplateManager ? window.TemplateManager.getWhatsAppUrl(it) : '#';

            const opps = this.detectOpportunities(it);
            const oppBadgesHtml = opps.slice(0, 2).map(o => `<span class="opp-badge ${o.badgeClass}" title="${this.escapeText(o.reason)}">${this.escapeText(o.badge)}</span>`).join(' ');
            const source = this.sourceForItem(it);
            const metrics = this.metricsForItem(it);
            const metricsText = [metrics.ratingAvailable ? `${it.rating} / 5` : 'Rating tidak tersedia', metrics.reviewsAvailable ? `${it.reviews_count} ulasan` : 'Ulasan tidak tersedia'].join(' · ');

            const multiChannelHtml = `
                <div class="lead-data-verification">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 5px;">
                        <span class="badge-clean-status" title="Atribusi mengikuti sumber; belum diverifikasi independen">
                            <i class="fa-solid fa-database" style="color: #2563eb; font-size: 0.75rem;"></i> ${this.escapeText(source.source_name)}
                        </span>
                        <button class="btn-view-detail" data-id="${it.id}" title="Klik untuk membuka rincian sumber data bisnis">
                            <i class="fa-solid fa-circle-info"></i> Rincian Data
                        </button>
                    </div>
                    <div class="lead-checklist-tags">
                        <span class="tag-clean">${it.phone && it.phone !== '-' ? 'Nomor tercantum' : 'Kontak tidak tersedia'}</span>
                        <span class="tag-clean">WhatsApp perlu verifikasi</span>
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px;">
                        ${oppBadgesHtml}
                    </div>
                </div>
            `;

            const rawPhone = (it.phone || '').trim();
            const cleanDigits = rawPhone.replace(/[^0-9]/g, '');
            let intl = cleanDigits;
            if (intl.startsWith('0')) intl = '62' + intl.substring(1);
            const isMobile = intl.startsWith('628') && intl.length >= 10 && intl.length <= 14;
            const hasPhone = rawPhone && rawPhone !== '-' && rawPhone.length >= 6;

            let phoneDisplay = `<span style="color: #94a3b8;">-</span>`;
            if (hasPhone) {
                if (isMobile) {
                    phoneDisplay = `<a href="${this.escapeText(waUrl)}" target="_blank" rel="noopener" style="color: #16a34a; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;" title="Coba WhatsApp; akun aktif belum diverifikasi"><i class="fa-brands fa-whatsapp"></i> ${this.escapeText(it.phone)}</a>`;
                } else {
                    phoneDisplay = `<a href="tel:${cleanDigits}" style="color: #2563eb; font-weight: 500; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;" title="Nomor telepon dari sumber"><i class="fa-solid fa-phone"></i> ${this.escapeText(it.phone)}</a>`;
                }
            }

            let webDisplay = `<span style="color: #94a3b8;">-</span>`;
            if (it.social_media && it.social_media !== '-') {
                const web = it.social_media;
                const isInsta = web.includes('instagram.com') || web.startsWith('@');
                const targetUrl = web.startsWith('http') ? web : (isInsta ? `https://${web.replace(/^@/, 'instagram.com/')}` : `https://${web}`);
                const icon = isInsta ? '<i class="fa-brands fa-instagram" style="color: #e1306c;"></i>' : '<i class="fa-solid fa-globe" style="color: #2563eb;"></i>';
                if (/^https?:\/\//i.test(targetUrl)) webDisplay = `<a href="${this.escapeText(targetUrl)}" target="_blank" rel="noopener" style="color: #2563eb; text-decoration: none; font-size: 0.72rem;" title="${this.escapeText(web)}">${icon} ${this.escapeText(web.replace(/^https?:\/\//, '').substring(0, 20))}${web.length > 20 ? '...' : ''}</a>`;
            }

            const hoursDisplay = (it.opening_hours && it.opening_hours !== '-')
                ? `<span style="font-size: 0.72rem; color: #475569; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-regular fa-clock" style="color: #94a3b8; font-size: 0.68rem;"></i> ${this.escapeText(it.opening_hours)}</span>`
                : `<span style="color: #94a3b8;">-</span>`;

            const waBtn = isMobile
                ? `<a href="${waUrl}" target="_blank" class="btn btn-wa btn-sm" title="Chat WhatsApp Langsung"><i class="fa-brands fa-whatsapp"></i> WA</a>`
                : `<button class="btn btn-outline btn-sm" disabled style="opacity: 0.35; cursor: not-allowed; font-size: 0.72rem;" title="Tidak ada nomor WhatsApp terdaftar"><i class="fa-brands fa-whatsapp"></i> WA</button>`;

            tr.innerHTML = `
                <td style="width: 30px; text-align: center;">${idx + 1}</td>
                <td>
                    <div style="font-weight: 700; color: #0f172a;">${this.escapeText(it.name)}</div>
                    <div style="font-size: 0.72rem; color: #64748b;">${this.escapeText(it.category)}</div>
                </td>
                <td style="min-width: 180px;">
                    ${multiChannelHtml}
                </td>
                <td style="max-width: 170px; font-size: 0.74rem;">${this.escapeText(it.address)}</td>
                <td style="white-space: nowrap; font-size: 0.76rem;">${phoneDisplay}</td>
                <td style="font-size: 0.72rem;">${webDisplay}</td>
                <td style="font-size: 0.72rem;">${hoursDisplay}</td>
                <td style="font-weight: 700; color: #64748b; white-space: nowrap;">${this.escapeText(metricsText)}</td>
                <td style="text-align: right; white-space: nowrap;">
                    <div style="display: inline-flex; gap: 4px;">
                        <button class="btn btn-outline btn-sm btn-quick-copy" title="Salin Pesan Penawaran Terpersonalisasi" data-id="${it.id}">
                            <i class="fa-solid fa-copy"></i> Salin
                        </button>
                        <button class="btn btn-sm btn-open-gemini-pitch" title="Analisis Celah & Buat Naskah Outreach" data-id="${it.id}" style="background: #0f172a; color: #ffffff; border: 1px solid #0f172a; font-size: 0.74rem; font-weight: 600; padding: 4px 8px; border-radius: 6px;">
                            <i class="fa-solid fa-bullseye"></i> Peluang &amp; Pitch
                        </button>
                        ${waBtn}
                    </div>
                </td>
            `;

            // Open Business Detail Modal (Rincian Data)
            const btnDetail = tr.querySelector('.btn-view-detail') || tr.querySelector('.btn-view-360');
            if (btnDetail) {
                btnDetail.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.open360InsightModal(it);
                });
            }

            // Quick Copy Handler
            tr.querySelector('.btn-quick-copy').addEventListener('click', () => {
                const pitch = window.TemplateManager ? window.TemplateManager.getPersonalizedMessage(it) : `Halo ${it.name}, kami dari tim cliento.`;
                navigator.clipboard.writeText(pitch);
                this.showToast(`✓ Pesan penawaran untuk ${it.name} berhasil disalin!`);
            });

            // Open Gemini AI Pitch Modal
            tr.querySelector('.btn-open-gemini-pitch').addEventListener('click', () => {
                this.openAIPitchModal(it);
            });

            tbody.appendChild(tr);
        });
    },

    // ----------------------------------------------------
    // 7. WHATSAPP OUTREACH & GEMINI AI SALES PITCH MODAL
    // ----------------------------------------------------
    uploadedPromoImage: null,

    bindAIPitchModal() {
        // Tab Switchers
        const tabStandard = document.getElementById('tab-btn-standard');
        const tabGemini = document.getElementById('tab-btn-gemini');
        const panelStandard = document.getElementById('outreach-panel-standard');
        const panelGemini = document.getElementById('outreach-panel-gemini');
        const btnQuickSwitch = document.getElementById('btn-quick-switch-to-ai');

        const switchTab = (mode) => {
            if (mode === 'standard') {
                tabStandard.classList.add('active');
                tabGemini.classList.remove('active');
                panelStandard.style.display = 'block';
                panelGemini.style.display = 'none';
            } else {
                tabGemini.classList.add('active');
                tabStandard.classList.remove('active');
                panelGemini.style.display = 'block';
                panelStandard.style.display = 'none';
            }
        };

        if (tabStandard && tabGemini) {
            tabStandard.addEventListener('click', () => switchTab('standard'));
            tabGemini.addEventListener('click', () => switchTab('gemini'));
        }
        if (btnQuickSwitch) {
            btnQuickSwitch.addEventListener('click', () => switchTab('gemini'));
        }

        // Standard Panel Controls
        const standardGreeting = document.getElementById('standard-greeting-select');
        if (standardGreeting) {
            standardGreeting.addEventListener('change', () => this.updateStandardPitchText());
        }

        const btnCopyStandard = document.getElementById('btn-copy-standard-output');
        if (btnCopyStandard) {
            btnCopyStandard.addEventListener('click', () => {
                const text = document.getElementById('standard-pitch-output')?.value;
                if (text) {
                    navigator.clipboard.writeText(text);
                    this.showToast('✓ Template pesan WhatsApp berhasil disalin!');
                }
            });
        }

        // Gemini AI Controls
        const btnRun = document.getElementById('btn-run-gemini-pitch');
        const btnCopyAI = document.getElementById('btn-copy-ai-output');
        const btnSaveAITemplate = document.getElementById('btn-save-ai-to-templates');

        if (btnRun) {
            btnRun.addEventListener('click', () => this.generateGeminiPitch());
        }

        if (btnCopyAI) {
            btnCopyAI.addEventListener('click', () => {
                const text = document.getElementById('ai-pitch-output')?.value;
                if (text) {
                    navigator.clipboard.writeText(text);
                    this.showToast('✓ Pesan AI Closing berhasil disalin ke clipboard!');
                }
            });
        }

        if (btnSaveAITemplate) {
            btnSaveAITemplate.addEventListener('click', () => {
                const text = document.getElementById('ai-pitch-output')?.value;
                if (text && window.TemplateManager) {
                    const cat = this.activeModalItem?.category || 'Umum';
                    window.TemplateManager.templatesMap[cat] = {
                        category_name: cat,
                        greeting_type: 'formal',
                        message_body: text
                    };
                    this.showToast(`✓ Pesan berhasil disimpan ke template kategori ${cat}!`);
                }
            });
        }

        // Multimodal Promo Image Upload & Drag-and-Drop
        const dropzone = document.getElementById('promo-image-dropzone');
        const fileInput = document.getElementById('promo-image-file');
        const previewCard = document.getElementById('promo-image-preview-card');
        const previewThumb = document.getElementById('promo-image-thumb');
        const previewFilename = document.getElementById('promo-image-filename');
        const btnRemoveImage = document.getElementById('btn-remove-promo-image');

        if (dropzone && fileInput) {
            dropzone.addEventListener('click', () => fileInput.click());

            dropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropzone.classList.add('dragover');
            });

            dropzone.addEventListener('dragleave', () => {
                dropzone.classList.remove('dragover');
            });

            dropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropzone.classList.remove('dragover');
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    this.handlePromoImageFile(e.dataTransfer.files[0]);
                }
            });

            fileInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    this.handlePromoImageFile(e.target.files[0]);
                }
            });
        }

        if (btnRemoveImage) {
            btnRemoveImage.addEventListener('click', () => {
                this.uploadedPromoImage = null;
                if (fileInput) fileInput.value = '';
                if (previewCard) previewCard.style.display = 'none';
                if (dropzone) dropzone.style.display = 'block';
                this.showToast('Foto brosur promosi dihapus');
            });
        }

        // Connect button from Template Management page
        const btnOpenAITemplate = document.getElementById('btn-open-ai-template-gen');
        if (btnOpenAITemplate) {
            btnOpenAITemplate.addEventListener('click', () => {
                const dummyItem = {
                    name: 'Nama Bisnis Calon Klien',
                    category: window.TemplateManager?.activeCategory || 'Cafe & Coffee Shop',
                    address: 'Kota Magelang',
                    rating: null,
                    reviews_count: 0,
                    phone: ''
                };
                this.openAIPitchModal(dummyItem, 'gemini');
            });
        }
    },

    handlePromoImageFile(file) {
        if (!file.type.startsWith('image/')) {
            alert('Silakan pilih file gambar (JPG, PNG, atau WebP)');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            this.uploadedPromoImage = {
                dataUrl: dataUrl,
                base64: dataUrl,
                mime: file.type,
                filename: file.name
            };

            const dropzone = document.getElementById('promo-image-dropzone');
            const previewCard = document.getElementById('promo-image-preview-card');
            const previewThumb = document.getElementById('promo-image-thumb');
            const previewFilename = document.getElementById('promo-image-filename');

            if (previewThumb) previewThumb.src = dataUrl;
            if (previewFilename) previewFilename.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
            if (dropzone) dropzone.style.display = 'none';
            if (previewCard) previewCard.style.display = 'flex';

            this.showToast('✓ Gambar flyer/brosur berhasil dimuat! Siap dianalisis Gemini AI.');
        };
        reader.readAsDataURL(file);
    },

    detectOpportunities(item) {
        if (!item) return [];
        const opps = [];

        // 1. Website Check
        const web = (item.website || item.social_media || '').trim();
        const hasRealWebsite = web && web !== '-' && web !== 'null' && (web.includes('.') && !web.startsWith('@'));
        if (!hasRealWebsite) {
            opps.push({
                id: 'no_web',
                badge: 'Tanpa Website',
                badgeClass: 'opp-badge-danger',
                title: 'Jasa Pembuatan Website & Landing Page',
                reason: 'Data audit mendeteksi bisnis ini belum memiliki website/landing page resmi. Calon pembeli kesulitan mengecek portofolio dan menu.',
                solution: 'Pembuatan landing page mobile-friendly satu halaman dengan tombol langsung WhatsApp & peta.',
                service: 'Jasa Pembuatan Website & Landing Page Profesional',
                pain: 'Belum memiliki website resmi atau portofolio digital sehingga calon pembeli ragu',
                pitchHook: 'kami perhatikan profil bisnis kakak di Google belum tertaut dengan website/landing page resmi. Banyak calon pembeli ragu bertransaksi karena tidak bisa melihat portofolio/menu lengkap',
                pitchSolution: 'kami bisa bantu siapkan Landing Page modern yang ringan dan langsung terhubung ke chat WhatsApp'
            });
        }

        // 2. Rating Check
        const ratingNum = parseFloat(item.rating) || 0;
        if (ratingNum > 0 && ratingNum < 4.2) {
            opps.push({
                id: 'low_rating',
                badge: `Rating Rendah (${ratingNum.toFixed(1)})`,
                badgeClass: 'opp-badge-warning',
                title: 'Manajemen Reputasi & Review Positif',
                reason: `Rating tercatat ${ratingNum.toFixed(1)} dari 5.0 (di bawah rata-rata aman 4.2). Konsumen cenderung memilih tempat dengan rating 4.5+.`,
                solution: 'Sistem pengumpulan ulasan bintang 5 organik dari pelanggan puas.',
                service: 'Jasa Optimasi Google Maps & Review Booster',
                pain: 'Jumlah ulasan masih sedikit atau ada review negatif yang belum ditangani profesional',
                pitchHook: `kami melihat rating toko saat ini di angka ${ratingNum.toFixed(1)}. Padahal dengan sedikit penataan respon ulasan dan filter komplain, reputasi bisa cepat naik ke 4.7+`,
                pitchSolution: 'kami ada metode otomatisasi ulasan positif organik dari pelanggan yang puas agar rating toko kakak pulih maksimal'
            });
        }

        // 3. Review Count Check
        const revCount = parseInt(item.reviews_count) || 0;
        if (this.metricsForItem(item).reviewsAvailable && ratingNum > 0 && revCount < 25 && ratingNum >= 4.2) {
            opps.push({
                id: 'low_reviews',
                badge: `Ulasan Sedikit (${revCount})`,
                badgeClass: 'opp-badge-info',
                title: 'Optimasi Google Maps & Review Booster',
                reason: `Jumlah ulasan baru tercatat ${revCount} ulasan. Google Maps memprioritaskan bisnis dengan ulasan aktif di pencarian teratas.`,
                solution: 'Optimasi listing peta dan booster ulasan bintang 5 organik.',
                service: 'Jasa Optimasi Google Maps & Review Booster',
                pain: 'Peringkat Google Maps belum di 3 besar & kompetitor di sekitar lebih ramai pengunjung',
                pitchHook: `data rating dan ulasan Google toko kakak belum lengkap pada sumber yang tersedia (tercatat ${revCount} ulasan). Kelengkapan profil resmi tetap membantu calon pembeli`,
                pitchSolution: 'kami bantu optimasi profil Google Maps dan booster ulasan bintang 5 organik agar toko kakak selalu muncul di pencarian teratas'
            });
        }

        // 4. WhatsApp / Mobile CS Check
        const rawPhone = (item.phone || '').trim();
        const digits = rawPhone.replace(/[^0-9]/g, '');
        let intl = digits;
        if (intl.startsWith('0')) intl = '62' + intl.substring(1);
        const isMobileWA = intl.startsWith('628') && intl.length >= 10 && intl.length <= 14;
        const hasAnyPhone = digits.length >= 6;

        if (!isMobileWA) {
            opps.push({
                id: 'no_wa_cs',
                badge: hasAnyPhone ? 'Telepon Kantor' : 'Tanpa Kontak WA',
                badgeClass: 'opp-badge-warning',
                title: 'Setup WhatsApp Bisnis & Chat CS',
                reason: hasAnyPhone 
                    ? `Nomor kontak terdaftar adalah telepon kantor (${rawPhone}). Konsumen modern lebih memilih chat WhatsApp.`
                    : 'Belum ada nomor kontak yang dapat dihubungi pelanggan langsung dari direktori digital.',
                solution: 'Setup WhatsApp Business resmi dan integrasi tombol chat di profil online.',
                service: 'Sistem POS Kasir Online & Manajemen Usaha',
                pain: 'Ingin omset naik drastis tapi hemat biaya iklan berbayar yang mahal',
                pitchHook: hasAnyPhone 
                    ? `nomor kontak yang tertera di peta masih nomor telepon kantor (${rawPhone}). Padahal lebih dari 85% pembeli sekarang enggan telepon pulsa dan maunya langsung klik chat WhatsApp` 
                    : 'kontak langsung pemesanan belum terhubung di peta sehingga calon pembeli sering batal transaksi',
                pitchSolution: 'kami bantu setup jalur chat WhatsApp Bisnis otomatis dan integrasi tombol pesan langsung agar konversi penjualan naik'
            });
        }

        // 5. Operating Hours Check
        const hours = (item.opening_hours || '').trim();
        const hasHours = hours && hours !== '-' && hours !== 'null';
        if (!hasHours) {
            opps.push({
                id: 'missing_hours',
                badge: 'Jam Operasional Belum Ada',
                badgeClass: 'opp-badge-neutral',
                title: 'Verifikasi & Jam Buka Profil Bisnis',
                reason: 'Jam operasional buka/tutup tidak terdata pada peta.',
                solution: 'Audit kelengkapan info Google Business Profile dan verifikasi jam buka.',
                service: 'Jasa Optimasi Google Maps & Review Booster',
                pain: 'Kompetitor lokal lebih ramai di jam sibuk & ranking Google Maps belum #1',
                pitchHook: 'jam operasional toko belum lengkap tercantum di Google Maps. Calon pelanggan berisiko ragu datang karena takut toko sedang tutup',
                pitchSolution: 'kami bantu audit dan rapikan informasi profil Google Maps secara komprehensif termasuk jam buka, foto, dan atribut fasilitas'
            });
        }

        // 6. Fallback if business has no severe gaps
        if (opps.length === 0) {
            opps.push({
                id: 'scale_growth',
                badge: 'Peluang Scaling Iklan',
                badgeClass: 'opp-badge-success',
                title: 'Perluasan Pasar & Iklan Digital',
                reason: ratingNum > 0 ? `Profil bisnis ini tercatat ${ratingNum.toFixed(1)} bintang pada sumber yang tersedia. Peluang saat ini adalah ekspansi penjualan melalui targeted traffic.` : 'Rating Google tidak tersedia pada data ini; peluang saat ini adalah ekspansi penjualan melalui targeted traffic.',
                solution: 'Pengelolaan kampanye iklan digital tertarget lokal untuk melipatgandakan omset.',
                service: 'Jasa Kelola Media Sosial & Iklan Berbayar',
                pain: 'Ingin omset naik drastis tapi hemat biaya iklan berbayar yang mahal',
                pitchHook: `kami perhatikan profil bisnis ${item.name} sudah sangat rapi dan punya reputasi unggul di kawasan ini. Ini momen tepat untuk melipatgandakan jangkauan ke konsumen baru`,
                pitchSolution: 'kami ingin menawarkan kemitraan strategi kampanye iklan digital tertarget agar omset harian bisa scale up lebih cepat'
            });
        }

        // Mark the first one (highest priority) as default checked
        opps[0].defaultChecked = true;

        return opps;
    },

    renderOpportunityChecklist() {
        const oppContainer = document.getElementById('opp-checklist-container');
        const oppBadgeCount = document.getElementById('opp-count-badge');
        if (!oppContainer || !this.detectedOpportunities) return;

        if (oppBadgeCount) {
            oppBadgeCount.textContent = `${this.detectedOpportunities.length} Celah Terdeteksi`;
        }

        oppContainer.innerHTML = this.detectedOpportunities.map((opp) => `
            <label class="opp-item-row ${opp.defaultChecked ? 'is-selected' : ''}" data-opp-id="${opp.id}">
                <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
                    <input type="checkbox" class="opp-checkbox" data-opp-id="${opp.id}" ${opp.defaultChecked ? 'checked' : ''}>
                    <span class="opp-title" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${opp.title}</span>
                </div>
                <span class="opp-badge ${opp.badgeClass}">${opp.badge}</span>
            </label>
        `).join('');

        oppContainer.querySelectorAll('.opp-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const row = e.target.closest('.opp-item-row');
                if (row) {
                    row.classList.toggle('is-selected', e.target.checked);
                }
                this.syncSelectedOpportunities();
            });
        });

        // Initialize selected opportunities
        this.selectedOpportunities = this.detectedOpportunities.filter(o => o.defaultChecked);
    },

    syncSelectedOpportunities() {
        const checkedBoxes = Array.from(document.querySelectorAll('#opp-checklist-container .opp-checkbox:checked'));
        const checkedIds = checkedBoxes.map(cb => cb.getAttribute('data-opp-id'));
        this.selectedOpportunities = (this.detectedOpportunities || []).filter(o => checkedIds.includes(o.id));

        // Sync with primary pain & service selects
        if (this.selectedOpportunities.length > 0) {
            const primary = this.selectedOpportunities[0];
            const painSelect = document.getElementById('ai-modal-pain-select');
            const serviceSelect = document.getElementById('ai-modal-service-select');
            if (painSelect && primary.pain) {
                for (let i = 0; i < painSelect.options.length; i++) {
                    if (painSelect.options[i].value.includes(primary.pain.substring(0, 20)) || primary.pain.includes(painSelect.options[i].value.substring(0, 20))) {
                        painSelect.selectedIndex = i;
                        break;
                    }
                }
            }
            if (serviceSelect && primary.service) {
                for (let i = 0; i < serviceSelect.options.length; i++) {
                    if (serviceSelect.options[i].value.includes(primary.service.substring(0, 15)) || primary.service.includes(serviceSelect.options[i].value.substring(0, 15))) {
                        serviceSelect.selectedIndex = i;
                        break;
                    }
                }
            }
        }

        // Re-generate standard pitch
        this.updateStandardPitchText();
    },

    openAIPitchModal(item, initialMode = 'standard') {
        this.activeModalItem = item;
        const modal = document.getElementById('modal-ai-pitch');
        const bizName = document.getElementById('ai-modal-biz-name');
        const bizMeta = document.getElementById('ai-modal-biz-meta');
        const inputBizName = document.getElementById('ai-input-biz-name');
        const statusEl = document.getElementById('ai-pitch-status');
        const tabStandard = document.getElementById('tab-btn-standard');
        const tabGemini = document.getElementById('tab-btn-gemini');
        const panelStandard = document.getElementById('outreach-panel-standard');
        const panelGemini = document.getElementById('outreach-panel-gemini');

        if (bizName) bizName.textContent = item.name;
        if (inputBizName) inputBizName.value = item.name;
        if (bizMeta) bizMeta.textContent = `${item.category} • ${item.address} • Rating ${item.rating} (${item.reviews_count || '0'} ulasan)`;
        if (statusEl) statusEl.textContent = '';

        // Reset promo image if modal opened afresh
        this.uploadedPromoImage = null;
        const fileInput = document.getElementById('promo-image-file');
        const previewCard = document.getElementById('promo-image-preview-card');
        const dropzone = document.getElementById('promo-image-dropzone');
        if (fileInput) fileInput.value = '';
        if (previewCard) previewCard.style.display = 'none';
        if (dropzone) dropzone.style.display = 'block';

        // Detect Data-Driven Opportunities and Render Checklist
        this.detectedOpportunities = this.detectOpportunities(item);
        this.renderOpportunityChecklist();

        // Update standard template text with detected opportunity
        this.updateStandardPitchText();

        // Switch to appropriate tab
        if (initialMode === 'gemini') {
            tabGemini?.classList.add('active');
            tabStandard?.classList.remove('active');
            if (panelGemini) panelGemini.style.display = 'block';
            if (panelStandard) panelStandard.style.display = 'none';
        } else {
            tabStandard?.classList.add('active');
            tabGemini?.classList.remove('active');
            if (panelStandard) panelStandard.style.display = 'block';
            if (panelGemini) panelGemini.style.display = 'none';
        }

        if (modal) modal.classList.add('active');
    },

    updateStandardPitchText() {
        if (!this.activeModalItem) return;
        const item = this.activeModalItem;
        const outputBox = document.getElementById('standard-pitch-output');
        const waBtn = document.getElementById('btn-wa-standard-output');
        const greetingSelect = document.getElementById('standard-greeting-select');
        const greetingType = greetingSelect ? greetingSelect.value : 'formal';

        let greetingText = `Hallo kak dgn pemilik/manajemen *${item.name}*?`;
        if (greetingType === 'humas') {
            greetingText = `Selamat siang bapak/ibu bagian manajemen & kemitraan *${item.name}*.`;
        } else if (greetingType === 'casual') {
            greetingText = `Halo kak *${item.name}*! Salam kenal dari tim cliento.`;
        }

        const selected = (this.selectedOpportunities && this.selectedOpportunities.length > 0)
            ? this.selectedOpportunities
            : (this.detectedOpportunities && this.detectedOpportunities.length > 0 ? [this.detectedOpportunities[0]] : []);

        let body = '';
        if (selected.length === 1) {
            const opp = selected[0];
            body = `${greetingText}\n\nKami melihat informasi publik usaha kakak di ${item.address} (rating: ${item.rating || 'belum tersedia dari sumber'}). Dari data yang tersedia, ${opp.pitchHook}.\n\nKebetulan di tim kami, ${opp.pitchSolution}.\n\nKira-kira jika kami kirimkan ringkasan solusi singkatnya via WhatsApp ini, boleh kak? Terima kasih.`;
        } else if (selected.length > 1) {
            // Bundled multi-opportunity pitch!
            const hooks = selected.map((o, i) => `${i + 1}. ${o.pitchHook}`).join('\n');
            body = `${greetingText}\n\nKami mengamati potensi pasar bisnis kakak di ${item.address}. Berdasarkan audit data kami, ada ${selected.length} celah peluang yang bisa dioptimalkan:\n\n${hooks}\n\nSolusi dari tim kami dapat mengintegrasikan perbaikan tersebut dalam satu paket efisien.\n\nKira-kira berkenan jika kami kirimkan gambaran solusi ringkasnya via chat ini kak? Terima kasih.`;
        } else {
            body = `${greetingText}\n\nKami mengamati reputasi bisnis *${item.name}* di ${item.address}. Kami ingin sharing solusi ringkas untuk meningkatkan kunjungan pelanggan lokal secara terarah.\n\nKira-kira boleh kami kirimkan ringkasannya via WhatsApp ini kak? Terima kasih.`;
        }

        if (outputBox) outputBox.value = body;

        let phone = (item.phone || '').replace(/[^0-9]/g, '');
        if (phone.startsWith('0')) phone = '62' + phone.substring(1);
        else if (!phone.startsWith('62') && phone.length > 8) phone = '62' + phone;

        if (waBtn) {
            waBtn.href = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(body)}`;
        }
    },

    async generateGeminiPitch() {
        if (!this.activeModalItem) return;

        const btnRun = document.getElementById('btn-run-gemini-pitch');
        const outputBox = document.getElementById('ai-pitch-output');
        const statusEl = document.getElementById('ai-pitch-status');
        const waBtn = document.getElementById('btn-wa-ai-output');

        const bizNameInput = document.getElementById('ai-input-biz-name');
        const targetBizName = bizNameInput && bizNameInput.value.trim() ? bizNameInput.value.trim() : this.activeModalItem.name;
        const service = document.getElementById('ai-modal-service-select')?.value || 'Jasa Optimasi Google Maps & Review Booster';
        const painPoint = document.getElementById('ai-modal-pain-select')?.value || 'Peringkat Google Maps belum di 3 besar & kompetitor di sekitar lebih ramai';
        const offer = document.getElementById('ai-modal-offer-input')?.value || 'Free Audit Profil Google Maps 10 Menit & Diskon Promo 50%';
        const tone = document.getElementById('ai-modal-tone-select')?.value || 'Hangat, Sopan & Profesional';

        const selectedOpps = (this.selectedOpportunities && this.selectedOpportunities.length > 0)
            ? this.selectedOpportunities
            : (this.detectedOpportunities && this.detectedOpportunities.length > 0 ? [this.detectedOpportunities[0]] : []);

        if (btnRun) {
            btnRun.disabled = true;
            btnRun.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gemini AI Sedang Menganalisis & Meracik Pesan...';
        }
        if (statusEl) {
            statusEl.textContent = 'Gemini AI sedang membaca data & menganalisis psikologi closing...';
            statusEl.style.color = '#2563eb';
        }

        try {
            const payload = {
                action: 'generate_pitch',
                business_name: targetBizName,
                category: this.activeModalItem.category,
                address: this.activeModalItem.address,
                rating: this.activeModalItem.rating,
                reviews_count: this.activeModalItem.reviews_count || 0,
                has_website: !!(this.activeModalItem.social_media && this.activeModalItem.social_media.includes('.')),
                my_service: service,
                my_offer: offer,
                pain_point: painPoint,
                tone: tone,
                selected_opportunities: selectedOpps.map(o => ({
                    id: o.id,
                    badge: o.badge,
                    title: o.title,
                    reason: o.reason,
                    solution: o.solution
                }))
            };

            // Attach image if uploaded
            if (this.uploadedPromoImage && this.uploadedPromoImage.base64) {
                payload.image_base64 = this.uploadedPromoImage.base64;
                payload.image_mime = this.uploadedPromoImage.mime;
            }

            let data = null;
            const isStaticHost = window.location.hostname.includes('github.io') || window.location.protocol === 'file:';

            if (!isStaticHost) {
                try {
                    const res = await fetch('api/gemini.php?action=generate_pitch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    if (res.ok) {
                        data = await res.json();
                    }
                } catch (netErr) {
                    console.warn('Gemini API network error, fallback to client pitch generator...', netErr);
                }
            }

            if (!data || !data.success || !data.pitch) {
                data = this.generateStaticPitch(payload);
            }

            if (data.success && data.pitch) {
                if (outputBox) outputBox.value = data.pitch;
                if (statusEl) {
                    statusEl.textContent = data.has_image ? '✓ Sukses diracik oleh Gemini Vision (Teks + Analisis Flyer)!' : '✓ Berhasil diracik oleh Gemini AI!';
                    statusEl.style.color = '#16a34a';
                }

                // Update WhatsApp button with generated AI text
                let phone = (this.activeModalItem.phone || '').replace(/[^0-9]/g, '');
                if (phone.startsWith('0')) phone = '62' + phone.substring(1);
                else if (!phone.startsWith('62') && phone.length > 8) phone = '62' + phone;

                if (waBtn) waBtn.href = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(data.pitch)}`;
                this.showToast('✓ Naskah closing AI berhasil diracik!');
            } else {
                alert('Gagal generate: ' + (data.message || 'Terjadi kesalahan'));
            }
        } catch (e) {
            alert('Kesalahan koneksi AI: ' + e.message);
        } finally {
            if (btnRun) {
                btnRun.disabled = false;
                btnRun.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Racik Naskah Closing Otomatis dengan Gemini AI';
            }
        }
    },

    showToast(message) {
        let toast = document.getElementById('app-toast-alert');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'app-toast-alert';
            toast.style.cssText = 'position:fixed; bottom:24px; right:24px; background:#0f172a; color:#ffffff; padding:10px 18px; border-radius:8px; font-size:0.8rem; font-family:"Poppins",sans-serif; z-index:9999; box-shadow:0 8px 20px rgba(0,0,0,0.18); transition:all 0.3s; opacity:0; transform:translateY(10px); pointer-events:none;';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
        }, 2800);
    },

    // ----------------------------------------------------
    // 8. 360° MULTI-CHANNEL LEAD INTELLIGENCE MODAL
    // ----------------------------------------------------
    open360InsightModal(item) {
        this.activeModalItem = item;
        const modal = document.getElementById('modal-360-insight');
        if (!modal) return;
        const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
        const source = this.sourceForItem(item);
        set('insight-modal-category', item.category || 'Usaha Lokal');
        set('insight-modal-biz-name', item.name);
        set('insight-modal-address', item.address || 'Alamat tidak tersedia');
        set('insight-modal-wa-badge', item.phone && item.phone !== '-' ? item.phone + ' (akun WA belum diverifikasi)' : 'Kontak tidak tersedia');
        set('insight-source-title', source.source_name);
        set('insight-source-provenance', [source.source_name, source.source_url, source.license || source.usage_basis, source.observed_at].filter(Boolean).join(' · '));
        set('insight-alpha-rating', this.metricsForItem(item).ratingAvailable ? item.rating + ' / 5' : 'Tidak tersedia');
        set('insight-alpha-reviews', this.metricsForItem(item).reviewsAvailable ? item.reviews_count + ' ulasan' : 'Tidak tersedia');
        set('insight-alpha-status', 'Data sesuai sumber'); set('insight-alpha-popularity', 'Tidak dinilai');
        set('insight-alpha-summary', item.rating > 0 ? 'Rating dan jumlah ulasan tercantum pada saat pengambilan data Google Maps.' : 'Rating atau jumlah ulasan tidak terbaca pada sumber.');
        set('insight-beta-sentiment', item.phone && item.phone !== '-' ? 'Nomor tercantum' : 'Tidak tersedia');
        set('insight-beta-price', 'Tidak dinilai'); set('insight-beta-satisfaction', 'Tidak dinilai'); set('insight-beta-recommend', 'Perlu verifikasi manual');
        set('insight-beta-summary', 'Nomor seluler tidak membuktikan akun WhatsApp aktif. Hanya gunakan kontak yang tercantum pada sumber.');
        set('insight-gamma-gps', item.lat != null && item.lng != null ? item.lat + ', ' + item.lng : 'Koordinat tidak tersedia');
        set('insight-gamma-zoning', 'Sesuai sumber'); set('insight-gamma-access', 'Tidak dinilai'); set('insight-gamma-cadastral', 'Perlu pemeriksaan peta');
        set('insight-gamma-summary', 'Tidak ada jaminan presisi GPS atau verifikasi batas wilayah dari data ini.');
        const waBtn = document.getElementById('btn-wa-360-direct');
        if (waBtn) { waBtn.style.opacity = '0.5'; waBtn.style.pointerEvents = 'none'; waBtn.title = 'Akun WhatsApp belum diverifikasi'; }
        modal.classList.add('active');
    },
    bind360ModalEvents() {
        const btnJumpAI = document.getElementById('btn-jump-to-ai-pitch');
        const btnCopySummary = document.getElementById('btn-copy-360-summary');
        const modal360 = document.getElementById('modal-360-insight');

        if (btnJumpAI) {
            btnJumpAI.addEventListener('click', () => {
                if (modal360) modal360.classList.remove('active');
                if (this.activeModalItem) {
                    this.openAIPitchModal(this.activeModalItem, 'gemini');
                }
            });
        }

        if (btnCopySummary) {
            btnCopySummary.addEventListener('click', () => {
                if (!this.activeModalItem) return;
                const it = this.activeModalItem;
                const ins = it.insights || {};
                const chA = ins.channel_alpha || {};
                const chB = ins.channel_beta || {};
                const chG = ins.channel_gamma || {};

                const source = this.sourceForItem(it);
                const summaryText = [
                    `Nama Bisnis: ${it.name}`,
                    `Kategori: ${it.category}`,
                    `Alamat: ${it.address}`,
                    `Kontak tercantum: ${it.phone || 'Tidak tersedia'}`,
                    `Rating Google: ${this.metricsForItem(it).ratingAvailable ? it.rating : 'Tidak tersedia'}`,
                    `Jumlah ulasan Google: ${this.metricsForItem(it).reviewsAvailable ? it.reviews_count : 'Tidak tersedia'}`,
                    `Sumber: ${source.source_name || 'Tidak tersedia'}`,
                    source.source_url ? `URL sumber: ${source.source_url}` : '',
                    source.license || source.usage_basis || '',
                    'Akun WhatsApp belum diverifikasi.'
                ].filter(Boolean).join('\n');

                navigator.clipboard.writeText(summaryText);
                this.showToast('Rincian sumber data bisnis berhasil disalin!');
            });
        }
    },

    exportScrapedToExcel() {
        if (!this.scrapedResults || this.scrapedResults.length === 0) {
            alert('Tidak ada data hasil scraping untuk diunduh!');
            return;
        }

        const excelRows = this.scrapedResults.map((item, idx) => ({
            'No': idx + 1,
            'Nama Tempat': item.name,
            'Kategori Usaha': item.category,
            'Lokasi / Alamat': item.address,
            'Telepon Tercantum': item.phone,
            'Tautan Medsos / Web': item.social_media,
            'Jam Operasional': item.opening_hours,
            'Rating Bintang': this.metricsForItem(item).ratingAvailable ? item.rating : '',
            'Jumlah Ulasan': this.metricsForItem(item).reviewsAvailable ? item.reviews_count : '',
            'Sumber Data': this.sourceForItem(item).source_name,
            'URL Sumber': this.sourceForItem(item).source_url || '',
            'Lisensi / Dasar Penggunaan': this.sourceForItem(item).license || this.sourceForItem(item).usage_basis || ''
        }));

        const ws = XLSX.utils.json_to_sheet(excelRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Hasil Scraping');

        const filename = `Scraped_${this.currentQuery.category}_${Date.now()}.xlsx`;
        XLSX.writeFile(wb, filename);
    },

    // ----------------------------------------------------
    // 7. EXCEL EXPORT, ARCHIVES (GOOGLE DRIVE) & HISTORY
    // ----------------------------------------------------
    exportScrapedToExcel() {
        if (!this.scrapedResults || this.scrapedResults.length === 0) {
            alert('Tidak ada data hasil scraping untuk diunduh!');
            return;
        }

        const excelRows = this.scrapedResults.map((item, idx) => ({
            'No': idx + 1,
            'Nama Tempat': item.name,
            'Kategori Usaha': item.category,
            'Lokasi / Alamat': item.address,
            'Telepon Tercantum': item.phone,
            'Tautan Medsos / Web': item.social_media,
            'Jam Operasional': item.opening_hours,
            'Rating Bintang': this.metricsForItem(item).ratingAvailable ? item.rating : '',
            'Jumlah Ulasan': this.metricsForItem(item).reviewsAvailable ? item.reviews_count : '',
            'Sumber Data': this.sourceForItem(item).source_name,
            'URL Sumber': this.sourceForItem(item).source_url || '',
            'Lisensi / Dasar Penggunaan': this.sourceForItem(item).license || this.sourceForItem(item).usage_basis || ''
        }));

        const ws = XLSX.utils.json_to_sheet(excelRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Hasil Scraping');

        const filename = `Scraped_${this.currentQuery.category}_${Date.now()}.xlsx`;
        XLSX.writeFile(wb, filename);
    },

    targetSaveSource: { type: 'current' },

    openSaveArchiveModal(fromHistory = null) {
        if (fromHistory) {
            this.targetSaveSource = {
                type: 'history',
                historyId: fromHistory.id,
                name: fromHistory.query_name
            };
            const defaultName = `${fromHistory.query_name} (${fromHistory.created_at ? fromHistory.created_at.substring(0, 10) : 'Riwayat'})`;
            const nameInput = document.getElementById('save-archive-name-input');
            const titleEl = document.getElementById('save-archive-modal-title');
            if (nameInput) nameInput.value = defaultName;
            if (titleEl) titleEl.textContent = 'Simpan Riwayat ke Arsip (Google Drive)';
        } else {
            if (!this.scrapedResults || this.scrapedResults.length === 0) {
                alert('Belum ada data hasil scraping untuk disimpan!');
                return;
            }
            this.targetSaveSource = { type: 'current' };
            const defaultName = `${(this.currentQuery.category || 'BISNIS').toUpperCase()} - ${this.currentQuery.location || 'Wilayah'} (${new Date().toLocaleDateString('id-ID')})`;
            const nameInput = document.getElementById('save-archive-name-input');
            const titleEl = document.getElementById('save-archive-modal-title');
            if (nameInput) nameInput.value = defaultName;
            if (titleEl) titleEl.textContent = 'Simpan ke Arsip (Google Drive)';
        }

        // Hide inline quick folder creator initially
        const quickContainer = document.getElementById('quick-folder-input-container');
        if (quickContainer) quickContainer.style.display = 'none';

        this.populateArchiveFoldersSelect();

        const modal = document.getElementById('modal-save-archive');
        if (modal) modal.classList.add('active');
    },

    async populateArchiveFoldersSelect(selectedId = null) {
        const select = document.getElementById('save-archive-folder-select');
        if (!select) return;

        select.innerHTML = '<option value="">📁 Root (Arsip Utama)</option>';
        try {
            const res = await fetch('api/archives.php?action=list_all_folders');
            const data = await res.json();
            if (data.success && data.folders) {
                data.folders.forEach(f => {
                    const opt = document.createElement('option');
                    opt.value = f.id;
                    opt.innerHTML = f.label;
                    if (selectedId && parseInt(selectedId) === parseInt(f.id)) {
                        opt.selected = true;
                    }
                    select.appendChild(opt);
                });
            }
        } catch (e) {
            console.error('Failed to populate folders select:', e);
        }

        // Bind quick folder toggle if not yet bound
        const btnToggleQuick = document.getElementById('btn-quick-new-folder-in-modal');
        const quickContainer = document.getElementById('quick-folder-input-container');
        const quickInput = document.getElementById('quick-folder-name-input');
        const btnSaveQuick = document.getElementById('btn-save-quick-folder');

        if (btnToggleQuick && !btnToggleQuick.dataset.bound) {
            btnToggleQuick.dataset.bound = 'true';
            btnToggleQuick.addEventListener('click', () => {
                if (quickContainer) {
                    const isVisible = quickContainer.style.display === 'block';
                    quickContainer.style.display = isVisible ? 'none' : 'block';
                    if (!isVisible && quickInput) {
                        quickInput.value = '';
                        setTimeout(() => quickInput.focus(), 100);
                    }
                }
            });
        }

        if (btnSaveQuick && !btnSaveQuick.dataset.bound) {
            btnSaveQuick.dataset.bound = 'true';
            btnSaveQuick.addEventListener('click', async () => {
                const folderName = quickInput ? quickInput.value.trim() : '';
                if (!folderName) {
                    alert('Nama folder tidak boleh kosong!');
                    return;
                }

                const parentId = select.value ? select.value : null;

                try {
                    const res = await fetch('api/archives.php?action=create_folder', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: folderName, parent_id: parentId })
                    });
                    const d = await res.json();
                    if (d.success) {
                        if (quickContainer) quickContainer.style.display = 'none';
                        await this.populateArchiveFoldersSelect(d.folder.id);
                        this.showToast(`✓ Folder "${folderName}" berhasil dibuat!`);
                    } else {
                        alert('Gagal: ' + d.message);
                    }
                } catch (err) {
                    alert('Kesalahan koneksi: ' + err.message);
                }
            });
        }
    },

    async confirmSaveArchive() {
        const nameInput = document.getElementById('save-archive-name-input');
        const folderSelect = document.getElementById('save-archive-folder-select');
        const name = nameInput ? nameInput.value.trim() : '';
        const folderId = folderSelect && folderSelect.value ? folderSelect.value : null;

        if (!name) {
            alert('Nama simpanan arsip wajib diisi!');
            return;
        }

        const btnConfirm = document.getElementById('btn-confirm-save-archive');
        if (btnConfirm) {
            btnConfirm.disabled = true;
            btnConfirm.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';
        }

        try {
            let data = null;
            const isStaticHost = window.location.hostname.includes('github.io') || window.location.protocol === 'file:';

            if (!isStaticHost) {
                try {
                    let res;
                    if (this.targetSaveSource && this.targetSaveSource.type === 'history') {
                        res = await fetch('api/history.php?action=save_to_archive', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                history_id: this.targetSaveSource.historyId,
                                name: name,
                                folder_id: folderId
                            })
                        });
                    } else if (this.targetSaveSource && this.targetSaveSource.type === 'data_manager') {
                        res = await fetch('api/archives.php?action=save_archive', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                name: name,
                                folder_id: folderId,
                                items: this.targetSaveSource.items || []
                            })
                        });
                    } else {
                        res = await fetch('api/archives.php?action=save_archive', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                name: name,
                                folder_id: folderId,
                                items: this.scrapedResults
                            })
                        });
                    }
                    if (res.ok) {
                        data = await res.json();
                    }
                } catch(netErr) {
                    console.warn('Save archive network error, saving to local storage...', netErr);
                }
            }

            // Fallback for static environments
            if (!data || !data.success) {
                const staticArchives = JSON.parse(localStorage.getItem('cliento_static_archives') || '[]');
                const itemsToSave = (this.targetSaveSource && this.targetSaveSource.type === 'data_manager')
                    ? (this.targetSaveSource.items || [])
                    : (this.scrapedResults || []);
                const newArchive = {
                    id: Date.now(),
                    folder_id: folderId,
                    name: name,
                    total_items: itemsToSave.length,
                    created_at: new Date().toISOString(),
                    items: itemsToSave
                };
                staticArchives.unshift(newArchive);
                localStorage.setItem('cliento_static_archives', JSON.stringify(staticArchives));
                data = { success: true, message: 'Data berhasil disimpan ke arsip!' };
            }

            if (data.success) {
                this.showToast(`✓ ${data.message || 'Data berhasil disimpan ke arsip!'}`);
                document.getElementById('modal-save-archive')?.classList.remove('active');
                if (window.ArchiveManager) {
                    window.ArchiveManager.loadCollectionsView(folderId);
                }
                if (window.App) {
                    window.App.refreshDashboardStats();
                }
            } else {
                alert('Gagal menyimpan: ' + (data.message || 'Terjadi kesalahan'));
            }
        } catch (e) {
            alert('Kesalahan penyimpanan: ' + e.message);
        } finally {
            if (btnConfirm) {
                btnConfirm.disabled = false;
                btnConfirm.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Simpan Data ke Arsip';
            }
        }
    },

    async openHistoryModal() {
        const modal = document.getElementById('modal-history');
        const listEl = document.getElementById('history-list-items');
        if (!modal || !listEl) return;

        modal.classList.add('active');
        listEl.innerHTML = '<div style="padding: 16px; text-align: center; color: #64748b;"><i class="fa-solid fa-spinner fa-spin"></i> Memuat riwayat scraping...</div>';

        try {
            let data = null;
            const isStaticHost = window.location.hostname.includes('github.io') || window.location.protocol === 'file:';

            if (!isStaticHost) {
                try {
                    const res = await fetch('api/history.php?action=list');
                    if (res.ok) {
                        data = await res.json();
                    }
                } catch(netErr) {}
            }

            if (!data || !data.success) {
                const hist = JSON.parse(localStorage.getItem('cliento_static_history') || '[]');
                data = { success: true, history: hist };
            }

            if (data.success && data.history) {
                listEl.innerHTML = '';
                if (data.history.length === 0) {
                    listEl.innerHTML = `
                        <div style="padding: 24px; text-align: center; color: #94a3b8; font-size: 0.8rem;">
                            <i class="fa-solid fa-clock-rotate-left" style="font-size: 1.8rem; margin-bottom: 6px; display: block; color: #cbd5e1;"></i>
                            Belum ada riwayat aktivitas scraping.
                        </div>
                    `;
                    return;
                }

                data.history.forEach(h => {
                    const row = document.createElement('div');
                    row.style.cssText = 'padding: 12px 14px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 0.78rem; transition: background 0.15s;';
                    row.addEventListener('mouseenter', () => row.style.background = '#f8fafc');
                    row.addEventListener('mouseleave', () => row.style.background = 'transparent');

                    row.innerHTML = `
                        <div style="min-width: 0; flex: 1;">
                            <strong style="color: #0f172a; font-size: 0.82rem; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${h.query_name}</strong>
                            <div style="font-size: 0.7rem; color: #64748b; margin-top: 2px;">
                                <span><i class="fa-regular fa-clock"></i> ${h.created_at}</span> • 
                                <span class="badge badge-blue" style="font-size: 0.65rem; padding: 1px 6px;">${h.total_found} kontak</span>
                            </div>
                        </div>
                        <div style="display: flex; gap: 4px; flex-shrink: 0;">
                            <button class="btn btn-primary btn-sm btn-load-hist" style="padding: 4px 8px; font-size: 0.72rem;" title="Buka Data di Tabel">
                                <i class="fa-solid fa-eye"></i> Buka
                            </button>
                            <button class="btn btn-outline btn-sm btn-save-hist" style="padding: 4px 8px; font-size: 0.72rem; color: #2563eb; border-color: #bfdbfe;" title="Simpan ke Folder Arsip Google Drive">
                                <i class="fa-solid fa-folder-plus"></i> Simpan
                            </button>
                            <button class="btn btn-outline btn-sm btn-excel-hist" style="padding: 4px 8px; font-size: 0.72rem; color: #16a34a; border-color: #bbf7d0;" title="Download Excel">
                                <i class="fa-solid fa-file-excel"></i>
                            </button>
                        </div>
                    `;

                    // 1. Load Data
                    row.querySelector('.btn-load-hist').addEventListener('click', async () => {
                        await this.loadHistoryItems(h.id, h.query_name);
                        modal.classList.remove('active');
                    });

                    // 2. Simpan ke Arsip
                    row.querySelector('.btn-save-hist').addEventListener('click', () => {
                        this.openSaveArchiveModal(h);
                    });

                    // 3. Download Excel
                    row.querySelector('.btn-excel-hist').addEventListener('click', () => {
                        this.exportHistoryToExcel(h.id, h.query_name);
                    });

                    listEl.appendChild(row);
                });
            }
        } catch (e) {
            listEl.innerHTML = '<div style="padding: 12px; color: #ef4444;">Gagal memuat riwayat: ' + e.message + '</div>';
        }
    },

    async exportHistoryToExcel(historyId, queryName) {
        try {
            const res = await fetch(`api/history.php?action=get_items&history_id=${historyId}`);
            const data = await res.json();
            if (data.success && data.items && data.items.length > 0) {
                const excelRows = data.items.map((item, idx) => ({
                    'No': idx + 1,
                    'Nama Tempat': item.name,
                    'Kategori': item.category,
                    'Alamat Lengkap': item.address,
                    'Telepon Tercantum': item.phone,
                    'Website': item.website || item.social_media || '',
                    'Rating': this.metricsForItem(item).ratingAvailable ? item.rating : '',
                    'Jumlah Ulasan': this.metricsForItem(item).reviewsAvailable ? item.reviews_count : '',
                    'Jam Operasional': item.opening_hours,
                    'Sumber Data': this.sourceForItem(item).source_name,
                    'URL Sumber': this.sourceForItem(item).source_url || '',
                    'Lisensi / Dasar Penggunaan': this.sourceForItem(item).license || this.sourceForItem(item).usage_basis || ''
                }));

                const ws = XLSX.utils.json_to_sheet(excelRows);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'Riwayat Scraping');
                XLSX.writeFile(wb, `${queryName || 'Riwayat_Scraping'}.xlsx`);
            } else {
                alert('Tidak ada data pada riwayat ini.');
            }
        } catch (e) {
            alert('Gagal ekspor riwayat: ' + e.message);
        }
    },

    async loadHistoryItems(historyId, title) {
        try {
            const res = await fetch(`api/history.php?action=get_items&history_id=${historyId}`);
            const data = await res.json();
            if (data.success && data.items) {
                this.scrapedResults = data.items;
                this.renderScrapedResultsTable();
                document.getElementById('scraper-setup-view').style.display = 'none';
                document.getElementById('scraped-results-view').style.display = 'block';
                this.showToast(`✓ Berhasil memuat ${data.items.length} kontak dari riwayat.`);
            }
        } catch (e) {
            alert('Gagal memuat item riwayat: ' + e.message);
        }
    }
};

window.ScraperClient = ScraperClient;

// ─────────────────────────────────────────────────────────────────────
// MASTER DATABASE INTEGRATION MODULE (Deteksi Lengkap + Live Filter)
// ─────────────────────────────────────────────────────────────────────
(function() {
    const MasterDB = {
        currentRegion: '',
        currentKecamatan: '',
        cityTotalPlaces: 0,
        currentPage: 1,
        perPage: 50,
        totalPages: 0,
        currentFilter: { keyword: '', category: '', has_phone: null },
        cachedData: [],
        categoriesSummary: {},
        readyRegions: [],
        detectionPollTimer: null,

        init() {
            if (window.ScraperClient?.googleMapsOnly) return;
            this.bindEvents();
            this.loadReadyRegions();
        },

        bindEvents() {
            // Open Master DB
            const btnOpen = document.getElementById('btn-open-master-db');
            if (btnOpen) btnOpen.addEventListener('click', () => this.openDatabaseView());

            // Back button from DB view
            const btnBack = document.getElementById('btn-back-to-setup-from-db');
            if (btnBack) btnBack.addEventListener('click', () => this.closeDatabaseView());

            // Trigger Deteksi Seluruh Bisnis
            const btnDetect = document.getElementById('btn-sapu-bersih');
            if (btnDetect) btnDetect.addEventListener('click', () => this.startFullDetection());

            // Refresh/re-harvest
            const btnRefresh = document.getElementById('btn-refresh-sapu');
            if (btnRefresh) btnRefresh.addEventListener('click', () => this.startFullDetection());

            // Toggle custom scrape in harvested view
            const btnToggleCustom = document.getElementById('btn-toggle-custom-scrape');
            const panelCustom = document.getElementById('harvested-custom-scrape-panel');
            const chevronCustom = document.getElementById('custom-scrape-chevron');
            if (btnToggleCustom && panelCustom) {
                btnToggleCustom.addEventListener('click', () => {
                    const isOpen = panelCustom.style.display === 'block';
                    panelCustom.style.display = isOpen ? 'none' : 'block';
                    if (chevronCustom) chevronCustom.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
                });
            }

            // Switch to targeted scrape from harvested city
            const btnSwitchTargeted = document.getElementById('btn-switch-to-targeted');
            if (btnSwitchTargeted) {
                btnSwitchTargeted.addEventListener('click', () => {
                    const branchHarvested = document.getElementById('branch-harvested-city');
                    const branchUnharvested = document.getElementById('branch-unharvested-city');
                    if (branchHarvested) branchHarvested.style.display = 'none';
                    if (branchUnharvested) {
                        branchUnharvested.style.display = 'block';
                        branchUnharvested.scrollIntoView({ behavior: 'smooth' });
                    }
                });
            }

            // Live keyword search with debounce
            const keywordInput = document.getElementById('db-filter-keyword');
            if (keywordInput) {
                let debounce = null;
                keywordInput.addEventListener('input', () => {
                    clearTimeout(debounce);
                    debounce = setTimeout(() => {
                        this.currentFilter.keyword = keywordInput.value.trim();
                        this.currentPage = 1;
                        this.fetchData();
                    }, 400);
                });
            }

            // Subdistrict / Kecamatan filter in Master DB
            const subdistrictSelect = document.getElementById('db-filter-subdistrict');
            if (subdistrictSelect) {
                subdistrictSelect.addEventListener('change', () => {
                    this.currentKecamatan = subdistrictSelect.value.trim();
                    this.currentPage = 1;
                    const titleEl = document.getElementById('master-db-results-title');
                    if (titleEl) {
                        titleEl.textContent = `Database: ${this.currentKecamatan ? `${this.currentKecamatan}, ` : ''}${this.currentRegion}`;
                    }
                    this.fetchData();
                });
            }

            // Category filter
            const catSelect = document.getElementById('db-filter-category');
            if (catSelect) {
                catSelect.addEventListener('change', () => {
                    this.currentFilter.category = catSelect.value;
                    this.currentPage = 1;
                    this.fetchData();
                });
            }

            // Quick filter pills
            document.querySelectorAll('.db-quick-filter').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.db-quick-filter').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const filter = btn.dataset.dbfilter;
                    if (filter === 'has_phone') this.currentFilter.has_phone = true;
                    else if (filter === 'no_phone') this.currentFilter.has_phone = false;
                    else this.currentFilter.has_phone = null;
                    this.currentPage = 1;
                    this.fetchData();
                });
            });

            // Pagination
            const btnPrev = document.getElementById('btn-db-prev-page');
            const btnNext = document.getElementById('btn-db-next-page');
            if (btnPrev) btnPrev.addEventListener('click', () => { if (this.currentPage > 1) { this.currentPage--; this.fetchData(); } });
            if (btnNext) btnNext.addEventListener('click', () => { if (this.currentPage < this.totalPages) { this.currentPage++; this.fetchData(); } });

            // Export DB Excel
            const btnExcel = document.getElementById('btn-export-db-excel');
            if (btnExcel) btnExcel.addEventListener('click', () => this.exportExcel());

            // Save DB to Archive
            const btnArchive = document.getElementById('btn-save-db-to-archive');
            if (btnArchive) btnArchive.addEventListener('click', () => this.saveToArchive());
        },

        // ─── CHECK STATUS ───
        async checkStatus(regionName, subdistrictName = null) {
            if (!regionName) {
                this.hideAllStates();
                return;
            }
            const cleanRegion = (regionName || '').replace(/\s*\[.*?\]\s*/g, '').trim();
            this.currentRegion = cleanRegion;

            if (subdistrictName === null) {
                const kecSelect = document.getElementById('filter-kecamatan');
                const rawKec = kecSelect?.options[kecSelect.selectedIndex]?.text || '';
                subdistrictName = (rawKec && !rawKec.startsWith('--')) ? rawKec : '';
            }
            this.currentKecamatan = (subdistrictName && !subdistrictName.startsWith('--')) ? subdistrictName.trim() : '';

            try {
                let statusUrl = `api/master_db.php?action=status&region=${encodeURIComponent(cleanRegion)}`;
                if (this.currentKecamatan) {
                    statusUrl += `&kecamatan=${encodeURIComponent(this.currentKecamatan)}`;
                }
                let data = null;
                try {
                    const res = await fetch(statusUrl);
                    const text = await res.text();
                    if (!text.trim().startsWith('<?php') && !text.trim().startsWith('<!DOCTYPE')) {
                        data = JSON.parse(text);
                    }
                } catch (e1) {}

                if (!data) {
                    // Check if cleanRegion is in readyRegions fallback
                    const matchRegion = (this.readyRegions || []).find(r => 
                        r.name.toLowerCase() === cleanRegion.toLowerCase() ||
                        cleanRegion.toLowerCase().includes(r.name.toLowerCase()) ||
                        r.name.toLowerCase().includes(cleanRegion.toLowerCase())
                    );
                    if (matchRegion) {
                        data = {
                            available: true,
                            region: cleanRegion,
                            total_places: matchRegion.total_places || 0,
                            city_total_places: matchRegion.total_places || 0,
                            categories: matchRegion.categories || {}
                        };
                    } else {
                        data = { available: false, total_places: 0 };
                    }
                }

                const branchHarvested = document.getElementById('branch-harvested-city');
                const branchUnharvested = document.getElementById('branch-unharvested-city');
                const harvestTitle = document.getElementById('harvested-region-title');
                const harvestBadge = document.getElementById('harvested-region-total-badge');
                const harvestBtnCount = document.getElementById('harvested-btn-count');
                const harvestCats = document.getElementById('harvested-categories-chips');
                const unharvestedName = document.getElementById('unharvested-region-name');

                const statusBadge = document.getElementById('master-db-status-badge');
                const statusCard = document.getElementById('master-db-status-card');
                const emptyState = document.getElementById('master-db-empty-state');

                this.cityTotalPlaces = data.city_total_places || data.total_places || 0;

                if (data.available && (data.total_places > 0 || data.city_total_places > 0)) {
                    // Auto-render points strictly inside boundary on map when data exists in database
                    try {
                        const previewUrl = `api/master_db.php?action=query&region=${encodeURIComponent(cleanRegion)}${this.currentKecamatan ? '&kecamatan=' + encodeURIComponent(this.currentKecamatan) : ''}&per_page=120&skip_meta=1&known_total=${data.total_places || data.city_total_places}`;
                        fetch(previewUrl).then(r => r.json()).then(pData => {
                            if (pData && pData.data && pData.data.length && window.mapEngine) {
                                window.mapEngine.showPreviewMarkers(pData.data);
                            }
                        }).catch(() => {});
                    } catch(e) {}
                } else {
                    // Clear any previous markers so only red boundary is visible
                    if (window.mapEngine && window.mapEngine.markersGroup) {
                        window.mapEngine.markersGroup.clearLayers();
                    }
                }
            } catch (e) {
                console.warn('Master DB status check failed:', e);
            }
        },

        hideAllStates() {
            const el3 = document.getElementById('sapu-bersih-progress');
            if (el3) el3.style.display = 'none';
        },

        // ─── OPEN DATABASE VIEW ───
        openDatabaseView() {
            document.getElementById('scraper-setup-view').style.display = 'none';
            document.getElementById('scraped-results-view').style.display = 'none';
            document.getElementById('master-db-results-view').style.display = 'block';

            const titleText = this.currentKecamatan ? `Database: ${this.currentKecamatan}, ${this.currentRegion}` : `Database: ${this.currentRegion}`;
            document.getElementById('master-db-results-title').textContent = titleText;
            this.currentPage = 1;
            this.currentFilter = { keyword: '', category: '', has_phone: null };

            // Reset filter inputs
            const kw = document.getElementById('db-filter-keyword');
            if (kw) kw.value = '';
            const cat = document.getElementById('db-filter-category');
            if (cat) cat.value = '';
            document.querySelectorAll('.db-quick-filter').forEach(b => {
                b.classList.toggle('active', b.dataset.dbfilter === 'all');
            });

            // Populate subdistrict and category dropdowns
            this.populateSubdistrictDropdown();
            this.populateCategoryDropdown();
            this.fetchData();
        },

        closeDatabaseView() {
            document.getElementById('master-db-results-view').style.display = 'none';
            document.getElementById('scraper-setup-view').style.display = 'block';
        },

        populateSubdistrictDropdown() {
            const select = document.getElementById('db-filter-subdistrict');
            if (!select) return;
            select.innerHTML = `<option value="">-- Semua Kecamatan (${(this.cityTotalPlaces || 0).toLocaleString()}) --</option>`;

            // Read available subdistricts from filter-kecamatan dropdown options
            const setupKecSelect = document.getElementById('filter-kecamatan');
            if (setupKecSelect && setupKecSelect.options) {
                Array.from(setupKecSelect.options).forEach(opt => {
                    const txt = opt.text.trim();
                    if (txt && !txt.startsWith('--')) {
                        const o = document.createElement('option');
                        o.value = txt;
                        o.textContent = txt;
                        if (this.currentKecamatan && (this.currentKecamatan.toLowerCase() === txt.toLowerCase() || txt.toLowerCase().includes(this.currentKecamatan.toLowerCase()))) {
                            o.selected = true;
                        }
                        select.appendChild(o);
                    }
                });
            }
        },

        populateCategoryDropdown() {
            const select = document.getElementById('db-filter-category');
            if (!select) return;
            const curVal = select.value;
            select.innerHTML = '<option value="">Semua Kategori</option>';
            if (this.categoriesSummary) {
                Object.entries(this.categoriesSummary).forEach(([cat, cnt]) => {
                    const opt = document.createElement('option');
                    opt.value = cat;
                    opt.textContent = `${cat} (${cnt})`;
                    if (cat === curVal) opt.selected = true;
                    select.appendChild(opt);
                });
            }
        },

        // ─── FETCH DATA ───
        async fetchData() {
            if (!this.currentRegion) return;

            if (!this.pageCache) this.pageCache = {};
            const cacheKey = `${this.currentRegion}_${this.currentKecamatan}_${this.currentPage}_${this.currentFilter.keyword}_${this.currentFilter.category}_${this.currentFilter.has_phone}`;

            // Instant memory cache hit (0ms)
            if (this.pageCache[cacheKey]) {
                const cached = this.pageCache[cacheKey];
                this.cachedData = cached.data || [];
                this.renderTable();
                this.updatePagination(cached);
                return;
            }

            let url = `api/master_db.php?action=query&region=${encodeURIComponent(this.currentRegion)}&page=${this.currentPage}&per_page=${this.perPage}`;
            if (this.currentKecamatan) url += `&kecamatan=${encodeURIComponent(this.currentKecamatan)}`;
            if (this.currentFilter.keyword) url += `&keyword=${encodeURIComponent(this.currentFilter.keyword)}`;
            if (this.currentFilter.category) url += `&category=${encodeURIComponent(this.currentFilter.category)}`;
            if (this.currentFilter.has_phone !== null) url += `&has_phone=${this.currentFilter.has_phone}`;
            if (this.currentPage > 1 && this.totalPages > 1) {
                url += `&skip_meta=1&known_total=${this.totalPlaces || 0}&known_city_total=${this.cityTotalPlaces || 0}`;
            }

            try {
                const res = await fetch(url);
                const data = await res.json();
                this.pageCache[cacheKey] = data;

                this.cachedData = data.data || [];
                this.totalPages = data.total_pages || 1;
                this.totalPlaces = data.total || this.totalPlaces;
                if (data.categories_summary) {
                    this.categoriesSummary = data.categories_summary;
                    this.populateCategoryDropdown();
                }

                // Update count badge
                const countBadge = document.getElementById('master-db-results-count');
                if (countBadge) {
                    if (this.currentKecamatan && data.city_total_places) {
                        countBadge.textContent = `${(data.total || 0).toLocaleString()} data di ${this.currentKecamatan} (dari ${(data.city_total_places || 0).toLocaleString()} total)`;
                    } else {
                        countBadge.textContent = `${(data.total || 0).toLocaleString()} data`;
                    }
                }

                // Update filter summary
                const summaryText = document.getElementById('db-filter-summary-text');
                if (summaryText) {
                    const parts = [];
                    if (this.currentKecamatan) parts.push(`Wilayah: ${this.currentKecamatan}`);
                    if (this.currentFilter.keyword) parts.push(`Keyword: "${this.currentFilter.keyword}"`);
                    if (this.currentFilter.category) parts.push(`Kategori: ${this.currentFilter.category}`);
                    if (this.currentFilter.has_phone === true) parts.push('Hanya punya HP');
                    if (this.currentFilter.has_phone === false) parts.push('Tanpa nomor HP');
                    summaryText.textContent = parts.length ? parts.join(' | ') : `Menampilkan semua data (${(data.total || 0).toLocaleString()} hasil)`;
                }

                this.renderTable();
                this.updatePagination(data);
            } catch (e) {
                console.error('Master DB query failed:', e);
            }
        },

        // ─── RENDER TABLE (Lengkap dengan Salin, AI Pitch, dan WhatsApp) ───
        renderTable() {
            const tbody = document.getElementById('master-db-table-body');
            if (!tbody) return;

            if (!this.cachedData.length) {
                tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 36px 16px; color: #94a3b8;">
                    <i class="fa-solid fa-search" style="font-size: 1.5rem; margin-bottom: 8px; display: block;"></i>
                    Tidak ada data yang cocok dengan filter saat ini.
                </td></tr>`;
                return;
            }

            const startIdx = (this.currentPage - 1) * this.perPage;
            tbody.innerHTML = '';

            this.cachedData.forEach((item, i) => {
                const tr = document.createElement('tr');
                const enriched = window.ScraperClient ? window.ScraperClient.enrichPlaceContact(item, this.currentRegion) : null;
                const phone = (item.phone && item.phone !== '-' && item.phone !== 'null') ? item.phone : (enriched ? enriched.phone : '-');
                const website = (item.website && item.website !== '-' && item.website !== 'null') ? item.website : (enriched ? enriched.website : '');
                const hours = (item.opening_hours && item.opening_hours !== '-' && item.opening_hours !== 'null') ? item.opening_hours : (enriched ? enriched.hours : '');
                item.phone = phone;
                item.website = website;
                item.opening_hours = hours;

                const hasPhone = phone && phone !== '-';
                const cleanPhone = phone.replace(/[^0-9]/g, '');
                const waNumber = cleanPhone.startsWith('0') ? '62' + cleanPhone.substring(1) : cleanPhone;

                const leadItem = {
                    id: item.id || ('mdb_' + (startIdx + i)),
                    name: item.name,
                    category: item.category,
                    address: item.address,
                    phone: phone,
                    social_media: website,
                    website: website,
                    opening_hours: hours,
                    rating: item.rating || 0,
                    reviews_count: item.reviews_count || 0,
                    lat: item.lat,
                    lng: item.lng
                };

                const waUrl = window.TemplateManager ? window.TemplateManager.getWhatsAppUrl(leadItem) : (hasPhone ? `https://wa.me/${waNumber}` : '#');

                const phoneDisplay = hasPhone 
                    ? `<a href="${waUrl}" target="_blank" style="color: #16a34a; font-weight: 600; text-decoration: none;"><i class="fa-brands fa-whatsapp"></i> ${phone}</a>` 
                    : '<span style="color: #cbd5e1;">-</span>';

                const webDisplay = website 
                    ? `<a href="${website.startsWith('http') ? website : 'https://' + website}" target="_blank" style="color: #2563eb; text-decoration: none; font-size: 0.74rem;" title="${website}">${website.replace(/https?:\/\//, '').substring(0, 22)}...</a>` 
                    : '<span style="color: #cbd5e1;">-</span>';

                tr.innerHTML = `
                    <td style="color: #94a3b8; font-size: 0.72rem; text-align: center;">${startIdx + i + 1}</td>
                    <td>
                        <div style="font-weight: 700; color: #0f172a;">${this.esc(item.name)}</div>
                        <div style="font-size: 0.70rem; color: #64748b;">${this.esc(item.category)}</div>
                    </td>
                    <td><span class="db-cat-chip" style="font-size:0.68rem;">${this.esc(item.category)}</span></td>
                    <td style="font-size: 0.74rem; color: #475569; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this.esc(item.address)}">${this.esc(item.address)}</td>
                    <td style="white-space: nowrap; font-size: 0.76rem;">${phoneDisplay}</td>
                    <td>${webDisplay}</td>
                    <td style="font-size: 0.72rem; color: #64748b; white-space: nowrap;">${this.esc(item.opening_hours || '-')}</td>
                    <td style="font-weight: 700; color: #64748b; white-space: nowrap;">${item.rating > 0 ? `⭐ ${item.rating} (${item.reviews_count || 0})` : 'Tidak tersedia'}</td>
                    <td style="text-align: right; white-space: nowrap;">
                        <div style="display: inline-flex; gap: 4px;">
                            <button class="btn btn-outline btn-sm btn-mdb-copy" title="Salin Pesan Penawaran Terpersonalisasi" style="font-size: 0.68rem; padding: 4px 7px;">
                                <i class="fa-solid fa-copy"></i> Salin
                            </button>
                            <button class="btn btn-primary btn-sm btn-mdb-pitch" title="Buat Pesan Sales Otomatis dengan Gemini AI" style="font-size: 0.68rem; padding: 4px 7px; background: linear-gradient(135deg, #2563eb, #7c3aed); border: none;">
                                <i class="fa-solid fa-wand-magic-sparkles"></i> AI Pitch
                            </button>
                            ${hasPhone ? `
                            <a href="${waUrl}" target="_blank" class="btn btn-wa btn-sm" title="Chat WhatsApp Langsung" style="font-size: 0.68rem; padding: 4px 7px;">
                                <i class="fa-brands fa-whatsapp"></i> WA
                            </a>` : ''}
                        </div>
                    </td>
                `;

                // Quick Copy Handler
                tr.querySelector('.btn-mdb-copy')?.addEventListener('click', () => {
                    const pitch = window.TemplateManager ? window.TemplateManager.getPersonalizedMessage(leadItem) : `Halo ${leadItem.name}, kami dari tim cliento.`;
                    navigator.clipboard.writeText(pitch);
                    if (window.ScraperClient) window.ScraperClient.showToast(`Pesan penawaran untuk ${leadItem.name} berhasil disalin!`);
                });

                // Open Gemini AI Pitch Modal
                tr.querySelector('.btn-mdb-pitch')?.addEventListener('click', () => {
                    if (window.ScraperClient) window.ScraperClient.openAIPitchModal(leadItem);
                });

                tbody.appendChild(tr);
            });
        },

        // ─── PAGINATION ───
        updatePagination(data) {
            const info = document.getElementById('db-pagination-info');
            const btnPrev = document.getElementById('btn-db-prev-page');
            const btnNext = document.getElementById('btn-db-next-page');

            if (info) info.textContent = `Halaman ${this.currentPage} dari ${this.totalPages}`;
            if (btnPrev) btnPrev.disabled = this.currentPage <= 1;
            if (btnNext) btnNext.disabled = this.currentPage >= this.totalPages;
        },

        // ─── READY REGIONS LOADER & QUICK CHIPS ───
        async loadReadyRegions() {
            if (window.ScraperClient?.googleMapsOnly) return;
            const container = document.getElementById('ready-regions-chips-container');
            try {
                let data = null;
                try {
                    const res = await fetch('api/master_db.php?action=regions');
                    const text = await res.text();
                    if (!text.trim().startsWith('<?php') && !text.trim().startsWith('<!DOCTYPE') && !text.trim().startsWith('<html')) {
                        data = JSON.parse(text);
                    }
                } catch (apiErr) {}

                if (!data || !data.regions) {
                    try {
                        const staticRes = await fetch('data/ready_regions.json');
                        data = await staticRes.json();
                    } catch (sErr) {}
                }

                if (data && data.regions && data.regions.length) {
                    this.readyRegions = data.regions.filter(r => r.total_places > 0);
                    if (container) {
                        container.innerHTML = '';
                        const parentBox = document.getElementById('master-db-quick-chips');
                        if (parentBox) parentBox.style.display = 'none';
                    }

                    // Re-trigger populateRegencies if dropdown already has options so badges show up
                    const provSelect = document.getElementById('filter-provinsi');
                    if (provSelect && provSelect.value && window.ScraperClient) {
                        const curKabVal = document.getElementById('filter-kabupaten')?.value;
                        window.ScraperClient.populateRegencies(provSelect.value);
                        if (curKabVal) {
                            const kabSelect = document.getElementById('filter-kabupaten');
                            if (kabSelect) kabSelect.value = curKabVal;
                        }
                        window.ScraperClient.checkMasterDbStatus();
                    }
                } else if (container) {
                    container.innerHTML = '<span style="font-size: 0.68rem; color: #94a3b8;">Belum ada wilayah terpanen</span>';
                }
            } catch (e) {
                console.warn('Gagal memuat wilayah siap pakai:', e);
            }
        },

        selectRegionDirectly(regionName) {
            if (!regionName || typeof REGIONS_DATA === 'undefined') return;

            const cleanTarget = regionName.toLowerCase().replace(/^(kabupaten|kota)\s+/i, '').trim();
            let targetProvId = null;
            let targetRegId = null;

            for (const pid in REGIONS_DATA.regencies) {
                const regList = REGIONS_DATA.regencies[pid] || [];
                const found = regList.find(r => {
                    const cleanR = r.name.toLowerCase().replace(/^(kabupaten|kota)\s+/i, '').trim();
                    return cleanR === cleanTarget || r.name.toLowerCase() === regionName.toLowerCase() || regionName.toLowerCase().includes(r.name.toLowerCase());
                });
                if (found) {
                    targetProvId = pid;
                    targetRegId = found.id;
                    break;
                }
            }

            if (targetProvId && targetRegId) {
                const provSelect = document.getElementById('filter-provinsi');
                if (provSelect) {
                    provSelect.value = targetProvId;
                    if (window.ScraperClient) {
                        window.ScraperClient.populateRegencies(targetProvId);
                    }
                    const kabSelect = document.getElementById('filter-kabupaten');
                    if (kabSelect) {
                        kabSelect.value = targetRegId;
                    }
                    if (window.ScraperClient) {
                        window.ScraperClient.populateDistricts(targetRegId);
                        window.ScraperClient.handleRegionChange();
                    }
                }
            } else {
                this.checkStatus(regionName);
            }
        },

        // ─── DETEKSI SELURUH BISNIS DI WILAYAH INI ───
        async startFullDetection() {
            if (!this.currentRegion) return;
            const kabName = this.currentRegion;

            const emptyState = document.getElementById('master-db-empty-state');
            const statusCard = document.getElementById('master-db-status-card');
            const progressEl = document.getElementById('sapu-bersih-progress');
            const btnDetect = document.getElementById('btn-sapu-bersih');

            if (emptyState) emptyState.style.display = 'none';
            if (statusCard) statusCard.style.display = 'none';
            if (progressEl) progressEl.style.display = 'block';

            if (btnDetect) {
                btnDetect.disabled = true;
                btnDetect.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mendeteksi Seluruh Bisnis...';
            }

            this.updateDetectionProgress('Proses deteksi wilayah dimulai... Sistem sedang mengumpulkan seluruh data usaha.', 10);

            // Simulation interval to keep UI alive and showing progressive steps while backend worker runs
            let simStep = 0;
            const simSteps = [
                { pct: 25, msg: 'Memindai batas koordinat wilayah & grid sektor...' },
                { pct: 45, msg: 'Mengumpulkan data bisnis: retail, kuliner, akomodasi, jasa...' },
                { pct: 70, msg: 'Mengklasifikasikan sektor bisnis & memvalidasi kontak...' },
                { pct: 88, msg: 'Menyinkronkan data ke Master Database lokal...' }
            ];
            const simInterval = setInterval(() => {
                if (simStep < simSteps.length) {
                    this.updateDetectionProgress(simSteps[simStep].msg, simSteps[simStep].pct);
                    simStep++;
                }
            }, 2500);

            try {
                const payload = {
                    action: 'add_and_run',
                    region: kabName,
                    mode: 'city'
                };
                if (this.currentQuery && this.currentQuery.bbox) {
                    payload.bbox = this.currentQuery.bbox;
                }
                if (this.currentKecamatan) {
                    payload.kecamatan = this.currentKecamatan;
                }
                if (this.currentQuery && this.currentQuery.province) {
                    payload.province = this.currentQuery.province;
                }
                const onlyWaToggle = document.getElementById('scraper-only-wa-toggle');
                if (onlyWaToggle && onlyWaToggle.checked) {
                    payload.only_wa = true;
                }

                const res = await fetch('api/harvest_queue.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                clearInterval(simInterval);

                if (data.success && (data.status === 'completed' || data.total_saved > 0)) {
                    this.updateDetectionProgress(`Deteksi selesai! ${(data.total_saved || 0).toLocaleString()} bisnis berhasil dikumpulkan.`, 100);
                    if (btnDetect) {
                        btnDetect.disabled = false;
                        btnDetect.innerHTML = '<i class="fa-solid fa-check"></i> Deteksi Selesai';
                    }
                    setTimeout(() => {
                        this.checkStatus(this.currentRegion, this.currentKecamatan);
                        this.loadReadyRegions();
                        if (window.DataManager) window.DataManager.loadTreeData();
                        if (window.ScraperClient && typeof window.ScraperClient.scanTerritory === 'function') {
                            window.ScraperClient.scanTerritory();
                        }
                        if (progressEl) progressEl.style.display = 'none';
                        if (btnDetect) {
                            btnDetect.innerHTML = '<i class="fa-solid fa-database"></i> Unduh Seluruh Data Kota ke Database';
                        }
                    }, 1200);
                } else if (data.status === 'queued') {
                    this.updateDetectionProgress('Deteksi antrean aktif... Menunggu worker.', 25);
                    this.startDetectionPolling();
                } else {
                    this.updateDetectionProgress(`Info: ${data.message || data.error || 'Memproses deteksi...'}`, 50);
                    this.startDetectionPolling();
                }
            } catch (e) {
                clearInterval(simInterval);
                try {
                    const res2 = await fetch(`api/full_harvest.php?action=harvest&region=${encodeURIComponent(kabName)}`);
                    const data2 = await res2.json();
                    if (data2.success || data2.total_saved > 0) {
                        this.updateDetectionProgress(`Deteksi selesai! ${(data2.total_saved || 0).toLocaleString()} bisnis berhasil dikumpulkan.`, 100);
                        if (btnDetect) {
                            btnDetect.disabled = false;
                            btnDetect.innerHTML = '<i class="fa-solid fa-check"></i> Deteksi Selesai';
                        }
                        setTimeout(() => {
                            this.checkStatus(this.currentRegion, this.currentKecamatan);
                            this.loadReadyRegions();
                            if (window.DataManager) window.DataManager.loadTreeData();
                            if (window.ScraperClient && typeof window.ScraperClient.scanTerritory === 'function') {
                                window.ScraperClient.scanTerritory();
                            }
                            if (progressEl) progressEl.style.display = 'none';
                            if (btnDetect) {
                                btnDetect.innerHTML = '<i class="fa-solid fa-crosshairs"></i> Deteksi Seluruh Bisnis di Wilayah Ini';
                            }
                        }, 1200);
                    } else {
                        this.updateDetectionProgress('Proses deteksi berjalan di latar belakang...', 35);
                        this.startDetectionPolling();
                    }
                } catch (e2) {
                    this.updateDetectionProgress('Gagal memulai proses. Periksa koneksi server.', 0);
                    if (btnDetect) {
                        btnDetect.disabled = false;
                        btnDetect.innerHTML = '<i class="fa-solid fa-crosshairs"></i> Deteksi Seluruh Bisnis di Wilayah Ini';
                    }
                }
            }
        },

        startSapuBersih() {
            return this.startFullDetection();
        },

        startDetectionPolling() {
            if (this.detectionPollTimer) clearInterval(this.detectionPollTimer);
            let pollCount = 0;

            this.detectionPollTimer = setInterval(async () => {
                pollCount++;
                try {
                    const res = await fetch(`api/master_db.php?action=status&region=${encodeURIComponent(this.currentRegion)}`);
                    const data = await res.json();

                    if (data.available && data.total_places > 0) {
                        clearInterval(this.detectionPollTimer);
                        this.detectionPollTimer = null;
                        this.updateDetectionProgress(`Deteksi selesai! ${data.total_places.toLocaleString()} bisnis terkumpul.`, 100);
                        const btnDetect = document.getElementById('btn-sapu-bersih');
                        if (btnDetect) {
                            btnDetect.disabled = false;
                            btnDetect.innerHTML = '<i class="fa-solid fa-check"></i> Deteksi Selesai';
                        }
                        setTimeout(async () => {
                            this.checkStatus(this.currentRegion, this.currentKecamatan);
                            this.loadReadyRegions();
                            if (window.ScraperClient && typeof window.ScraperClient.scanTerritory === 'function') {
                                window.ScraperClient.scanTerritory();
                            }
                            const progressEl = document.getElementById('sapu-bersih-progress');
                            if (progressEl) progressEl.style.display = 'none';
                            if (btnDetect) {
                                btnDetect.innerHTML = '<i class="fa-solid fa-crosshairs"></i> Deteksi Seluruh Bisnis di Wilayah Ini';
                            }

                            // AUTOMATICALLY REDIRECT TO SCRAPED RESULTS TABLE!
                            try {
                                const qUrl = `api/master_db.php?action=query&region=${encodeURIComponent(this.currentRegion)}&per_page=100`;
                                const qRes = await fetch(qUrl);
                                const qData = await qRes.json();
                                const rawPlaces = qData.places || qData.items || [];
                                if (rawPlaces.length > 0 && window.ScraperClient) {
                                    window.ScraperClient.scrapedResults = rawPlaces.map((p, idx) => ({
                                        id: idx + 1,
                                        osm_id: p.osm_id || null,
                                        name: p.name,
                                        category: p.category_name || p.subsector || 'Usaha Lokal',
                                        address: p.address || this.currentRegion,
                                        phone: p.phone || '-',
                                        lat: parseFloat(p.lat || p.latitude || 0),
                                        lng: parseFloat(p.lng || p.longitude || 0),
                                        social_media: p.website || '-',
                                        opening_hours: p.opening_hours || '-',
                                        rating: p.rating !== undefined && p.rating !== null ? parseFloat(p.rating) : 0,
                                        reviews_count: p.reviews_count !== undefined && p.reviews_count !== null ? parseInt(p.reviews_count, 10) : 0,
                                        status: 'none',
                                        source: p.source || 'master_db',
                                        source_name: 'Master DB Wilayah',
                                        source_type: 'Database Sapu Bersih',
                                        source_color: '#3b82f6',
                                        source_icon: 'fa-database',
                                        insights: (typeof window.ScraperClient.generateInsights === 'function')
                                            ? window.ScraperClient.generateInsights(p.name, p.category_name, p.rating, p.reviews_count, p.phone)
                                            : null
                                    }));
                                    window.ScraperClient.currentQuery.location = this.currentRegion;
                                    window.ScraperClient.currentQuery.category = 'all';
                                    window.ScraperClient.activeFilter = 'all';
                                    window.ScraperClient.renderScrapedResultsTable();

                                    const setupView = document.getElementById('scraper-setup-view');
                                    const resultsView = document.getElementById('scraped-results-view');
                                    if (setupView) setupView.style.display = 'none';
                                    if (resultsView) resultsView.style.display = 'block';

                                    // Scroll into view smoothly
                                    resultsView.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }
                            } catch(err) {
                                console.warn('Could not auto-load scraped results table from master_db:', err);
                            }
                        }, 1200);
                        return;
                    }

                    const pct = Math.min(95, 20 + pollCount * 4);
                    this.updateDetectionProgress(`Memindai data bisnis wilayah... (siklus ke-${pollCount})`, pct);

                    if (pollCount >= 40) {
                        clearInterval(this.detectionPollTimer);
                        this.detectionPollTimer = null;
                        this.updateDetectionProgress('Proses deteksi selesai atau berjalan di latar belakang.', 90);
                        const btnDetect = document.getElementById('btn-sapu-bersih');
                        if (btnDetect) {
                            btnDetect.disabled = false;
                            btnDetect.innerHTML = '<i class="fa-solid fa-crosshairs"></i> Deteksi Seluruh Bisnis di Wilayah Ini';
                        }
                        this.checkStatus(this.currentRegion, this.currentKecamatan);
                    }
                } catch (e) {
                    // Keep polling
                }
            }, 3000);
        },

        startSapuPolling() {
            return this.startDetectionPolling();
        },

        updateDetectionProgress(label, pct) {
            const bar = document.getElementById('sapu-progress-bar');
            const pctEl = document.getElementById('sapu-progress-pct');
            const labelEl = document.getElementById('sapu-progress-label');
            if (bar) bar.style.width = pct + '%';
            if (pctEl) pctEl.textContent = pct + '%';
            if (labelEl) labelEl.textContent = label;
        },

        updateSapuProgress(label, pct) {
            return this.updateDetectionProgress(label, pct);
        },

        // ─── EXPORT EXCEL ───
        exportExcel() {
            if (!this.cachedData.length) return;
            if (typeof XLSX === 'undefined') { alert('SheetJS library not loaded.'); return; }

            const rows = this.cachedData.map((item, i) => ({
                'No': i + 1,
                'Nama Tempat': item.name,
                'Kategori': item.category,
                'Alamat': item.address,
                'Nomor HP': item.phone || '-',
                'Website': item.website || '-',
                'Jam Operasional': item.opening_hours || '-',
                'Latitude': item.lat,
                'Longitude': item.lng
            }));

            const ws = XLSX.utils.json_to_sheet(rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Database');
            const filename = `Database_${this.currentRegion.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.xlsx`;
            XLSX.writeFile(wb, filename);
        },

        // ─── SAVE TO ARCHIVE ───
        saveToArchive() {
            // Leverage the existing archive save modal from ScraperClient
            if (window.ScraperClient && this.cachedData.length) {
                // Convert to ScraperClient format
                window.ScraperClient.scrapedResults = this.cachedData.map(item => ({
                    name: item.name,
                    address: item.address,
                    phone: item.phone || '',
                    category: item.category,
                    social_media: item.website || '',
                    opening_hours: item.opening_hours || '',
                    rating: 0,
                    reviews_count: 0,
                    lat: item.lat,
                    lng: item.lng
                }));
                // Open the save modal
                const modal = document.getElementById('modal-save-archive');
                if (modal) modal.style.display = 'flex';
            }
        },

        esc(str) {
            if (!str) return '-';
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }
    };

    // ─── HOOK INTO SCRAPER CLIENT ───
    if (window.ScraperClient) {
        window.ScraperClient.checkMasterDbStatus = function() {
            if (this.googleMapsOnly) return;
            const kabSelect = document.getElementById('filter-kabupaten');
            if (!kabSelect || !kabSelect.value) {
                MasterDB.hideAllStates();
                return;
            }
            const rawKabName = kabSelect.options[kabSelect.selectedIndex]?.text || '';
            const kabName = rawKabName.replace(/\s*\[.*?\]\s*/g, '').trim();

            const kecSelect = document.getElementById('filter-kecamatan');
            const rawKecName = kecSelect?.options[kecSelect?.selectedIndex]?.text || '';
            const kecName = (rawKecName && !rawKecName.startsWith('--')) ? rawKecName.trim() : '';

            if (kabName && !kabName.startsWith('--')) {
                MasterDB.checkStatus(kabName, kecName);
            }
        };
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => MasterDB.init());
    } else {
        MasterDB.init();
    }

    window.MasterDB = MasterDB;
})();
