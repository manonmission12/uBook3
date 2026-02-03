// --- KONFIGURASI PDF.JS ---
const pdfjsLib = window['pdfjs-dist/build/pdf'];
// Pastikan worker mengarah ke versi yang sama
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// --- VARIABEL GLOBAL ---
let pdfDoc = null,
    pageNum = 1,
    pageRendering = false,
    pageNumPending = null,
    scale = 1.0, 
    canvas = document.getElementById('the-canvas'),
    ctx = canvas.getContext('2d'),
    highlightCanvas = document.getElementById('highlight-canvas'),
    hCtx = highlightCanvas.getContext('2d');

// Variabel Tools & Data
let isDrawing = false;
let currentTool = 'move'; // Default 'move' agar aman
let annotationData = {}; // Simpan coretan: { 1: [paths], 2: [paths] }
let undoStack = [];
let notesData = {}; // Simpan catatan

// --- INISIALISASI (SAAT LOAD) ---
document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Ambil Parameter URL
    const urlParams = new URLSearchParams(window.location.search);
    const title = urlParams.get('title');
    const source = urlParams.get('source');

    if (title) document.getElementById('bookTitleDisplay').innerText = decodeURIComponent(title);
    
    // 2. Deteksi Mobile untuk Scale Awal
    if (window.innerWidth < 768) {
        scale = 0.6; // Nilai sementara, nanti akan di-override oleh Auto-Fit
        setActiveTool('move'); // Paksa mode move di awal buat HP
    }

    // 3. Load Buku
    if (source) {
        loadBook(decodeURIComponent(source));
    } else {
        alert("Buku tidak ditemukan! Kembali ke beranda.");
        window.location.href = 'index.html';
    }

    // 4. Setup Event Listeners
    setupNavEvents();      // Tombol Prev/Next/Zoom
    setupMobileEvents();   // Drawer Mobile
    setupToolEvents();     // Stabilo/Eraser
    setupSwipeEvents();    // Swipe Gesture
    setupNoteEvents();     // Catatan
    setupRatingEvents();   // Modal Rating
    
    // Auto Resize saat layar diputar
    window.addEventListener('resize', () => {
        if(pdfDoc) queueRenderPage(pageNum);
    });
});

// --- FUNGSI PDF CORE ---

function loadBook(url) {
    document.getElementById('loadingOverlay').classList.add('active');
    
    pdfjsLib.getDocument(url).promise.then(pdf => {
        pdfDoc = pdf;
        document.getElementById('pageTotal').innerText = '/ ' + pdfDoc.numPages;
        document.getElementById('loadingOverlay').classList.remove('active');
        
        // Render Halaman Pertama
        renderPage(pageNum);
        generateThumbnails(pdf);
    }).catch(err => {
        console.error(err);
        alert("Gagal memuat PDF. Pastikan file valid.");
        document.getElementById('loadingOverlay').classList.remove('active');
    });
}

