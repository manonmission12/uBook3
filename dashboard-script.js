document.addEventListener('DOMContentLoaded', () => {

    // Helpers
    function safeParse(key, fallback) {
        try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; }
        catch (e) { console.warn('JSON parse error', key); return fallback; }
    }

    // Non-blocking notification banner (internal)
    function ensureNotifyContainer() {
        let c = document.getElementById('notifyContainer');
        if (!c) {
            c = document.createElement('div');
            c.id = 'notifyContainer';
            c.style.position = 'fixed';
            c.style.top = '20px';
            c.style.right = '20px';
            c.style.zIndex = 99999;
            c.style.display = 'flex';
            c.style.flexDirection = 'column';
            c.style.gap = '8px';
            document.body.appendChild(c);
        }
        return c;
    }
    function notify(message, type = 'info', timeout = 3000) {
        const container = ensureNotifyContainer();
        const el = document.createElement('div');
        el.className = `notify notify-${type}`;
        el.textContent = message;
        el.style.minWidth = '220px';
        el.style.padding = '10px 14px';
        el.style.borderRadius = '8px';
        el.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)';
        el.style.color = '#fff';
        el.style.fontWeight = '500';
        el.style.fontSize = '14px';
        el.style.opacity = '0';
        el.style.transform = 'translateY(-6px)';
        el.style.transition = 'all 220ms ease';
        if (type === 'error') el.style.background = '#ef4444';
        else if (type === 'success') el.style.background = '#10b981';
        else el.style.background = '#2563eb';

        container.appendChild(el);
        requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });

        setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(-6px)';
            setTimeout(() => el.remove(), 220);
        }, timeout);
    }

    // small util: debounce
    function debounce(fn, wait = 200) {
        let t;
        return function(...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), wait);
        };
    }

    // --- 0. DARK MODE (DUAL BUTTON LOGIC) ---
    const themeToggles = document.querySelectorAll('.theme-btn');
    const root = document.documentElement;
    if (localStorage.getItem('theme') === 'dark') {
        root.setAttribute('data-theme', 'dark');
        themeToggles.forEach(btn => {
            const icon = btn.querySelector('i');
            if (icon) { icon.classList.remove('fa-moon'); icon.classList.add('fa-sun'); }
        });
    }
    themeToggles.forEach(btn => {
        btn.addEventListener('click', () => {
            const currentTheme = root.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            root.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            themeToggles.forEach(b => {
                const icon = b.querySelector('i');
                if (icon) {
                    if (newTheme === 'dark') { icon.classList.remove('fa-moon'); icon.classList.add('fa-sun'); }
                    else { icon.classList.remove('fa-sun'); icon.classList.add('fa-moon'); }
                }
            });
        });
    });

    // --- 1. MOBILE MENU LOGIC ---
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const navMenu = document.getElementById('navMenu');
    if (mobileMenuBtn && navMenu) {
        mobileMenuBtn.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            const menuIcon = mobileMenuBtn.querySelector('i');
            if (menuIcon) {
                if (navMenu.classList.contains('active')) menuIcon.classList.replace('fa-bars', 'fa-times');
                else menuIcon.classList.replace('fa-times', 'fa-bars');
            }
        });
    }

    // --- 2. AUTH & USER INFO (AVATAR FIX) ---
    const currentUser = localStorage.getItem('currentUser');
    const profileMenuWrapper = document.getElementById('profileMenuWrapper');
    const loginBtnContainer = document.getElementById('loginBtnContainer');
    const userDisplay = document.getElementById('userDisplay');

    if (currentUser) {
        if (profileMenuWrapper) profileMenuWrapper.style.display = 'flex';
        if (loginBtnContainer) loginBtnContainer.style.display = 'none';
        if (userDisplay) userDisplay.innerText = `Halo, ${currentUser}`;

        const avatarImg = document.querySelector('.profile-trigger .avatar');
        const savedAvatar = localStorage.getItem(`avatar_${currentUser}`);
        if (avatarImg) {
            avatarImg.src = savedAvatar ? savedAvatar : `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser)}&background=random&color=fff`;
        }

        const profileTrigger = document.getElementById('profileTrigger');
        const profileDropdown = document.getElementById('profileDropdown');
        if (profileTrigger && profileDropdown) {
            profileTrigger.addEventListener('click', (e) => { e.stopPropagation(); profileDropdown.classList.toggle('active'); });
            // Fix: only close dropdown when clicking OUTSIDE both trigger AND dropdown
            document.addEventListener('click', (e) => {
                if (!profileTrigger.contains(e.target) && !profileDropdown.contains(e.target)) {
                    profileDropdown.classList.remove('active');
                }
            });

            // ARIA
            profileTrigger.setAttribute('aria-haspopup', 'menu');
            profileTrigger.setAttribute('aria-expanded', String(profileDropdown.classList.contains('active')));
            profileDropdown.setAttribute('role', 'menu');
            profileDropdown.querySelectorAll('.dropdown-item').forEach((it) => it.setAttribute('role', 'menuitem'));

            // toggle already done on click; update aria when toggled
            const syncDropdownState = (open) => {
                profileDropdown.classList.toggle('active', open);
                profileTrigger.setAttribute('aria-expanded', String(open));
                if (open) {
                    const first = profileDropdown.querySelector('[role="menuitem"]');
                    first && first.focus();
                } else {
                    profileTrigger.focus();
                }
            };

            profileTrigger.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
                    ev.preventDefault();
                    syncDropdownState(!profileDropdown.classList.contains('active'));
                } else if (ev.key === 'ArrowDown') {
                    ev.preventDefault();
                    syncDropdownState(true);
                } else if (ev.key === 'Escape') {
                    syncDropdownState(false);
                }
            });

            profileDropdown.addEventListener('keydown', (ev) => {
                const items = Array.from(profileDropdown.querySelectorAll('[role="menuitem"]'));
                const idx = items.indexOf(document.activeElement);
                if (ev.key === 'Escape') { syncDropdownState(false); }
                else if (ev.key === 'ArrowDown') { ev.preventDefault(); items[(idx + 1) % items.length].focus(); }
                else if (ev.key === 'ArrowUp') { ev.preventDefault(); items[(idx - 1 + items.length) % items.length].focus(); }
            });
        }

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                // Prevent document click handler from closing/hijacking before confirm
                e.stopPropagation();
                if (confirm('Yakin ingin keluar?')) { localStorage.removeItem('currentUser'); window.location.href = 'login.html'; }
            });
        }
    } else {
        if (profileMenuWrapper) profileMenuWrapper.style.display = 'none';
        if (loginBtnContainer) loginBtnContainer.style.display = 'block';
    }

    // --- 3. DATA BUKU (16 ORIGINAL - LOCAL FILE) ---
    const defaultBooks = [
        { id: "B1", title: "Filosofi Teras", author: "Henry Manampiring", category: "Filsafat", img: "covers/filosofi teras.png", pdf: "books/1. Filosofi Teras.pdf", rating: 4.8 },
        { id: "B2", title: "This is Marketing", author: "Seth Godin", category: "Bisnis", img: "covers/this is marketing.png", pdf: "books/2. This is marketing.pdf", rating: 4.6 },
        { id: "B3", title: "Atomic Habits", author: "James Clear", category: "Self-Improvement", img: "covers/atomic habits.png", pdf: "books/3. Atomic Habits.pdf", rating: 4.9 },
        { id: "B4", title: "Psychology of Money", author: "Morgan Housel", category: "Self-Improvement", img: "covers/the psychology of money.png", pdf: "books/4. The Psychology of Money.pdf", rating: 4.7 },
        { id: "B5", title: "Citizen 4.0", author: "Hermawan Kartajaya", category: "Bisnis", img: "covers/citizen 4.0.png", pdf: "books/5. Citizen 4.0.pdf", rating: 4.5 },
        { id: "B6", title: "Find Your Why", author: "Simon Sinek", category: "Self-Improvement", img: "covers/find your why.png", pdf: "books/6. Find your why.pdf", rating: 4.4 },
        { id: "B7", title: "How To Win Friends", author: "Dale Carnegie", category: "Self-Improvement", img: "covers/how to win friends&influence people.png", pdf: "books/7. How to win friend & influence people.pdf", rating: 4.8 },
        { id: "B8", title: "Marketing 4.0", author: "Philip Kotler", category: "Bisnis", img: "covers/marketing 4.0.png", pdf: "books/8. Marketing 4.0.pdf", rating: 4.7 },
        { id: "B9", title: "Marketing in Crisis", author: "Rhenald Kasal", category: "Bisnis", img: "covers/marketing in crisis.png", pdf: "books/9. Marketing in Crisis.pdf", rating: 4.5 },
        { id: "B10", title: "Mindset", author: "Dr. Carol S. Dweck", category: "Self-Improvement", img: "covers/mindset.png", pdf: "books/10. Mindset.pdf", rating: 4.3 },
        { id: "B11", title: "Bodo Amat", author: "Mark Manson", category: "Self-Improvement", img: "covers/sebuah seni untuk bersikap bodo amat.png", pdf: "books/11. Sebuah Seni untuk Bersikap Bodo Amat.pdf", rating: 4.6 },
        { id: "B12", title: "Thinking, Fast & Slow", author: "Daniel Kahneman", category: "Self-Improvement", img: "covers/thinking fast and slow.png", pdf: "books/12. Thinking, fast and slow.pdf", rating: 4.7 },
        { id: "B13", title: "Grit", author: "Angela Duckworth", category: "Self-Improvement", img: "covers/grit.png", pdf: "books/grit.pdf", rating: 4.5 },
        { id: "B14", title: "Show Your Work", author: "Austin Kleon", category: "Self-Improvement", img: "covers/Show Your Work.png", pdf: "books/14. Show your work.pdf", rating: 4.8 },
        { id: "B15", title: "Intelligent Investor", author: "Benjamin Graham", category: "Bisnis", img: "covers/the intelligent investor.png", pdf: "books/15. The Intelligent Investor.pdf", rating: 4.6 },
        { id: "B16", title: "Think Like a Freak", author: "Steven D. Levitt", category: "Self-Improvement", img: "covers/think like a freak.png", pdf: "books/16. Think like a freak.pdf", rating: 4.9 }
    ];

    // Baca semua upload global yang disimpan upload-script ke 'myUploadedBooks'
    const uploadedBooksRaw = safeParse('myUploadedBooks', []);
    const UPLOAD_ID_BASE = Date.now();
    let uploadedBooksModified = false;
    const uploadedBooks = Array.isArray(uploadedBooksRaw) ? uploadedBooksRaw.map((b, i) => {
        const item = (b && typeof b === 'object') ? b : {};
        if (!item.id) { item.id = `U${UPLOAD_ID_BASE}_${i}`; uploadedBooksModified = true; }
        // ensure basic fields exist to avoid render errors
        if (!item.title) item.title = `Uploaded Buku ${i + 1}`;
        if (!item.author) item.author = item.author || 'Unknown';
        return item;
    }) : [];
    if (uploadedBooksModified) {
        try { localStorage.setItem('myUploadedBooks', JSON.stringify(uploadedBooks)); } catch (e) { /* ignore */ }
    }
    let allBooks = [...(uploadedBooks.slice().reverse()), ...defaultBooks];

    // Helper: ambil list reading & finished sebagai array objek buku
    function collectByStatus(status) {
        if (!readingHistory) return [];
        const ids = Object.keys(readingHistory).filter(k => readingHistory[k] === status);
        return ids.map(id => allBooks.find(b => b && b.id === id)).filter(Boolean);
    }

    // Render strip "Lanjutkan Membaca"
    function renderContinueStrip() {
        const row = document.getElementById('continueRow');
        const host = document.getElementById('continueStrip');
        if (!row || !host) return;
        const readingList = collectByStatus('reading');
        if (!readingList.length) { row.style.display = 'none'; host.innerHTML = ''; return; }
        row.style.display = '';
        host.innerHTML = '';
        readingList.slice(0, 12).forEach(book => {
            const card = document.createElement('div');
            card.className = 'continue-card';
            card.addEventListener('click', () => {
                // Guard: wajib daftar/login sebelum bisa membaca
                const currentUser = localStorage.getItem('currentUser');
                if (!currentUser) {
                    notify('Daftar dulu untuk membuka buku.', 'info', 2000);
                    window.location.href = 'signup.html';
                    return;
                }
                const safeTitle = encodeURIComponent(book.title || '');
                const safeSource = encodeURIComponent(book.pdf || book.file || '');
                window.location.href = `read.html?title=${safeTitle}&source=${safeSource}`;
            });
            const img = document.createElement('img');
            img.loading = 'lazy';
            img.src = book.img || book.image || 'https://via.placeholder.com/300x180?text=Cover';
            img.onerror = function(){ this.src = 'https://via.placeholder.com/300x180?text=Cover'; };
            const info = document.createElement('div');
            info.className = 'continue-info';
            const h4 = document.createElement('h4'); h4.textContent = book.title || '';
            const p = document.createElement('p'); p.textContent = book.author || '';
            info.appendChild(h4); info.appendChild(p);
            card.appendChild(img); card.appendChild(info);
            host.appendChild(card);
        });
    }

    // Badge jumlah pada tab Favorit/Reading/Selesai
    function updateCategoryBadges() {
        const btnFav = document.querySelector('.btn-cat[data-cat="want"]');
        const btnRead = document.querySelector('.btn-cat[data-cat="reading"]');
        const btnFin = document.querySelector('.btn-cat[data-cat="finished"]');

        const favCount = Array.isArray(savedBooks) ? savedBooks.length : 0;
        const readCount = collectByStatus('reading').length;
        const finCount = collectByStatus('finished').length;

        const setBadge = (btn, count) => {
            if (!btn) return;
            let b = btn.querySelector('.tab-badge');
            if (!b) { b = document.createElement('span'); b.className = 'tab-badge'; btn.appendChild(b); }
            b.textContent = String(count);
            b.style.display = count > 0 ? 'inline-flex' : 'none';
        };
        setBadge(btnFav, favCount);
        setBadge(btnRead, readCount);
        setBadge(btnFin, finCount);
    }

    // --- 4. RENDER BUKU ---
    const bookGrid = document.getElementById('bookGrid');
    const searchInput = document.getElementById('searchInput');
    const dashboardSort = document.getElementById('dashboardSort');
    const categoryTabs = document.querySelectorAll('.btn-cat');

    // Migrate userRatings to id-keyed map (safely) and normalize formats
    const userRatingsRaw = safeParse('userRatings', {});
    function migrateUserRatings(raw, books) {
        if (!raw || typeof raw !== 'object') return {};
        const out = {};
        const titleToId = {};
        books.forEach(b => { if (b && b.id && b.title) titleToId[b.title] = b.id; });

        Object.keys(raw).forEach(k => {
            const val = raw[k];
            const targetId = books.find(b => b && b.id === k) ? k : (titleToId[k] || null);
            if (!targetId) return;

            if (typeof val === 'number') out[targetId] = { score: val, date: null };
            else if (val && typeof val === 'object' && (val.score !== undefined || val.date !== undefined)) {
                out[targetId] = { score: Number(val.score) || 0, date: val.date || null };
            } else if (!isNaN(Number(val))) {
                out[targetId] = { score: Number(val), date: null };
            }
        });
        return out;
    }
    let userRatings = migrateUserRatings(userRatingsRaw, allBooks);
    try { localStorage.setItem('userRatings', JSON.stringify(userRatings)); } catch (e) { /* ignore */ }

    let savedBooks = currentUser ? safeParse(`savedBooks_${currentUser}`, []) : [];
    // migrate and use id-keyed readingHistory
    function migrateReadingHistory(rawHistory, books) {
        if (!rawHistory || typeof rawHistory !== 'object') return {};
        const byId = {};
        const titleToId = {};
        books.forEach(b => { if (b && b.id && b.title) titleToId[b.title] = b.id; });

        Object.keys(rawHistory).forEach(k => {
            const val = rawHistory[k];
            if (books.find(b => b && b.id === k)) { byId[k] = val; return; }
            if (titleToId[k]) { byId[titleToId[k]] = val; return; }
        });
        return byId;
    }
    let readingHistoryRaw = currentUser ? safeParse(`readingHistory_${currentUser}`, {}) : {};
    let readingHistory = migrateReadingHistory(readingHistoryRaw, allBooks);
    try { localStorage.setItem(`readingHistory_${currentUser}`, JSON.stringify(readingHistory)); } catch (e) { /* ignore */ }

    // helpers
    function getActiveCategory() {
        const el = document.querySelector('.btn-cat.active');
        return el ? el.dataset.cat : 'all';
    }
    function getBookStatus(book) {
        if (!book) return 'none';
        if (readingHistory[book.id] === 'finished') return 'finished';
        if (readingHistory[book.id] === 'reading') return 'reading';
        if (Array.isArray(savedBooks) && savedBooks.some(b => b && String(b.id) === String(book.id))) return 'want';
        return 'none';
    }
    function setBookStatus(book, newStatus) {
        if (!currentUser || !book) return;
        readingHistory = readingHistory || {};
        savedBooks = Array.isArray(savedBooks) ? savedBooks : [];

        delete readingHistory[book.id];
        savedBooks = savedBooks.filter(b => String(b.id) !== String(book.id));

        if (newStatus === 'want') savedBooks.push(book);
        else if (newStatus === 'reading') readingHistory[book.id] = 'reading';
        else if (newStatus === 'finished') readingHistory[book.id] = 'finished';

        try {
            localStorage.setItem(`savedBooks_${currentUser}`, JSON.stringify(savedBooks));
            localStorage.setItem(`readingHistory_${currentUser}`, JSON.stringify(readingHistory));
            notify('Status buku diperbarui.', 'success', 1600);
        } catch (e) {
            notify('Gagal menyimpan status.', 'error');
        }
    }

    function renderBooks(filterText = '', category = 'all') {
        if (!bookGrid) return;
        bookGrid.innerHTML = '';

        const text = (filterText || '').toString().toLowerCase();
        let filtered = allBooks.filter(b => {
            if (!b) return false;
            const matchText = (b.title || '').toLowerCase().includes(text) || (b.author || '').toLowerCase().includes(text);
            let matchCat = true;
            if (category === 'all') matchCat = true;
            else if (['want', 'reading', 'finished'].includes(category)) {
                const status = getBookStatus(b);
                matchCat = (category === 'want') ? (status === 'want')
                         : (category === 'reading') ? (status === 'reading')
                         : (status === 'finished');
            } else { matchCat = (b.category === category); }
            return matchText && matchCat;
        });

        const sortVal = dashboardSort ? dashboardSort.value : 'default';
        if (sortVal === 'az') filtered.sort((a,b) => (a.title || '').localeCompare(b.title || ''));
        if (sortVal === 'newest') filtered.reverse();
        if (sortVal === 'rating') filtered.sort((a,b) => (b.rating || 0) - (a.rating || 0));

        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.style.gridColumn = '1/-1';
            empty.style.textAlign = 'center';
            empty.style.color = 'var(--text-tertiary)';
            const p = document.createElement('p');
            p.textContent = 'Buku tidak ditemukan.';
            empty.appendChild(p);
            bookGrid.appendChild(empty);
            return;
        }

        filtered.forEach(book => {
            const card = document.createElement('div');
            card.className = 'book-card';
            card.style.position = 'relative';

            const statusWrapper = document.createElement('div');
            statusWrapper.className = 'book-status-wrapper';

            const btnStatus = document.createElement('button');
            btnStatus.className = 'btn-status-toggle';
            const status = getBookStatus(book);
            if (status) btnStatus.classList.add(status);
            btnStatus.dataset.id = book.id;

            const btnIcon = document.createElement('i');
            btnIcon.className = status === 'want' ? 'fas fa-bookmark' : status === 'reading' ? 'fas fa-book-reader' : status === 'finished' ? 'fas fa-check-circle' : 'far fa-bookmark';
            btnStatus.appendChild(btnIcon);

            const dropdown = document.createElement('div');
            dropdown.className = 'status-dropdown';
            const options = [
                { val: 'want', text: 'Ingin Dibaca', icon: 'fas fa-bookmark' },
                { val: 'reading', text: 'Sedang Dibaca', icon: 'fas fa-book-reader' },
                { val: 'finished', text: 'Selesai', icon: 'fas fa-check-circle' },
                { val: 'none', text: 'Hapus', icon: 'fas fa-trash-alt' },
            ];
            options.forEach(o => {
                const btn = document.createElement('button');
                btn.className = 'status-option';
                btn.dataset.val = o.val;
                btn.innerHTML = `<i class="${o.icon}"></i> ${o.text}`;
                dropdown.appendChild(btn);
            });

            statusWrapper.appendChild(btnStatus);
            statusWrapper.appendChild(dropdown);

            const img = document.createElement('img');
            img.loading = 'lazy';
            img.decoding = 'async';
            img.src = book.img || book.image || book.cover || 'https://via.placeholder.com/300x450?text=Cover';
            img.alt = (book.title || '').replace(/"/g, '');
            img.onerror = function() { this.src = 'https://via.placeholder.com/300x450?text=Cover'; };

            const info = document.createElement('div');
            info.className = 'book-info';

            const tag = document.createElement('span');
            tag.className = 'tag';
            tag.textContent = book.category || '';

            const h3 = document.createElement('h3');
            h3.textContent = book.title || '';

            const pAuthor = document.createElement('p');
            pAuthor.textContent = book.author || '';

            const footer = document.createElement('div');
            footer.className = 'card-footer';

            const starsWrap = document.createElement('div');
            starsWrap.className = 'interactive-stars';
            const ratingObj = userRatings[book.id];
            const currentScore = ratingObj
                ? (typeof ratingObj === 'object' ? (Number(ratingObj.score) || 0) : (Number(ratingObj) || 0))
                : (Number(book.rating) || 0);

            for (let i = 1; i <= 5; i++) {
                const star = document.createElement('i');
                star.className = 'fas fa-star' + (Math.round(currentScore) >= i ? ' filled' : '');
                star.style.color = Math.round(currentScore) >= i ? '#f59e0b' : '#e5e7eb';
                star.setAttribute('aria-hidden', 'true');
                starsWrap.appendChild(star);
            }

            const ratingNumber = document.createElement('span');
            ratingNumber.className = 'rating-number';
            ratingNumber.textContent = Number(currentScore).toFixed(1);

            footer.appendChild(starsWrap);
            footer.appendChild(ratingNumber);

            info.appendChild(tag);
            info.appendChild(h3);
            info.appendChild(pAuthor);
            info.appendChild(footer);

            card.appendChild(statusWrapper);
            card.appendChild(img);
            card.appendChild(info);

            btnStatus.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!currentUser) { notify('Silakan login terlebih dahulu!', 'info'); return; }
                document.querySelectorAll('.status-dropdown').forEach(d => { if (d !== dropdown) d.classList.remove('active'); });
                dropdown.classList.toggle('active');
            });

            dropdown.querySelectorAll('.status-option').forEach(opt => {
                opt.addEventListener('click', (e) => {
                    e.stopPropagation();
                    setBookStatus(book, opt.dataset.val);
                    dropdown.classList.remove('active');
                    renderBooks(searchInput ? searchInput.value : '', getActiveCategory());
                });
            });

            card.addEventListener('click', (e) => {
                // Klik kartu: jika belum login/daftar, arahkan ke signup
                if (!currentUser) {
                    notify('Daftar dulu untuk membuka buku.', 'info', 2000);
                    window.location.href = 'signup.html';
                    return;
                }
                if (!e.target.closest('.book-status-wrapper')) openModal(book);
            });

            bookGrid.appendChild(card);
        });
    }

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.book-status-wrapper')) document.querySelectorAll('.status-dropdown').forEach(d => d.classList.remove('active'));
    });

    // Persist & restore kategori + pencarian
    const LS_CAT = 'dash_last_cat';
    const LS_Q = 'dash_last_q';
    (function restoreFilters() {
        try {
            const lastCat = localStorage.getItem(LS_CAT) || 'all';
            const lastQ = localStorage.getItem(LS_Q) || '';
            // set active tab
            const targetBtn = document.querySelector(`.btn-cat[data-cat="${lastCat}"]`);
            const prev = document.querySelector('.btn-cat.active');
            if (targetBtn) { if (prev) prev.classList.remove('active'); targetBtn.classList.add('active'); }
            // set search
            const si = document.getElementById('searchInput');
            if (si) si.value = lastQ;
            // initial render with restored state
            renderBooks(lastQ, lastCat);
        } catch (e) { renderBooks(); }
    })();

    // Override initial render (yang lama)
    // renderBooks();  // <-- diabaikan, sudah dipanggil via restoreFilters()

    // Listeners
    if (searchInput) {
        const debouncedRender = debounce((e) => {
            const q = e.target.value;
            localStorage.setItem(LS_Q, q);
            renderBooks(q, getActiveCategory());
            updateCategoryBadges();
        }, 220);
        searchInput.removeEventListener && searchInput.removeEventListener('input', debouncedRender); // safe-guard
        searchInput.addEventListener('input', debouncedRender);
    }
    if (dashboardSort) dashboardSort.addEventListener('change', () => {
        renderBooks(searchInput ? searchInput.value : '', getActiveCategory());
        updateCategoryBadges();
    });

    categoryTabs.forEach(btn => {
        btn.addEventListener('click', () => {
            const prev = document.querySelector('.btn-cat.active');
            if (prev) prev.classList.remove('active');
            btn.classList.add('active');
            const cat = btn.dataset.cat || 'all';
            localStorage.setItem(LS_CAT, cat);
            renderBooks(searchInput ? searchInput.value : '', cat);
            updateCategoryBadges();
        });
    });

    // Setelah data siap: render strip + badges awal
    renderContinueStrip();
    updateCategoryBadges();

    // Pastikan strip & badge ikut segar saat buku dirender ulang
    const _origRenderBooks = renderBooks;
    renderBooks = function(filterText = '', category = 'all') {
        showGridSkeleton(6);
        _origRenderBooks(filterText, category);
        renderContinueStrip();
        updateCategoryBadges();
    };

    // --- 5. MODAL LOGIC ---
    const modal = document.getElementById('bookModal');
    const feedback = document.getElementById('ratingFeedback');

    function openModal(book) {
        if (!modal) return;
        // Guard: wajib daftar/login sebelum bisa membaca
        if (!currentUser) {
            notify('Daftar dulu untuk membuka buku.', 'info', 2000);
            window.location.href = 'signup.html';
            return;
        }

        const modalImg = document.getElementById('modalImg');
        const modalTitle = document.getElementById('modalTitle');
        const modalAuthor = document.getElementById('modalAuthor');
        const modalBadges = document.getElementById('modalBadges');
        if (modalImg) modalImg.src = book.img || book.image || '';
        if (modalTitle) modalTitle.innerText = book.title || '';
        if (modalAuthor) modalAuthor.innerText = book.author || '';
        if (modalBadges) {
            modalBadges.innerHTML = '';
            const span = document.createElement('span');
            span.className = 'badge-cat';
            span.textContent = book.category || '';
            modalBadges.appendChild(span);
        }

        const readBtn = document.getElementById('readBtn');
        if (readBtn) {
            readBtn.onclick = () => {
                // Guard lagi di tombol baca (jika modal dibuka dari state lain)
                if (!currentUser) {
                    notify('Daftar dulu untuk membuka buku.', 'info', 2000);
                    window.location.href = 'signup.html';
                    return;
                }
                if (book.fileData) {
                    const safeTitle = encodeURIComponent(book.title);
                    const safeSource = encodeURIComponent(book.fileData);
                    window.location.href = `read.html?title=${safeTitle}&source=${safeSource}`;
                } else if (book.pdf) {
                    const safeTitle = encodeURIComponent(book.title);
                    const safeSource = encodeURIComponent(book.pdf);
                    window.location.href = `read.html?title=${safeTitle}&source=${safeSource}`;
                } else {
                    notify('File buku tidak ditemukan!', 'error');
                }
            };
        }

        const modalActions = document.querySelector('.modal-actions');
        if (modalActions) {
            let copyBtn = document.getElementById('copyLinkBtn');
            if (!copyBtn) {
                copyBtn = document.createElement('button');
                copyBtn.id = 'copyLinkBtn';
                copyBtn.className = 'btn-primary';
                copyBtn.style.background = 'transparent';
                copyBtn.style.color = 'var(--text-primary)';
                copyBtn.style.border = '1px solid var(--border)';
                copyBtn.style.marginTop = '10px';
                modalActions.appendChild(copyBtn);
            }
            copyBtn.innerText = 'Salin Link Baca';
            copyBtn.onclick = () => {
                try {
                    const url = new URL('read.html', location.href);
                    url.searchParams.set('title', book.title || '');
                    url.searchParams.set('source', book.pdf || book.file || '');
                    const href = url.href;
                    if (navigator.clipboard) {
                        navigator.clipboard.writeText(href).then(() => notify('Link disalin ke clipboard!', 'success'), () => notify(href, 'info', 6000));
                    } else {
                        notify('Browser tidak mendukung clipboard. URL: ' + href, 'info', 6000);
                    }
                } catch (e) {
                    notify('Gagal membentuk URL.', 'error');
                }
            };
        }

        const modalStars = Array.from(document.querySelectorAll('#modalStars i'));
        const myRating = userRatings[book.id];
        updateVisualStars(myRating ? (typeof myRating === 'object' ? myRating.score : myRating) : 0);
        if (feedback) feedback.innerText = myRating ? 'Rating tersimpan.' : 'Beri penilaian.';

        if (modalStars.length > 0) {
            // remove previous handlers
            modalStars.forEach(star => {
                star.onmousemove = star.onclick = star.onmouseleave = null;
            });

            // Helper to compute rating from star element + clientX
            function computeRatingFromEvent(starEl, clientX) {
                const rect = starEl.getBoundingClientRect();
                const rel = Math.max(0, Math.min(1, (clientX - rect.left) / (rect.width || 1)));
                const starIndex = parseInt(starEl.dataset.val, 10) || 0;
                const raw = (starIndex - 1) + rel; // e.g. 3 + 0.4 => 3.4
                return Math.round(raw * 10) / 10; // round to 1 decimal
            }

            // Preview on hover/move
            const starsContainer = document.getElementById('modalStars');
            let savedVal = userRatings[book.id] ? (typeof userRatings[book.id] === 'object' ? userRatings[book.id].score : Number(userRatings[book.id])) : 0;

            // mouse move preview (existing)
            starsContainer.addEventListener('mousemove', (ev) => {
                const target = ev.target.closest('i[data-val]');
                if (!target) return;
                const preview = computeRatingFromEvent(target, ev.clientX);
                updateVisualStars(preview);
            });
            starsContainer.addEventListener('mouseleave', () => {
                updateVisualStars(savedVal);
            });

            // touch support: preview on touchmove, commit on touchend
            let lastTouchPreview = null;
            starsContainer.addEventListener('touchstart', (ev) => {
                if (!ev.touches || !ev.touches[0]) return;
                const touch = ev.touches[0];
                const el = document.elementFromPoint(touch.clientX, touch.clientY);
                const target = el && el.closest && el.closest('i[data-val]');
                if (!target) return;
                ev.preventDefault();
                lastTouchPreview = computeRatingFromEvent(target, touch.clientX);
                updateVisualStars(lastTouchPreview);
            }, { passive: false });

            starsContainer.addEventListener('touchmove', (ev) => {
                if (!ev.touches || !ev.touches[0]) return;
                const touch = ev.touches[0];
                const el = document.elementFromPoint(touch.clientX, touch.clientY);
                const target = el && el.closest && el.closest('i[data-val]');
                if (!target) return;
                ev.preventDefault();
                lastTouchPreview = computeRatingFromEvent(target, touch.clientX);
                updateVisualStars(lastTouchPreview);
            }, { passive: false });

            starsContainer.addEventListener('touchend', (ev) => {
                if (lastTouchPreview == null) {
                    // restore saved value
                    updateVisualStars(savedVal);
                    return;
                }
                // commit touch preview as rating
                if (!currentUser) { notify('Login dulu!', 'info'); lastTouchPreview = null; updateVisualStars(savedVal); return; }
                const newRating = lastTouchPreview;
                userRatings[book.id] = { score: parseFloat(newRating), date: new Date().toISOString() };
                try { localStorage.setItem('userRatings', JSON.stringify(userRatings)); } catch (e) {}
                savedVal = userRatings[book.id].score;
                updateVisualStars(savedVal);
                if (feedback) feedback.innerText = 'Terima kasih! Rating tersimpan.';
                renderBooks(searchInput ? searchInput.value : '', getActiveCategory());
                lastTouchPreview = null;
            }, { passive: false });

            // Click to set rating (supports decimals) — existing handlers preserved
            modalStars.forEach(star => {
                star.addEventListener('click', function (ev) {
                    if (!currentUser) { notify('Login dulu!', 'info'); return; }
                    const newRating = computeRatingFromEvent(this, ev.clientX);
                    userRatings[book.id] = { score: parseFloat(newRating), date: new Date().toISOString() };
                    try { localStorage.setItem('userRatings', JSON.stringify(userRatings)); } catch (e) {}
                    savedVal = userRatings[book.id].score;
                    updateVisualStars(savedVal);
                    if (feedback) feedback.innerText = 'Terima kasih! Rating tersimpan.';
                    renderBooks(searchInput ? searchInput.value : '', getActiveCategory());
                    // small animation: pulse numeric value
                    const numEl = document.getElementById('modalRatingNumber');
                    if (numEl) {
                        numEl.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 300 });
                    }
                });
            });
        }

        modal.classList.add('active');
    }

    function updateVisualStars(val) {
        const stars = Array.from(document.querySelectorAll('#modalStars i'));
        if (!stars || stars.length === 0) return;
        const n = Number(val) || 0;

        // For each star, compute how much of that star should be filled (0..100%)
        stars.forEach((s, idx) => {
            const vIndex = idx + 1; // 1-based index
            const fillPct = Math.max(0, Math.min(100, (n - (vIndex - 1)) * 100));
            // Use gradient + background-clip:text to render partial fill; fallback to color if not supported
            s.style.background = `linear-gradient(90deg, #f59e0b ${fillPct}%, #e5e7eb ${fillPct}%)`;
            s.style.webkitBackgroundClip = 'text';
            s.style.backgroundClip = 'text';
            s.style.color = 'transparent';
            s.style.transition = 'background 220ms ease';
            s.setAttribute('aria-hidden', 'true');
        });

        // update numeric rating element beside the stars (if present)
        const numEl = document.getElementById('modalRatingNumber');
        if (numEl) {
            numEl.textContent = Number(n).toFixed(1);
            numEl.setAttribute('aria-label', `Rating ${Number(n).toFixed(1)}`);
        }
    }

    window.closeModal = () => { if (modal) modal.classList.remove('active'); };
    if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) window.closeModal(); });

    // Guest banner: show if no currentUser and not dismissed
    (function setupGuestBanner() {
        const banner = document.getElementById('guestBanner');
        const dismissed = localStorage.getItem('guestBannerDismissed') === 'true';
        if (!currentUser && banner && !dismissed) banner.style.display = '';
        const dismissBtn = document.getElementById('dismissGuestBanner');
        if (dismissBtn) dismissBtn.addEventListener('click', () => {
            banner && (banner.style.display = 'none');
            localStorage.setItem('guestBannerDismissed', 'true');
        });
    })();

    // Inject lightweight skeletons before rendering books
    function showGridSkeleton(count = 8) {
        const host = document.getElementById('bookGrid');
        if (!host) return;
        host.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const card = document.createElement('div');
            card.className = 'book-card skeleton';
            const img = document.createElement('div'); img.style.height = '220px'; img.style.borderBottom = '1px solid var(--border)';
            const info = document.createElement('div'); info.className = 'book-info';
            const tag = document.createElement('div'); tag.className = 'tag'; tag.style.width = '80px';
            const h3 = document.createElement('div'); h3.style.height = '16px'; h3.style.margin = '8px 0';
            const p = document.createElement('div'); p.style.height = '14px';
            const footer = document.createElement('div'); footer.className = 'card-footer'; footer.style.height = '24px';
            info.appendChild(tag); info.appendChild(h3); info.appendChild(p);
            card.appendChild(img); card.appendChild(info); card.appendChild(footer);
            host.appendChild(card);
        }
    }

    // === NEW: Back to Top button ===
    (function setupBackToTop() {
        let btn = document.getElementById('backToTopBtn');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'backToTopBtn';
            btn.className = 'back-to-top';
            btn.innerHTML = '<i class="fas fa-arrow-up"></i>';
            btn.title = 'Kembali ke atas';
            document.body.appendChild(btn);
        }
        window.addEventListener('scroll', () => {
            btn.classList.toggle('visible', window.scrollY > 400);
        }, { passive: true });
        btn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    })();

    // === NEW: Keyboard shortcuts ===
    document.addEventListener('keydown', (e) => {
        // Escape closes modal
        if (e.key === 'Escape') {
            if (typeof window.closeModal === 'function') window.closeModal();
            // also close any open status dropdown
            document.querySelectorAll('.status-dropdown.active').forEach(d => d.classList.remove('active'));
        }
        // "/" focuses search (if not already in an input)
        if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
            e.preventDefault();
            const si = document.getElementById('searchInput');
            if (si) si.focus();
        }
    });

    // Initial Render
    renderBooks();
});