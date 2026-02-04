// --- CONFIGURASI PDF.JS ---
const pdfjsLib = window['pdfjs-dist/build/pdf'];
// Pastikan worker mengarah ke versi yang sama
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// --- GLOBAL VARIABLES ---
let pdfDoc = null,
    pageNum = 1,
    pageRendering = false,
    pageNumPending = null,
    scale = 1.0, 
    canvas = document.getElementById('the-canvas'),
    ctx = canvas.getContext('2d'),
    highlightCanvas = document.getElementById('highlight-canvas'),
    hCtx = highlightCanvas.getContext('2d');

// State Aplikasi
let isDrawing = false;
let currentTool = 'move'; // Default 'move' agar aman di mobile
let annotationData = {}; // Format: { pageNum: [ {tool, points, color, width} ] }
let undoStack = [];
let notesData = {}; // Format: { pageNum: [ {text, date} ] }

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
        setActiveTool('move'); // Paksa mode move di awal buat HP biar bisa swipe
    }

    // 3. Load Buku
    if (source) {
        loadBook(decodeURIComponent(source));
    } else {
        alert("Buku tidak ditemukan! Kembali ke beranda.");
        window.location.href = 'index.html';
    }

    // 4. Setup Semua Event Listener
    setupNavEvents();      // Navigasi Halaman & Zoom
    setupToolEvents();     // Tools Desktop & Mobile (Stabilo, Eraser, dll)
    setupDrawingEvents();  // Logic Menggambar di Canvas
    setupSwipeEvents();    // Logic Swipe Jari
    setupMobileUI();       // Logic Bottom Sheet Mobile
    setupNotesEvents();    // Logic Catatan
    setupRatingEvents();   // Logic Modal Rating
    
    // Auto Resize saat layar diputar/diubah ukurannya
    window.addEventListener('resize', () => {
        if(pdfDoc) queueRenderPage(pageNum);
    });
});

// --- FUNGSI UTAMA PDF ---

function loadBook(url) {
    const loader = document.getElementById('loadingOverlay');
    if(loader) loader.classList.add('active');
    
    pdfjsLib.getDocument(url).promise.then(pdf => {
        pdfDoc = pdf;
        if(document.getElementById('pageTotal')) document.getElementById('pageTotal').innerText = pdf.numPages;
        if(loader) loader.classList.remove('active');
        
        // Render Halaman Pertama
        renderPage(pageNum);
        // Generate Thumbnail (Desktop Sidebar)
        generateThumbnails(pdf);
    }).catch(err => {
        console.error(err);
        alert("Gagal memuat PDF. Pastikan file valid.");
        if(loader) loader.classList.remove('active');
    });
}

