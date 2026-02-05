// --- 1. KONFIGURASI PDF.JS ---
const pdfjsLib = window['pdfjs-dist/build/pdf'];
// Pastikan worker mengarah ke versi yang sama dengan library di HTML
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// --- 2. VARIABEL GLOBAL ---
let pdfDoc = null, 
    pageNum = 1, 
    scale = 1.2; // Default Zoom Desktop

// Canvas Utama (Gambar PDF)
let canvas = document.getElementById('the-canvas'), 
    ctx = canvas.getContext('2d');

// Canvas Stabilo (Coretan)
let hCanvas = document.getElementById('highlight-canvas'), 
    hCtx = hCanvas.getContext('2d');

// Layer Teks (Untuk Seleksi)
let textLayerDiv = document.getElementById('text-layer');

// State Aplikasi
let isDrawing = false, 
    currentTool = 'move', // Default tool: Move (Bisa Blok Teks)
    annotationData = {}, 
    notesData = {}, 
    undoStack = [], 
    redoStack = [];

// --- 3. INISIALISASI (SAAT LOAD) ---
document.addEventListener('DOMContentLoaded', () => {
    // Ambil parameter URL
    const params = new URLSearchParams(window.location.search);
    if(params.get('title')) document.getElementById('bookTitleDisplay').innerText = decodeURIComponent(params.get('title'));
    
    const source = params.get('source');
    if(source) {
        loadBook(decodeURIComponent(source));
    } else { 
        alert("Buku tidak ditemukan!"); 
        window.location.href='index.html'; 
    }
    
    setupEvents();
});

// --- 4. FUNGSI LOAD BUKU ---
function loadBook(url) {
    document.getElementById('loadingOverlay').classList.add('active');
    
    pdfjsLib.getDocument(url).promise.then(pdf => {
        pdfDoc = pdf;
        document.getElementById('pageTotal').innerText = pdf.numPages;
        
        // 1. Render Halaman Utama DULUAN (Prioritas)
        renderPage(pageNum).then(() => {
            // Setelah halaman 1 muncul, hilangkan loading
            document.getElementById('loadingOverlay').classList.remove('active');
            
            // 2. Generate Thumbnail pelan-pelan di background (Async)
            setTimeout(() => generateThumbnails(pdf), 500);
        });

    }).catch(err => {
        console.error("Error loading PDF:", err);
        alert("Gagal memuat buku.");
        document.getElementById('loadingOverlay').classList.remove('active');
    });
}

// --- 5. FUNGSI RENDER HALAMAN UTAMA ---
function renderPage(num) {
    return new Promise((resolve) => {
        pdfDoc.getPage(num).then(page => {
            const viewport = page.getViewport({scale: scale});
            
            // Set Ukuran Canvas Utama & Highlight agar sama persis
            canvas.height = viewport.height; 
            canvas.width = viewport.width;
            hCanvas.height = viewport.height; 
            hCanvas.width = viewport.width;
            
            // Set Ukuran Layer Teks
            textLayerDiv.style.width = `${viewport.width}px`; 
            textLayerDiv.style.height = `${viewport.height}px`;

            const renderCtx = { canvasContext: ctx, viewport: viewport };
            
            // Render Gambar PDF
            page.render(renderCtx).promise.then(() => {
                return page.getTextContent();
            }).then(textContent => {
                // Render Teks (Agar bisa diseleksi/blok)
                textLayerDiv.innerHTML = '';
                pdfjsLib.renderTextLayer({ 
                    textContent: textContent, 
                    container: textLayerDiv, 
                    viewport: viewport, 
                    textDivs: [] 
                });
                
                // Render Ulang Coretan/Stabilo yang tersimpan
                redrawAnnotations();
                
                // Update UI Info
                document.getElementById('pageInput').value = num;
                document.getElementById('zoomLevel').innerText = Math.round(scale * 100) + '%';
                
                // Cek Tombol Selesai
                if(pageNum === pdfDoc.numPages) document.getElementById('finishBtn').style.display = 'block';
                else document.getElementById('finishBtn').style.display = 'none';

                updateActiveThumb();
                renderNotes();
                
                // PENTING: Reset pointer events sesuai tool yang aktif saat ini
                updateToolUI(currentTool === 'move' ? 'moveBtn' : (currentTool === 'highlight' ? 'highlightBtn' : 'eraserBtn'));

                resolve(); // Selesai Render
            });
        });
    });
}

