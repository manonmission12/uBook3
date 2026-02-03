document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. CEK LIBRARY ---
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    } else {
        alert("Gagal memuat Library PDF.js. Cek koneksi internet.");
    }

    const urlParams = new URLSearchParams(window.location.search);
    const bookTitle = urlParams.get('title') || 'Unknown_Book';
    const bookSource = urlParams.get('source');

    if(bookTitle) document.getElementById('bookTitleDisplay').innerText = bookTitle;

    // --- CONFIG & STATE ---
    let pdfDoc = null;
    let pageNum = 1;
    let scale = 1.5; 
    let pageRendering = false;
    let isPageChanging = false;
    
    // Elements
    const canvas = document.getElementById('the-canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    const highlightCanvas = document.getElementById('highlight-canvas');
    const hCtx = highlightCanvas ? highlightCanvas.getContext('2d') : null;
    
    const pdfWrapper = document.getElementById('pdfWrapper');
    const pdfContainer = document.getElementById('pdfContainer');
    const textLayerDiv = document.getElementById('text-layer');
    const annotationLayer = document.getElementById('annotation-layer');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const pageNavList = document.getElementById('pageNavList');
    
    // Navigasi
    const nextBtn = document.getElementById('nextBtn');
    const prevBtn = document.getElementById('prevBtn');
    const finishBtn = document.getElementById('finishBtn');
    const pageInput = document.getElementById('pageInput');
    const pageTotalDisplay = document.getElementById('pageTotal');
    const notePageLabel = document.getElementById('notePageLabel');
    const zoomLevelDisplay = document.getElementById('zoomLevel');
    
    // Tools
    const zoomInBtn = document.getElementById('zoomIn');
    const zoomOutBtn = document.getElementById('zoomOut');
    
    const highlightBtn = document.getElementById('highlightBtn');
    const moveBtn = document.getElementById('moveBtn'); // TOMBOL GESER
    const eraserBtn = document.getElementById('eraserBtn');
    const clearPageBtn = document.getElementById('clearPageBtn');
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    
    const notesList = document.getElementById('notesList');
    const noteInput = document.getElementById('noteInput');
    const addNoteBtn = document.getElementById('addNoteBtn');

    // State Aplikasi
    let isHighlightMode = false;
    let isEraserMode = false;
    let isMoveMode = false; // Mode Geser
    let isDrawing = false;
    
    // Variables untuk Move Logic
    let draggingHighlightIndex = -1;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let startX, startY;
    
    let undoStack = [], redoStack = [];
    const currentUser = localStorage.getItem('currentUser') || 'Tamu';
    const storageKey = `annotations_${currentUser}_${bookTitle}`;
    let annotationsData = JSON.parse(localStorage.getItem(storageKey) || '{}');

    // --- ANIMASI FLIP TRANSISI ---
    function animateAndRender(newPageNum, direction) {
        if (pageRendering || isPageChanging) return;
        isPageChanging = true;
        const animClass = direction === 'next' ? 'page-flip-next' : 'page-flip-prev';
        pdfWrapper.classList.add(animClass);
        setTimeout(() => {
            pageNum = newPageNum;
            renderPage(pageNum, () => {
                setTimeout(() => {
                    pdfWrapper.classList.remove(animClass);
                    isPageChanging = false;
                }, 300);
            });
        }, 200);
    }

    // --- RENDER PAGE ---
    function renderPage(num, callback) {
        pageRendering = true;
        undoStack = []; redoStack = []; 

        pdfDoc.getPage(num).then(page => {
            const viewport = page.getViewport({ scale: scale });
            const outputScale = Math.min(window.devicePixelRatio || 1, 2.0);

            const displayWidth = Math.floor(viewport.width);
            const displayHeight = Math.floor(viewport.height);

            canvas.width = Math.floor(viewport.width * outputScale);
            canvas.height = Math.floor(viewport.height * outputScale);
            highlightCanvas.width = Math.floor(viewport.width * outputScale);
            highlightCanvas.height = Math.floor(viewport.height * outputScale);

            canvas.style.width = `${displayWidth}px`;
            canvas.style.height = `${displayHeight}px`;
            highlightCanvas.style.width = `${displayWidth}px`;
            highlightCanvas.style.height = `${displayHeight}px`;
            
            pdfWrapper.style.width = `${displayWidth}px`;
            pdfWrapper.style.height = `${displayHeight}px`;

            hCtx.setTransform(outputScale, 0, 0, outputScale, 0, 0);

            const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
            const renderContext = { canvasContext: ctx, viewport: viewport, transform: transform };
            
            const renderTask = page.render(renderContext);

            renderTask.promise.then(() => {
                pageRendering = false;
                loadingOverlay.classList.remove('active'); 
                updateUIState(num);
                pdfContainer.scrollTop = 0;
                if (callback) callback();
                return page.getTextContent();
            }).then(textContent => {
                textLayerDiv.innerHTML = '';
                textLayerDiv.style.setProperty('--scale-factor', scale);
                pdfjsLib.renderTextLayer({
                    textContent: textContent,
                    container: textLayerDiv,
                    viewport: viewport,
                    textDivs: []
                });
                loadAnnotationsForPage(num);
                updateToolState(); 
            }).catch(error => { console.warn(error); loadingOverlay.classList.remove('active'); pageRendering = false; });
        }).catch(error => { console.error(error); loadingOverlay.classList.remove('active'); pageRendering = false; });
    }

    function updateUIState(num) {
        pageInput.value = num;
        if(notePageLabel) notePageLabel.innerText = `Hal ${num}`;
        if(zoomLevelDisplay) zoomLevelDisplay.innerText = Math.round(scale * 100) + '%';
        updatePageNavHighlight(num);
        renderSidebarNotes(num);
        prevBtn.disabled = (num <= 1);
        if (num >= pdfDoc.numPages) { nextBtn.style.display = 'none'; if(finishBtn) finishBtn.style.display = 'flex'; } 
        else { nextBtn.style.display = 'flex'; nextBtn.disabled = false; if(finishBtn) finishBtn.style.display = 'none'; }
    }

    // --- TOOL SWITCHING ---
    highlightBtn.addEventListener('click', () => { 
        isHighlightMode = !isHighlightMode; isEraserMode = false; isMoveMode = false; updateToolState(); 
    });
    eraserBtn.addEventListener('click', () => { 
        isEraserMode = !isEraserMode; isHighlightMode = false; isMoveMode = false; updateToolState(); 
    });
    if(moveBtn) moveBtn.addEventListener('click', () => {
        isMoveMode = !isMoveMode; isHighlightMode = false; isEraserMode = false; updateToolState();
    });

    function updateToolState() {
        highlightBtn.classList.toggle('active', isHighlightMode);
        eraserBtn.classList.toggle('active', isEraserMode);
        if(moveBtn) moveBtn.classList.toggle('active', isMoveMode);

        if (isHighlightMode || isEraserMode || isMoveMode) {
            annotationLayer.style.pointerEvents = 'auto';
            textLayerDiv.style.pointerEvents = 'none';
            if (isHighlightMode) highlightCanvas.style.cursor = 'crosshair';
            else if (isEraserMode) highlightCanvas.style.cursor = 'cell'; 
            else if (isMoveMode) highlightCanvas.style.cursor = 'move'; // Kursor Move
        } else {
            annotationLayer.style.pointerEvents = 'none';
            textLayerDiv.style.pointerEvents = 'auto';
            highlightCanvas.style.cursor = 'default';
        }
    }

    // --- CANVAS INTERACTION (Highlight, Erase, MOVE) ---
    function getCoords(e) {
        const r = highlightCanvas.getBoundingClientRect();
        let cx, cy;
        if(e.touches) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; } else { cx = e.clientX; cy = e.clientY; }
        return { x: cx - r.left, y: cy - r.top };
    }

    // 1. MOUSE DOWN
    highlightCanvas.addEventListener('mousedown', (e) => {
        if (!isHighlightMode && !isEraserMode && !isMoveMode) return;
        
        isDrawing = true;
        const c = getCoords(e);

        if (isMoveMode) {
            // Logika Mencari Highlight yang diklik
            const pageData = annotationsData[pageNum];
            if (pageData && pageData.highlights) {
                for (let i = pageData.highlights.length - 1; i >= 0; i--) {
                    const r = pageData.highlights[i];
                    // Hit Test
                    if (c.x >= r.x && c.x <= r.x + r.w && c.y >= r.y && c.y <= r.y + r.h) {
                        draggingHighlightIndex = i; 
                        dragOffsetX = c.x - r.x; 
                        dragOffsetY = c.y - r.y;
                        saveStateToHistory(); 
                        return; 
                    }
                }
            }
            return;
        }

        if (isHighlightMode || isEraserMode) saveStateToHistory();
        if (isHighlightMode) { startX = c.x; startY = c.y; }
        if (isEraserMode) performEraser(c.x, c.y);
    });

    // 2. MOUSE MOVE
    highlightCanvas.addEventListener('mousemove', (e) => {
        if (!isDrawing) return;
        const c = getCoords(e);

        if (isMoveMode && draggingHighlightIndex !== -1) {
            // Logika Geser
            const r = annotationsData[pageNum].highlights[draggingHighlightIndex];
            r.x = c.x - dragOffsetX;
            r.y = c.y - dragOffsetY;
            loadAnnotationsForPage(pageNum); // Redraw real-time
            return;
        }

        if (isEraserMode) performEraser(c.x, c.y);
        else if (isHighlightMode) {
            loadAnnotationsForPage(pageNum);
            const w = Math.abs(c.x - startX), h = Math.abs(c.y - startY);
            hCtx.fillStyle = 'rgba(255, 255, 0, 0.4)';
            hCtx.fillRect(Math.min(startX, c.x), Math.min(startY, c.y), w, h);
        }
    });

    // 3. MOUSE UP
    window.addEventListener('mouseup', (e) => {
        if (!isDrawing) return;
        isDrawing = false;

        if (isMoveMode && draggingHighlightIndex !== -1) {
            draggingHighlightIndex = -1; // Reset
            saveData();
            return;
        }

        if (isHighlightMode) loadAnnotationsForPage(pageNum);
    });

    highlightCanvas.addEventListener('mouseup', (e) => {
        if (!isHighlightMode) return;
        const c = getCoords(e);
        const w = Math.abs(c.x - startX), h = Math.abs(c.y - startY);
        if (w > 5 && h > 5) {
            if (!annotationsData[pageNum]) annotationsData[pageNum] = {highlights:[], notes:[]};
            if (!annotationsData[pageNum].highlights) annotationsData[pageNum].highlights = [];
            annotationsData[pageNum].highlights.push({
                x: Math.min(startX, c.x), y: Math.min(startY, c.y), w: w, h: h
            });
            saveData();
        }
        loadAnnotationsForPage(pageNum);
    });

    function performEraser(x, y) {
        const p = annotationsData[pageNum]; if(!p || !p.highlights) return;
        let del = false;
        for (let i = p.highlights.length - 1; i >= 0; i--) {
            const r = p.highlights[i];
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { 
                p.highlights.splice(i, 1); del = true; 
            }
        }
        if (del) { saveData(); loadAnnotationsForPage(pageNum); }
    }

    function highlightSelectedText() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return false;
        const range = selection.getRangeAt(0);
        if (!textLayerDiv.contains(range.commonAncestorContainer) && !textLayerDiv.contains(range.startContainer.parentNode)) return false;
        const rects = range.getClientRects();
        const wrapperRect = pdfWrapper.getBoundingClientRect();
        if (rects.length > 0) {
            saveStateToHistory();
            if (!annotationsData[pageNum]) annotationsData[pageNum] = { highlights: [], notes: [] };
            if (!annotationsData[pageNum].highlights) annotationsData[pageNum].highlights = [];
            for (let i = 0; i < rects.length; i++) {
                const r = rects[i];
                annotationsData[pageNum].highlights.push({ 
                    x: r.left - wrapperRect.left, 
                    y: r.top - wrapperRect.top, 
                    w: r.width, 
                    h: r.height 
                });
            }
            saveData(); loadAnnotationsForPage(pageNum); selection.removeAllRanges();
            return true;
        }
        return false;
    }
    
    highlightBtn.addEventListener('click', () => {
        if(highlightSelectedText()) { 
            isHighlightMode = false; isEraserMode = false; isMoveMode = false; 
            updateToolState(); 
        } 
    });

    // --- HISTORY, SAVE & LOAD ---
    function saveStateToHistory() {
        const d = annotationsData[pageNum] ? JSON.parse(JSON.stringify(annotationsData[pageNum])) : {highlights:[], notes:[]};
        undoStack.push(d); redoStack = []; if(undoStack.length > 20) undoStack.shift();
    }
    function performUndo() {
        if(undoStack.length===0)return; redoStack.push(annotationsData[pageNum]?JSON.parse(JSON.stringify(annotationsData[pageNum])):{highlights:[],notes:[]});
        annotationsData[pageNum]=undoStack.pop(); saveData(); loadAnnotationsForPage(pageNum);
    }
    function performRedo() {
        if(redoStack.length===0)return; undoStack.push(annotationsData[pageNum]?JSON.parse(JSON.stringify(annotationsData[pageNum])):{highlights:[],notes:[]});
        annotationsData[pageNum]=redoStack.pop(); saveData(); loadAnnotationsForPage(pageNum);
    }
    undoBtn.addEventListener('click', performUndo);
    redoBtn.addEventListener('click', performRedo);
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); performUndo(); }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y')) { e.preventDefault(); performRedo(); }
    });

    function loadAnnotationsForPage(page) {
        hCtx.save(); hCtx.setTransform(1, 0, 0, 1, 0, 0); 
        hCtx.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height); hCtx.restore(); 
        const pageData = annotationsData[page];
        if (pageData && pageData.highlights) {
            hCtx.fillStyle = 'rgba(255, 255, 0, 0.4)';
            pageData.highlights.forEach(rect => { hCtx.fillRect(rect.x, rect.y, rect.w, rect.h); });
        }
    }

    function saveData() { localStorage.setItem(storageKey, JSON.stringify(annotationsData)); }

    // --- UI EVENTS ---
    clearPageBtn.addEventListener('click', () => { if(confirm("Hapus semua coretan?")) { saveStateToHistory(); delete annotationsData[pageNum]; saveData(); loadAnnotationsForPage(pageNum); } });
    if(zoomInBtn) zoomInBtn.addEventListener('click', () => { if(scale<3.0) { scale += 0.2; renderPage(pageNum); }});
    if(zoomOutBtn) zoomOutBtn.addEventListener('click', () => { if(scale>0.5) { scale -= 0.2; renderPage(pageNum); }});

    function renderSidebarNotes(pNum) {
        notesList.innerHTML = '';
        const pageData = annotationsData[pNum];
        const notes = (pageData && pageData.notes) ? pageData.notes : [];
        if (notes.length === 0) { notesList.innerHTML = '<div class="empty-notes">Belum ada catatan.</div>'; return; }
        notes.forEach((note, index) => {
            const div = document.createElement('div'); div.className = 'note-item';
            div.innerHTML = `<div class="note-content">${note.text}</div><span class="note-date">${new Date(note.date).toLocaleDateString('id-ID')}</span><button class="btn-delete-note"><i class="fas fa-trash"></i></button>`;
            div.querySelector('button').onclick = () => { if(confirm('Hapus?')) { saveStateToHistory(); notes.splice(index, 1); saveData(); renderSidebarNotes(pNum); } };
            notesList.appendChild(div);
        });
    }
    
    addNoteBtn.addEventListener('click', () => {
        const val = noteInput.value.trim(); if(!val) return; saveStateToHistory();
        if(!annotationsData[pageNum]) annotationsData[pageNum]={highlights:[],notes:[]};
        if(!annotationsData[pageNum].notes) annotationsData[pageNum].notes=[];
        annotationsData[pageNum].notes.push({text:val, date: new Date().toISOString()});
        saveData(); renderSidebarNotes(pageNum); noteInput.value='';
    });

    // --- SCROLL & NAV EVENTS ---
    pdfContainer.addEventListener('wheel', (e) => {
        if (pageRendering || isPageChanging) return;
        const scrollTop = pdfContainer.scrollTop;
        const scrollHeight = pdfContainer.scrollHeight;
        const clientHeight = pdfContainer.clientHeight;
        const isAtBottom = (scrollTop + clientHeight >= scrollHeight - 5);
        const isAtTop = (scrollTop <= 0);
        if (e.deltaY > 0 && isAtBottom) { if (pageNum < pdfDoc.numPages) animateAndRender(pageNum + 1, 'next'); } 
        else if (e.deltaY < 0 && isAtTop) { if (pageNum > 1) animateAndRender(pageNum - 1, 'prev'); }
    }, { passive: true });

    prevBtn.addEventListener('click', () => { if (pageNum > 1) animateAndRender(pageNum - 1, 'prev'); });
    nextBtn.addEventListener('click', () => { if (pageNum < pdfDoc.numPages) animateAndRender(pageNum + 1, 'next'); });
    pageInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { handlePageSearch(); pageInput.blur(); } });
    pageInput.addEventListener('change', handlePageSearch);
    function handlePageSearch() {
        let p = parseInt(pageInput.value); if (isNaN(p) || p < 1) p = 1; else if (p > pdfDoc.numPages) p = pdfDoc.numPages;
        if (p !== pageNum) { const dir = p > pageNum ? 'next' : 'prev'; animateAndRender(p, dir); } else pageInput.value = pageNum;
    }

    // --- SIDEBAR THUMBNAIL ---
    function generatePageNavigation(total) {
        pageNavList.innerHTML = '';
        const observer = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && entry.target.dataset.rendered === "false") {
                    renderThumbnail(entry.target); entry.target.dataset.rendered = "true"; obs.unobserve(entry.target);
                }
            });
        }, { root: pageNavList, rootMargin: '100px', threshold: 0.01 });
        for (let i = 1; i <= total; i++) {
            const item = document.createElement('div'); item.className = 'page-nav-item'; item.dataset.page = i; item.dataset.rendered = "false";
            const c = document.createElement('canvas'); c.width=100; c.height=140; 
            const s = document.createElement('span'); s.className='page-label'; s.innerText=i;
            item.appendChild(c); item.appendChild(s);
            item.onclick = () => { if(pageRendering || i === pageNum) return; const dir = i > pageNum ? 'next' : 'prev'; animateAndRender(i, dir); };
            pageNavList.appendChild(item); observer.observe(item);
        }
    }
    function renderThumbnail(container) {
        const p = parseInt(container.dataset.page);
        pdfDoc.getPage(p).then(page => {
            const viewport = page.getViewport({ scale: 0.2 });
            const canvas = container.querySelector('canvas'); const ctx = canvas.getContext('2d');
            canvas.height = viewport.height; canvas.width = viewport.width;
            page.render({ canvasContext: ctx, viewport: viewport });
        });
    }
    function updatePageNavHighlight(current) {
        const items = document.querySelectorAll('.page-nav-item'); items.forEach(item => item.classList.remove('active'));
        const activeItem = document.querySelector(`.page-nav-item[data-page="${current}"]`);
        if (activeItem) { activeItem.classList.add('active'); activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }

    // --- INIT ---
    if (bookSource) {
        loadingOverlay.classList.add('active');
        pdfjsLib.getDocument(bookSource).promise.then(doc => {
            pdfDoc = doc; pageTotalDisplay.innerText = `/ ${pdfDoc.numPages}`; pageInput.max = pdfDoc.numPages;
            renderPage(pageNum); generatePageNavigation(doc.numPages);
        }).catch(err => { console.error(err); loadingOverlay.classList.remove('active'); alert("Gagal memuat."); });
    } else { loadingOverlay.classList.remove('active'); }

    // --- RATING ---
    if(finishBtn) finishBtn.addEventListener('click', () => document.getElementById('ratingModal').classList.add('active'));
    if(document.getElementById('skipRatingBtn')) document.getElementById('skipRatingBtn').addEventListener('click', () => window.location.href = 'index.html');
    const stars = document.querySelectorAll('.star-widget i'); const rInput = document.getElementById('ratingScore');
    stars.forEach(s => s.addEventListener('click', () => {
        const val = parseInt(s.getAttribute('data-value')); rInput.value = val;
        stars.forEach(st => st.style.color = parseInt(st.getAttribute('data-value')) <= val ? '#f59e0b' : '#ddd');
    }));
    if(document.getElementById('submitRatingBtn')) {
        document.getElementById('submitRatingBtn').addEventListener('click', () => {
            const val = parseFloat(rInput.value || 0); if(val <= 0) { alert("Beri nilai dulu!"); return; }
            const allRatings = JSON.parse(localStorage.getItem('userRatings') || '{}');
            allRatings[bookTitle] = { score: val, review: document.getElementById('ratingReview').value, date: new Date().toISOString() };
            localStorage.setItem('userRatings', JSON.stringify(allRatings));
            alert("Terima kasih!"); window.location.href = 'index.html';
        });
    }
});