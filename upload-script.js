// ...existing code...
document.addEventListener('DOMContentLoaded', () => {

    // simple notification replacement (no toast.js)
    function notify(msg) { alert(msg); }

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
    if (!uploadForm) return;

    // NEW: cover preview + basic URL validation helpers
    const coverInput = document.getElementById('bookCover');
    const coverPreviewWrap = document.getElementById('coverPreviewWrap');
    const coverPreviewImg = document.getElementById('coverPreviewImg');

    function isHttpUrl(s) {
        try {
            const u = new URL(String(s || ''));
            return u.protocol === 'http:' || u.protocol === 'https:';
        } catch { return false; }
    }
    function looksLikePdfUrl(s) {
        try {
            const u = new URL(String(s || ''));
            return (u.pathname || '').toLowerCase().endsWith('.pdf');
        } catch { return false; }
    }

    if (coverInput && coverPreviewWrap && coverPreviewImg) {
        coverInput.addEventListener('input', () => {
            const v = coverInput.value.trim();
            if (!v || !isHttpUrl(v)) { coverPreviewWrap.style.display = 'none'; return; }
            coverPreviewImg.src = v;
            coverPreviewWrap.style.display = '';
            coverPreviewImg.onerror = () => { coverPreviewWrap.style.display = 'none'; };
        });
    }

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

        // NEW: validate URLs
        if (!isHttpUrl(cover)) {
            alert("Link cover tidak valid. Gunakan URL http/https.");
            return;
        }
        if (!isHttpUrl(file)) {
            alert("Link file PDF tidak valid. Gunakan URL http/https.");
            return;
        }
        if (!looksLikePdfUrl(file)) {
            alert("Link file harus berakhiran .pdf");
            return;
        }

        // Buat Object Buku Baru
        const newBook = {
            id: 'U-' + Date.now(),
            title: title,
            author: author,
            category: category,
            img: cover,
            pdf: file,
            uploadedBy: currentUser,
            uploadedAt: new Date().toISOString()
        };

        // Simpan global (untuk dashboard) dan juga per-user (untuk profil)
        const existingBooks = JSON.parse(localStorage.getItem('myUploadedBooks') || '[]');
        existingBooks.push(newBook);
        localStorage.setItem('myUploadedBooks', JSON.stringify(existingBooks));
        const userUploadsKey = `uploads_${currentUser}`;
        const userUploads = JSON.parse(localStorage.getItem(userUploadsKey) || '[]');
        userUploads.push(newBook);
        localStorage.setItem(userUploadsKey, JSON.stringify(userUploads));

        notify("Buku berhasil diupload! Terima kasih kontribusinya.");
        uploadForm.reset();
        setTimeout(() => window.location.href = 'profile.html', 700);
    });
});
// ...existing code...