function renderPage(num) {
    pageRendering = true;
    
    pdfDoc.getPage(num).then(page => {
        // --- SMART AUTO-FIT LOGIC ---
        const container = document.getElementById('pdfContainer');
        // Kurangi padding container (misal 20px) agar tidak mepet
        // Desktop padding lebih besar (80px), Mobile padding kecil (0px)
        const availableWidth = container.clientWidth - (window.innerWidth < 768 ? 0 : 80); 
        const viewportUnscaled = page.getViewport({scale: 1.0});
        
        let finalScale = scale;

        // JIKA DI HP: Paksa Width 100% Layar
        if (window.innerWidth < 768) {
            finalScale = availableWidth / viewportUnscaled.width;
            scale = finalScale; // Update global scale agar konsisten
        }

        const viewport = page.getViewport({scale: finalScale});
        
        // Set Ukuran Canvas Utama & Highlight
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        highlightCanvas.height = viewport.height;
        highlightCanvas.width = viewport.width;
        
        // Set Ukuran Text Layer
        const textLayer = document.getElementById('text-layer');
        textLayer.style.width = `${viewport.width}px`;
        textLayer.style.height = `${viewport.height}px`;

        // Render PDF ke Canvas
        const renderContext = { canvasContext: ctx, viewport: viewport };
        const renderTask = page.render(renderContext);

        renderTask.promise.then(() => {
            pageRendering = false;
            
            // Render Text Layer (Agar teks bisa diblok)
            return page.getTextContent();
        }).then(textContent => {
            textLayer.innerHTML = '';
            pdfjsLib.renderTextLayer({
                textContent: textContent,
                container: textLayer,
                viewport: viewport,
                textDivs: []
            });

            // Gambar Ulang Coretan (Anotasi)
            redrawAnnotations(); 
            
            // Update UI Info
            document.getElementById('pageInput').value = num;
            document.getElementById('zoomLevel').innerText = Math.round(finalScale * 100) + '%';
            checkFinishButton();
            document.getElementById('notePageLabel').innerText = num;
            renderNotes();
            
            // Highlight Thumbnail di Sidebar
            document.querySelectorAll('.thumb-item').forEach(el => el.classList.remove('active'));
            const activeThumb = document.getElementById(`thumb-${num}`);
            if(activeThumb) {
                activeThumb.classList.add('active');
                activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }

            // Cek antrian render
            if (pageNumPending !== null) {
                renderPage(pageNumPending);
                pageNumPending = null;
            }
        });
    });
}

function queueRenderPage(num) {
    if (pageRendering) pageNumPending = num;
    else renderPage(num);
}

function checkFinishButton() {
    const btn = document.getElementById('finishBtn');
    if(btn) btn.style.display = (pageNum === pdfDoc.numPages) ? 'block' : 'none';
}

function generateThumbnails(pdf) {
    const list = document.getElementById('pageNavList');
    list.innerHTML = ''; // Reset

    for(let i=1; i<=pdf.numPages; i++) {
        const div = document.createElement('div');
        div.className = 'thumb-item';
        div.id = `thumb-${i}`;
        
        const c = document.createElement('canvas');
        const label = document.createElement('div');
        label.className = 'thumb-label';
        label.innerText = i;

        div.appendChild(c);
        div.appendChild(label);
        
        div.onclick = () => {
            pageNum = i;
            queueRenderPage(pageNum);
            window.closeAllSidebars(); // Tutup drawer di HP
        };

        list.appendChild(div);

        // Async Render Thumbnail
        pdf.getPage(i).then(page => {
            const vp = page.getViewport({ scale: 0.2 });
            c.height = vp.height;
            c.width = vp.width;
            page.render({ canvasContext: c.getContext('2d'), viewport: vp });
        });
    }
}

// --- NAVIGASI ---
function setupNavEvents() {
    document.getElementById('prevBtn').onclick = () => { if(pageNum > 1) { pageNum--; queueRenderPage(pageNum); }};
    document.getElementById('nextBtn').onclick = () => { if(pageNum < pdfDoc.numPages) { pageNum++; queueRenderPage(pageNum); }};
    
    document.getElementById('pageInput').onchange = (e) => {
        const val = parseInt(e.target.value);
        if(val >= 1 && val <= pdfDoc.numPages) { pageNum = val; queueRenderPage(pageNum); }
    };

    document.getElementById('zoomIn').onclick = () => { scale += 0.2; queueRenderPage(pageNum); };
    document.getElementById('zoomOut').onclick = () => { if(scale > 0.4) { scale -= 0.2; queueRenderPage(pageNum); }};
}

