document.addEventListener('DOMContentLoaded', () => {
    
    // --- Dark Mode ---
    const themeToggle = document.getElementById('themeToggle');
    const root = document.documentElement;
    const icon = themeToggle ? themeToggle.querySelector('i') : null;
    
    const savedTheme = localStorage.getItem('theme') || 'light';
    root.setAttribute('data-theme', savedTheme);
    if(icon && savedTheme === 'dark') icon.classList.replace('fa-moon', 'fa-sun');

    if(themeToggle) {
        themeToggle.addEventListener('click', () => {
            const current = root.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            root.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
            if(icon) { icon.classList.toggle('fa-moon'); icon.classList.toggle('fa-sun'); }
        });
    }

    // --- Login Process ---
    const loginForm = document.getElementById('loginForm');
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const usernameInput = document.getElementById('username').value.trim();
        const passwordInput = document.getElementById('password').value;

        if (!usernameInput || !passwordInput) {
            alert("Mohon isi username dan password!"); return;
        }

        const users = JSON.parse(localStorage.getItem('users') || '[]');
        const user = users.find(u => u.username === usernameInput && u.password === passwordInput);

        if (user) {
            localStorage.setItem('currentUser', user.username);
            
            const btn = loginForm.querySelector('button');
            const originalText = btn.innerText;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memuat...';
            
            setTimeout(() => {
                window.location.href = 'index.html'; // Redirect ke Beranda
            }, 1000);
        } else {
            alert("Username atau password salah!");
            // Efek Shake
            const card = document.querySelector('.auth-card');
            card.style.transform = "translateX(5px)";
            setTimeout(() => card.style.transform = "translateX(-5px)", 100);
            setTimeout(() => card.style.transform = "translateX(0)", 200);
        }
    });
});