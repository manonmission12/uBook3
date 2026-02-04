const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

let pdfDoc = null, pageNum = 1, scale = 1.0;
let canvas = document.getElementById('the-canvas'), ctx = canvas.getContext('2d');
let hCanvas = document.getElementById('highlight-canvas'), hCtx = hCanvas.getContext('2d');
let currentTool = 'move', isDrawing = false, annotationData = {}, notesData = {};

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const source = urlParams.get('source');

    if(source) loadBook(decodeURIComponent(source));
    else window.location.href = 'index.html';

    setupUI();
    setupSwipe();
    setupDrawing();
});

function loadBook(url) {
    document.getElementById('loading').classList.add('active');
    pdfjsLib.getDocument(url).promise.then(pdf => {
        pdfDoc = pdf;
        document.getElementById('pageTotal').innerText = pdf.numPages;
        document.getElementById('loading').classList.remove('active');
        renderPage(pageNum);
        generateThumbnails(pdf);
    });
}

function renderPage(num) {
    pdfDoc.getPage(num).then(page => {
        // Auto Fit Width HP
        const viewportBase = page.getViewport({scale: 1.0});
        const containerWidth = window.innerWidth - 20; 
        scale = containerWidth / viewportBase.width;
        
        const viewport = page.getViewport({scale: scale});
        
        canvas.height = viewport.height; canvas.width = viewport.width;
        hCanvas.height = viewport.height; hCanvas.width = viewport.width;

        page.render({canvasContext: ctx, viewport}).promise.then(() => {
            redrawAnnotations();
            document.getElementById('currPage').innerText = num;
            updateThumbActive();
            renderNotes();
        });
    });
}

// SWIPE GESTURE
function setupSwipe() {
    let ts = 0;
    const area = document.getElementById('readerArea');
    area.addEventListener('touchstart', e => {
        if(currentTool === 'move') ts = e.changedTouches[0].screenX;
    }, {passive: false});
    
    area.addEventListener('touchend', e => {
        if(currentTool === 'move') {
            const te = e.changedTouches[0].screenX;
            if(te < ts - 50 && pageNum < pdfDoc.numPages) { pageNum++; renderPage(pageNum); }
            if(te > ts + 50 && pageNum > 1) { pageNum--; renderPage(pageNum); }
        }
    }, {passive: false});
}

// UI LOGIC (BOTTOM SHEET)
function setupUI() {
    const sheet = document.getElementById('bottomSheet');
    const bg = document.getElementById('backdrop');
    
    document.getElementById('btnMenu').onclick = () => { sheet.classList.add('active'); bg.classList.add('active'); };
    bg.onclick = () => { sheet.classList.remove('active'); bg.classList.remove('active'); };

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('panel-' + btn.dataset.target).classList.add('active');
        };
    });

    // Tools
    ['move', 'highlight', 'eraser'].forEach(t => {
        document.getElementById('tool' + t.charAt(0).toUpperCase() + t.slice(1)).onclick = () => {
            currentTool = t;
            hCanvas.style.pointerEvents = (t === 'move') ? 'none' : 'auto';
            sheet.classList.remove('active'); bg.classList.remove('active');
            
            // Visual Update
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('tool' + t.charAt(0).toUpperCase() + t.slice(1)).classList.add('active');
        };
    });

    document.getElementById('toolClear').onclick = () => {
        if(confirm('Hapus?')) { annotationData[pageNum] = []; redrawAnnotations(); }
    };

    // Note
    document.getElementById('mobileAddNote').onclick = () => {
        const val = document.getElementById('mobileNoteInput').value;
        if(val) {
            if(!notesData[pageNum]) notesData[pageNum] = [];
            notesData[pageNum].push(val);
            document.getElementById('mobileNoteInput').value = '';
            renderNotes();
        }
    };
}

// DRAWING
function setupDrawing() {
    function getPos(e) {
        const rect = hCanvas.getBoundingClientRect();
        const touch = e.touches[0];
        return {
            x: (touch.clientX - rect.left) * (hCanvas.width / rect.width),
            y: (touch.clientY - rect.top) * (hCanvas.height / rect.height)
        };
    }

    hCanvas.addEventListener('touchstart', e => {
        if(currentTool === 'move') return;
        e.preventDefault(); isDrawing = true;
        if(!annotationData[pageNum]) annotationData[pageNum] = [];
        const {x,y} = getPos(e);
        annotationData[pageNum].push({ tool: currentTool, points: [{x,y}] });
    }, {passive: false});

    hCanvas.addEventListener('touchmove', e => {
        if(!isDrawing) return;
        e.preventDefault();
        const {x,y} = getPos(e);
        annotationData[pageNum][annotationData[pageNum].length-1].points.push({x,y});
        redrawAnnotations();
    }, {passive: false});

    hCanvas.addEventListener('touchend', () => isDrawing = false);
}

function redrawAnnotations() {
    hCtx.clearRect(0,0, hCanvas.width, hCanvas.height);
    if(!annotationData[pageNum]) return;
    annotationData[pageNum].forEach(path => {
        hCtx.beginPath(); hCtx.lineCap = 'round'; hCtx.lineWidth = 20;
        hCtx.strokeStyle = path.tool === 'highlight' ? 'rgba(255,235,59,0.4)' : 'white';
        hCtx.globalCompositeOperation = path.tool === 'eraser' ? 'destination-out' : 'multiply';
        hCtx.moveTo(path.points[0].x, path.points[0].y);
        for(let p of path.points) hCtx.lineTo(p.x, p.y);
        hCtx.stroke();
    });
    hCtx.globalCompositeOperation = 'source-over';
}

function generateThumbnails(pdf) {
    const grid = document.getElementById('thumbGrid');
    grid.innerHTML = '';
    for(let i=1; i<=pdf.numPages; i++) {
        const d = document.createElement('div');
        d.className = 'thumb-item'; d.id = `thumb-${i}`;
        const c = document.createElement('canvas');
        d.appendChild(c);
        d.onclick = () => { pageNum = i; renderPage(i); document.getElementById('bottomSheet').classList.remove('active'); document.getElementById('backdrop').classList.remove('active'); };
        grid.appendChild(d);
        
        pdf.getPage(i).then(page => {
            const vp = page.getViewport({ scale: 0.15 });
            c.height = vp.height; c.width = vp.width;
            page.render({ canvasContext: c.getContext('2d'), viewport: vp });
        });
    }
}

function updateThumbActive() {
    document.querySelectorAll('.thumb-item').forEach(el => el.classList.remove('active'));
    const a = document.getElementById(`thumb-${pageNum}`);
    if(a) a.classList.add('active');
}

function renderNotes() {
    const list = document.getElementById('mobileNotesList');
    list.innerHTML = '';
    if(notesData[pageNum]) {
        notesData[pageNum].forEach(n => list.innerHTML += `<div class="note-item">${n}</div>`);
    }
}