// --- 6. LOGIKA GANTI ALAT (LAYER SWITCHING - PENTING!) ---
function setupEvents() {
    // Navigasi
    document.getElementById('prevBtn').onclick = () => { if(pageNum > 1) { pageNum--; renderPage(pageNum); }};
    document.getElementById('nextBtn').onclick = () => { if(pageNum < pdfDoc.numPages) { pageNum++; renderPage(pageNum); }};
    document.getElementById('pageInput').onchange = (e) => {
        const v = parseInt(e.target.value);
        if(v >= 1 && v <= pdfDoc.numPages) { pageNum = v; renderPage(pageNum); }
    };
    
    // Zoom
    document.getElementById('zoomIn').onclick = () => { scale += 0.2; renderPage(pageNum); };
    document.getElementById('zoomOut').onclick = () => { if(scale > 0.4) scale -= 0.2; renderPage(pageNum); };

    // Tools (Highlight, Eraser, Move)
    ['highlightBtn', 'eraserBtn', 'moveBtn'].forEach(id => {
        document.getElementById(id).onclick = () => {
            // Ubah ID tombol jadi nama tool (highlight, eraser, move)
            currentTool = id.replace('Btn', '').toLowerCase();
            updateToolUI(id);
        };
    });

    // Undo, Redo, Notes
    document.getElementById('undoBtn').onclick = undo;
    document.getElementById('redoBtn').onclick = redo;
    document.getElementById('addNoteBtn').onclick = addNote;

    // Aktifkan Mouse Drawing
    setupDrawing();
}

function updateToolUI(activeId) {
    // 1. Visual Tombol: Reset semua, aktifkan yang diklik
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(activeId).classList.add('active');
    
    // 2. LOGIKA LAYERS (INTI SOLUSI)
    if(currentTool === 'move') {
        // --- MODE GESER / SELEKSI ---
        // Matikan interaksi di Canvas Stabilo (biar tembus ke bawah)
        hCanvas.style.pointerEvents = 'none'; 
        hCanvas.style.cursor = 'default';
        
        // Hidupkan interaksi di Text Layer (biar bisa Blok Teks)
        textLayerDiv.style.pointerEvents = 'auto';
    } else {
        // --- MODE GAMBAR / STABILO ---
        // Hidupkan interaksi di Canvas Stabilo (biar bisa gambar)
        hCanvas.style.pointerEvents = 'auto'; 
        hCanvas.style.cursor = currentTool === 'highlight' ? 'crosshair' : 'cell';
        
        // Matikan interaksi di Text Layer (biar gak kepilih teksnya pas ngegambar)
        textLayerDiv.style.pointerEvents = 'none';
    }
}

// --- 7. LOGIKA MENGGAMBAR (DESKTOP MOUSE) ---
function setupDrawing() {
    function getPos(e) {
        const rect = hCanvas.getBoundingClientRect();
        return { 
            x: (e.clientX - rect.left) * (hCanvas.width/rect.width), 
            y: (e.clientY - rect.top) * (hCanvas.height/rect.height) 
        };
    }

    hCanvas.addEventListener('mousedown', e => {
        if(currentTool === 'move') return; // Jangan gambar kalau mode move
        
        isDrawing = true; 
        saveState(); // Simpan state untuk Undo
        
        const {x,y} = getPos(e);
        if(!annotationData[pageNum]) annotationData[pageNum]=[];
        
        annotationData[pageNum].push({
            tool: currentTool, 
            points: [{x,y}], 
            color: 'rgba(255, 235, 59, 0.4)' // Warna Kuning Stabilo
        });
    });

    hCanvas.addEventListener('mousemove', e => {
        if(!isDrawing || currentTool === 'move') return;
        const {x,y} = getPos(e);
        // Tambahkan titik ke path terakhir
        annotationData[pageNum][annotationData[pageNum].length-1].points.push({x,y});
        redrawAnnotations();
    });

    window.addEventListener('mouseup', () => isDrawing = false);
}

