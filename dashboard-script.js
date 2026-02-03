document.addEventListener('DOMContentLoaded', () => {
    
    // --- 0. DARK MODE (DUAL BUTTON LOGIC) ---
    // Ambil semua tombol tema (desktop & mobile)
    const themeToggles = document.querySelectorAll('.theme-btn');
    const root = document.documentElement;

    // Load Theme Awal
    if (localStorage.getItem('theme') === 'dark') {
        root.setAttribute('data-theme', 'dark');
        // Update semua ikon jadi matahari
        themeToggles.forEach(btn => {
            const icon = btn.querySelector('i');
            if(icon) { icon.classList.remove('fa-moon'); icon.classList.add('fa-sun'); }
        });
    }

    // Event Listener untuk SEMUA tombol tema
    themeToggles.forEach(btn => {
        btn.addEventListener('click', () => {
            const currentTheme = root.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            
            root.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            
            // Update ikon di SEMUA tombol secara bersamaan
            themeToggles.forEach(b => {
                const icon = b.querySelector('i');
                if (icon) {
                    if (newTheme === 'dark') {
                        icon.classList.remove('fa-moon');
                        icon.classList.add('fa-sun');
                    } else {
                        icon.classList.remove('fa-sun');
                        icon.classList.add('fa-moon');
                    }
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
            if (navMenu.classList.contains('active')) {
                menuIcon.classList.replace('fa-bars', 'fa-times');
            } else {
                menuIcon.classList.replace('fa-times', 'fa-bars');
            }
        });
    }

    // --- 2. AUTH & USER INFO (AVATAR FIX) ---
    const currentUser = localStorage.getItem('currentUser'); 
    const profileMenuWrapper = document.getElementById('profileMenuWrapper');
    const loginBtnContainer = document.getElementById('loginBtnContainer');
    const userDisplay = document.getElementById('userDisplay');

    if (currentUser) {
        if(profileMenuWrapper) profileMenuWrapper.style.display = 'flex';
        if(loginBtnContainer) loginBtnContainer.style.display = 'none';
        if(userDisplay) userDisplay.innerText = `Halo, ${currentUser}`;

        // Avatar Logic
        const avatarImg = document.querySelector('.profile-trigger .avatar');
        const savedAvatar = localStorage.getItem(`avatar_${currentUser}`);
        if (avatarImg) {
            avatarImg.src = savedAvatar ? savedAvatar : `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser)}&background=random&color=fff`;
        }

        const profileTrigger = document.getElementById('profileTrigger');
        const profileDropdown = document.getElementById('profileDropdown');
        if(profileTrigger && profileDropdown) {
            profileTrigger.addEventListener('click', (e) => { e.stopPropagation(); profileDropdown.classList.toggle('active'); });
            document.addEventListener('click', (e) => { if (!profileTrigger.contains(e.target)) profileDropdown.classList.remove('active'); });
        }
        
        const logoutBtn = document.getElementById('logoutBtn');
        if(logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                if(confirm('Yakin ingin keluar?')) { localStorage.removeItem('currentUser'); window.location.href = 'login.html'; }
            });
        }
    } else {
        if(profileMenuWrapper) profileMenuWrapper.style.display = 'none';
        if(loginBtnContainer) loginBtnContainer.style.display = 'block';
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

    let uploadedBooks = JSON.parse(localStorage.getItem(`uploads_${currentUser}`)) || [];
    let allBooks = [...uploadedBooks.reverse(), ...defaultBooks]; 

    // --- 4. RENDER BUKU ---
    const bookGrid = document.getElementById('bookGrid'); 
    const searchInput = document.getElementById('searchInput');
    const dashboardSort = document.getElementById('dashboardSort');
    const categoryTabs = document.querySelectorAll('.btn-cat');

    const userRatings = JSON.parse(localStorage.getItem('userRatings') || '{}');
    let savedBooks = JSON.parse(localStorage.getItem(`savedBooks_${currentUser}`) || '[]');
    let readingHistory = JSON.parse(localStorage.getItem(`readingHistory_${currentUser}`) || '{}');

    function getBookStatus(book) {
        if (readingHistory[book.title] === 'finished') return 'finished';
        if (readingHistory[book.title] === 'reading') return 'reading';
        if (savedBooks.some(b => b.id.toString() === book.id.toString())) return 'want';
        return 'none';
    }
    function setBookStatus(book, newStatus) {
        if (!currentUser) return;
        delete readingHistory[book.title];
        savedBooks = savedBooks.filter(b => b.id.toString() !== book.id.toString());
        if (newStatus === 'want') savedBooks.push(book);
        else if (newStatus === 'reading') readingHistory[book.title] = 'reading';
        else if (newStatus === 'finished') readingHistory[book.title] = 'finished';
        localStorage.setItem(`savedBooks_${currentUser}`, JSON.stringify(savedBooks));
        localStorage.setItem(`readingHistory_${currentUser}`, JSON.stringify(readingHistory));
    }

    function renderBooks(filterText = '', category = 'all') {
        if (!bookGrid) return;
        bookGrid.innerHTML = '';

        let filtered = allBooks.filter(b => {
            const matchText = b.title.toLowerCase().includes(filterText.toLowerCase()) || 
                              b.author.toLowerCase().includes(filterText.toLowerCase());
            let matchCat = true;
            if (category === 'all') matchCat = true;
            else if (['want', 'reading', 'finished'].includes(category)) {
                const status = getBookStatus(b);
                if (category === 'want') matchCat = (status === 'want');
                if (category === 'reading') matchCat = (status === 'reading');
                if (category === 'finished') matchCat = (status === 'finished');
            } else { matchCat = (b.category === category); }
            return matchText && matchCat;
        });

        const sortVal = dashboardSort ? dashboardSort.value : 'default';
        if (sortVal === 'az') filtered.sort((a,b) => a.title.localeCompare(b.title));
        if (sortVal === 'newest') filtered.reverse();
        if (sortVal === 'rating') filtered.sort((a,b) => b.rating - a.rating);

        if (filtered.length === 0) {
            bookGrid.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:var(--text-tertiary);"><p>Buku tidak ditemukan.</p></div>`;
            return;
        }

        filtered.forEach(book => {
            const card = document.createElement('div');
            card.className = 'book-card';
            
            const imgSrc = book.img || book.image || book.cover;
            
            const myRating = userRatings[book.title];
            const currentScore = myRating ? myRating.score : (book.rating || 0);
            
            let starsHTML = '';
            for (let i = 1; i <= 5; i++) {
                let fillClass = Math.round(currentScore) >= i ? 'filled' : '';
                starsHTML += `<i class="fas fa-star ${fillClass}" style="color: ${Math.round(currentScore) >= i ? '#f59e0b' : '#e5e7eb'}"></i>`;
            }

            const status = getBookStatus(book);
            let btnClass = '', btnIcon = 'far fa-bookmark';
            if (status === 'want') { btnClass = 'want'; btnIcon = 'fas fa-bookmark'; }
            else if (status === 'reading') { btnClass = 'reading'; btnIcon = 'fas fa-book-reader'; }
            else if (status === 'finished') { btnClass = 'finished'; btnIcon = 'fas fa-check-circle'; }

            card.innerHTML = `
                <div class="book-status-wrapper">
                    <button class="btn-status-toggle ${btnClass}" data-id="${book.id}">
                        <i class="${btnIcon}"></i>
                    </button>
                    <div class="status-dropdown">
                        <button class="status-option" data-val="want"><i class="fas fa-bookmark"></i> Ingin Dibaca</button>
                        <button class="status-option" data-val="reading"><i class="fas fa-book-reader"></i> Sedang Dibaca</button>
                        <button class="status-option" data-val="finished"><i class="fas fa-check-circle"></i> Selesai</button>
                        <button class="status-option" data-val="none"><i class="fas fa-trash-alt"></i> Hapus</button>
                    </div>
                </div>

                <img src="${imgSrc}" alt="${book.title}" onerror="this.src='https://via.placeholder.com/300x450?text=Cover'">
                <div class="book-info">
                    <span class="tag">${book.category}</span>
                    <h3>${book.title}</h3>
                    <p>${book.author}</p>
                    <div class="card-footer">
                        <div class="interactive-stars">${starsHTML}</div>
                        <span class="rating-number">${parseFloat(currentScore).toFixed(1)}</span>
                    </div>
                </div>
            `;
            
            const wrapper = card.querySelector('.book-status-wrapper');
            const toggleBtn = wrapper.querySelector('.btn-status-toggle');
            const dropdown = wrapper.querySelector('.status-dropdown');

            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!currentUser) return alert('Silakan login terlebih dahulu!');
                
                document.querySelectorAll('.status-dropdown').forEach(d => {
                    if(d !== dropdown) d.classList.remove('active');
                });
                dropdown.classList.toggle('active');
            });

            wrapper.querySelectorAll('.status-option').forEach(opt => {
                opt.addEventListener('click', (e) => {
                    e.stopPropagation();
                    setBookStatus(book, opt.dataset.val);
                    dropdown.classList.remove('active');
                    renderBooks(searchInput.value, document.querySelector('.btn-cat.active').dataset.cat);
                });
            });

            card.addEventListener('click', (e) => {
                if (!e.target.closest('.book-status-wrapper')) openModal(book);
            });

            bookGrid.appendChild(card);
        });
    }

    document.addEventListener('click', (e) => {
        if(!e.target.closest('.book-status-wrapper')) document.querySelectorAll('.status-dropdown').forEach(d => d.classList.remove('active'));
    });

    // --- 5. MODAL LOGIC ---
    const modal = document.getElementById('bookModal');
    const feedback = document.getElementById('ratingFeedback');

    function openModal(book) {
        if (!modal) return;
        document.getElementById('modalImg').src = book.img || book.image;
        document.getElementById('modalTitle').innerText = book.title;
        document.getElementById('modalAuthor').innerText = book.author;
        document.getElementById('modalBadges').innerHTML = `<span class="badge-cat">${book.category}</span>`;
        
        const readBtn = document.getElementById('readBtn');
        readBtn.onclick = () => {
            if (book.fileData) {
                const safeTitle = encodeURIComponent(book.title);
                const safeSource = encodeURIComponent(book.fileData);
                window.location.href = `read.html?title=${safeTitle}&source=${safeSource}`;
            } else if (book.pdf) {
                const safeTitle = encodeURIComponent(book.title);
                const safeSource = encodeURIComponent(book.pdf);
                window.location.href = `read.html?title=${safeTitle}&source=${safeSource}`;
            } else {
                alert("File buku tidak ditemukan!");
            }
        };

        const modalStars = document.querySelectorAll('#modalStars i');
        const myRating = userRatings[book.title];
        
        updateVisualStars(myRating ? myRating.score : 0);
        if(feedback) feedback.innerText = myRating ? "Rating tersimpan." : "Beri penilaian.";

        modalStars.forEach(star => {
            star.onclick = function() {
                if(!currentUser) return alert("Login dulu!");
                const val = this.dataset.val;
                userRatings[book.title] = { score: parseFloat(val), date: new Date().toISOString() };
                localStorage.setItem('userRatings', JSON.stringify(userRatings));
                updateVisualStars(val);
                if(feedback) feedback.innerText = "Terima kasih! Rating tersimpan.";
                renderBooks(searchInput.value, document.querySelector('.btn-cat.active').dataset.cat);
            };
        });

        modal.classList.add('active');
    }

    function updateVisualStars(val) {
        document.querySelectorAll('#modalStars i').forEach(s => {
            s.style.color = val >= parseInt(s.dataset.val) ? '#f59e0b' : '#e5e7eb';
        });
    }

    window.closeModal = () => modal.classList.remove('active');
    if(modal) modal.addEventListener('click', (e) => { if(e.target === modal) window.closeModal(); });

    // Initial Render
    renderBooks();
    
    // Listeners
    if(searchInput) searchInput.addEventListener('input', (e) => renderBooks(e.target.value, document.querySelector('.btn-cat.active').dataset.cat));
    if(dashboardSort) dashboardSort.addEventListener('change', () => renderBooks(searchInput.value, document.querySelector('.btn-cat.active').dataset.cat));
    
    categoryTabs.forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelector('.btn-cat.active').classList.remove('active');
            btn.classList.add('active');
            renderBooks(searchInput.value, btn.dataset.cat);
        });
    });
});