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

const getDPR = () => window.devicePixelRatio || 1;

// --- 3. INIT ---
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const source = params.get('source');
    if(source) loadBook(decodeURIComponent(source));
    else { alert("Buku tidak ditemukan."); window.location.href = 'index.html'; }
    
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

// --- 4. LOAD BUKU ---
function loadBook(url) {
    document.getElementById('loading').classList.add('active');
    
    pdfjsLib.getDocument(url).promise.then(pdf => {
        pdfDoc = pdf;
        document.getElementById('totalPage').innerText = pdf.numPages;
        
        pdf.getPage(1).then(page => {
            const viewport = page.getViewport({scale: 1.0});
            const screenWidth = window.innerWidth || 360; 
            
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

// --- 5. RENDER PAGE (HD IMAGE + LOGICAL TEXT) ---
function renderPage(num) {
    return new Promise(resolve => {
        if(!pdfDoc) return;

        pdfDoc.getPage(num).then(page => {
            const dpr = getDPR();
            
            // 1. VIEWPORT HD: Untuk Gambar Canvas agar TAJAM
            // Scale dikali DPR (misal 2.0 atau 3.0)
            const viewportHD = page.getViewport({scale: scale * dpr});
            
            // 2. VIEWPORT LOGIS: Untuk Text Layer agar PAS di Layar
            // Scale sesuai ukuran layar (tidak dikali DPR)
            const viewportLogical = page.getViewport({scale: scale});
            
            // Set Ukuran Canvas (Pixel Fisik Tinggi)
            canvas.width = viewportHD.width;
            canvas.height = viewportHD.height;
            hCanvas.width = viewportHD.width;
            hCanvas.height = viewportHD.height;
            
            // Set Ukuran Container Text Layer (Sesuai Logis/Layar)
            // CSS width:100% akan membuatnya pas dengan container
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
                    viewport: viewportLogical, // <--- KUNCI PERBAIKAN
                    textDivs: []
                });

                redrawAnnotations(); 
                document.getElementById('currPage').innerText = num;
                renderNotes();
                updateThumbActive();
                updateToolState(); // Reset pointer
                
                resolve();
            });
        }).catch(err => console.error(err));
    });
}

// --- 6. CHANGE PAGE ---
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

// --- 7. TOOL STATE ---
function updateToolState() {
    if (currentTool === 'move') {
        // Mode Move: Hidupkan Text Layer (Bisa Blok), Matikan Canvas Coretan
        textLayerDiv.style.pointerEvents = 'auto'; 
        hCanvas.style.pointerEvents = 'none';      
    } else {
        // Mode Gambar: Matikan Text Layer, Hidupkan Canvas Coretan
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

// --- 8. UI HANDLERS ---
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
    document.getElementById('toolClear').onclick = () => { if(confirm('Hapus?')) { saveState(); annotationData[pageNum]=[]; redrawAnnotations(); }};
    document.getElementById('mobNoteBtn').onclick = () => {
        const v = document.getElementById('mobNoteIn').value;
        if(v) { if(!notesData[pageNum]) notesData[pageNum]=[]; notesData[pageNum].push(v); document.getElementById('mobNoteIn').value=''; renderNotes(); }
    };
}

// --- 9. DRAWING ---
function setupDrawing() {
    function getTouchPos(e) {
        const rect = hCanvas.getBoundingClientRect();
        const t = e.touches[0];
        // Konversi koordinat sentuh ke koordinat canvas HD
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

    hCanvas.addEventListener('touchend', () => isDrawing=false);
}

function redrawAnnotations() {
    hCtx.clearRect(0,0,hCanvas.width, hCanvas.height);
    if(!annotationData[pageNum]) return;
    const dpr = getDPR();
    annotationData[pageNum].forEach(p => {
        hCtx.beginPath(); hCtx.lineCap='round'; hCtx.lineJoin='round';
        // Kalikan tebal garis dengan DPR
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

// --- 10. SWIPE GESTURE ---
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

            // Swipe Cepat & Jauh = Ganti Halaman
            // Tahan Lama = Blok Teks
            if(Math.abs(diff) > 50 && timeDiff < 300) {
                if(diff < 0) changePage(1); 
                else changePage(-1);
            }
        }
    }, {passive: false});
}

function saveState() { undoStack.push(JSON.parse(JSON.stringify(annotationData))); redoStack=[]; }
function undo() { if(undoStack.length>0) { redoStack.push(JSON.parse(JSON.stringify(annotationData))); annotationData=undoStack.pop(); redrawAnnotations(); } }
function redo() { if(redoStack.length>0) { undoStack.push(JSON.parse(JSON.stringify(annotationData))); annotationData=redoStack.pop(); redrawAnnotations(); } }

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
    const list = document.getElementById('mobNoteList'); list.innerHTML = '';
    if(notesData[pageNum]) notesData[pageNum].forEach(n => list.innerHTML += `<div class="note-item">${n}</div>`);
}