(() => {
	'use strict';

	if (window.__DESKTOP_READER_LOADED__) return;
	window.__DESKTOP_READER_LOADED__ = true;

	const pdfjsLib = window.pdfjsLib || window['pdfjsLib'];
	if (!pdfjsLib) { alert('pdf.js tidak ditemukan!'); return; }
	try {
		pdfjsLib.GlobalWorkerOptions.workerSrc =
			pdfjsLib.GlobalWorkerOptions.workerSrc ||
			'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
	} catch {}

	// ---- STATE ----
	let pdfDoc = null, pageNum = 1, scale = 1.0, rotation = 0;
	let scrollMode = false, fitWidth = false;
	let currentTool = 'move'; // move | highlight | eraser
	let annotationData = {}, notesData = {}, bookmarks = [];
	let undoStack = [], redoStack = [];
	let storageKey = 'reader_desktop_';
	let renderTask = null, renderSeq = 0;
	const MIN_SCALE = 0.4, MAX_SCALE = 4.0;
	let lastUsedScale = 1.0; // track actual rendered scale for zoom label

	// idle auto-hide navbar
	let idleTimer = null;
	function resetIdle() {
		const nav = document.getElementById('readerNav') || document.querySelector('.reader-nav');
		if (nav) nav.classList.remove('idle');
		clearTimeout(idleTimer);
		idleTimer = setTimeout(() => {
			if (nav) nav.classList.add('idle');
		}, 4000);
	}

	// ---- ELEMENTS ----
	const canvas = document.getElementById('the-canvas');
	const ctx = canvas ? canvas.getContext('2d') : null;
	const hlCanvas = document.getElementById('highlight-canvas');
	const hlCtx = hlCanvas ? hlCanvas.getContext('2d') : null;

	// ---- HELPERS ----
	function setLoading(on) {
		const el = document.getElementById('loadingOverlay');
		if (el) el.classList.toggle('active', !!on);
	}
	function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
	function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
	function loadLS(suffix) { try { return JSON.parse(localStorage.getItem(storageKey + suffix)); } catch { return null; } }
	function saveLS(suffix, data) { try { localStorage.setItem(storageKey + suffix, JSON.stringify(data)); } catch {} }
	const saveLSDebounced = debounce(saveLS, 300);

	function pushUndo() {
		try { undoStack.push(JSON.stringify(annotationData)); if (undoStack.length > 50) undoStack.shift(); redoStack = []; } catch {}
	}
	function undo() {
		if (!undoStack.length) return;
		try { redoStack.push(JSON.stringify(annotationData)); } catch {}
		try { annotationData = JSON.parse(undoStack.pop()); } catch { annotationData = {}; }
		saveLSDebounced('annotations', annotationData);
		redrawAnnotations();
	}
	function redo() {
		if (!redoStack.length) return;
		try { undoStack.push(JSON.stringify(annotationData)); } catch {}
		try { annotationData = JSON.parse(redoStack.pop()); } catch { annotationData = {}; }
		saveLSDebounced('annotations', annotationData);
		redrawAnnotations();
	}

	// ---- ANNOTATIONS DRAWING ----
	function redrawAnnotations() {
		if (!hlCanvas || !hlCtx) return;
		hlCtx.clearRect(0, 0, hlCanvas.width, hlCanvas.height);
		const w = hlCanvas.getBoundingClientRect().width || 1;
		const h = hlCanvas.getBoundingClientRect().height || 1;
		const strokes = annotationData[pageNum] || [];
		for (const s of strokes) {
			if (!s || !Array.isArray(s.points) || s.points.length < 1) continue;
			hlCtx.beginPath();
			hlCtx.lineCap = 'round';
			hlCtx.lineJoin = 'round';
			hlCtx.lineWidth = s.width || 24;
			if (s.tool === 'eraser') {
				hlCtx.globalCompositeOperation = 'destination-out';
				hlCtx.strokeStyle = 'rgba(0,0,0,1)';
			} else {
				hlCtx.globalCompositeOperation = 'source-over';
				hlCtx.strokeStyle = (s.color || '#fff275') + '88';
			}
			const p0 = s.points[0];
			hlCtx.moveTo(p0.x * w, p0.y * h);
			for (let i = 1; i < s.points.length; i++) hlCtx.lineTo(s.points[i].x * w, s.points[i].y * h);
			hlCtx.stroke();
			hlCtx.closePath();
		}
		hlCtx.globalCompositeOperation = 'source-over';
	}

	let isDrawing = false, currentStroke = null;
	function setupDrawing() {
		if (!hlCanvas || setupDrawing._done) return;
		setupDrawing._done = true;
		const colorEl = document.getElementById('highlightColor');
		const sizeEl = document.getElementById('highlightSize');
		const getColor = () => colorEl ? colorEl.value : '#fff275';
		const getSize = () => sizeEl ? Number(sizeEl.value) || 24 : 24;

		function getNorm(e) {
			const r = hlCanvas.getBoundingClientRect();
			return { x: clamp((e.clientX - r.left) / (r.width || 1), 0, 1), y: clamp((e.clientY - r.top) / (r.height || 1), 0, 1) };
		}
		hlCanvas.addEventListener('mousedown', (e) => {
			if (currentTool === 'move') return;
			pushUndo();
			isDrawing = true;
			const pos = getNorm(e);
			annotationData[pageNum] = annotationData[pageNum] || [];
			currentStroke = { tool: currentTool, color: currentTool === 'highlight' ? getColor() : undefined, width: getSize(), points: [pos] };
			annotationData[pageNum].push(currentStroke);
			redrawAnnotations();
		});
		hlCanvas.addEventListener('mousemove', (e) => {
			if (!isDrawing || !currentStroke || currentTool === 'move') return;
			currentStroke.points.push(getNorm(e));
			redrawAnnotations();
		});
		const endDraw = () => {
			if (!isDrawing) return;
			isDrawing = false;
			currentStroke = null;
			saveLSDebounced('annotations', annotationData);
		};
		hlCanvas.addEventListener('mouseup', endDraw);
		hlCanvas.addEventListener('mouseleave', endDraw);

		// preview
		const previewDot = document.querySelector('.preview-dot');
		const syncPreview = () => {
			if (previewDot) {
				const sz = getSize();
				previewDot.style.width = sz + 'px';
				previewDot.style.height = sz + 'px';
				previewDot.style.background = getColor();
				previewDot.style.setProperty('--highlight-preview-color', getColor());
				previewDot.style.setProperty('--hl-preview-size', sz + 'px');
			}
		};
		colorEl && colorEl.addEventListener('input', syncPreview);
		sizeEl && sizeEl.addEventListener('input', syncPreview);
		syncPreview();
	}

	function updateToolUI() {
		['moveBtn', 'highlightBtn', 'eraserBtn'].forEach(id => {
			const el = document.getElementById(id);
			if (!el) return;
			const t = id.replace('Btn', '');
			el.classList.toggle('active', currentTool === t);
		});
		const tl = document.getElementById('text-layer');
		if (hlCanvas) hlCanvas.style.pointerEvents = currentTool === 'move' ? 'none' : 'auto';
		if (tl) tl.style.pointerEvents = currentTool === 'move' ? 'auto' : 'none';
	}

	// ---- BOOKMARKS ----
	function loadBookmarks() { bookmarks = loadLS('bookmarks') || []; }
	function saveBookmarks() { saveLS('bookmarks', bookmarks); }
	function toggleBookmark() {
		const idx = bookmarks.indexOf(pageNum);
		if (idx >= 0) bookmarks.splice(idx, 1); else bookmarks.push(pageNum);
		bookmarks.sort((a, b) => a - b);
		saveBookmarks();
		renderBookmarks();
		updateThumbBookmarks();
		updateUI();
	}
	function renderBookmarks() {
		const list = document.getElementById('bookmarkList');
		if (!list) return;
		if (!bookmarks.length) { list.innerHTML = '<p class="empty-msg">Belum ada bookmark.</p>'; return; }
		list.innerHTML = '';
		bookmarks.forEach(pg => {
			const row = document.createElement('div');
			row.className = 'bookmark-row';
			row.innerHTML = `<span class="bookmark-label">Hal ${pg}</span><div class="bookmark-actions"><button class="btn-open" data-p="${pg}">Buka</button><button class="btn-del" data-p="${pg}">×</button></div>`;
			list.appendChild(row);
		});
		list.querySelectorAll('.btn-open').forEach(b => b.onclick = () => goToPage(Number(b.dataset.p)));
		list.querySelectorAll('.btn-del').forEach(b => b.onclick = () => { bookmarks = bookmarks.filter(x => x !== Number(b.dataset.p)); saveBookmarks(); renderBookmarks(); updateThumbBookmarks(); });
	}
	function updateThumbBookmarks() {
		const c = document.getElementById('thumbnailContainer');
		if (!c) return;
		c.querySelectorAll('.thumb-item').forEach(t => {
			const pg = Number(t.dataset.page);
			t.classList.toggle('bookmarked', bookmarks.includes(pg));
		});
	}

	// ---- NOTES ----
	function renderNotes() {
		const host = document.getElementById('notesList');
		if (!host) return;
		host.innerHTML = '';
		const title = document.createElement('div');
		title.className = 'note-section-title';
		title.textContent = `Catatan Hal ${pageNum}`;
		host.appendChild(title);
		const cur = notesData[pageNum] || [];
		if (!cur.length) {
			const p = document.createElement('div');
			p.className = 'note-empty';
			p.textContent = 'Belum ada catatan.';
			host.appendChild(p);
		} else {
			cur.forEach((n, i) => {
				const el = document.createElement('div');
				el.className = 'note-item';
				el.innerHTML = `<span class="note-page-badge">Hal ${pageNum}</span> <span class="note-text">${String(n).replace(/</g,'&lt;')}</span><span class="del-note" data-i="${i}" style="cursor:pointer;float:right;">×</span>`;
				host.appendChild(el);
			});
		}
		host.querySelectorAll('.del-note').forEach(b => b.onclick = () => {
			notesData[pageNum].splice(Number(b.dataset.i), 1);
			saveLSDebounced('notes', notesData);
			renderNotes();
		});
	}

	// ---- RENDER PAGE ----
	async function renderPage(num) {
		if (!pdfDoc || !canvas || !ctx) return;
		num = clamp(num, 1, pdfDoc.numPages);
		try { if (renderTask) renderTask.cancel(); } catch {}
		const seq = ++renderSeq;
		const page = await pdfDoc.getPage(num);
		if (seq !== renderSeq) return;

		const container = document.getElementById('pdfContainer');
		const containerW = container ? container.clientWidth - 40 : window.innerWidth;
		const baseVp = page.getViewport({ scale: 1, rotation });
		let usedScale = scale;
		if (fitWidth) usedScale = containerW / (baseVp.width || 1);
		usedScale = clamp(usedScale, MIN_SCALE, MAX_SCALE);
		lastUsedScale = usedScale; // track for zoom label
		const vp = page.getViewport({ scale: usedScale, rotation });
		const dpr = window.devicePixelRatio || 1;

		canvas.width = Math.floor(vp.width * dpr);
		canvas.height = Math.floor(vp.height * dpr);
		canvas.style.width = vp.width + 'px';
		canvas.style.height = vp.height + 'px';
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		if (hlCanvas && hlCtx) {
			hlCanvas.width = canvas.width;
			hlCanvas.height = canvas.height;
			hlCanvas.style.width = canvas.style.width;
			hlCanvas.style.height = canvas.style.height;
			hlCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
		}

		const task = page.render({ canvasContext: ctx, viewport: vp });
		renderTask = task;
		try { await task.promise; } catch (e) {
			if (e && e.name === 'RenderingCancelledException') { /* expected */ }
			else if (seq === renderSeq) console.warn('[render]', e);
			return;
		}
		if (seq !== renderSeq) return;

		// text layer
		const tl = document.getElementById('text-layer');
		if (tl) {
			tl.style.width = vp.width + 'px';
			tl.style.height = vp.height + 'px';
			tl.innerHTML = '';
			try {
				const tc = await page.getTextContent();
				pdfjsLib.renderTextLayer({ textContent: tc, container: tl, viewport: vp, textDivs: [] });
			} catch {}
		}

		pageNum = num;

		// save reading progress
		try {
			const params = new URLSearchParams(location.search);
			const src = params.get('source') || '';
			if (src) {
				const progressKey = 'readProgress_' + encodeURIComponent(src);
				saveLS('', null); // no-op, just to test
				localStorage.setItem(progressKey, JSON.stringify({ page: pageNum, total: pdfDoc.numPages, ts: Date.now() }));
			}
		} catch {}

		updateUI();
		redrawAnnotations();
		renderNotes();

		// highlight active thumbnail
		const thumbHost = document.getElementById('thumbnailContainer');
		if (thumbHost) {
			thumbHost.querySelectorAll('.thumb-item').forEach(t => {
				t.classList.toggle('active', Number(t.dataset.page) === pageNum);
			});
			// scroll active thumb into view
			const activeThumb = thumbHost.querySelector('.thumb-item.active');
			if (activeThumb) activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}
	}

	function updateUI() {
		const pi = document.getElementById('pageInput');
		const pt = document.getElementById('pageTotal');
		const sl = document.getElementById('pageSlider');
		const zl = document.getElementById('zoomLevel');
		const pb = document.getElementById('pageProgressBar');
		const td = document.getElementById('bookTitleDisplay');
		if (pi) pi.value = pageNum;
		if (pt) pt.textContent = pdfDoc ? pdfDoc.numPages : '--';
		if (sl && pdfDoc) { sl.max = pdfDoc.numPages; sl.value = pageNum; }
		// zoom label: show actual rendered scale (handles fitWidth correctly)
		if (zl) zl.textContent = Math.round((fitWidth ? lastUsedScale : scale) * 100) + '%';
		if (pb && pdfDoc) {
			const pct = pageNum / pdfDoc.numPages;
			pb.style.transform = `scaleX(${pct})`;
			pb.setAttribute('aria-valuenow', Math.round(pct * 100));
		}
		if (td) {
			const params = new URLSearchParams(location.search);
			td.textContent = decodeURIComponent(params.get('title') || 'uBook Reader');
		}
		updateToolUI();

		const bmBtn = document.getElementById('bookmarkBtn');
		if (bmBtn) bmBtn.classList.toggle('active', bookmarks.includes(pageNum));

		// finish button: show on last page
		const finBtn = document.getElementById('finishBtn');
		if (finBtn && pdfDoc) finBtn.style.display = (pageNum === pdfDoc.numPages) ? '' : 'none';
	}

	function goToPage(n) { if (pdfDoc) renderPage(clamp(n, 1, pdfDoc.numPages)); }

	// ---- THUMBNAILS ----
	async function generateThumbnails() {
		const host = document.getElementById('thumbnailContainer');
		if (!host || !pdfDoc) return;
		host.innerHTML = '';
		for (let i = 1; i <= pdfDoc.numPages; i++) {
			const item = document.createElement('div');
			item.className = 'thumb-item';
			item.dataset.page = i;
			if (i === pageNum) item.classList.add('active');
			const bm = document.createElement('span');
			bm.className = 'thumb-bm';
			bm.textContent = '★';
			item.appendChild(bm);
			const c = document.createElement('canvas');
			const label = document.createElement('div');
			label.className = 'thumb-num';
			label.textContent = i;
			item.appendChild(c);
			item.appendChild(label);
			item.addEventListener('click', () => { if (scrollMode) exitScrollMode(); goToPage(i); });
			host.appendChild(item);
			try {
				const pg = await pdfDoc.getPage(i);
				const vp = pg.getViewport({ scale: 0.2 });
				c.width = vp.width;
				c.height = vp.height;
				await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
			} catch {}
		}
		updateThumbBookmarks();
	}

	// ---- SCROLL MODE ----
	let scrollIO = null;
	function enterScrollMode() {
		const stack = document.getElementById('scrollStack');
		const wrapper = document.getElementById('singlePageWrapper');
		if (!stack || !pdfDoc) return;
		scrollMode = true;
		if (wrapper) wrapper.style.display = 'none';
		stack.style.display = '';
		stack.innerHTML = ''; // clear + reset rendered cache
		for (let i = 1; i <= pdfDoc.numPages; i++) {
			const sec = document.createElement('section');
			sec.className = 'page-stack';
			sec.dataset.page = i;
			const c = document.createElement('canvas');
			c.dataset.page = i;
			// do NOT set c.dataset.rendered here — let IO handle it fresh
			const t = document.createElement('div');
			t.className = 'page-text textLayer';
			sec.appendChild(c);
			sec.appendChild(t);
			stack.appendChild(sec);
		}
		setupScrollIO(stack);
		const target = stack.querySelector(`.page-stack[data-page="${pageNum}"]`);
		if (target) target.scrollIntoView({ behavior: 'auto', block: 'start' });
		document.getElementById('scrollModeBtn')?.classList.add('active');
	}

	/** Re-render visible pages without rebuilding the stack or scrolling */
	function refreshScrollMode() {
		const stack = document.getElementById('scrollStack');
		if (!stack || !pdfDoc) return;
		// Clear rendered flag so IO will re-render visible pages
		stack.querySelectorAll('.page-stack canvas').forEach(c => {
			delete c.dataset.rendered;
		});
		// Disconnect old observer and set up new one (triggers for already-visible entries)
		setupScrollIO(stack);
	}

	function setupScrollIO(stack) {
		if (scrollIO) { try { scrollIO.disconnect(); } catch {} }
		scrollIO = new IntersectionObserver((entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				const sec = entry.target;
				const pg = Number(sec.dataset.page);
				const c = sec.querySelector('canvas');
				if (c && c.dataset.rendered !== '1') {
					c.dataset.rendered = '1';
					(async () => {
						try {
							const page = await pdfDoc.getPage(pg);
							const containerW = stack.clientWidth || 600;
							const baseVp = page.getViewport({ scale: 1, rotation });
							const s = clamp(containerW / (baseVp.width || 1), MIN_SCALE, MAX_SCALE);
							const vp = page.getViewport({ scale: s, rotation });
							const dpr = window.devicePixelRatio || 1;
							c.width = Math.floor(vp.width * dpr);
							c.height = Math.floor(vp.height * dpr);
							c.style.width = vp.width + 'px';
							c.style.height = vp.height + 'px';
							const tctx = c.getContext('2d');
							tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
							await page.render({ canvasContext: tctx, viewport: vp }).promise;
							const tl = sec.querySelector('.page-text');
							if (tl) {
								tl.style.width = vp.width + 'px';
								tl.style.height = vp.height + 'px';
								tl.innerHTML = '';
								try {
									const tc = await page.getTextContent();
									pdfjsLib.renderTextLayer({ textContent: tc, container: tl, viewport: vp, textDivs: [] });
								} catch {}
							}
						} catch (err) { console.warn('[scrollRender]', pg, err); }
					})();
				}
				pageNum = pg;
				updateUI();
			}
		}, { root: document.getElementById('pdfContainer'), rootMargin: '200px', threshold: 0.01 });
		stack.querySelectorAll('.page-stack').forEach(s => scrollIO.observe(s));
	}

	function exitScrollMode() {
		scrollMode = false;
		try { scrollIO && scrollIO.disconnect(); } catch {}
		const stack = document.getElementById('scrollStack');
		const wrapper = document.getElementById('singlePageWrapper');
		if (stack) { stack.style.display = 'none'; stack.innerHTML = ''; }
		if (wrapper) wrapper.style.display = '';
		document.getElementById('scrollModeBtn')?.classList.remove('active');
		renderPage(pageNum);
	}

	// ---- EXPORT / IMPORT ----
	function exportAnnotations() {
		const payload = { annotations: annotationData, notes: notesData, bookmarks };
		const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `ubook_annotations_${Date.now()}.json`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 500);
	}

	function importAnnotations(jsonStr) {
		try {
			const data = JSON.parse(jsonStr);
			if (data.annotations) { annotationData = data.annotations; saveLSDebounced('annotations', annotationData); }
			if (data.notes) { notesData = data.notes; saveLSDebounced('notes', notesData); }
			if (Array.isArray(data.bookmarks)) { bookmarks = data.bookmarks; saveBookmarks(); renderBookmarks(); updateThumbBookmarks(); }
			// legacy: if root is annotation data directly (no wrapper)
			if (!data.annotations && !data.notes && typeof data === 'object') {
				annotationData = data; saveLSDebounced('annotations', annotationData);
			}
			redrawAnnotations();
			renderNotes();
		} catch (e) { console.warn('[import]', e); }
	}

	// ---- WIRE UI ----
	function wireUI() {
		const w = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };

		w('prevBtn', () => !scrollMode && goToPage(pageNum - 1));
		w('nextBtn', () => !scrollMode && goToPage(pageNum + 1));

		w('zoomIn', () => {
			scale = Math.min(MAX_SCALE, scale + 0.15);
			fitWidth = false;
			document.getElementById('fitWidthBtn')?.classList.remove('active');
			if (scrollMode) refreshScrollMode(); else renderPage(pageNum);
		});
		w('zoomOut', () => {
			scale = Math.max(MIN_SCALE, scale - 0.15);
			fitWidth = false;
			document.getElementById('fitWidthBtn')?.classList.remove('active');
			if (scrollMode) refreshScrollMode(); else renderPage(pageNum);
		});
		w('fitWidthBtn', () => {
			fitWidth = !fitWidth;
			document.getElementById('fitWidthBtn')?.classList.toggle('active', fitWidth);
			if (scrollMode) refreshScrollMode(); else renderPage(pageNum);
		});
		w('rotateBtn', () => {
			rotation = (rotation + 90) % 360;
			if (scrollMode) enterScrollMode(); else renderPage(pageNum);
		});
		w('scrollModeBtn', () => { scrollMode ? exitScrollMode() : enterScrollMode(); });

		w('moveBtn', () => { currentTool = 'move'; updateToolUI(); });
		w('highlightBtn', () => { currentTool = 'highlight'; updateToolUI(); });
		w('eraserBtn', () => { currentTool = 'eraser'; updateToolUI(); });
		w('undoBtn', undo);
		w('redoBtn', redo);
		w('bookmarkBtn', toggleBookmark);

		w('helpBtn', () => {
			const h = document.getElementById('readerHelp');
			if (h) h.style.display = h.style.display === 'none' ? '' : 'none';
		});
		w('closeHelp', () => {
			const h = document.getElementById('readerHelp');
			if (h) h.style.display = 'none';
		});

		// finish button -> go home
		w('finishBtn', () => { window.location.href = 'index.html'; });

		// export / import
		w('exportAnnBtn', exportAnnotations);
		w('importAnnBtn', () => document.getElementById('importAnnFile')?.click());

		const importFile = document.getElementById('importAnnFile');
		importFile && importFile.addEventListener('change', () => {
			const f = importFile.files && importFile.files[0];
			if (!f) return;
			const r = new FileReader();
			r.onload = () => importAnnotations(r.result);
			r.readAsText(f);
			importFile.value = '';
		});

		// page input + slider
		const pageInput = document.getElementById('pageInput');
		pageInput && pageInput.addEventListener('change', () => goToPage(Number(pageInput.value)));
		const pageSlider = document.getElementById('pageSlider');
		pageSlider && pageSlider.addEventListener('input', () => goToPage(Number(pageSlider.value)));

		// download current page as image
		w('downloadPageBtn', () => {
			if (!canvas) return;
			const a = document.createElement('a');
			a.href = canvas.toDataURL('image/png');
			a.download = `page_${pageNum}.png`;
			a.click();
		});

		// notes
		w('addNoteBtn', () => {
			const input = document.getElementById('noteInput');
			if (!input || !input.value.trim()) return;
			notesData[pageNum] = notesData[pageNum] || [];
			notesData[pageNum].push(input.value.trim());
			saveLSDebounced('notes', notesData);
			input.value = '';
			renderNotes();
		});
		// also allow Enter key in note textarea
		const noteInput = document.getElementById('noteInput');
		noteInput && noteInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				document.getElementById('addNoteBtn')?.click();
			}
		});

		// double-click on canvas: toggle zoom (1x ↔ 2x)
		const pdfContainer = document.getElementById('pdfContainer');
		pdfContainer && pdfContainer.addEventListener('dblclick', () => {
			if (scrollMode) return;
			fitWidth = false;
			document.getElementById('fitWidthBtn')?.classList.remove('active');
			scale = (scale > 1.5) ? 1.0 : 2.0;
			renderPage(pageNum);
		});

		// keyboard shortcuts
		document.addEventListener('keydown', (e) => {
			if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
			const k = e.key;
			if (k === 'ArrowLeft') { e.preventDefault(); goToPage(pageNum - 1); }
			else if (k === 'ArrowRight') { e.preventDefault(); goToPage(pageNum + 1); }
			else if (k === 'h' || k === 'H') { currentTool = 'highlight'; updateToolUI(); }
			else if (k === 'e' || k === 'E') { currentTool = 'eraser'; updateToolUI(); }
			else if (k === 'm' || k === 'M') { currentTool = 'move'; updateToolUI(); }
			else if (k === 'b' || k === 'B') toggleBookmark();
			else if (k === '0') { scale = 1; fitWidth = false; document.getElementById('fitWidthBtn')?.classList.remove('active'); renderPage(pageNum); }
			else if (e.ctrlKey && k === 'z') { e.preventDefault(); undo(); }
			else if (e.ctrlKey && k === 'y') { e.preventDefault(); redo(); }
			else if (k === 'Escape') { const h = document.getElementById('readerHelp'); if (h) h.style.display = 'none'; }
			else if (k === '+' || k === '=') { scale = Math.min(MAX_SCALE, scale + 0.15); fitWidth = false; renderPage(pageNum); }
			else if (k === '-') { scale = Math.max(MIN_SCALE, scale - 0.15); fitWidth = false; renderPage(pageNum); }
		});

		// idle navbar auto-hide
		['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
			document.addEventListener(evt, resetIdle, { passive: true });
		});
		resetIdle();

		setupDrawing();
		updateToolUI();
	}

	// ---- INIT ----
	async function init() {
		try {
			const params = new URLSearchParams(location.search);
			const rawSrc = params.get('source');
			if (!rawSrc) { setLoading(false); alert('Tidak ada sumber buku. Kembali ke beranda.'); window.location.href = 'index.html'; return; }

			const src = decodeURIComponent(rawSrc);
			storageKey = 'reader_desktop_' + encodeURIComponent(src) + '_';
			annotationData = loadLS('annotations') || {};
			notesData = loadLS('notes') || {};
			loadBookmarks();

			setLoading(true);
			wireUI();

			// try fetch first (works for same-origin + CORS), fallback to direct URL
			try {
				const res = await fetch(src);
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const data = new Uint8Array(await res.arrayBuffer());
				pdfDoc = await pdfjsLib.getDocument({ data }).promise;
			} catch (e1) {
				try { pdfDoc = await pdfjsLib.getDocument(src).promise; }
				catch (e2) {
					setLoading(false);
					alert('Gagal memuat PDF:\n' + (e2.message || e1.message));
					return;
				}
			}

			// restore last read page
			let startPage = 1;
			try {
				const progressKey = 'readProgress_' + encodeURIComponent(src);
				const saved = JSON.parse(localStorage.getItem(progressKey) || 'null');
				if (saved && saved.page && saved.page > 1 && saved.page <= pdfDoc.numPages) startPage = saved.page;
			} catch {}

			await renderPage(startPage);
			renderBookmarks();
			setTimeout(() => generateThumbnails(), 200);

			// resize handler
			let rzT = null;
			window.addEventListener('resize', () => {
				clearTimeout(rzT);
				rzT = setTimeout(() => {
					if (scrollMode) refreshScrollMode(); else renderPage(pageNum);
				}, 200);
			}, { passive: true });

			setLoading(false);
		} catch (e) {
			console.error('[DesktopReader] init failed:', e);
			setLoading(false);
			alert('Gagal memuat reader: ' + (e.message || ''));
		}
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
	else init();
})();