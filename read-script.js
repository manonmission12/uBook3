// --- 1. KONFIGURASI PDF.JS ---
const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// --- 2. VARIABEL GLOBAL ---
let pdfDoc = null,
    pageNum = 1,
    pageRendering = false,
    pageNumPending = null,
    scale = 1.2, // Zoom default untuk Desktop (sedikit lebih besar)
    canvas = document.getElementById('the-canvas'),
    ctx = canvas.getContext('2d'),
    highlightCanvas = document.getElementById('highlight-canvas'),
    hCtx = highlightCanvas.getContext('2d');

// State Tools
let isDrawing = false;
let currentTool = 'move'; // move, highlight, eraser
let annotationData = {}; // Format: { 1: [path, path], 2: [...] }
let undoStack = [];
let notesData = {}; // Format: { 1: [text, text] }

// --- 3. INISIALISASI ---
document.addEventListener('DOMContentLoaded', () => {
    
    // Ambil Parameter URL
    const urlParams = new URLSearchParams(window.location.search);
    const title = urlParams.get('title');
    const source = urlParams.get('source');

    if (title) document.getElementById('bookTitleDisplay').innerText = decodeURIComponent(title);

    if (source) {
        loadBook(decodeURIComponent(source));
    } else {
        alert("Buku tidak ditemukan! Kembali ke beranda.");
        window.location.href = 'index.html';
    }

    // Setup Event Listeners
    setupNavigation();
    setupTools();
    setupDrawing();
    setupNotes();
});

// --- 4. CORE PDF FUNCTIONS ---

function loadBook(url) {
    document.getElementById('loadingOverlay').classList.add('active');
    
    pdfjsLib.getDocument(url).promise.then(pdf => {
        pdfDoc = pdf;
        document.getElementById('pageTotal').innerText = pdf.numPages;
        document.getElementById('loadingOverlay').classList.remove('active');
        
        // Render Halaman Pertama
        renderPage(pageNum);
        // Buat Thumbnail di Sidebar Kiri
        generateThumbnails(pdf);
    }).catch(err => {
        console.error(err);
        alert("Gagal memuat PDF.");
        document.getElementById('loadingOverlay').classList.remove('active');
    });
}