function redrawAnnotations() {
    hCtx.clearRect(0, 0, hCanvas.width, hCanvas.height);
    if(!annotationData[pageNum]) return;
    
    annotationData[pageNum].forEach(p => {
        hCtx.beginPath(); 
        hCtx.lineCap = 'round'; 
        hCtx.lineJoin = 'round';
        // Ketebalan: Stabilo 20, Penghapus 30
        hCtx.lineWidth = p.tool === 'eraser' ? 30 : 20; 
        
        hCtx.strokeStyle = p.tool === 'highlight' ? p.color : 'rgba(0,0,0,1)';
        // Mode Multiply agar transparan, Destination-out untuk menghapus
        hCtx.globalCompositeOperation = p.tool === 'eraser' ? 'destination-out' : 'multiply'; 
        
        if(p.points.length > 0) {
            hCtx.moveTo(p.points[0].x, p.points[0].y);
            for(let pt of p.points) hCtx.lineTo(pt.x, pt.y);
        }
        hCtx.stroke();
    });
    hCtx.globalCompositeOperation = 'source-over'; // Reset mode
}

// --- 8. GENERATE THUMBNAIL (ASYNC LOOP) ---
async function generateThumbnails(pdf) {
    const list = document.getElementById('thumbnailContainer');
    list.innerHTML = ''; // Reset list

    for(let i=1; i<=pdf.numPages; i++) {
        const div = document.createElement('div'); 
        div.className = 'thumb-item'; 
        div.id = `thumb-${i}`;
        
        // Buat Canvas
        const c = document.createElement('canvas');
        div.appendChild(c);
        div.innerHTML += `<span class="thumb-num">Hal ${i}</span>`;
        
        div.onclick = () => { pageNum = i; renderPage(i); };
        
        // Masukkan ke DOM
        list.appendChild(div);
        
        // Render Gambar Thumbnail (Satu per Satu)
        try {
            await pdf.getPage(i).then(page => {
                const vp = page.getViewport({scale: 0.2}); // Skala kecil
                
                // Ambil referensi canvas dari DOM
                const canvasInDOM = document.getElementById(`thumb-${i}`).querySelector('canvas');
                canvasInDOM.height = vp.height; 
                canvasInDOM.width = vp.width;
                
                const ctxThumb = canvasInDOM.getContext('2d');
                return page.render({canvasContext: ctxThumb, viewport: vp}).promise;
            });
        } catch (e) {
            console.warn(`Skip thumb ${i}`, e);
        }
        
        // Jeda kecil biar browser lancar
        await new Promise(r => setTimeout(r, 50)); 
    }
}

function updateActiveThumb() {
    document.querySelectorAll('.thumb-item').forEach(e => e.classList.remove('active'));
    const t = document.getElementById(`thumb-${pageNum}`);
    if(t) { 
        t.classList.add('active'); 
        t.scrollIntoView({block: 'center', behavior: 'smooth'}); 
    }
}

// --- 9. UNDO, REDO & NOTES ---
function saveState() { 
    undoStack.push(JSON.parse(JSON.stringify(annotationData))); 
    redoStack = []; 
}

function undo() { 
    if(undoStack.length > 0) { 
        redoStack.push(JSON.parse(JSON.stringify(annotationData))); 
        annotationData = undoStack.pop(); 
        redrawAnnotations(); 
    } 
}

function redo() { 
    if(redoStack.length > 0) { 
        undoStack.push(JSON.parse(JSON.stringify(annotationData))); 
        annotationData = redoStack.pop(); 
        redrawAnnotations(); 
    } 
}

function addNote() {
    const v = document.getElementById('noteInput').value.trim();
    if(v) {
        if(!notesData[pageNum]) notesData[pageNum]=[];
        notesData[pageNum].push({text: v, date: new Date().toLocaleTimeString()});
        document.getElementById('noteInput').value='';
        renderNotes();
    }
}

function renderNotes() {
    const list = document.getElementById('notesList'); 
    list.innerHTML='';
    
    if(notesData[pageNum]) {
        notesData[pageNum].forEach((n,i) => {
            list.innerHTML += `
                <div class="note-item">
                    <div>${n.text}</div>
                    <span style="font-size:0.7rem; color:#888;">${n.date}</span>
                    <span class="del-note" onclick="deleteNote(${i})">&times;</span>
                </div>`;
        });
    }
}

window.deleteNote = (i) => { 
    if(confirm("Hapus catatan?")) {
        notesData[pageNum].splice(i,1); 
        renderNotes(); 
    }
};