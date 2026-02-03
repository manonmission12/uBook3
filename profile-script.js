document.addEventListener('DOMContentLoaded', () => {
    
    // --- DATA BUKU SOURCE (Agar profil bisa mengenali buku dari judul) ---
    const defaultBooks = [
        { id: "B1", title: "Filosofi Teras", category: "Filsafat", img: "covers/filosofi teras.png", pdf: "books/1. Filosofi Teras.pdf" },
        { id: "B2", title: "This is Marketing", category: "Bisnis", img: "covers/this is marketing.png", pdf: "books/2. This is marketing.pdf" },
        { id: "B3", title: "Atomic Habits", category: "Self-Improvement", img: "covers/atomic habits.png", pdf: "books/3. Atomic Habits.pdf" },
        { id: "B4", title: "Psychology of Money", category: "Self-Improvement", img: "covers/the psychology of money.png", pdf: "books/4. The Psychology of Money.pdf" },
        { id: "B5", title: "Citizen 4.0", category: "Bisnis", img: "covers/citizen 4.0.png", pdf: "books/5. Citizen 4.0.pdf" },
        { id: "B6", title: "Find Your Why", category: "Self-Improvement", img: "covers/find your why.png", pdf: "books/6. Find your why.pdf" },
        { id: "B7", title: "How To Win Friends", category: "Self-Improvement", img: "covers/how to win friends&influence people.png", pdf: "books/7. How to win friend & influence people.pdf" },
        { id: "B8", title: "Marketing 4.0", category: "Bisnis", img: "covers/marketing 4.0.png", pdf: "books/8. Marketing 4.0.pdf" },
        { id: "B9", title: "Marketing in Crisis", category: "Bisnis", img: "covers/marketing in crisis.png", pdf: "books/9. Marketing in Crisis.pdf" },
        { id: "B10", title: "Mindset", category: "Self-Improvement", img: "covers/mindset.png", pdf: "books/10. Mindset.pdf" },
        { id: "B11", title: "Bodo Amat", category: "Self-Improvement", img: "covers/sebuah seni untuk bersikap bodo amat.png", pdf: "books/11. Sebuah Seni untuk Bersikap Bodo Amat.pdf" },
        { id: "B12", title: "Thinking, Fast & Slow", category: "Self-Improvement", img: "covers/thinking fast and slow.png", pdf: "books/12. Thinking, fast and slow.pdf" },
        { id: "B13", title: "Grit", category: "Self-Improvement", img: "covers/grit.png", pdf: "books/grit.pdf" },
        { id: "B14", title: "Show Your Work", category: "Self-Improvement", img: "covers/Show Your Work.png", pdf: "books/14. Show your work.pdf" },
        { id: "B15", title: "Intelligent Investor", category: "Bisnis", img: "covers/the intelligent investor.png", pdf: "books/15. The Intelligent Investor.pdf" },
        { id: "B16", title: "Think Like a Freak", category: "Self-Improvement", img: "covers/think like a freak.png", pdf: "books/16. Think like a freak.pdf" }
    ];
    let uploadedBooksSource = JSON.parse(localStorage.getItem('myUploadedBooks') || '[]');
    let allBooksSource = [...uploadedBooksSource, ...defaultBooks]; 

    // --- SETUP PROFIL ---
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) { window.location.href = 'login.html'; return; }

    document.getElementById('displayName').innerText = currentUser;
    
    const savedAvatar = localStorage.getItem(`avatar_${currentUser}`);
    const avatarDisplay = document.getElementById('profileAvatarDisplay');
    if (savedAvatar) { avatarDisplay.innerHTML = `<img src="${savedAvatar}" alt="Avatar">`; }

    const avatarInput = document.getElementById('avatarInput');
    avatarInput.addEventListener('change', function() {
        const file = this.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const result = e.target.result;
                try {
                    localStorage.setItem(`avatar_${currentUser}`, result);
                    avatarDisplay.innerHTML = `<img src="${result}" alt="Avatar">`;
                    alert("Foto profil diperbarui!");
                } catch (err) { alert("Gambar terlalu besar! Gunakan ukuran lebih kecil."); }
            }
            reader.readAsDataURL(file);
        }
    });

    // --- RENDER SECTION BUKU ---
    
    // 1. Upload Saya
    document.getElementById('statUploads').innerText = uploadedBooksSource.length;
    renderList('userBookGrid', uploadedBooksSource.reverse(), "Kamu belum mengupload buku.");

    // 2. Disimpan (Favorit)
    const savedBooks = JSON.parse(localStorage.getItem(`savedBooks_${currentUser}`) || '[]');
    document.getElementById('statSaved').innerText = savedBooks.length;
    renderList('savedBookGrid', savedBooks, "Belum ada buku yang disimpan.");

    // 3. Riwayat Baca (Sedang & Selesai)
    const readingHistory = JSON.parse(localStorage.getItem(`readingHistory_${currentUser}`) || '{}');
    
    // Filter buku berdasarkan status di history
    const readingList = [];
    const finishedList = [];

    // Loop semua judul di history
    Object.keys(readingHistory).forEach(title => {
        const status = readingHistory[title];
        // Cari data buku lengkap dari allBooksSource
        const bookData = allBooksSource.find(b => b.title === title);
        
        if (bookData) {
            if (status === 'reading') readingList.push(bookData);
            else if (status === 'finished') finishedList.push(bookData);
        }
    });

    renderList('readingSection', readingList, "Tidak ada buku yang sedang dibaca.");
    renderList('finishedSection', finishedList, "Belum ada buku yang selesai dibaca.");


    // FUNGSI RENDER UMUM
    function renderList(elementId, booksArray, emptyMessage) {
        const grid = document.getElementById(elementId);
        grid.innerHTML = '';

        if (booksArray.length > 0) {
            booksArray.forEach(book => {
                const card = document.createElement('div');
                card.className = 'mini-book-card';
                card.onclick = () => {
                    // Update status jadi reading lagi kalau diklik (opsional, biar jadi last read)
                    const history = JSON.parse(localStorage.getItem(`readingHistory_${currentUser}`) || '{}');
                    if (history[book.title] !== 'finished') {
                        history[book.title] = 'reading';
                        localStorage.setItem(`readingHistory_${currentUser}`, JSON.stringify(history));
                    }

                    const safeTitle = encodeURIComponent(book.title);
                    const safeSource = encodeURIComponent(book.pdf || book.file || '');
                    window.location.href = `read.html?title=${safeTitle}&source=${safeSource}`;
                };

                card.innerHTML = `
                    <img src="${book.img || book.image || book.cover}" alt="${book.title}" onerror="this.src='https://via.placeholder.com/150'">
                    <div class="mini-info">
                        <h4>${book.title}</h4>
                        <p>${book.category}</p>
                    </div>
                `;
                grid.appendChild(card);
            });
        } else {
            grid.innerHTML = `<p class="empty-msg">${emptyMessage}</p>`;
        }
    }

    document.getElementById('logoutBtn').addEventListener('click', () => {
        if(confirm('Keluar akun?')) {
            localStorage.removeItem('currentUser');
            window.location.href = 'login.html';
        }
    });

    const themeToggle = document.getElementById('themeToggle');
    const root = document.documentElement;
    root.setAttribute('data-theme', localStorage.getItem('theme') || 'light');
    if(themeToggle) themeToggle.addEventListener('click', () => {
        const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
    });
});