// --- TOOLS & ANOTASI (FIX PRESISI) ---
function setupToolEvents() {
    const highlightBtn = document.getElementById('highlightBtn');
    const eraserBtn = document.getElementById('eraserBtn');
    const moveBtn = document.getElementById('moveBtn');
    const clearBtn = document.getElementById('clearPageBtn');
    const undoBtn = document.getElementById('undoBtn');

    window.setActiveTool = function(tool) {
        currentTool = tool;
        [highlightBtn, eraserBtn, moveBtn].forEach(b => { if(b) b.classList.remove('active'); });
        
        if (tool === 'highlight') {
            highlightBtn.classList.add('active');
            highlightCanvas.style.cursor = 'crosshair';
            highlightCanvas.style.pointerEvents = 'auto'; // Aktifkan input mouse
        } else if (tool === 'eraser') {
            eraserBtn.classList.add('active');
            highlightCanvas.style.cursor = 'cell';
            highlightCanvas.style.pointerEvents = 'auto';
        } else if (tool === 'move') {
            if(moveBtn) moveBtn.classList.add('active');
            highlightCanvas.style.cursor = 'grab';
            // PENTING: Pass through event agar bisa swipe/scroll di mobile
            highlightCanvas.style.pointerEvents = 'none'; 
        }
    }

    if(highlightBtn) highlightBtn.onclick = () => setActiveTool('highlight');
    if(eraserBtn) eraserBtn.onclick = () => setActiveTool('eraser');
    if(moveBtn) moveBtn.onclick = () => setActiveTool('move');
    
    if(clearBtn) clearBtn.onclick = () => {
        if(confirm("Hapus semua coretan di halaman ini?")) {
            saveState();
            annotationData[pageNum] = [];
            redrawAnnotations();
        }
    };
    
    if(undoBtn) undoBtn.onclick = undo;

    // --- DRAWING LOGIC ---
    function getPos(e) {
        const rect = highlightCanvas.getBoundingClientRect();
        // Support Mouse & Touch coordinate extraction
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        return {
            x: (clientX - rect.left) * (highlightCanvas.width / rect.width),
            y: (clientY - rect.top) * (highlightCanvas.height / rect.height)
        };
    }

    const startDraw = (e) => {
        if(currentTool === 'move') return;
        if(e.type === 'touchstart') e.preventDefault();
        
        isDrawing = true;
        const {x, y} = getPos(e);
        saveState();
        
        if(!annotationData[pageNum]) annotationData[pageNum] = [];
        
        annotationData[pageNum].push({
            tool: currentTool,
            points: [{x, y}],
            color: currentTool === 'highlight' ? 'rgba(255, 235, 59, 0.4)' : 'rgba(255,255,255,1)',
            width: currentTool === 'highlight' ? 20 : 30
        });
    };

    const drawing = (e) => {
        if(!isDrawing || currentTool === 'move') return;
        if(e.type === 'touchmove') e.preventDefault();

        const {x, y} = getPos(e);
        const currentPath = annotationData[pageNum][annotationData[pageNum].length - 1];
        currentPath.points.push({x, y});
        
        redrawAnnotations();
    };

    const endDraw = () => { isDrawing = false; };

    // Events
    highlightCanvas.addEventListener('mousedown', startDraw);
    highlightCanvas.addEventListener('mousemove', drawing);
    highlightCanvas.addEventListener('mouseup', endDraw);
    highlightCanvas.addEventListener('mouseout', endDraw);
    
    highlightCanvas.addEventListener('touchstart', startDraw, {passive: false});
    highlightCanvas.addEventListener('touchmove', drawing, {passive: false});
    highlightCanvas.addEventListener('touchend', endDraw);
}

function redrawAnnotations() {
    hCtx.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height);
    if(!annotationData[pageNum]) return;

    annotationData[pageNum].forEach(path => {
        hCtx.beginPath();
        hCtx.lineCap = 'round'; hCtx.lineJoin = 'round';
        hCtx.strokeStyle = path.color;
        hCtx.lineWidth = path.width;
        
        if(path.tool === 'eraser') hCtx.globalCompositeOperation = 'destination-out';
        else hCtx.globalCompositeOperation = 'multiply';

        if(path.points.length > 0) {
            hCtx.moveTo(path.points[0].x, path.points[0].y);
            for(let i=1; i<path.points.length; i++) {
                hCtx.lineTo(path.points[i].x, path.points[i].y);
            }
        }
        hCtx.stroke();
    });
    hCtx.globalCompositeOperation = 'source-over'; // Reset
}

