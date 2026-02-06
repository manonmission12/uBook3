// --- PROTEKSI HALAMAN (SECURITY) ---
if (!localStorage.getItem('currentUser')) {
    alert("Akses ditolak! Silakan login atau daftar terlebih dahulu.");
    window.location.href = 'login.html';
}

// --- 1. CONFIG PDF.JS ---
var pdfjsLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// --- 2. STATE ---
let pdfDoc = null, 
    pageNum = 1, 
    scale = 1.0; 

let canvas = document.getElementById('the-canvas'), 
    ctx = canvas.getContext('2d');
let hCanvas = document.getElementById('highlight-canvas'), 
    hCtx = hCanvas.getContext('2d');
let textLayerDiv = document.getElementById('text-layer');

let currentTool = 'move', isDrawing = false, isAnimating = false;
let annotationData = {}, notesData = {}, undoStack = [], redoStack = [];

// Kunci Penyimpanan Unik (Berdasarkan URL Buku)
let STORAGE_KEY = 'pdf_data_default';

const getDPR = () => window.devicePixelRatio || 1;

// --- 3. INIT ---
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const source = params.get('source');
    
    if(source) {
        // Set Key Unik agar data tiap buku beda
        STORAGE_KEY = 'pdf_data_' + encodeURIComponent(source);
        loadFromStorage(); // Load data lama
        loadBook(decodeURIComponent(source));
    } else { 
        alert("Buku tidak ditemukan."); 
        window.location.href = 'index.html'; 
    }
    
    setupUI();
    setupSwipe();
    setupDrawing();
    
    window.addEventListener('resize', () => {
        if(pdfDoc) {
            clearTimeout(window.resizeTimer);
            window.resizeTimer = setTimeout(() => { renderPage(pageNum); }, 300);
        }
    });
});

// ... (LANJUTKAN DENGAN SISA KODINGAN read-mobile.js YANG LAMA) ...
// ... (Bagian renderPage, saveToStorage, dll tetap sama) ...
// Kalau bingung, pakai file read-mobile.js yang terakhir sukses, cuma tambah IF LOGIN di paling atas.

function saveToStorage() {
    const data = {
        annotations: annotationData,
        notes: notesData
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadFromStorage() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            const data = JSON.parse(saved);
            annotationData = data.annotations || {};
            notesData = data.notes || {};
        } catch (e) {
            console.error("Gagal load data:", e);
        }
    }
}

// --- 5. LOAD BUKU ---
function loadBook(url) {
    document.getElementById('loading').classList.add('active');
    
    pdfjsLib.getDocument(url).promise.then(pdf => {
        pdfDoc = pdf;
        document.getElementById('totalPage').innerText = pdf.numPages;
        
        pdf.getPage(1).then(page => {
            const viewport = page.getViewport({scale: 1.0});
            const screenWidth = window.innerWidth || 360; 
            
            // Hitung Scale "Logical" (Pas di Layar)
            scale = (screenWidth - 20) / viewport.width;
            if (scale <= 0) scale = 0.6; 
            
            renderPage(pageNum).then(() => {
                document.getElementById('loading').classList.remove('active');
                setTimeout(() => generateThumbnails(pdf), 800);
            });
        });
    }).catch(err => {
        console.error(err);
        alert("Gagal memuat buku.");
        document.getElementById('loading').classList.remove('active');
    });
}

// --- 6. RENDER PAGE (HD + LOGICAL TEXT) ---
function renderPage(num) {
    return new Promise(resolve => {
        if(!pdfDoc) return;

        pdfDoc.getPage(num).then(page => {
            const dpr = getDPR();
            
            // 1. VIEWPORT HD (Untuk Gambar Canvas agar TAJAM)
            const viewportHD = page.getViewport({scale: scale * dpr});
            
            // 2. VIEWPORT LOGIS (Untuk Text Layer agar POSISI PAS)
            const viewportLogical = page.getViewport({scale: scale});
            
            // Set Ukuran Canvas (Pixel Fisik Tinggi - HD)
            canvas.width = viewportHD.width;
            canvas.height = viewportHD.height;
            hCanvas.width = viewportHD.width;
            hCanvas.height = viewportHD.height;
            
            // Set Ukuran Container Text Layer (Sesuai Logis/Layar)
            textLayerDiv.style.width = `${viewportLogical.width}px`;
            textLayerDiv.style.height = `${viewportLogical.height}px`;

            // Render Gambar (Pakai HD)
            const renderCtx = { canvasContext: ctx, viewport: viewportHD };
            
            page.render(renderCtx).promise.then(() => {
                return page.getTextContent();
            }).then(textContent => {
                // RENDER TEKS (Pakai LOGICAL biar pas posisinya)
                textLayerDiv.innerHTML = '';
                pdfjsLib.renderTextLayer({
                    textContent: textContent,
                    container: textLayerDiv,
                    viewport: viewportLogical,
                    textDivs: []
                });

                redrawAnnotations(); 
                document.getElementById('currPage').innerText = num;
                renderNotes(); // Update list catatan
                updateThumbActive();
                updateToolState(); // Reset pointer events
                resolve();
            });
        }).catch(err => console.error(err));
    });
}

