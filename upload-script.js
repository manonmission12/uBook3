document.addEventListener('DOMContentLoaded', () => {
    
    // --- 0. CEK LOGIN (PENTING) ---
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) {
        alert("Silakan login terlebih dahulu untuk mengupload buku.");
        window.location.href = 'login.html';
        return;
    }

    // --- 1. DARK MODE SETUP ---
    const themeToggle = document.getElementById('themeToggle');
    const root = document.documentElement;
    const icon = themeToggle ? themeToggle.querySelector('i') : null;

    if(localStorage.getItem('theme') === 'dark') {
        root.setAttribute('data-theme', 'dark');
        if(icon) icon.classList.replace('fa-moon', 'fa-sun');
    }

    if(themeToggle) {
        themeToggle.addEventListener('click', () => {
            const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            root.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
            if(icon) { icon.classList.toggle('fa-moon'); icon.classList.toggle('fa-sun'); }
        });
    }

    // --- 2. LOGIKA UPLOAD ---
    const uploadForm = document.getElementById('uploadForm');

    uploadForm.addEventListener('submit', (e) => {
        e.preventDefault();

        // Ambil Nilai dari Input
        const title = document.getElementById('bookTitle').value.trim();
        const author = document.getElementById('bookAuthor').value.trim();
        const category = document.getElementById('bookCategory').value;
        const cover = document.getElementById('bookCover').value.trim();
        const file = document.getElementById('bookFile').value.trim();

        // Validasi Sederhana
        if (!category) {
            alert("Harap pilih kategori buku!");
            return;
        }

        // Buat Object Buku Baru
        const newBook = {
            id: 'U-' + Date.now(), // ID Unik berdasarkan waktu
            title: title,
            author: author,
            category: category,
            img: cover,
            pdf: file,
            uploadedBy: currentUser,
            uploadedAt: new Date().toISOString()
        };

        // Simpan ke LocalStorage ('myUploadedBooks')
        const existingBooks = JSON.parse(localStorage.getItem('myUploadedBooks') || '[]');
        existingBooks.push(newBook);
        localStorage.setItem('myUploadedBooks', JSON.stringify(existingBooks));

        // Feedback & Redirect
        alert("Buku berhasil diupload! Terima kasih kontribusinya.");
        
        // Bersihkan Form
        uploadForm.reset();

        // Arahkan ke Profil agar user bisa melihat bukunya
        window.location.href = 'profile.html';
    });
});