function saveState() {
    undoStack.push(JSON.parse(JSON.stringify(annotationData)));
    if(undoStack.length > 20) undoStack.shift();
}

function undo() {
    if(undoStack.length > 0) {
        annotationData = undoStack.pop();
        redrawAnnotations();
    }
}

// --- SWIPE GESTURE ---
function setupSwipeEvents() {
    let touchStartX = 0;
    const container = document.getElementById('pdfContainer'); // Swipe area

    container.addEventListener('touchstart', (e) => {
        if (currentTool === 'move') touchStartX = e.changedTouches[0].screenX;
    }, {passive: false});

    container.addEventListener('touchend', (e) => {
        if (currentTool === 'move') {
            const touchEndX = e.changedTouches[0].screenX;
            if (touchEndX < touchStartX - 50 && pageNum < pdfDoc.numPages) {
                pageNum++; queueRenderPage(pageNum);
            }
            if (touchEndX > touchStartX + 50 && pageNum > 1) {
                pageNum--; queueRenderPage(pageNum);
            }
        }
    }, {passive: false});
}

// --- MOBILE SIDEBARS ---
function setupMobileEvents() {
    const backdrop = document.getElementById('sidebarBackdrop');
    const pBar = document.getElementById('pageSidebar');
    const nBar = document.getElementById('notesSidebar');

    const toggle = (bar) => {
        bar.classList.toggle('active');
        backdrop.classList.toggle('active', bar.classList.contains('active'));
    };

    document.getElementById('mobilePageToggle').onclick = () => { toggle(pBar); nBar.classList.remove('active'); };
    document.getElementById('mobileNoteToggle').onclick = () => { toggle(nBar); pBar.classList.remove('active'); };
    
    window.closeAllSidebars = () => {
        pBar.classList.remove('active');
        nBar.classList.remove('active');
        backdrop.classList.remove('active');
    };
}

// --- NOTES ---
function setupNoteEvents() {
    document.getElementById('addNoteBtn').onclick = () => {
        const val = document.getElementById('noteInput').value.trim();
        if(!val) return;
        if(!notesData[pageNum]) notesData[pageNum] = [];
        notesData[pageNum].push({text: val, date: new Date().toLocaleTimeString()});
        document.getElementById('noteInput').value = '';
        renderNotes();
    };
}

function renderNotes() {
    const list = document.getElementById('notesList');
    list.innerHTML = '';
    const notes = notesData[pageNum] || [];
    notes.forEach((n, i) => {
        const div = document.createElement('div');
        div.className = 'note-item';
        div.innerHTML = `<div>${n.text}</div><span class="note-date">${n.date}</span><i class="fas fa-trash del-note" onclick="deleteNote(${i})"></i>`;
        list.appendChild(div);
    });
}

window.deleteNote = (i) => {
    if(confirm('Hapus catatan?')) {
        notesData[pageNum].splice(i, 1);
        renderNotes();
    }
};

// --- RATING MODAL ---
function setupRatingEvents() {
    const modal = document.getElementById('ratingModal');
    document.getElementById('finishBtn').onclick = () => modal.classList.add('active');
    document.getElementById('closeModalBtn').onclick = () => modal.classList.remove('active');
    document.getElementById('submitRatingBtn').onclick = () => {
        alert('Terima kasih! Ulasan terkirim.');
        window.location.href = 'index.html';
    };
    
    document.querySelectorAll('.stars i').forEach(star => {
        star.onclick = () => {
            const v = star.getAttribute('data-val');
            document.querySelectorAll('.stars i').forEach(s => {
                if(s.getAttribute('data-val') <= v) s.classList.add('active');
                else s.classList.remove('active');
            });
        };
    });
}