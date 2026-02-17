// Profile page script: avatar, lists, readingHistory migration, theme, logout, delete-account.

document.addEventListener('DOMContentLoaded', () => {
	// --- helpers ---
	const safeParse = (key, fallback) => {
		try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
		catch { return fallback; }
	};
	const saveJson = (key, value) => {
		try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
	};
	const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
		'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
	}[c]));

	// --- auth guard ---
	const currentUser = localStorage.getItem('currentUser');
	if (!currentUser) { window.location.href = 'login.html'; return; }

	// --- theme ---
	const root = document.documentElement;
	const themeBtn = document.getElementById('themeToggle');
	const themeIcon = themeBtn ? themeBtn.querySelector('i') : null;
	const applyTheme = (t) => {
		root.setAttribute('data-theme', t);
		localStorage.setItem('theme', t);
		if (themeIcon) themeIcon.className = t === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
	};
	applyTheme(localStorage.getItem('theme') === 'dark' ? 'dark' : 'light');
	themeBtn && themeBtn.addEventListener('click', () => applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));

	// --- user name text ---
	const userDisplay = document.getElementById('userDisplay');
	const profileName = document.getElementById('profileName');
	if (userDisplay) userDisplay.textContent = `Halo, ${currentUser}`;
	if (profileName) profileName.textContent = currentUser;

	// --- avatar (top-right + left card) ---
	const savedAvatarKey = `avatar_${currentUser}`;
	const savedAvatar = localStorage.getItem(savedAvatarKey);
	const defaultAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser)}&background=random&color=fff`;
	const avatarUrl = savedAvatar || defaultAvatarUrl;

	const triggerAvatar = document.querySelector('.profile-trigger .avatar');
	if (triggerAvatar) triggerAvatar.src = avatarUrl;

	const avatarLarge = document.getElementById('avatarLarge');
	if (avatarLarge) {
		if (savedAvatar) avatarLarge.innerHTML = `<img alt="Avatar" src="${savedAvatar}">`;
		else avatarLarge.textContent = (currentUser || 'U').slice(0, 1).toUpperCase();
	}

	// avatar upload button
	const btnEdit = document.getElementById('btnEditPhoto');
	const fileIn = document.getElementById('avatarFile');
	btnEdit && fileIn && btnEdit.addEventListener('click', () => fileIn.click());
	fileIn && fileIn.addEventListener('change', () => {
		const f = fileIn.files && fileIn.files[0];
		if (!f) return;
		if (!f.type || !f.type.startsWith('image/')) return;

		const r = new FileReader();
		r.onload = () => {
			try {
				localStorage.setItem(savedAvatarKey, String(r.result || ''));
				// refresh avatar UI quickly
				location.reload();
			} catch { /* ignore */ }
		};
		r.readAsDataURL(f);
		fileIn.value = '';
	});

	// --- dropdown profile menu ---
	const trigger = document.getElementById('profileTrigger');
	const dd = document.getElementById('profileDropdown');
	if (trigger && dd) {
		const close = () => dd.classList.remove('active');
		trigger.addEventListener('click', (e) => { e.stopPropagation(); dd.classList.toggle('active'); });
		document.addEventListener('click', (e) => {
			if (!trigger.contains(e.target) && !dd.contains(e.target)) close();
		});
	}

	// --- logout ---
	const doLogout = () => {
		if (!confirm('Yakin ingin keluar?')) return;
		try { localStorage.removeItem('currentUser'); } catch { /* ignore */ }
		window.location.href = 'login.html';
	};
	const logoutBtn = document.getElementById('logoutBtn');
	const logoutBtnBig = document.getElementById('logoutBtnBig');
	logoutBtn && logoutBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); doLogout(); });
	logoutBtnBig && logoutBtnBig.addEventListener('click', doLogout);

	// --- data sources (KONSISTEN) ---
	// koleksi: savedBooks_<user> (array of book objects)
	const savedBooks = safeParse(`savedBooks_${currentUser}`, []);
	// uploads: uploads_<user> (preferred) + fallback from global myUploadedBooks
	const uploadsPerUser = safeParse(`uploads_${currentUser}`, []);
	const myUploadedBooks = safeParse('myUploadedBooks', []);
	const uploadsFromGlobal = Array.isArray(myUploadedBooks)
		? myUploadedBooks.filter(b => b && b.uploadedBy === currentUser)
		: [];

	// merge uploads (unique by id)
	const uploadsMap = new Map();
	[...(Array.isArray(uploadsPerUser) ? uploadsPerUser : []), ...uploadsFromGlobal].forEach(b => {
		if (!b || !b.id) return;
		if (!uploadsMap.has(String(b.id))) uploadsMap.set(String(b.id), b);
	});
	const uploads = Array.from(uploadsMap.values());

	// --- stats ---
	const statUploads = document.getElementById('statUploads');
	const statSaved = document.getElementById('statSaved');
	if (statUploads) statUploads.textContent = String(Array.isArray(uploads) ? uploads.length : 0);
	if (statSaved) statSaved.textContent = String(Array.isArray(savedBooks) ? savedBooks.length : 0);

	// --- render cards ---
	const cardHtml = (book) => {
		const title = book && book.title ? book.title : 'Untitled';
		const author = book && book.author ? book.author : '';
		const img = book && (book.img || book.image || book.cover) ? (book.img || book.image || book.cover) : 'https://via.placeholder.com/300x450?text=Cover';
		return `
			<div class="mini-book-card" tabindex="0" role="button">
				<img src="${img}" alt="${escapeHtml(title)}" loading="lazy" />
				<div class="mini-info">
					<h4 title="${escapeHtml(title)}">${escapeHtml(title)}</h4>
					<p>${escapeHtml(author)}</p>
				</div>
			</div>
		`;
	};

	const savedGrid = document.getElementById('savedGrid');
	const uploadsGrid = document.getElementById('uploadsGrid');
	const savedEmpty = document.getElementById('savedEmpty');
	const uploadsEmpty = document.getElementById('uploadsEmpty');

	// koleksi
	if (savedGrid) {
		const arr = Array.isArray(savedBooks) ? savedBooks : [];
		if (arr.length) {
			savedGrid.innerHTML = arr.map(cardHtml).join('');
			if (savedEmpty) savedEmpty.style.display = 'none';
		} else {
			savedGrid.innerHTML = '';
			if (savedEmpty) savedEmpty.style.display = '';
		}
	}

	// uploads
	if (uploadsGrid) {
		if (uploads.length) {
			uploadsGrid.innerHTML = uploads.slice().reverse().map(cardHtml).join('');
			if (uploadsEmpty) uploadsEmpty.style.display = 'none';
		} else {
			uploadsGrid.innerHTML = '';
			if (uploadsEmpty) uploadsEmpty.style.display = '';
		}
	}

	// OPTIONAL: click card -> open reader (kalau pdf ada)
	function wireOpenHandlers(host, booksArr) {
		if (!host || !Array.isArray(booksArr)) return;
		const cards = Array.from(host.querySelectorAll('.mini-book-card'));
		cards.forEach((el, i) => {
			const book = booksArr[i];
			if (!book) return;
			const open = () => {
				const src = book.pdf || book.file;
				if (!src) return;
				const safeTitle = encodeURIComponent(book.title || '');
				const safeSource = encodeURIComponent(src);
				window.location.href = `read.html?title=${safeTitle}&source=${safeSource}`;
			};
			el.addEventListener('click', open);
			el.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
		});
	}
	wireOpenHandlers(savedGrid, Array.isArray(savedBooks) ? savedBooks : []);
	wireOpenHandlers(uploadsGrid, uploads.slice().reverse());

	// === NEW: Delete Account ===
	const deleteBtn = document.getElementById('deleteAccountBtn');
	if (deleteBtn && currentUser) {
		deleteBtn.addEventListener('click', () => {
			const confirmText = prompt(
				'PERINGATAN: Semua data akan dihapus permanen.\n\n' +
				'Ketik username kamu untuk konfirmasi:'
			);
			if (confirmText !== currentUser) {
				if (confirmText !== null) toast ? toast('Username tidak cocok.', 'error') : alert('Username tidak cocok.');
				return;
			}

			// hapus semua data user
			const keysToRemove = [];
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i);
				if (key && (
					key === 'currentUser' ||
					key.includes(currentUser) ||
					key.startsWith(`avatar_${currentUser}`) ||
					key.startsWith(`savedBooks_${currentUser}`) ||
					key.startsWith(`readingHistory_${currentUser}`) ||
					key.startsWith(`uploads_${currentUser}`)
				)) {
					keysToRemove.push(key);
				}
			}

			// hapus user dari users array
			try {
				const users = JSON.parse(localStorage.getItem('users') || '[]');
				const filtered = users.filter(u => u && u.username !== currentUser);
				localStorage.setItem('users', JSON.stringify(filtered));
			} catch { /* ignore */ }

			// hapus keys
			keysToRemove.forEach(k => {
				try { localStorage.removeItem(k); } catch { /* ignore */ }
			});

			if (typeof toast === 'function') toast('Akun dihapus.', 'success');
			setTimeout(() => { window.location.href = 'signup.html'; }, 800);
		});
	}
});