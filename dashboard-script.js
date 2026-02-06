document.addEventListener('DOMContentLoaded', () => {
    
    // =========================================
    // 1. AUTH & PROFILE (FINAL FIX)
    // =========================================
    const currentUser = localStorage.getItem('currentUser');
    
    // Ambil elemen dengan ID yang PASTI
    const profileMenu = document.getElementById('profileMenu') || document.querySelector('.profile-menu');
    const loginBtnContainer = document.getElementById('loginBtnContainer');
    
    // Element User Info (Pakai ID baru)
    const avatarImg = document.getElementById('userAvatar');
    const userNameSpan = document.getElementById('userNameDisplay');
    
    // Dropdown Trigger
    const profileTrigger = document.querySelector('.profile-trigger');
    const dropdown = document.querySelector('.dropdown-menu');
    
    // Cek Status Login
    if (currentUser) {
        // A. JIKA LOGIN: Tampilkan Profil, Sembunyikan Tombol Login
        if (profileMenu) profileMenu.style.display = 'block'; 
        if (loginBtnContainer) loginBtnContainer.style.display = 'none';
        
        // Update Nama
        if (userNameSpan) userNameSpan.innerText = `Halo, ${currentUser}`;
        
        // Update Foto Profil (Anti Gagal)
        if (avatarImg) {
            avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser)}&background=10b981&color=fff&bold=true`;
        }

        // --- DROPDOWN LOGIC ---
        if (profileTrigger && dropdown) {
            profileTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('active');
            });

            document.addEventListener('click', (e) => {
                if (!profileTrigger.contains(e.target) && !dropdown.contains(e.target)) {
                    dropdown.classList.remove('active');
                }
            });
        }

        // --- LOGOUT LOGIC (ID: btnLogout) ---
        const btnLogout = document.getElementById('btnLogout');
        if (btnLogout) {
            btnLogout.addEventListener('click', (e) => {
                e.preventDefault(); // Matikan link
                if (confirm("Yakin ingin keluar akun?")) {
                    localStorage.removeItem('currentUser'); // Hapus sesi
                    window.location.replace('login.html'); // Pindah halaman
                }
            });
        }

    } else {
        // B. JIKA TIDAK LOGIN: Sembunyikan Profil, Tampilkan Tombol Login
        if (profileMenu) profileMenu.style.display = 'none';
        if (loginBtnContainer) loginBtnContainer.style.display = 'block';
    }

    // =========================================
    // 2. DARK MODE & MOBILE MENU
    // =========================================
    const themeToggles = document.querySelectorAll('.theme-btn');
    const root = document.documentElement;

    if (localStorage.getItem('theme') === 'dark') {
        root.setAttribute('data-theme', 'dark');
        themeToggles.forEach(btn => btn.querySelector('i').className = 'fas fa-sun');
    }

    themeToggles.forEach(btn => {
        btn.addEventListener('click', () => {
            const isDark = root.getAttribute('data-theme') === 'dark';
            const newTheme = isDark ? 'light' : 'dark';
            root.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            const newIcon = isDark ? 'fa-moon' : 'fa-sun';
            themeToggles.forEach(b => b.querySelector('i').className = `fas ${newIcon}`);
        });
    });

    const menuBtn = document.getElementById('mobileMenuBtn');
    const navMenu = document.getElementById('navMenu');
    if(menuBtn && navMenu) {
        menuBtn.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            const icon = menuBtn.querySelector('i');
            icon.className = navMenu.classList.contains('active') ? 'fas fa-times' : 'fas fa-bars';
        });
    }

    // =========================================
    // 3. DATA BUKU
    // =========================================
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

    let uploadedBooks = currentUser ? (JSON.parse(localStorage.getItem(`uploads_${currentUser}`)) || []) : [];
    let allBooks = [...uploadedBooks.reverse(), ...defaultBooks]; 

    // --- 4. RENDER LOGIC ---
    const bookGrid = document.getElementById('bookGrid');
    const searchInput = document.getElementById('searchInput');
    const dashboardSort = document.getElementById('dashboardSort');
    const categoryTabs = document.querySelectorAll('.btn-cat');
    const modal = document.getElementById('bookModal');

    // Data User
    const userRatings = JSON.parse(localStorage.getItem('userRatings') || '{}');
    let savedBooks = currentUser ? (JSON.parse(localStorage.getItem(`savedBooks_${currentUser}`) || '[]')) : [];
    let readingHistory = currentUser ? (JSON.parse(localStorage.getItem(`readingHistory_${currentUser}`) || '{}')) : {};

    function getBookStatus(book) {
        if (!currentUser) return 'none';
        if (readingHistory[book.title] === 'finished') return 'finished';
        if (readingHistory[book.title] === 'reading') return 'reading';
        if (savedBooks.some(b => b.id.toString() === book.id.toString())) return 'want';
        return 'none';
    }

    function setBookStatus(book, newStatus) {
        if (!currentUser) return alert('Silakan login terlebih dahulu!');
        
        delete readingHistory[book.title];
        savedBooks = savedBooks.filter(b => b.id.toString() !== book.id.toString());
        
        if (newStatus === 'want') savedBooks.push(book);
        else if (newStatus === 'reading') readingHistory[book.title] = 'reading';
        else if (newStatus === 'finished') readingHistory[book.title] = 'finished';
        
        localStorage.setItem(`savedBooks_${currentUser}`, JSON.stringify(savedBooks));
        localStorage.setItem(`readingHistory_${currentUser}`, JSON.stringify(readingHistory));
    }

    function generateStars(rating) {
        let stars = '';
        for (let i = 1; i <= 5; i++) {
            if (i <= Math.floor(rating)) stars += '<i class="fas fa-star filled" style="color:#f59e0b"></i>';
            else if (i === Math.ceil(rating) && !Number.isInteger(rating)) stars += '<i class="fas fa-star-half-alt filled" style="color:#f59e0b"></i>';
            else stars += '<i class="far fa-star" style="color:#e5e7eb"></i>';
        }
        return stars;
    }

    function renderBooks(filterText = '', category = 'all') {
        if (!bookGrid) return;
        bookGrid.innerHTML = '';

        let filtered = allBooks.filter(b => {
            const matchText = b.title.toLowerCase().includes(filterText.toLowerCase()) || 
                              b.author.toLowerCase().includes(filterText.toLowerCase());
            let matchCat = (category === 'all') || (b.category === category);
            
            if(['want', 'reading', 'finished'].includes(category)) {
                const status = getBookStatus(b);
                matchCat = (status === category);
            }
            return matchText && matchCat;
        });

        const sortVal = dashboardSort ? dashboardSort.value : 'default';
        if (sortVal === 'rating') filtered.sort((a,b) => b.rating - a.rating);
        if (sortVal === 'az') filtered.sort((a,b) => a.title.localeCompare(b.title));

        if (filtered.length === 0) {
            bookGrid.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:gray; padding:20px;">Buku tidak ditemukan.</div>`;
            return;
        }

        filtered.forEach(book => {
            const card = document.createElement('div');
            card.className = 'book-card';
            
            const imgSrc = book.img || book.image || book.cover || 'https://via.placeholder.com/300x450?text=No+Cover';
            
            const status = getBookStatus(book);
            let btnClass = '', btnIcon = 'far fa-bookmark';
            if (status === 'want') { btnClass = 'want'; btnIcon = 'fas fa-bookmark'; }
            else if (status === 'reading') { btnClass = 'reading'; btnIcon = 'fas fa-book-reader'; }
            else if (status === 'finished') { btnClass = 'finished'; btnIcon = 'fas fa-check-circle'; }

            const ratingVal = userRatings[book.title] ? userRatings[book.title].score : (book.rating || 0);

            card.innerHTML = `
                <div class="book-status-wrapper">
                    <button class="btn-status-toggle ${btnClass}"><i class="${btnIcon}"></i></button>
                    <div class="status-dropdown">
                        <button class="status-option" data-val="want"><i class="fas fa-bookmark"></i> Ingin</button>
                        <button class="status-option" data-val="reading"><i class="fas fa-book-reader"></i> Baca</button>
                        <button class="status-option" data-val="finished"><i class="fas fa-check-circle"></i> Selesai</button>
                        <button class="status-option" data-val="none"><i class="fas fa-trash"></i> Hapus</button>
                    </div>
                </div>
                <img src="${imgSrc}" alt="${book.title}" loading="lazy">
                <div class="book-info">
                    <span class="tag">${book.category}</span>
                    <h3>${book.title}</h3>
                    <p>${book.author}</p>
                    <div class="card-footer">
                        <div class="interactive-stars">${generateStars(ratingVal)}</div>
                        <span class="rating-number">${parseFloat(ratingVal).toFixed(1)}</span>
                    </div>
                </div>
            `;

            const wrapper = card.querySelector('.book-status-wrapper');
            const toggleBtn = wrapper.querySelector('.btn-status-toggle');
            const statusDropdown = wrapper.querySelector('.status-dropdown');

            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.status-dropdown').forEach(d => { if(d!==statusDropdown) d.classList.remove('active'); });
                statusDropdown.classList.toggle('active');
            });

            wrapper.querySelectorAll('.status-option').forEach(opt => {
                opt.addEventListener('click', (e) => {
                    e.stopPropagation();
                    setBookStatus(book, opt.dataset.val);
                    statusDropdown.classList.remove('active');
                    const activeCat = document.querySelector('.btn-cat.active')?.dataset.cat || 'all';
                    renderBooks(searchInput.value, activeCat);
                });
            });

            card.addEventListener('click', (e) => {
                if (!e.target.closest('.book-status-wrapper')) {
                    openModal(book);
                }
            });

            bookGrid.appendChild(card);
        });
    }

    // =========================================
    // 5. MODAL & SECURITY
    // =========================================
    function openModal(book) {
        if (!modal) return;
        
        const imgEl = document.getElementById('modalImg');
        if(imgEl) imgEl.src = book.img || book.image || book.cover;
        
        document.getElementById('modalTitle').innerText = book.title;
        document.getElementById('modalAuthor').innerText = book.author;
        
        const badges = document.getElementById('modalBadges');
        if(badges) badges.innerHTML = `<span class="tag">${book.category}</span>`;

        const readBtn = document.getElementById('readBtn');
        if(readBtn) {
            readBtn.onclick = () => {
                if (!currentUser) {
                    if(confirm("Eits! Fitur baca hanya untuk anggota terdaftar. Mau daftar sekarang (Gratis)?")) {
                        window.location.href = 'signup.html';
                    }
                    return;
                }

                const isMobile = window.innerWidth <= 768;
                const targetPage = isMobile ? 'read-mobile.html' : 'read.html';
                const source = book.fileData || book.pdf;
                
                if (source) {
                    window.location.href = `${targetPage}?source=${encodeURIComponent(source)}`;
                } else {
                    alert("File buku tidak ditemukan!");
                }
            };
        }

        modal.classList.add('active');
    }

    window.closeModal = () => { if(modal) modal.classList.remove('active'); };
    window.onclick = (e) => { if (e.target === modal) window.closeModal(); };

    // --- Global Listeners ---
    document.addEventListener('click', (e) => {
        if(!e.target.closest('.book-status-wrapper')) {
            document.querySelectorAll('.status-dropdown').forEach(d => d.classList.remove('active'));
        }
    });

    if(searchInput) searchInput.addEventListener('input', (e) => {
        const cat = document.querySelector('.btn-cat.active')?.dataset.cat || 'all';
        renderBooks(e.target.value, cat);
    });

    if(dashboardSort) dashboardSort.addEventListener('change', () => {
        const cat = document.querySelector('.btn-cat.active')?.dataset.cat || 'all';
        renderBooks(searchInput.value, cat);
    });

    categoryTabs.forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-cat').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderBooks(searchInput.value, btn.dataset.cat);
        });
    });

    // Start
    renderBooks();
});