function renderPage(num) {
    pageRendering = true;
    
    pdfDoc.getPage(num).then(page => {
        const viewport = page.getViewport({scale: scale});
        
        // Atur Ukuran Canvas & Layer
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        highlightCanvas.height = viewport.height;
        highlightCanvas.width = viewport.width;
        
        const textLayer = document.getElementById('text-layer');
        textLayer.style.width = `${viewport.width}px`;
        textLayer.style.height = `${viewport.height}px`;

        // Render PDF
        const renderContext = { canvasContext: ctx, viewport: viewport };
        const renderTask = page.render(renderContext);

        renderTask.promise.then(() => {
            pageRendering = false;
            return page.getTextContent();
        }).then(textContent => {
            // Render Teks (agar bisa diblok/copy)
            textLayer.innerHTML = '';
            pdfjsLib.renderTextLayer({
                textContent: textContent,
                container: textLayer,
                viewport: viewport,
                textDivs: []
            });

            // Gambar Ulang Coretan (Stabilo)
            redrawAnnotations();
            
            // Update UI
            document.getElementById('pageInput').value = num;
            document.getElementById('zoomLevel').innerText = Math.round(scale * 100) + '%';
            
            // Tampilkan tombol selesai jika halaman terakhir
            const finishBtn = document.getElementById('finishBtn');
            if (pageNum === pdfDoc.numPages) finishBtn.style.display = 'block';
            else finishBtn.style.display = 'none';

            // Update Highlight Thumbnail
            updateActiveThumbnail();
            // Update List Catatan
            renderNotes();

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

// --- 5. SIDEBAR: THUMBNAILS ---

function generateThumbnails(pdf) {
    const list = document.getElementById('pageNavList');
    list.innerHTML = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const item = document.createElement('div');
        item.className = 'thumb-item';
        item.id = `thumb-${i}`;
        
        // Canvas Kecil
        const c = document.createElement('canvas');
        const label = document.createElement('div');
        label.innerText = `Hal ${i}`;
        label.style.fontSize = '0.8rem';
        label.style.color = '#ccc';
        label.style.marginTop = '5px';

        item.appendChild(c);
        item.appendChild(label);
        
        item.onclick = () => {
            pageNum = i;
            queueRenderPage(pageNum);
        };

        list.appendChild(item);

        // Render Async (Skala Kecil)
        pdf.getPage(i).then(page => {
            const vp = page.getViewport({ scale: 0.15 });
            c.height = vp.height;
            c.width = vp.width;
            page.render({ canvasContext: c.getContext('2d'), viewport: vp });
        });
    }
}

function updateActiveThumbnail() {
    // Hapus kelas active dari semua thumb
    document.querySelectorAll('.thumb-item').forEach(el => el.classList.remove('active'));
    // Tambah ke yang aktif
    const active = document.getElementById(`thumb-${pageNum}`);
    if (active) {
        active.classList.add('active');
        active.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// --- 6. NAVIGATION & ZOOM ---

function setupNavigation() {
    document.getElementById('prevBtn').onclick = () => {
        if (pageNum <= 1) return;
        pageNum--;
        queueRenderPage(pageNum);
    };

    document.getElementById('nextBtn').onclick = () => {
        if (pageNum >= pdfDoc.numPages) return;
        pageNum++;
        queueRenderPage(pageNum);
    };

    document.getElementById('pageInput').onchange = (e) => {
        const val = parseInt(e.target.value);
        if (val >= 1 && val <= pdfDoc.numPages) {
            pageNum = val;
            queueRenderPage(pageNum);
        }
    };

    document.getElementById('zoomIn').onclick = () => {
        scale += 0.2;
        queueRenderPage(pageNum);
    };

    document.getElementById('zoomOut').onclick = () => {
        if (scale > 0.4) {
            scale -= 0.2;
            queueRenderPage(pageNum);
        }
    };
}

// --- 7. TOOLS & DRAWING (DESKTOP MOUSE ONLY) ---

function setupTools() {
    const tools = ['highlightBtn', 'eraserBtn', 'moveBtn'];
    
    tools.forEach(id => {
        document.getElementById(id).onclick = () => {
            // Reset active class
            tools.forEach(t => document.getElementById(t).classList.remove('active'));
            document.getElementById(id).classList.add('active');
            
            // Set Current Tool
            if (id === 'highlightBtn') {
                currentTool = 'highlight';
                highlightCanvas.style.pointerEvents = 'auto'; // Aktifkan canvas atas
                highlightCanvas.style.cursor = 'crosshair';
            } else if (id === 'eraserBtn') {
                currentTool = 'eraser';
                highlightCanvas.style.pointerEvents = 'auto';
                highlightCanvas.style.cursor = 'cell';
            } else {
                currentTool = 'move';
                highlightCanvas.style.pointerEvents = 'none'; // Matikan canvas atas (biar bisa seleksi teks)
                highlightCanvas.style.cursor = 'default';
            }
        };
    });
}

function setupDrawing() {
    // Fungsi untuk mendapatkan posisi mouse relatif terhadap canvas
    function getMousePos(evt) {
        const rect = highlightCanvas.getBoundingClientRect();
        return {
            x: (evt.clientX - rect.left) * (highlightCanvas.width / rect.width),
            y: (evt.clientY - rect.top) * (highlightCanvas.height / rect.height)
        };
    }

    highlightCanvas.addEventListener('mousedown', (e) => {
        if (currentTool === 'move') return;
        isDrawing = true;
        const pos = getMousePos(e);
        
        // Buat path baru
        if (!annotationData[pageNum]) annotationData[pageNum] = [];
        annotationData[pageNum].push({
            tool: currentTool,
            points: [pos],
            color: currentTool === 'highlight' ? 'rgba(255, 235, 59, 0.4)' : null
        });
    });

    highlightCanvas.addEventListener('mousemove', (e) => {
        if (!isDrawing || currentTool === 'move') return;
        const pos = getMousePos(e);
        const currentPath = annotationData[pageNum][annotationData[pageNum].length - 1];
        currentPath.points.push(pos);
        redrawAnnotations();
    });

    highlightCanvas.addEventListener('mouseup', () => {
        isDrawing = false;
    });
    
    highlightCanvas.addEventListener('mouseout', () => {
        isDrawing = false;
    });
}

function redrawAnnotations() {
    hCtx.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height);
    if (!annotationData[pageNum]) return;

    annotationData[pageNum].forEach(path => {
        hCtx.beginPath();
        hCtx.lineCap = 'round';
        hCtx.lineJoin = 'round';
        hCtx.lineWidth = 20; // Lebar stabilo
        
        if (path.tool === 'eraser') {
            hCtx.globalCompositeOperation = 'destination-out';
            hCtx.strokeStyle = 'rgba(0,0,0,1)';
        } else {
            hCtx.globalCompositeOperation = 'multiply';
            hCtx.strokeStyle = path.color;
        }

        if (path.points.length > 0) {
            hCtx.moveTo(path.points[0].x, path.points[0].y);
            for (let point of path.points) {
                hCtx.lineTo(point.x, point.y);
            }
        }
        hCtx.stroke();
    });
    
    // Reset composite
    hCtx.globalCompositeOperation = 'source-over';
}

// --- 8. NOTES ---

function setupNotes() {
    document.getElementById('addNoteBtn').onclick = () => {
        const input = document.getElementById('noteInput');
        const text = input.value.trim();
        if (!text) return;

        if (!notesData[pageNum]) notesData[pageNum] = [];
        notesData[pageNum].push(text);
        
        input.value = '';
        renderNotes();
    };
}

function renderNotes() {
    const list = document.getElementById('notesList');
    list.innerHTML = '';
    
    const notes = notesData[pageNum] || [];
    
    if (notes.length === 0) {
        list.innerHTML = '<div style="color:#777; text-align:center; padding:10px;">Belum ada catatan.</div>';
        return;
    }

    notes.forEach((text, index) => {
        const div = document.createElement('div');
        div.className = 'note-item';
        div.innerHTML = `
            <div>${text}</div>
            <i class="fas fa-trash del-note" onclick="deleteNote(${index})"></i>
        `;
        list.appendChild(div);
    });
}

// Fungsi Global untuk hapus note (biar bisa dipanggil dari onclick HTML)
window.deleteNote = function(index) {
    if (confirm("Hapus catatan ini?")) {
        notesData[pageNum].splice(index, 1);
        renderNotes();
    }
};