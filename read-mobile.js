(() => {
	'use strict';

	// === SINGLE-LOAD GUARD ===
	if (window.__MOBILE_READER_LOADED__) return;
	window.__MOBILE_READER_LOADED__ = true;

	// ---- PDF.JS ----
	const pdfjsLib = window.pdfjsLib || window['pdfjsLib'];
	if (!pdfjsLib) throw new Error('pdfjsLib not found. Load pdf.min.js before read-mobile.js');

	try {
		pdfjsLib.GlobalWorkerOptions.workerSrc =
			pdfjsLib.GlobalWorkerOptions.workerSrc ||
			'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
	} catch { /* ignore */ }

	// ---- STATE ----
	let pdfDoc = null;
	let pageNum = 1;
	let scale = 0.85;
	const MIN_SCALE = 0.6;
	const MAX_SCALE = 3.0;
	let mRotation = 0;

	let mScrollMode = false;
	let mIO = null;

	let storageKeyBase = 'reader_mobile_';
	let annotationData = {};
	let notesData = {};

	let currentTool = 'move';

	let mobileUndoStack = [];
	let mobileRedoStack = [];

	let swipeNav = {
		startX: 0,
		startY: 0,
		startT: 0,
		active: false
	};

	let __singleRenderTask = null;
	let __singleRenderSeq = 0; // monotonically increasing, to ignore stale completions

	let __lastSwipeDisabledToastAt = 0;

	// --- ADD (near STATE): drawing state for mobile annotations ---
	let isDrawing = false;
	let currentStroke = null;

	// ---- ELEMENTS ----
	const canvas = document.getElementById('the-canvas');
	const ctx = canvas ? canvas.getContext('2d') : null;
	const aCanvas = document.getElementById('highlight-canvas');
	const aCtx = aCanvas ? aCanvas.getContext('2d') : null;

	// ---- HELPERS ----
	function setLoading(active, msg) {
		const loader = document.getElementById('loading');
		if (!loader) return;
		loader.classList.toggle('active', !!active);
		const p = loader.querySelector('p');
		if (p && msg) p.textContent = msg;
	}

	function debounce(fn, ms) {
		let t;
		return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
	}

	function loadFromStorage(suffix) {
		try {
			const raw = localStorage.getItem(storageKeyBase + suffix);
			return raw ? JSON.parse(raw) : null;
		} catch { return null; }
	}

	function saveToStorageImmediate(suffix, data) {
		try { localStorage.setItem(storageKeyBase + suffix, JSON.stringify(data ?? {})); } catch { /* ignore */ }
	}

	const saveToStorage = debounce(saveToStorageImmediate, 200);

	async function fetchPdfAsUint8Array(url) {
		const res = await fetch(url);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		return new Uint8Array(await res.arrayBuffer());
	}

	function notifyMobile(msg, timeout = 1200) {
		const old = document.getElementById('mobileNotify');
		if (old) old.remove();
		const d = document.createElement('div');
		d.id = 'mobileNotify';
		d.textContent = String(msg || '');
		d.style.cssText = [
			'position:fixed',
			'left:50%',
			'bottom:84px',
			'transform:translateX(-50%)',
			'background:rgba(0,0,0,0.78)',
			'color:#fff',
			'padding:8px 12px',
			'border-radius:999px',
			'font-size:13px',
			'font-weight:700',
			'z-index:99999',
			'pointer-events:none',
			'box-shadow:0 10px 26px rgba(0,0,0,0.28)'
		].join(';');
		document.body.appendChild(d);
		setTimeout(() => d.remove(), timeout);
	}

	function notifyMobileThrottled(msg, ms = 2000) {
		const now = Date.now();
		if (now - __lastSwipeDisabledToastAt < ms) return;
		__lastSwipeDisabledToastAt = now;
		notifyMobile(msg);
	}

	// --- ADD (helpers): clamp + normalized pointer position ---
	function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

	function getNormPosFromEvent(e) {
		if (!aCanvas) return { x: 0, y: 0 };
		const rect = aCanvas.getBoundingClientRect();
		const pt = (e.touches && e.touches[0]) ? e.touches[0]
			: (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0]
			: e;
		const x = clamp(((pt.clientX - rect.left) / (rect.width || 1)), 0, 1);
		const y = clamp(((pt.clientY - rect.top) / (rect.height || 1)), 0, 1);
		return { x, y };
	}

	// --- ADD: undo/redo snapshots for annotationData (mobile) ---
	function mobilePushUndoSnapshot() {
		try {
			mobileUndoStack.push(JSON.stringify(annotationData || {}));
			if (mobileUndoStack.length > 50) mobileUndoStack.shift();
			mobileRedoStack = [];
		} catch { /* ignore */ }
	}
	function mobileUndo() {
		if (!mobileUndoStack.length) return;
		try { mobileRedoStack.push(JSON.stringify(annotationData || {})); } catch {}
		try { annotationData = JSON.parse(mobileUndoStack.pop() || '{}') || {}; } catch { annotationData = {}; }
		saveToStorage('annotations', annotationData);
		redrawAnnotations();
		notifyMobile('Undo');
	}
	function mobileRedo() {
		if (!mobileRedoStack.length) return;
		try { mobileUndoStack.push(JSON.stringify(annotationData || {})); } catch {}
		try { annotationData = JSON.parse(mobileRedoStack.pop() || '{}') || {}; } catch { annotationData = {}; }
		saveToStorage('annotations', annotationData);
		redrawAnnotations();
		notifyMobile('Redo');
	}

	// --- ADD: redraw annotations on overlay canvas (normalized -> CSS pixels) ---
	function redrawAnnotations() {
		if (!aCanvas || !aCtx) return;

		// clear in CSS coordinate system (we setTransform(dpr,0,0,dpr,0,0) in renderPage)
		const rect = aCanvas.getBoundingClientRect();
		const cssW = rect.width || 1;
		const cssH = rect.height || 1;

		// IMPORTANT: clear using canvas pixel size; transform already maps CSS->device
		aCtx.clearRect(0, 0, aCanvas.width, aCanvas.height);

		const strokes = (annotationData && annotationData[pageNum]) ? annotationData[pageNum] : [];
		for (const s of strokes) {
			if (!s || !Array.isArray(s.points) || s.points.length < 1) continue;

			aCtx.beginPath();
			aCtx.lineCap = 'round';
			aCtx.lineJoin = 'round';
			aCtx.lineWidth = Number(s.width) || (s.tool === 'eraser' ? 30 : 24);

			if (s.tool === 'eraser') {
				aCtx.globalCompositeOperation = 'destination-out';
				aCtx.strokeStyle = 'rgba(0,0,0,1)';
			} else {
				aCtx.globalCompositeOperation = 'multiply';
				aCtx.strokeStyle = s.color || '#fff275';
			}

			const p0 = s.points[0];
			aCtx.moveTo(clamp((p0.x || 0) * cssW, 0, cssW), clamp((p0.y || 0) * cssH, 0, cssH));

			for (let i = 1; i < s.points.length; i++) {
				const p = s.points[i];
				aCtx.lineTo(clamp((p.x || 0) * cssW, 0, cssW), clamp((p.y || 0) * cssH, 0, cssH));
			}

			aCtx.stroke();
			aCtx.closePath();
		}

		aCtx.globalCompositeOperation = 'source-over';
	}

	// --- ADD: drawing handlers (touch) on highlight-canvas ---
	function setupMobileDrawing() {
		if (!aCanvas || !aCtx) return;
		if (setupMobileDrawing._didAttach) return;
		setupMobileDrawing._didAttach = true;

		const colorEl = document.getElementById('mobHighlightColor');
		const sizeEl = document.getElementById('mobHighlightSize');

		const getStrokeColor = () => (colorEl && colorEl.value) ? colorEl.value : '#fff275';
		const getStrokeWidth = () => {
			const v = sizeEl ? Number(sizeEl.value) : 24;
			return Number.isFinite(v) ? v : 24;
		};

		function startDraw(e) {
			if (currentTool === 'move') return;
			// Only draw in single-page mode (scroll mode overlay hidden anyway)
			if (mScrollMode) return;

			e.preventDefault();

			// NEW: lock swipe detector immediately
			swipeNav.active = false;

			mobilePushUndoSnapshot();

			isDrawing = true;
			const pos = getNormPosFromEvent(e);

			annotationData[pageNum] = Array.isArray(annotationData[pageNum]) ? annotationData[pageNum] : [];

			currentStroke = {
				tool: currentTool, // 'highlight' | 'eraser'
				color: currentTool === 'highlight' ? getStrokeColor() : undefined,
				width: currentTool === 'eraser' ? Math.max(14, Math.round(getStrokeWidth() * 1.1)) : getStrokeWidth(),
				points: [pos]
			};

			annotationData[pageNum].push(currentStroke);
			redrawAnnotations();
		}

		function moveDraw(e) {
			if (!isDrawing || !currentStroke) return;
			if (currentTool === 'move') return;

			// NEW: prevent page swipe/scroll while drawing
			e.preventDefault();

			const pos = getNormPosFromEvent(e);
			currentStroke.points.push(pos);
			redrawAnnotations();
		}

		function endDraw() {
			if (!isDrawing) return;
			isDrawing = false;
			currentStroke = null;
			saveToStorage('annotations', annotationData);

			// NEW: setelah selesai gambar, balik ke mode move otomatis
			if (currentTool !== 'move') {
				currentTool = 'move';
				updateToolUI();
				notifyMobile('Mode: Move', 900);
			}
		}

		// Touch only (mobile). If you also want mouse: add pointer events.
		aCanvas.addEventListener('touchstart', startDraw, { passive: false });
		aCanvas.addEventListener('touchmove', moveDraw, { passive: false });
		aCanvas.addEventListener('touchend', endDraw, { passive: true });
		aCanvas.addEventListener('touchcancel', endDraw, { passive: true });

		// NEW (optional): tap di canvas saat tool highlight/eraser => balik move
		aCanvas.addEventListener('click', (e) => {
			if (currentTool === 'move') return;
			// jangan ganggu kalau click itu bagian dari gesture drawing yang baru selesai
			if (isDrawing) return;
			currentTool = 'move';
			updateToolUI();
			e.preventDefault();
			e.stopPropagation();
		});
	}

	// ---- BOOKMARKS ----
	let mobileBookmarks = [];

	function normalizeNums(arr) {
		if (!Array.isArray(arr)) return [];
		return [...new Set(arr.map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
	}

	function loadMobileBookmarks() {
		try { return normalizeNums(JSON.parse(localStorage.getItem(storageKeyBase + 'bookmarks') || '[]')); }
		catch { return []; }
	}

	function saveMobileBookmarks() {
		try {
			mobileBookmarks = normalizeNums(mobileBookmarks);
			localStorage.setItem(storageKeyBase + 'bookmarks', JSON.stringify(mobileBookmarks));
		} catch { /* ignore */ }
	}

	function ensureMobileBookmarkBadge() {
		const btn = document.getElementById('toolBookmark');
		if (!btn) return null;
		let b = btn.querySelector('.bookmark-count-badge');
		if (!b) {
			b = document.createElement('span');
			b.className = 'bookmark-count-badge';
			btn.style.position = 'relative';
			btn.appendChild(b);
		}
		return b;
	}

	function updateMobileBookmarkCountBadge() {
		const b = ensureMobileBookmarkBadge();
		if (!b) return;
		const cur = loadMobileBookmarks();
		b.textContent = String(cur.length);
		if (cur.length > 0) b.classList.add('show');
		else b.classList.remove('show');
	}

	function updateMobileBookmarkButtonState() {
		const btn = document.getElementById('toolBookmark');
		if (!btn) return;
		const cur = loadMobileBookmarks();
		btn.classList.toggle('active', cur.includes(Number(pageNum)));
	}

	function updateThumbBookmarks() {
		const grid = document.getElementById('thumbGrid');
		if (!grid) return;
		const cur = loadMobileBookmarks();
		grid.querySelectorAll('.thumb-item').forEach(t => {
			const pg = Number(t.getAttribute('data-page'));
			if (!Number.isFinite(pg)) return;
			t.classList.toggle('bookmarked', cur.includes(pg));
			const m = t.querySelector('.thumb-bm');
			if (m) m.style.opacity = cur.includes(pg) ? '1' : '0';
		});
	}

	function toggleMobileBookmark() {
		mobileBookmarks = loadMobileBookmarks();
		const pg = Number(pageNum);
		const idx = mobileBookmarks.indexOf(pg);
		if (idx >= 0) { mobileBookmarks.splice(idx, 1); notifyMobile('Bookmark dihapus'); }
		else { mobileBookmarks.push(pg); notifyMobile('Bookmark tersimpan'); }
		saveMobileBookmarks();
		updateThumbBookmarks();
		updateMobileBookmarkButtonState();
		updateMobileBookmarkCountBadge();
	}

	function renderMobileBookmarks() {
		const list = document.getElementById('mobBookmarkList');
		if (!list) return;
		list.innerHTML = '';
		const cur = loadMobileBookmarks();
		if (!cur.length) {
			const p = document.createElement('p');
			p.className = 'note-empty';
			p.textContent = 'Belum ada bookmark.';
			list.appendChild(p);
			return;
		}
		cur.forEach(pg => {
			const row = document.createElement('div');
			row.className = 'm-bookmark-row';
			row.innerHTML = `
				<div class="m-bookmark-label">Hal ${pg}</div>
				<div class="m-bookmark-actions">
					<button data-p="${pg}" class="m-btn-open">Buka</button>
					<button data-p="${pg}" class="m-btn-del">×</button>
				</div>
			`;
			list.appendChild(row);
		});

		list.querySelectorAll('.m-btn-open').forEach(b => b.addEventListener('click', (e) => {
			const p = Number(e.currentTarget.dataset.p);
			if (!Number.isFinite(p)) return;
			if (mScrollMode) {
				const target = document.querySelector(`#mobScrollStack .m-page-stack[data-page="${p}"]`);
				target && target.scrollIntoView({ behavior: 'smooth', block: 'start' });
				pageNum = p;
				updateMobileProgress();
			} else {
				renderPage(p);
			}
		}));

		list.querySelectorAll('.m-btn-del').forEach(b => b.addEventListener('click', (e) => {
			const p = Number(e.currentTarget.dataset.p);
			mobileBookmarks = loadMobileBookmarks().filter(x => x !== p);
			saveMobileBookmarks();
			renderMobileBookmarks();
			updateThumbBookmarks();
			updateMobileBookmarkCountBadge();
			updateMobileBookmarkButtonState();
		}));
	}

	// ---- UI SYNC ----
	function updateMobileProgress() {
		const curr = document.getElementById('currPage');
		const total = document.getElementById('totalPage');
		const bar = document.getElementById('mPageProgress');
		if (curr) curr.textContent = String(pageNum);
		if (total && pdfDoc) total.textContent = String(pdfDoc.numPages || '--');
		if (bar && pdfDoc) {
			const pct = Math.max(0, Math.min(1, pageNum / (pdfDoc.numPages || 1)));
			bar.style.transform = `scaleX(${pct})`;
		}
		updateMobileBookmarkButtonState();
		updateMobileBookmarkCountBadge();
	}

	// --- PATCH: updateToolUI to enable overlay pointer events for drawing tools ---
	function updateToolUI() {
		const ids = ['toolMove', 'toolHighlight', 'toolEraser'];
		ids.forEach(id => {
			const el = document.getElementById(id);
			if (!el) return;
			const tool = id.replace('tool', '').toLowerCase();
			el.classList.toggle('active', currentTool === tool);
		});

		// allow select text only in move mode
		const tl = document.getElementById('text-layer');
		if (aCanvas) aCanvas.style.pointerEvents = (currentTool === 'move') ? 'none' : 'auto';
		if (tl) tl.style.pointerEvents = (currentTool === 'move') ? 'auto' : 'none';
	}

	// --- ADD: notes renderer (mobile) ---
	function renderMobileNotes() {
		const host = document.getElementById('mobNoteList');
		if (!host) return;

		host.innerHTML = '';

		// section: current page
		const title = document.createElement('div');
		title.className = 'note-section-title';
		title.textContent = `Catatan Hal ${pageNum}`;
		host.appendChild(title);

		const curNotes = (notesData && notesData[pageNum]) ? notesData[pageNum] : [];
		if (!Array.isArray(curNotes) || curNotes.length === 0) {
			const p = document.createElement('div');
			p.className = 'note-empty';
			p.textContent = 'Belum ada catatan di halaman ini.';
			host.appendChild(p);
		} else {
			curNotes.forEach((n, idx) => {
				const item = document.createElement('div');
				item.className = 'note-item';
				item.innerHTML = `
					<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
						<div style="display:flex;flex-direction:column;gap:6px;">
							<div style="font-weight:700;">${escapeHtml(n && n.text ? n.text : '')}</div>
							<div style="font-size:0.75rem;color:#bbb;">${escapeHtml(n && n.date ? n.date : '')}</div>
						</div>
						<button class="m-del-note" data-idx="${idx}" aria-label="Hapus catatan" style="background:none;border:none;color:#ddd;font-size:18px;line-height:1;cursor:pointer;">×</button>
					</div>
				`;
				host.appendChild(item);
			});

			host.querySelectorAll('.m-del-note').forEach(btn => btn.addEventListener('click', (e) => {
				const i = Number(e.currentTarget.dataset.idx);
				if (!Number.isFinite(i)) return;
				if (!notesData[pageNum]) return;
				notesData[pageNum].splice(i, 1);
				if (notesData[pageNum].length === 0) delete notesData[pageNum];
				saveToStorageImmediate('notes', notesData);
				renderMobileNotes();
				notifyMobile('Catatan dihapus');
			}));
		}

		// divider
		const hr = document.createElement('hr');
		hr.style.border = 'none';
		hr.style.borderTop = '1px solid rgba(255,255,255,0.08)';
		hr.style.margin = '12px 0';
		host.appendChild(hr);

		// section: all notes
		const allTitle = document.createElement('div');
		allTitle.className = 'note-section-title';
		allTitle.textContent = 'Semua Catatan';
		host.appendChild(allTitle);

		const pages = Object.keys(notesData || {})
			.map(k => Number(k))
			.filter(Number.isFinite)
			.sort((a, b) => a - b);

		if (!pages.length) {
			const p = document.createElement('div');
			p.className = 'note-empty';
			p.textContent = 'Belum ada catatan tersimpan.';
			host.appendChild(p);
			return;
		}

		pages.forEach(pg => {
			const arr = notesData[pg];
			if (!Array.isArray(arr) || !arr.length) return;
			arr.forEach((n) => {
				const row = document.createElement('div');
				row.className = 'note-item';
				row.innerHTML = `
					<div style="display:flex;gap:10px;align-items:flex-start;">
						<button class="m-jump-note" data-page="${pg}" style="background:#10b981;border:none;color:#fff;border-radius:8px;padding:6px 8px;font-weight:800;cursor:pointer;">Hal ${pg}</button>
						<div style="display:flex;flex-direction:column;gap:6px;">
							<div style="font-weight:700;">${escapeHtml(n && n.text ? n.text : '')}</div>
							<div style="font-size:0.75rem;color:#bbb;">${escapeHtml(n && n.date ? n.date : '')}</div>
						</div>
					</div>
				`;
				host.appendChild(row);
			});
		});

		host.querySelectorAll('.m-jump-note').forEach(btn => btn.addEventListener('click', (e) => {
			const p = Number(e.currentTarget.dataset.page);
			if (!Number.isFinite(p) || !pdfDoc) return;
			if (mScrollMode) {
				const target = document.querySelector(`#mobScrollStack .m-page-stack[data-page="${p}"]`);
				target && target.scrollIntoView({ behavior: 'smooth', block: 'start' });
				pageNum = p;
				updateMobileProgress();
			} else {
				renderPage(p);
			}
		}));
	}

	function escapeHtml(s) {
		return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
	}

	// ---- RENDER SINGLE PAGE ----
	async function renderPage(num) {
		if (!pdfDoc || !canvas || !ctx) return;

		// clamp
		num = Math.max(1, Math.min(num, pdfDoc.numPages || 1));

		// NEW: cancel previous in-flight render on the SAME canvas
		try {
			if (__singleRenderTask && typeof __singleRenderTask.cancel === 'function') {
				__singleRenderTask.cancel();
			}
		} catch { /* ignore */ }

		const mySeq = ++__singleRenderSeq;

		const page = await pdfDoc.getPage(num);

		// If another render started while awaiting getPage, stop
		if (mySeq !== __singleRenderSeq) return;

		const wrapper = document.getElementById('pdfWrapper');
		const wrapperW = (wrapper ? wrapper.clientWidth : 0) || window.innerWidth;

		const baseVp = page.getViewport({ scale: 1, rotation: mRotation });
		const fitScale = wrapperW / (baseVp.width || 1);
		const usedScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min(scale, fitScale)));
		const vp = page.getViewport({ scale: usedScale, rotation: mRotation });

		const dpr = window.devicePixelRatio || 1;

		// size canvas first
		canvas.width = Math.floor(vp.width * dpr);
		canvas.height = Math.floor(vp.height * dpr);
		canvas.style.width = `${Math.floor(vp.width)}px`;
		canvas.style.height = `${Math.floor(vp.height)}px`;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		if (aCanvas && aCtx) {
			aCanvas.width = Math.floor(vp.width * dpr);
			aCanvas.height = Math.floor(vp.height * dpr);
			aCanvas.style.width = canvas.style.width;
			aCanvas.style.height = canvas.style.height;
			aCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
		}

		// NEW: keep the task reference and await safely
		const task = page.render({ canvasContext: ctx, viewport: vp });
		__singleRenderTask = task;

		try {
			await task.promise;
		} catch (e) {
			// expected when we cancel due to fast swipe
			const msg = String(e && (e.name || e.message) || '');
			if (!/RenderingCancelledException/i.test(msg)) throw e;
			return;
		} finally {
			// only clear if we are still the latest render
			if (__singleRenderTask === task) __singleRenderTask = null;
		}

		// If another render started after await, don't touch UI layers
		if (mySeq !== __singleRenderSeq) return;

		const tl = document.getElementById('text-layer');
		if (tl) {
			tl.style.width = `${vp.width}px`;
			tl.style.height = `${vp.height}px`;
			tl.innerHTML = '';
			try {
				const tc = await page.getTextContent();
				// If stale after await text:
				if (mySeq !== __singleRenderSeq) return;
				pdfjsLib.renderTextLayer && pdfjsLib.renderTextLayer({
					textContent: tc,
					container: tl,
					viewport: vp,
					textDivs: []
				});
			} catch { /* ignore */ }
		}

		pageNum = num;
		updateMobileProgress();
		updateToolUI();
		updateMobileZoomLabel(); // NEW: sync label after render

		// ADD:
		try { redrawAnnotations(); } catch {}

		// ADDED:
		try { renderMobileNotes(); } catch {}
	}

	// ---- THUMBNAILS ----
	async function generateThumbnails(pdf) {
		const grid = document.getElementById('thumbGrid');
		if (!grid || !pdf) return;
		grid.innerHTML = '';

		const total = pdf.numPages || 0;
		const batchSize = 6;

		const renderOne = async (pg) => {
			const item = document.createElement('div');
			item.className = 'thumb-item';
			item.setAttribute('data-page', String(pg));

			const bm = document.createElement('span');
			bm.className = 'thumb-bm';
			bm.textContent = '★';
			item.appendChild(bm);

			const c = document.createElement('canvas');
			const label = document.createElement('div');
			label.className = 'thumb-num';
			label.textContent = `Hal ${pg}`;

			item.appendChild(c);
			item.appendChild(label);

			item.addEventListener('click', () => {
				if (mScrollMode) {
					const target = document.querySelector(`#mobScrollStack .m-page-stack[data-page="${pg}"]`);
					target && target.scrollIntoView({ behavior: 'smooth', block: 'start' });
					pageNum = pg;
					updateMobileProgress();
				} else {
					renderPage(pg);
				}
			});

			grid.appendChild(item);

			try {
				const page = await pdf.getPage(pg);
				const vp = page.getViewport({ scale: 0.18, rotation: 0 });
				c.width = Math.floor(vp.width);
				c.height = Math.floor(vp.height);
				await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
			} catch { /* ignore */ }
		};

		for (let i = 1; i <= total; i += batchSize) {
			const end = Math.min(total, i + batchSize - 1);
			// eslint-disable-next-line no-await-in-loop
			await Promise.all(Array.from({ length: end - i + 1 }, (_, k) => renderOne(i + k)));
			// eslint-disable-next-line no-await-in-loop
			await new Promise(r => setTimeout(r, 10));
		}
		updateThumbBookmarks();
	}

	// ---- SCROLL MODE (STACK + LAZY RENDER) ----
	async function lazyRenderMobileStackPage(pg, sectionEl) {
		if (!pdfDoc || !sectionEl) return;

		const c = sectionEl.querySelector('canvas');
		const textHost = sectionEl.querySelector('.m-page-text');
		if (!c || !textHost) return;

		// NEW: prevent concurrent renders on same canvas
		if (c.dataset.rendered === '1') return;
		if (c.dataset.rendering === '1') return;

		// NEW: cancel previous render task if still running
		try {
			if (c.__renderTask && typeof c.__renderTask.cancel === 'function') {
				c.__renderTask.cancel();
			}
		} catch { /* ignore */ }

		c.dataset.rendering = '1';

		try {
			const page = await pdfDoc.getPage(pg);

			const stackEl = document.getElementById('mobScrollStack');
			const containerW = (stackEl ? stackEl.clientWidth : 0) || window.innerWidth;

			const baseVp = page.getViewport({ scale: 1, rotation: mRotation });
			const usedScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, containerW / (baseVp.width || 1)));
			const vp = page.getViewport({ scale: usedScale, rotation: mRotation });

			const dpr = window.devicePixelRatio || 1;
			c.width = Math.floor(vp.width * dpr);
			c.height = Math.floor(vp.height * dpr);
			c.style.width = `${Math.floor(vp.width)}px`;
			c.style.height = `${Math.floor(vp.height)}px`;

			const tctx = c.getContext('2d');
			tctx.setTransform(dpr, 0, 0, dpr, 0, 0);

			// IMPORTANT: store renderTask on canvas and await it safely
			const task = page.render({ canvasContext: tctx, viewport: vp });
			c.__renderTask = task;
			await task.promise;

			// text layer
			textHost.classList.add('textLayer');
			textHost.style.width = `${vp.width}px`;
			textHost.style.height = `${vp.height}px`;
			textHost.innerHTML = '';
			try {
				const tc = await page.getTextContent();
				pdfjsLib.renderTextLayer && pdfjsLib.renderTextLayer({ textContent: tc, container: textHost, viewport: vp, textDivs: [] });
			} catch { /* ignore */ }

			c.dataset.rendered = '1';
		} catch (e) {
			// ignore expected cancellation errors
			const msg = String(e && (e.name || e.message) || '');
			if (!/RenderingCancelledException/i.test(msg)) {
				console.warn('lazyRenderMobileStackPage failed', pg, e);
			}
		} finally {
			c.dataset.rendering = '0';
			// do not keep old task reference
			try { c.__renderTask = null; } catch { /* ignore */ }
		}
	}

	function enterMobileScrollMode() {
		const stack = document.getElementById('mobScrollStack');
		if (!stack || !pdfDoc) return;

		stack.innerHTML = '';
		try { mIO && mIO.disconnect(); } catch { /* ignore */ }
		mIO = null;

		for (let i = 1; i <= (pdfDoc.numPages || 1); i++) {
			const sec = document.createElement('section');
			sec.className = 'm-page-stack';
			sec.dataset.page = String(i);

			const c = document.createElement('canvas');
			c.dataset.page = String(i);

			const t = document.createElement('div');
			t.className = 'm-page-text';

			sec.appendChild(c);
			sec.appendChild(t);
			stack.appendChild(sec);
		}

		mIO = new IntersectionObserver((entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				const pg = Number(entry.target.dataset.page);
				if (!Number.isFinite(pg)) continue;
				lazyRenderMobileStackPage(pg, entry.target);
				pageNum = pg;
				updateMobileProgress();

				// ADDED:
				try {
					const notesPanelActive = document.getElementById('panel-notes')?.classList.contains('active');
					if (notesPanelActive) renderMobileNotes();
				} catch {}
			}
		}, {
			root: document.getElementById('readerArea') || null,
			rootMargin: '250px',
			threshold: 0.01
		});

		stack.querySelectorAll('.m-page-stack').forEach(sec => mIO.observe(sec));

		const target = stack.querySelector(`.m-page-stack[data-page="${pageNum}"]`) || stack.querySelector('.m-page-stack');
		if (target) {
			try { target.scrollIntoView({ behavior: 'auto', block: 'start' }); } catch { /* ignore */ }
			lazyRenderMobileStackPage(Number(target.dataset.page || 1), target);
		}
	}

	function leaveMobileScrollMode() {
		try { mIO && mIO.disconnect(); } catch { /* ignore */ }
		mIO = null;
		const stack = document.getElementById('mobScrollStack');
		if (stack) stack.innerHTML = '';
	}

	// ---- UI WIRING ----
	function attachUI() {
		if (attachUI._didAttach) return;
		attachUI._didAttach = true;

		const sheetEl = document.getElementById('bottomSheet');
		const backdropEl = document.getElementById('backdrop');
		const menuBtn = document.getElementById('btnMenu');
		const dragHandle = document.querySelector('.drag-handle');

		const openSheet = () => { sheetEl && sheetEl.classList.add('active'); backdropEl && backdropEl.classList.add('active'); };
		const closeSheet = () => { sheetEl && sheetEl.classList.remove('active'); backdropEl && backdropEl.classList.remove('active'); };
		const toggleSheet = () => sheetEl && (sheetEl.classList.contains('active') ? closeSheet() : openSheet());

		menuBtn && menuBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggleSheet(); });
		dragHandle && dragHandle.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggleSheet(); });
		backdropEl && backdropEl.addEventListener('click', closeSheet);

		// tabs
		const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
		const tabPanels = Array.from(document.querySelectorAll('.tab-panel'));
		const activateTab = (key) => {
			tabButtons.forEach(b => b.classList.toggle('active', b.dataset.target === key));
			tabPanels.forEach(p => p.classList.toggle('active', p.id === `panel-${key}`));
			if (key === 'bookmarks') renderMobileBookmarks();
			if (key === 'notes') renderMobileNotes(); // ADDED
		};
		tabButtons.forEach(btn => btn.addEventListener('click', () => activateTab(btn.dataset.target)));

		const wire = (id, fn) => {
			const el = document.getElementById(id);
			if (!el) return;
			el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
		};

		wire('toolZoomIn', () => { scale = Math.min(MAX_SCALE, scale + 0.15); renderPage(pageNum); });
		wire('toolZoomOut', () => { scale = Math.max(MIN_SCALE, scale - 0.15); renderPage(pageNum); });

		wire('toolMove', () => { currentTool = 'move'; updateToolUI(); });
		wire('toolHighlight', () => { currentTool = 'highlight'; updateToolUI(); });
		wire('toolEraser', () => { currentTool = 'eraser'; updateToolUI(); });

		wire('toolBookmark', () => toggleMobileBookmark());

		wire('rotateMobBtn', () => { mRotation = (mRotation + 90) % 360; if (!mScrollMode) renderPage(pageNum); else enterMobileScrollMode(); });

		wire('scrollMobBtn', () => {
			if (!pdfDoc) return;
			mScrollMode = !mScrollMode;

			const btn = document.getElementById('scrollMobBtn');
			btn && btn.classList.toggle('active', mScrollMode);

			const wrapper = document.getElementById('pdfWrapper');
			const stack = document.getElementById('mobScrollStack');
			const tl = document.getElementById('text-layer');

			if (mScrollMode) {
				if (aCanvas) aCanvas.style.display = 'none';
				if (tl) tl.style.display = 'none';
				wrapper && (wrapper.style.display = 'none');
				stack && (stack.style.display = '');
				enterMobileScrollMode();
			} else {
				leaveMobileScrollMode();
				stack && (stack.style.display = 'none');
				wrapper && (wrapper.style.display = '');
				if (aCanvas) aCanvas.style.display = '';
				if (tl) tl.style.display = '';
				renderPage(pageNum);
			}
		});

		// Top scroll proxy
		const topScrollBtn = document.getElementById('scrollMobBtnTop');
		const sheetScrollBtn = document.getElementById('scrollMobBtn');
		if (topScrollBtn && sheetScrollBtn) {
			topScrollBtn.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				sheetScrollBtn.click();
				topScrollBtn.classList.toggle('active', sheetScrollBtn.classList.contains('active'));
			});
		}

		// REPLACE these (currently no-op vars) with actual handlers:
		wire('toolUndo', () => mobileUndo());
		wire('toolRedo', () => mobileRedo());
		wire('toolSave', () => { saveToStorageImmediate('annotations', annotationData); notifyMobile('Tersimpan'); });
		wire('toolClear', () => {
			const cur = Array.isArray(annotationData[pageNum]) ? annotationData[pageNum] : [];
			if (cur.length === 0) { notifyMobile('Sudah kosong'); return; }

			mobilePushUndoSnapshot();
			annotationData[pageNum] = [];
			saveToStorage('annotations', annotationData);
			redrawAnnotations();
			notifyMobile('Bersih');
		});

		 // --- ADD: export/import wiring for annotations ---
		const expBtn = document.getElementById('mobExportAnn');
		const impBtn = document.getElementById('mobImportAnn');
		const impFile = document.getElementById('mobImportAnnFile');

		expBtn && expBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			exportMobileAnnotations();
		});

		if (impBtn && impFile) {
			impBtn.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				impFile.click();
			});

			impFile.addEventListener('change', (ev) => {
				const f = ev.target.files && ev.target.files[0];
				if (!f) return;

				// OK = replace, Cancel = merge
				const replace = confirm('Ganti semua anotasi dengan file ini?\nOK = Replace\nCancel = Merge');
				importMobileAnnotationsFile(f, replace);

				impFile.value = '';
			});
		}

		// ensure drawing listeners attached once
		setupMobileDrawing();

		// highlight size/color preview polish (optional, uses existing .mob-highlight-preview)
		const colorEl = document.getElementById('mobHighlightColor');
		const sizeEl = document.getElementById('mobHighlightSize');
		const preview = document.querySelector('.mob-highlight-preview');
		const applyPreview = () => {
			if (preview && colorEl) preview.style.setProperty('--highlight-preview-color', colorEl.value);
			if (sizeEl) {
				const v = Number(sizeEl.value) || 24;
				// scale thumb + preview size (rough, but feels good)
				const thumbScale = 0.9 + ((Math.min(80, Math.max(8, v)) - 8) / 72) * 0.7; // 0.9..1.6
				document.documentElement.style.setProperty('--mob-hl-thumb-scale', String(thumbScale));
				if (preview) {
					const pSize = 26 + ((Math.min(80, Math.max(8, v)) - 8) / 72) * 26; // 26..52
					preview.style.setProperty('--mob-hl-preview-size', `${pSize}px`);
				}
			}
		};
		colorEl && colorEl.addEventListener('input', applyPreview);
		sizeEl && sizeEl.addEventListener('input', applyPreview);
		applyPreview();

		// === NEW: TOP ZOOM CONTROL (sesuai screenshot) ===
		const zoomInTop = document.getElementById('mobZoomInBtn');
		const zoomOutTop = document.getElementById('mobZoomOutBtn');

		const applyZoom = (dir) => {
			const step = 0.15;
			if (dir > 0) scale = Math.min(MAX_SCALE, (scale || 1) + step);
			else scale = Math.max(MIN_SCALE, (scale || 1) - step);

			updateMobileZoomLabel();

			if (!pdfDoc) return;
			if (mScrollMode) enterMobileScrollMode();
			else renderPage(pageNum);
		};

		if (zoomInTop) zoomInTop.addEventListener('click', (e) => {
			e.preventDefault(); e.stopPropagation();
			applyZoom(+1);
		});
		if (zoomOutTop) zoomOutTop.addEventListener('click', (e) => {
			e.preventDefault(); e.stopPropagation();
			applyZoom(-1);
		});

		updateToolUI();
		updateMobileBookmarkButtonState();
		updateMobileBookmarkCountBadge();
		updateMobileZoomLabel(); // NEW: initial label
	}

	// helper: update label zoom di navbar
	function updateMobileZoomLabel() {
		const el = document.getElementById('mobZoomLevel');
		if (!el) return;
		el.textContent = `${Math.round((scale || 1) * 100)}%`;
	}

	// --- ADD: export/import annotations (mobile) ---
	function exportMobileAnnotations() {
		try {
			const data = JSON.stringify(annotationData || {});
			const blob = new Blob([data], { type: 'application/json' });
			const a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			a.download = `annotations_mobile_${Date.now()}.json`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			setTimeout(() => URL.revokeObjectURL(a.href), 500);
			notifyMobile('Export anotasi OK');
		} catch (e) {
			console.warn('exportMobileAnnotations failed', e);
			notifyMobile('Gagal export anotasi');
		}
	}

	function importMobileAnnotationsFile(file, replace = false) {
		if (!file) return;
		const r = new FileReader();
		r.onerror = () => notifyMobile('Gagal membaca file');
		r.onload = () => {
			try {
				const obj = JSON.parse(String(r.result || '{}')) || {};
				// snapshot before changing (so Undo can revert)
				mobilePushUndoSnapshot();

				if (replace) {
					annotationData = obj;
				} else {
					// merge per-page arrays
					Object.keys(obj).forEach(pg => {
						const incoming = Array.isArray(obj[pg]) ? obj[pg] : [];
						const cur = Array.isArray(annotationData[pg]) ? annotationData[pg] : [];
						annotationData[pg] = cur.concat(incoming);
					});
				}

				saveToStorageImmediate('annotations', annotationData);
				redrawAnnotations();
				notifyMobile(replace ? 'Import (replace) OK' : 'Import (merge) OK');
			} catch (e) {
				console.warn('importMobileAnnotationsFile failed', e);
				notifyMobile('File JSON tidak valid');
			}
		};
		r.readAsText(file);
	}

	// ---- INIT ----
	async function initMobileReader() {
		try {
			const params = new URLSearchParams(window.location.search);
			const rawSrc = params.get('source');
			if (!rawSrc) { setLoading(false); alert('Buku tidak ditemukan (mobile).'); return; }

			const src = decodeURIComponent(rawSrc);

			storageKeyBase = 'reader_mobile_' + encodeURIComponent(src) + '_';
			annotationData = loadFromStorage('annotations') || {};
			notesData = loadFromStorage('notes') || {};
			mobileBookmarks = loadMobileBookmarks();

			// ADD: seed undo stack so first undo works nicely
			try {
				mobileUndoStack = [];
				mobileRedoStack = [];
				mobileUndoStack.push(JSON.stringify(annotationData || {}));
			} catch { /* ignore */ }

			setLoading(true, 'Sedang Memuat...');
			attachUI();

			try {
				pdfDoc = await pdfjsLib.getDocument({ url: src }).promise;
			} catch (e1) {
				const data = await fetchPdfAsUint8Array(src);
				pdfDoc = await pdfjsLib.getDocument({ data }).promise;
			}

			await renderPage(1);

			// ensure drawing is ready even if user never opens bottom sheet
			setupMobileDrawing();

			// ADDED: enable swipe navigation for single-page mode
			attachSwipeNavigation();

			setTimeout(() => generateThumbnails(pdfDoc), 250);

			// ADDED: keep layout correct on rotate / resize
			let __rzT = null;
			const onResize = () => {
				clearTimeout(__rzT);
				__rzT = setTimeout(() => {
					if (!pdfDoc) return;
					if (mScrollMode) enterMobileScrollMode(); // rebuild stack using new width
					else renderPage(pageNum);                 // re-fit single page
				}, 180);
			};
			window.addEventListener('resize', onResize, { passive: true });
			window.addEventListener('orientationchange', onResize, { passive: true });

			setLoading(false);
		} catch (e) {
			console.error('[MobileReader] init failed:', e);
			setLoading(false);
			alert('Gagal memuat buku (mobile). ' + (e.message || ''));
		}
	}

	function canSwipeNavigate(targetEl) {
		// Only in single-page mode
		if (mScrollMode) {
			notifyMobileThrottled('Swipe nonaktif di Scroll Mode', 2000);
			return false;
		}

		 // NEW: saat tool bukan move (highlight/eraser), jangan izinkan swipe page.
		if (currentTool !== 'move') return false;

		// NEW: kalau gesture berasal dari canvas stabilo, selalu block swipe
		if (targetEl && targetEl.closest && targetEl.closest('#highlight-canvas')) return false;

		// Block when interacting with sheet / controls
		if (!targetEl) return true;
		if (targetEl.closest && (targetEl.closest('#bottomSheet') || targetEl.closest('.sheet-body'))) return false;

		const tag = (targetEl.tagName || '').toLowerCase();
		if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button' || tag === 'label') return false;

		return true;
	}

	async function goPrevPage() {
		if (!pdfDoc) return;
		if (pageNum <= 1) return;
		await renderPage(pageNum - 1);
	}

	async function goNextPage() {
		if (!pdfDoc) return;
		if (pageNum >= (pdfDoc.numPages || 1)) return;
		await renderPage(pageNum + 1);
	}

	function attachSwipeNavigation() {
		const readerArea = document.getElementById('readerArea');
		if (!readerArea || attachSwipeNavigation._didAttach) return;
		attachSwipeNavigation._didAttach = true;

		const THRESHOLD_PX = 55;      // minimal jarak swipe
		const MAX_SWIPE_TIME = 650;   // ms
		const MAX_OFFAXIS = 80;       // toleransi gerak vertical

		readerArea.addEventListener('touchstart', (e) => {
			if (!e.touches || e.touches.length !== 1) return;
			const t = e.touches[0];

			// NEW: always re-check current tool before arming swipe
			if (!canSwipeNavigate(e.target)) return;

			swipeNav.startX = t.clientX;
			swipeNav.startY = t.clientY;
			swipeNav.startT = Date.now();
			swipeNav.active = true;
		}, { passive: true });

		// NEW: cancel swipe if finger is moving but tool changes OR drawing starts
		readerArea.addEventListener('touchmove', (e) => {
			if (!swipeNav.active) return;
			if (!canSwipeNavigate(e.target)) swipeNav.active = false;
		}, { passive: true });

		readerArea.addEventListener('touchend', async (e) => {
			if (!swipeNav.active) return;
			swipeNav.active = false;

			const changed = e.changedTouches && e.changedTouches[0];
			if (!changed) return;

			const dx = changed.clientX - swipeNav.startX;
			const dy = changed.clientY - swipeNav.startY;
			const dt = Date.now() - swipeNav.startT;

			// quick reject: too slow
			if (dt > MAX_SWIPE_TIME) return;

			// horizontal must dominate
			if (Math.abs(dx) < THRESHOLD_PX) return;
			if (Math.abs(dy) > MAX_OFFAXIS) return;
			if (Math.abs(dx) < Math.abs(dy) * 1.2) return;

			// Swipe left => next, swipe right => prev
			if (dx < 0) await goNextPage();
			else await goPrevPage();
		}, { passive: true });

		// OPTIONAL: tap left/right edge to navigate (helps one-hand use)
		readerArea.addEventListener('click', async (e) => {
			if (!canSwipeNavigate(e.target)) return;
			// avoid accidental tap when selecting text
			const sel = window.getSelection && window.getSelection();
			if (sel && String(sel).trim()) return;

			const rect = readerArea.getBoundingClientRect();
			const x = e.clientX - rect.left;
			if (x < rect.width * 0.22) await goPrevPage();
			else if (x > rect.width * 0.78) await goNextPage();
		});
	}

	let __didInit = false;
	document.addEventListener('DOMContentLoaded', () => {
		if (__didInit) return;
		__didInit = true;
		initMobileReader();
	});
})();