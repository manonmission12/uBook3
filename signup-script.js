document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    // --- Theme toggle ---
    const root = document.documentElement;
    const themeBtn = document.getElementById('themeToggle');
    const themeIcon = themeBtn ? themeBtn.querySelector('i') : null;

    const saved = localStorage.getItem('theme') || 'light';
    root.setAttribute('data-theme', saved);
    if (themeIcon && saved === 'dark') themeIcon.classList.replace('fa-moon', 'fa-sun');

    themeBtn && themeBtn.addEventListener('click', () => {
        const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
        if (themeIcon) { themeIcon.classList.toggle('fa-moon'); themeIcon.classList.toggle('fa-sun'); }
    });

    // --- Hash helper ---
    async function hashPassword(pwd) {
        if (!pwd) return '';
        const enc = new TextEncoder();
        const data = await crypto.subtle.digest('SHA-256', enc.encode(pwd));
        return Array.from(new Uint8Array(data)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // --- Signup form ---
    const form = document.getElementById('signupForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const fullname = (document.getElementById('fullname')?.value || '').trim();
        const email = (document.getElementById('email')?.value || '').trim();
        const username = (document.getElementById('username')?.value || '').trim();
        const password = document.getElementById('password')?.value || '';

        // Validasi
        if (!fullname || !email || !username || !password) {
            if (typeof toast === 'function') toast('Semua field wajib diisi!', 'error');
            else alert('Semua field wajib diisi!');
            return;
        }

        if (password.length < 6) {
            if (typeof toast === 'function') toast('Password minimal 6 karakter!', 'error');
            else alert('Password minimal 6 karakter!');
            return;
        }

        // Email format check
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            if (typeof toast === 'function') toast('Format email tidak valid!', 'error');
            else alert('Format email tidak valid!');
            return;
        }

        // Load existing users
        let users = [];
        try { users = JSON.parse(localStorage.getItem('users') || '[]'); } catch { users = []; }
        if (!Array.isArray(users)) users = [];

        // Check duplicate
        if (users.some(u => u && u.username === username)) {
            if (typeof toast === 'function') toast('Username sudah dipakai!', 'error');
            else alert('Username sudah dipakai!');
            return;
        }

        if (users.some(u => u && u.email === email)) {
            if (typeof toast === 'function') toast('Email sudah terdaftar!', 'error');
            else alert('Email sudah terdaftar!');
            return;
        }

        // Hash & save
        const hashed = await hashPassword(password);
        const newUser = {
            fullname,
            email,
            username,
            password: hashed,
            joinDate: new Date().toISOString()
        };

        users.push(newUser);
        try { localStorage.setItem('users', JSON.stringify(users)); } catch { /* ignore */ }

        // Auto login
        localStorage.setItem('currentUser', username);

        // Confetti 🎉
        if (typeof confetti === 'function') {
            confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
        }

        // Feedback
        const btn = form.querySelector('button[type="submit"]');
        if (btn) btn.innerHTML = '<i class="fas fa-check"></i> Berhasil!';

        if (typeof toast === 'function') toast('Akun berhasil dibuat! 🎉', 'success');

        // Redirect
        setTimeout(() => { window.location.href = 'index.html'; }, 1400);
    });
});