function changePage(delta) {
    if(isAnimating) return;
    const newNum = pageNum + delta;
    if (newNum < 1 || newNum > pdfDoc.numPages) return;

    isAnimating = true;
    const wrapper = document.getElementById('pdfWrapper');
    wrapper.classList.add('fade-out');

    setTimeout(() => {
        pageNum = newNum;
        renderPage(pageNum).then(() => {
            wrapper.classList.remove('fade-out');
            isAnimating = false;
        });
    }, 200);
}

function updateToolState() {
    if (currentTool === 'move') {
        textLayerDiv.style.pointerEvents = 'auto'; 
        hCanvas.style.pointerEvents = 'none';      
    } else {
        textLayerDiv.style.pointerEvents = 'none'; 
        hCanvas.style.pointerEvents = 'auto';      
    }
}

function changeZoom(delta) {
    let newScale = scale + delta;
    if(newScale < 0.2) newScale = 0.2;
    if(newScale > 3.0) newScale = 3.0;
    scale = newScale;
    renderPage(pageNum);
}

function setupUI() {
    const sheet = document.getElementById('bottomSheet');
    const bg = document.getElementById('backdrop');
    
    document.getElementById('btnMenu').onclick = () => { sheet.classList.add('active'); bg.classList.add('active'); };
    bg.onclick = () => { sheet.classList.remove('active'); bg.classList.remove('active'); };

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`panel-${btn.dataset.target}`).classList.add('active');
        };
    });

    ['move', 'highlight', 'eraser'].forEach(t => {
        const id = 'tool' + t.charAt(0).toUpperCase() + t.slice(1);
        const el = document.getElementById(id);
        if(!el) return;

        el.onclick = () => {
            currentTool = t;
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            el.classList.add('active');
            updateToolState();
            sheet.classList.remove('active'); bg.classList.remove('active');
        };
    });

    document.getElementById('toolZoomIn').onclick = () => changeZoom(0.2);
    document.getElementById('toolZoomOut').onclick = () => changeZoom(-0.2);
    document.getElementById('toolUndo').onclick = undo;
    document.getElementById('toolRedo').onclick = redo;
    document.getElementById('toolClear').onclick = () => { 
        if(confirm('Hapus semua coretan di halaman ini?')) { 
            saveState(); 
            annotationData[pageNum]=[]; 
            redrawAnnotations(); 
            saveToStorage();
        }
    };
    
    document.getElementById('mobNoteBtn').onclick = () => {
        const v = document.getElementById('mobNoteIn').value;
        if(v) { 
            if(!notesData[pageNum]) notesData[pageNum]=[]; 
            notesData[pageNum].push(v); 
            document.getElementById('mobNoteIn').value=''; 
            renderNotes(); 
            saveToStorage();
        }
    };
}

function setupDrawing() {
    function getTouchPos(e) {
        const rect = hCanvas.getBoundingClientRect();
        const t = e.touches[0];
        return { 
            x: (t.clientX - rect.left) * (hCanvas.width / rect.width), 
            y: (t.clientY - rect.top) * (hCanvas.height / rect.height) 
        };
    }

    hCanvas.addEventListener('touchstart', e => {
        if(currentTool==='move') return; 
        e.preventDefault(); isDrawing=true; saveState();
        if(!annotationData[pageNum]) annotationData[pageNum]=[];
        const {x,y} = getTouchPos(e);
        annotationData[pageNum].push({tool:currentTool, points:[{x,y}], color:'rgba(255,235,59,0.4)'});
    }, {passive:false});

    hCanvas.addEventListener('touchmove', e => {
        if(!isDrawing || currentTool==='move') return;
        e.preventDefault();
        const {x,y} = getTouchPos(e);
        annotationData[pageNum][annotationData[pageNum].length-1].points.push({x,y});
        redrawAnnotations();
    }, {passive:false});

    hCanvas.addEventListener('touchend', () => { isDrawing=false; saveToStorage(); });
}

