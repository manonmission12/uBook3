document.addEventListener('DOMContentLoaded', () => {
    
    // --- 0. DARK MODE SETUP ---
    const themeToggle = document.getElementById('themeToggle');
    const root = document.documentElement;
    const icon = themeToggle ? themeToggle.querySelector('i') : null;

    const savedTheme = localStorage.getItem('theme') || 'light';
    root.setAttribute('data-theme', savedTheme);
    if(icon && savedTheme === 'dark') icon.classList.replace('fa-moon', 'fa-sun');

    if(themeToggle) {
        themeToggle.addEventListener('click', () => {
            const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            root.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
            if(icon) { icon.classList.toggle('fa-moon'); icon.classList.toggle('fa-sun'); }
        });
    }

    // --- 1. PROSES PENDAFTARAN ---
    const signupForm = document.getElementById('signupForm');

    signupForm.addEventListener('submit', (e) => {
        e.preventDefault();

        // Ambil Data dari Form
        const fullname = document.getElementById('fullname').value.trim();
        const email = document.getElementById('email').value.trim(); // DATA EMAIL BARU
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        // Validasi Sederhana
        if (!fullname || !email || !username || !password) {
            alert("Harap isi semua kolom!"); return;
        }
        if (!email.includes('@') || !email.includes('.')) {
            alert("Format email tidak valid!"); return;
        }
        if (password.length < 6) {
            alert("Password minimal 6 karakter!"); return;
        }

        // Cek apakah username sudah ada
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        if (users.find(u => u.username === username)) {
            alert("Username sudah terpakai, coba yang lain!"); return;
        }
        
        // Cek apakah email sudah ada (opsional, biar lebih valid)
        if (users.find(u => u.email === email)) {
            alert("Email ini sudah terdaftar!"); return;
        }

        // Simpan User Baru ke Array
        const newUser = {
            fullname: fullname,
            email: email, // Simpan Email
            username: username,
            password: password,
            joined: new Date().toISOString()
        };

        users.push(newUser);
        localStorage.setItem('users', JSON.stringify(users));

        // Efek Sukses (Confetti)
        const btn = signupForm.querySelector('button');
        const originalText = btn.innerText;
        btn.innerHTML = '<i class="fas fa-check"></i> Berhasil!';
        btn.style.opacity = '0.8';
        
        if (typeof confetti === 'function') confetti();

        // Redirect ke Login setelah 2 detik
        setTimeout(() => {
            alert("Pendaftaran berhasil! Silakan login.");
            window.location.href = 'login.html'; 
        }, 2000);
    });
});