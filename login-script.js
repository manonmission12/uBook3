document.addEventListener('DOMContentLoaded', () => {

    // helper aman parse JSON
    function safeParse(key, fallback) {
        try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; }
        catch (e) { console.warn('JSON parse error', key); return fallback; }
    }

    async function hashPassword(pwd) {
        if (!pwd) return '';
        const enc = new TextEncoder();
        const data = await crypto.subtle.digest('SHA-256', enc.encode(pwd));
        return Array.from(new Uint8Array(data)).map(b => b.toString(16).padStart(2,'0')).join('');
    }

    // ganti notify ke toast ringan agar tidak mengganggu
    function toast(msg) {
        let c = document.getElementById('notifyContainer');
        if (!c) {
            c = document.createElement('div');
            c.id = 'notifyContainer';
            c.style.position = 'fixed';
            c.style.bottom = '20px';
            c.style.right = '20px';
            c.style.zIndex = '99999';
            c.style.display = 'flex';
            c.style.flexDirection = 'column';
            c.style.gap = '8px';
            document.body.appendChild(c);
        }
        const el = document.createElement('div');
        el.textContent = msg;
        el.style.background = '#111827';
        el.style.color = '#fff';
        el.style.padding = '10px 14px';
        el.style.borderRadius = '8px';
        el.style.boxShadow = '0 8px 24px rgba(0,0,0,0.18)';
        c.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; setTimeout(()=> el.remove(), 220); }, 1400);
    }

    // --- Dark Mode ---
    const themeToggle = document.getElementById('themeToggle');
    const root = document.documentElement;
    const icon = themeToggle ? themeToggle.querySelector('i') : null;

    const savedTheme = localStorage.getItem('theme') || 'light';
    root.setAttribute('data-theme', savedTheme);
    if (icon && savedTheme === 'dark') icon.classList.replace('fa-moon', 'fa-sun');

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const current = root.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            root.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
            if (icon) { icon.classList.toggle('fa-moon'); icon.classList.toggle('fa-sun'); }
        });
    }

    // --- Login Process ---
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Perbaikan: cocokkan ID dengan login.html
        const usernameInput = (document.getElementById('loginUsername')?.value || '').trim();
        const passwordInput = document.getElementById('loginPassword')?.value || '';

        if (!usernameInput || !passwordInput) {
            toast('Mohon isi username dan password!');
            return;
        }

        const users = safeParse('users', []);
        const hashedInput = await hashPassword(passwordInput);
        const user = users.find(u => u.username === usernameInput && (u.password === hashedInput || u.password === passwordInput));

        if (user) {
            localStorage.setItem('currentUser', user.username);
            const btn = loginForm.querySelector('button');
            if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Masuk...';
            setTimeout(() => { window.location.href = 'index.html'; }, 600);
        } else {
            toast('Username atau password salah!');
            const card = document.querySelector('.auth-card');
            if (card) {
                card.style.transition = 'transform 140ms ease';
                card.style.transform = 'translateX(8px)';
                setTimeout(() => { card.style.transform = 'translateX(-8px)'; }, 120);
                setTimeout(() => { card.style.transform = 'translateX(0)'; }, 260);
            }
        }
    });
});