function renderPage(num) {
    pageRendering = true;
    
    pdfDoc.getPage(num).then(page => {
        // --- SMART AUTO-FIT LOGIC ---
        const container = document.getElementById('pdfContainer');
        
        // Desktop padding ~80px, Mobile 0px (Full Width)
        const padding = window.innerWidth < 768 ? 0 : 80;
        const availableWidth = container.clientWidth - padding;
        
        const viewportBase = page.getViewport({scale: 1.0});
        
        let finalScale = scale;

        // JIKA DI HP: Abaikan scale user, paksa Fit Width
        if (window.innerWidth < 768) {
            finalScale = availableWidth / viewportBase.width;
            scale = finalScale; // Sinkronkan variabel global
        }

        const viewport = page.getViewport({scale: finalScale});
        
        // Resize Canvas
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        highlightCanvas.height = viewport.height;
        highlightCanvas.width = viewport.width;
        
        // Resize Text Layer
        const textLayer = document.getElementById('text-layer');
        textLayer.style.width = `${viewport.width}px`;
        textLayer.style.height = `${viewport.height}px`;

        // Render PDF ke Canvas
        const renderContext = { canvasContext: ctx, viewport: viewport };
        const renderTask = page.render(renderContext);

        renderTask.promise.then(() => {
            pageRendering = false;
            
            // Render Text Layer (Agar teks bisa diblok/copy)
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
            if(document.getElementById('pageInput')) document.getElementById('pageInput').value = num;
            if(document.getElementById('zoomLevel')) document.getElementById('zoomLevel').innerText = Math.round(finalScale * 100) + '%';
            
            checkFinishButton();
            updateActiveThumb(); // Highlight sidebar
            renderNotes(); // Tampilkan catatan halaman ini

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

// --- THUMBNAIL GENERATOR ---
function generateThumbnails(pdf) {
    // Generate untuk Sidebar Desktop
    const list = document.getElementById('pageNavList');
    if(!list) return;
    
    list.innerHTML = ''; 

    for(let i=1; i<=pdf.numPages; i++) {
        const div = document.createElement('div');
        div.className = 'thumb-item';
        div.id = `thumb-${i}`;
        
        // Canvas Thumbnail Kecil
        const c = document.createElement('canvas');
        // Label Nomor
        const label = document.createElement('div');
        label.className = 'thumb-label';
        label.innerText = `Hal ${i}`;

        div.appendChild(c);
        div.appendChild(label);
        
        div.onclick = () => {
            pageNum = i;
            queueRenderPage(pageNum);
        };

        list.appendChild(div);

        // Render Async (Low Quality biar ringan)
        pdf.getPage(i).then(page => {
            const vp = page.getViewport({ scale: 0.2 });
            c.height = vp.height;
            c.width = vp.width;
            page.render({ canvasContext: c.getContext('2d'), viewport: vp });
        });
    }
}

function updateActiveThumb() {
    document.querySelectorAll('.thumb-item').forEach(el => el.classList.remove('active'));
    const active = document.getElementById(`thumb-${pageNum}`);
    if(active) {
        active.classList.add('active');
        active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
}

// --- NAVIGATION EVENTS ---
function setupNavEvents() {
    const prev = document.getElementById('prevBtn');
    const next = document.getElementById('nextBtn');
    const input = document.getElementById('pageInput');
    const zIn = document.getElementById('zoomIn');
    const zOut = document.getElementById('zoomOut');

    if(prev) prev.onclick = () => { if(pageNum > 1) { pageNum--; queueRenderPage(pageNum); }};
    if(next) next.onclick = () => { if(pageNum < pdfDoc.numPages) { pageNum++; queueRenderPage(pageNum); }};
    
    if(input) input.onchange = (e) => {
        const val = parseInt(e.target.value);
        if(val >= 1 && val <= pdfDoc.numPages) { pageNum = val; queueRenderPage(pageNum); }
    };

    if(zIn) zIn.onclick = () => { scale += 0.2; queueRenderPage(pageNum); };
    if(zOut) zOut.onclick = () => { if(scale > 0.4) scale -= 0.2; queueRenderPage(pageNum); };
}

// --- TOOLS SETUP (DESKTOP & MOBILE) ---
function setupToolEvents() {
    // Fungsi Central untuk Ganti Tool
    window.setActiveTool = function(tool) {
        currentTool = tool;
        
        // Reset Visual Semua Tombol (Desktop & Mobile)
        const allBtnIds = ['highlightBtn', 'eraserBtn', 'moveBtn', 'mHighlight', 'mEraser', 'mMove'];
        allBtnIds.forEach(id => {
            const btn = document.getElementById(id);
            if(btn) btn.classList.remove('active');
        });

        // Set Visual Tombol Aktif & Cursor Canvas
        if (tool === 'highlight') {
            ['highlightBtn', 'mHighlight'].forEach(id => {
                const btn = document.getElementById(id);
                if(btn) btn.classList.add('active');
            });
            highlightCanvas.style.cursor = 'crosshair';
            highlightCanvas.style.pointerEvents = 'auto'; // Aktifkan input mouse/touch
        } 
        else if (tool === 'eraser') {
            ['eraserBtn', 'mEraser'].forEach(id => {
                const btn = document.getElementById(id);
                if(btn) btn.classList.add('active');
            });
            highlightCanvas.style.cursor = 'cell';
            highlightCanvas.style.pointerEvents = 'auto';
        } 
        else if (tool === 'move') {
            ['moveBtn', 'mMove'].forEach(id => {
                const btn = document.getElementById(id);
                if(btn) btn.classList.add('active');
            });
            highlightCanvas.style.cursor = 'grab';
            // PENTING: Pass through event agar bisa swipe/scroll di mobile
            highlightCanvas.style.pointerEvents = 'none'; 
        }
    };

    // Binding Tombol Desktop
    bindTool('highlightBtn', 'highlight');
    bindTool('eraserBtn', 'eraser');
    bindTool('moveBtn', 'move');
    
    // Binding Tombol Mobile
    bindTool('mHighlight', 'highlight');
    bindTool('mEraser', 'eraser');
    bindTool('mMove', 'move');

    // Undo & Clear
    const undoBtn = document.getElementById('undoBtn');
    if(undoBtn) undoBtn.onclick = undo;
    
    const clearBtn = document.getElementById('clearPageBtn');
    if(clearBtn) clearBtn.onclick = clearAnnotations;
}

function bindTool(id, toolName) {
    const btn = document.getElementById(id);
    if(btn) btn.onclick = () => {
        setActiveTool(toolName);
        // Jika di mobile, tutup bottom sheet setelah pilih alat
        const sheet = document.getElementById('mobileBottomSheet');
        const bg = document.getElementById('backdrop');
        if(sheet && sheet.classList.contains('active')) {
            sheet.classList.remove('active');
            if(bg) bg.classList.remove('active');
        }
    };
}

// --- DRAWING LOGIC (ANNOTATION) ---
function setupDrawingEvents() {
    
    // Helper: Dapatkan Koordinat Presisi
    function getPos(e) {
        const rect = highlightCanvas.getBoundingClientRect();
        // Support Mouse & Touch
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        return {
            x: (clientX - rect.left) * (highlightCanvas.width / rect.width),
            y: (clientY - rect.top) * (highlightCanvas.height / rect.height)
        };
    }

    const startDraw = (e) => {
        if(currentTool === 'move') return;
        if(e.type === 'touchstart') e.preventDefault(); // Cegah scroll browser
        
        isDrawing = true;
        const {x, y} = getPos(e);
        
        saveState(); // Simpan untuk Undo
        
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
        
        redrawAnnotations(); // Render Realtime
    };

    const endDraw = () => { isDrawing = false; };

    // Mouse Events
    highlightCanvas.addEventListener('mousedown', startDraw);
    highlightCanvas.addEventListener('mousemove', drawing);
    highlightCanvas.addEventListener('mouseup', endDraw);
    highlightCanvas.addEventListener('mouseout', endDraw);
    
    // Touch Events
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

function clearAnnotations() {
    if(confirm("Hapus semua coretan di halaman ini?")) {
        saveState();
        annotationData[pageNum] = [];
        redrawAnnotations();
    }
}

// --- SWIPE GESTURE (MOBILE SLIDE) ---
function setupSwipeEvents() {
    let touchStartX = 0;
    // Gunakan container PDF sebagai area swipe
    const container = document.getElementById('pdfContainer'); 

    if(!container) return;

    container.addEventListener('touchstart', (e) => {
        if (currentTool === 'move') touchStartX = e.changedTouches[0].screenX;
    }, {passive: false});

    container.addEventListener('touchend', (e) => {
        if (currentTool === 'move') {
            const touchEndX = e.changedTouches[0].screenX;
            // Ambang batas geser 50px
            if (touchEndX < touchStartX - 50 && pageNum < pdfDoc.numPages) {
                pageNum++; queueRenderPage(pageNum);
            }
            if (touchEndX > touchStartX + 50 && pageNum > 1) {
                pageNum--; queueRenderPage(pageNum);
            }
        }
    }, {passive: false});
}

// --- MOBILE UI (BOTTOM SHEET) ---
function setupMobileUI() {
    const sheet = document.getElementById('mobileBottomSheet');
    const backdrop = document.getElementById('backdrop');
    const content = document.getElementById('mobilePanelContent');
    const menuBtn = document.getElementById('mobileMenuBtn');

    if(!sheet || !menuBtn) return;

    // Buka Menu
    menuBtn.onclick = () => {
        sheet.classList.add('active');
        if(backdrop) backdrop.classList.add('active');
        // Default tampilkan tools
        showMobileContent('tools'); 
    };

    // Tutup Menu (klik backdrop)
    if(backdrop) backdrop.onclick = () => {
        sheet.classList.remove('active');
        backdrop.classList.remove('active');
    };

    // Handler Tombol Navigasi di Bottom Sheet
    const mThumbBtn = document.getElementById('mThumb');
    const mNoteBtn = document.getElementById('mNote');

    if(mThumbBtn) mThumbBtn.onclick = () => showMobileContent('thumbs');
    if(mNoteBtn) mNoteBtn.onclick = () => showMobileContent('notes');
}

function showMobileContent(type) {
    const content = document.getElementById('mobilePanelContent');
    if(!content) return;
    content.innerHTML = ''; // Reset isi panel

    if (type === 'tools') {
        content.innerHTML = '<p style="text-align:center; color:#888; margin-top:10px;">Pilih alat di atas untuk mulai menandai.</p>';
    } 
    else if (type === 'thumbs') {
        // Generate List Halaman Mobile
        for(let i=1; i<=pdfDoc.numPages; i++) {
            const div = document.createElement('div');
            // Gunakan style inline atau class yang sudah ada di read-mobile.css
            div.className = 'thumb-item'; 
            div.innerText = `Halaman ${i}`;
            div.style.padding = "10px";
            div.style.background = "#444";
            div.style.marginBottom = "5px";
            div.style.borderRadius = "5px";
            div.style.textAlign = "center";
            
            div.onclick = () => { 
                pageNum = i; queueRenderPage(i); 
                // Tutup menu
                document.getElementById('mobileBottomSheet').classList.remove('active');
                document.getElementById('backdrop').classList.remove('active');
            };
            content.appendChild(div);
        }
    } 
    else if (type === 'notes') {
        // Tampilkan Input & List Catatan
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
            <div style="display:flex; gap:10px; margin-bottom:15px;">
                <input id="mobNoteIn" style="flex:1; padding:8px; border-radius:5px; border:none;" placeholder="Tulis...">
                <button id="mobNoteBtn" style="padding:8px 15px; background:#10b981; border:none; border-radius:5px; color:white;">Add</button>
            </div>
            <div id="mobNoteList"></div>
        `;
        content.appendChild(wrapper);
        
        // Bind event add note mobile
        document.getElementById('mobNoteBtn').onclick = () => {
            const val = document.getElementById('mobNoteIn').value;
            if(val) saveNote(val);
            renderMobileNotesList(); // Refresh list lokal
        };
        renderMobileNotesList();
    }
}

// --- NOTES & RATING ---
function setupNotesEvents() {
    const addBtn = document.getElementById('addNoteBtn');
    if(addBtn) addBtn.onclick = () => {
        const val = document.getElementById('noteInput').value.trim();
        if(val) {
            saveNote(val);
            document.getElementById('noteInput').value = '';
        }
    };
}

function saveNote(text) {
    if(!notesData[pageNum]) notesData[pageNum] = [];
    notesData[pageNum].push({text: text, date: new Date().toLocaleTimeString()});
    renderNotes(); // Refresh desktop list
}

function renderNotes() {
    // Render untuk Sidebar Desktop
    const list = document.getElementById('notesList');
    if(list) {
        list.innerHTML = '';
        const notes = notesData[pageNum] || [];
        notes.forEach((n, i) => {
            const div = document.createElement('div');
            div.className = 'note-item';
            div.innerHTML = `
                <div>${n.text}</div>
                <span class="note-date" style="font-size:0.7rem; color:#888;">${n.date}</span>
                <i class="fas fa-trash del-note" style="float:right; cursor:pointer;" onclick="deleteNote(${i})"></i>
            `;
            list.appendChild(div);
        });
    }
}

function renderMobileNotesList() {
    // Render khusus untuk panel mobile
    const list = document.getElementById('mobNoteList');
    if(list) {
        list.innerHTML = '';
        const notes = notesData[pageNum] || [];
        notes.forEach(n => {
            list.innerHTML += `<div style="background:#444; padding:8px; margin-bottom:5px; border-radius:5px;">${n.text}</div>`;
        });
    }
}

window.deleteNote = (i) => {
    if(confirm('Hapus catatan?')) {
        notesData[pageNum].splice(i, 1);
        renderNotes();
    }
};

function setupRatingEvents() {
    const modal = document.getElementById('ratingModal');
    const finishBtn = document.getElementById('finishBtn');
    const closeBtn = document.getElementById('closeModalBtn');
    const submitBtn = document.getElementById('submitRatingBtn');

    if(finishBtn) finishBtn.onclick = () => modal.classList.add('active');
    if(closeBtn) closeBtn.onclick = () => modal.classList.remove('active');
    
    if(submitBtn) submitBtn.onclick = () => {
        alert("Terima kasih! Ulasan terkirim.");
        window.location.href = 'index.html';
    };
    
    // Star Widget Logic
    document.querySelectorAll('.stars i').forEach(star => {
        star.onclick = () => {
            const val = star.getAttribute('data-val');
            document.querySelectorAll('.stars i').forEach(s => {
                if(s.getAttribute('data-val') <= val) s.classList.add('active');
                else s.classList.remove('active');
            });
        };
    });
}