function redrawAnnotations() {
    hCtx.clearRect(0,0,hCanvas.width, hCanvas.height);
    if(!annotationData[pageNum]) return;
    const dpr = getDPR();
    annotationData[pageNum].forEach(p => {
        hCtx.beginPath(); hCtx.lineCap='round'; hCtx.lineJoin='round';
        hCtx.lineWidth = (p.tool==='eraser' ? 30 : 20) * dpr;
        hCtx.strokeStyle = p.tool==='highlight' ? p.color : 'rgba(0,0,0,1)';
        hCtx.globalCompositeOperation = p.tool==='eraser' ? 'destination-out' : 'multiply';
        if(p.points.length>0) {
            hCtx.moveTo(p.points[0].x, p.points[0].y);
            for(let pt of p.points) hCtx.lineTo(pt.x, pt.y);
        }
        hCtx.stroke();
    });
    hCtx.globalCompositeOperation='source-over';
}

function setupSwipe() {
    let ts = 0;
    let startTime = 0;
    const area = document.getElementById('readerArea');
    
    area.addEventListener('touchstart', e => { 
        if(currentTool==='move') {
            ts = e.changedTouches[0].screenX; 
            startTime = new Date().getTime();
        }
    }, {passive: false});
    
    area.addEventListener('touchend', e => {
        if(currentTool==='move') {
            const te = e.changedTouches[0].screenX;
            const diff = te - ts;
            const timeDiff = new Date().getTime() - startTime;

            if(Math.abs(diff) > 50 && timeDiff < 300) {
                if(diff < 0) changePage(1); 
                else changePage(-1);
            }
        }
    }, {passive: false});
}

function saveState() { undoStack.push(JSON.parse(JSON.stringify(annotationData))); redoStack=[]; }
function undo() { if(undoStack.length>0) { redoStack.push(JSON.parse(JSON.stringify(annotationData))); annotationData=undoStack.pop(); redrawAnnotations(); saveToStorage(); } }
function redo() { if(redoStack.length>0) { undoStack.push(JSON.parse(JSON.stringify(annotationData))); annotationData=redoStack.pop(); redrawAnnotations(); saveToStorage(); } }

async function generateThumbnails(pdf) {
    const grid = document.getElementById('thumbGrid'); grid.innerHTML = '';
    for(let i=1; i<=pdf.numPages; i++) {
        const d = document.createElement('div'); d.className='thumb-item'; d.id=`thumb-${i}`;
        const c = document.createElement('canvas'); d.appendChild(c); d.innerHTML+=`<div>${i}</div>`;
        d.onclick = () => { pageNum=i; renderPage(i); document.getElementById('bottomSheet').classList.remove('active'); document.getElementById('backdrop').classList.remove('active'); };
        grid.appendChild(d);
        await new Promise(r => setTimeout(r, 50));
        try {
            await pdf.getPage(i).then(p => { 
                const vp = p.getViewport({scale:0.2}); c.height=vp.height; c.width=vp.width; 
                p.render({canvasContext:c.getContext('2d'), viewport:vp}); 
            });
        } catch(e) {}
    }
}

function updateThumbActive() {
    document.querySelectorAll('.thumb-item').forEach(e => e.classList.remove('active'));
    const a = document.getElementById(`thumb-${pageNum}`);
    if(a) { a.classList.add('active'); a.scrollIntoView({behavior: 'smooth', block: 'nearest', inline: 'center'}); }
}

function renderNotes() {
    const list = document.getElementById('mobNoteList'); 
    list.innerHTML = '';
    const pages = Object.keys(notesData).map(Number).sort((a,b) => a-b);
    
    if (pages.length === 0) {
        list.innerHTML = '<div style="color:#888; text-align:center; margin-top:20px;">Belum ada catatan.</div>';
        return;
    }

    pages.forEach(pNum => {
        notesData[pNum].forEach((note, idx) => {
            const item = document.createElement('div');
            item.className = 'note-item';
            item.style.display = 'flex';
            item.style.justifyContent = 'space-between';
            item.innerHTML = `
                <div style="flex:1; padding-right:10px;">
                    <div style="font-size:0.75rem; color:#f59e0b; font-weight:bold; margin-bottom:2px;">
                        Halaman ${pNum}
                    </div>
                    <div style="word-break:break-word;">${note}</div>
                </div>
                <div onclick="deleteNote(${pNum}, ${idx})" 
                     style="color:#ef4444; cursor:pointer; font-size:1.2rem; padding:0 5px;">
                    &times;
                </div>
            `;
            list.appendChild(item);
        });
    });
}

window.deleteNote = function(pNum, idx) {
    if(confirm('Hapus catatan ini?')) {
        notesData[pNum].splice(idx, 1);
        if(notesData[pNum].length === 0) delete notesData[pNum];
        renderNotes();
        saveToStorage();
    }
};