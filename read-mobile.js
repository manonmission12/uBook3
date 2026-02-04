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
    setupUI(); setupSwipe(); setupDrawing();
});

function loadBook(url) {
    document.getElementById('loading').classList.add('active');
    pdfjsLib.getDocument(url).promise.then(pdf => {
        pdfDoc = pdf;
        document.getElementById('totalPage').innerText = pdf.numPages;
        document.getElementById('loading').classList.remove('active');
        renderPage(pageNum);
        generateThumbnails(pdf);
    });
}

function renderPage(num) {
    pdfDoc.getPage(num).then(page => {
        const viewportBase = page.getViewport({scale: 1.0});
        scale = (window.innerWidth - 20) / viewportBase.width; // Auto Fit Width
        const viewport = page.getViewport({scale: scale});
        
        canvas.height = viewport.height; canvas.width = viewport.width;
        hCanvas.height = viewport.height; hCanvas.width = viewport.width;

        page.render({canvasContext: ctx, viewport}).promise.then(() => {
            redrawAnnotations();
            document.getElementById('currPage').innerText = num;
            renderNotes();
        });
    });
}

function setupSwipe() {
    let ts = 0;
    const area = document.getElementById('readerArea');
    area.addEventListener('touchstart', e => { if(currentTool==='move') ts = e.changedTouches[0].screenX; }, {passive:false});
    area.addEventListener('touchend', e => {
        if(currentTool==='move') {
            const te = e.changedTouches[0].screenX;
            if(te < ts - 50 && pageNum < pdfDoc.numPages) { pageNum++; renderPage(pageNum); }
            if(te > ts + 50 && pageNum > 1) { pageNum--; renderPage(pageNum); }
        }
    }, {passive:false});
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
        const btnId = 'tool' + t.charAt(0).toUpperCase() + t.slice(1);
        document.getElementById(btnId).onclick = () => {
            currentTool = t;
            hCanvas.style.pointerEvents = (t==='move') ? 'none' : 'auto';
            sheet.classList.remove('active'); bg.classList.remove('active');
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            document.getElementById(btnId).classList.add('active');
        };
    });
    
    document.getElementById('toolClear').onclick = () => { if(confirm('Hapus?')) { annotationData[pageNum]=[]; redrawAnnotations(); }};
    document.getElementById('mobNoteBtn').onclick = () => {
        const val = document.getElementById('mobNoteIn').value;
        if(val) {
            if(!notesData[pageNum]) notesData[pageNum]=[];
            notesData[pageNum].push(val);
            document.getElementById('mobNoteIn').value = '';
            renderNotes();
        }
    };
}

function setupDrawing() {
    function getPos(e) {
        const rect = hCanvas.getBoundingClientRect();
        const t = e.touches[0];
        return { x: (t.clientX - rect.left) * (hCanvas.width/rect.width), y: (t.clientY - rect.top) * (hCanvas.height/rect.height) };
    }
    hCanvas.addEventListener('touchstart', e => {
        if(currentTool==='move') return;
        e.preventDefault(); isDrawing = true;
        if(!annotationData[pageNum]) annotationData[pageNum]=[];
        const {x,y} = getPos(e);
        annotationData[pageNum].push({tool: currentTool, points:[{x,y}]});
    }, {passive:false});
    hCanvas.addEventListener('touchmove', e => {
        if(!isDrawing) return;
        e.preventDefault();
        const {x,y} = getPos(e);
        annotationData[pageNum][annotationData[pageNum].length-1].points.push({x,y});
        redrawAnnotations();
    }, {passive:false});
    hCanvas.addEventListener('touchend', () => isDrawing = false);
}

function redrawAnnotations() {
    hCtx.clearRect(0,0,hCanvas.width, hCanvas.height);
    if(!annotationData[pageNum]) return;
    annotationData[pageNum].forEach(p => {
        hCtx.beginPath(); hCtx.lineCap='round'; hCtx.lineWidth=20;
        hCtx.strokeStyle = p.tool==='highlight'?'rgba(255,235,59,0.4)':'white';
        hCtx.globalCompositeOperation = p.tool==='eraser'?'destination-out':'multiply';
        hCtx.moveTo(p.points[0].x, p.points[0].y);
        for(let pt of p.points) hCtx.lineTo(pt.x, pt.y);
        hCtx.stroke();
    });
    hCtx.globalCompositeOperation = 'source-over';
}

function generateThumbnails(pdf) {
    const grid = document.getElementById('thumbGrid');
    grid.innerHTML = '';
    for(let i=1; i<=pdf.numPages; i++) {
        const d = document.createElement('div'); d.innerText = `Hal ${i}`;
        d.style = "background:white;color:black;padding:10px;text-align:center;border-radius:5px;";
        d.onclick = () => { pageNum=i; renderPage(i); document.getElementById('bottomSheet').classList.remove('active'); document.getElementById('backdrop').classList.remove('active'); };
        grid.appendChild(d);
    }
}

function renderNotes() {
    const list = document.getElementById('mobNoteList');
    list.innerHTML = '';
    if(notesData[pageNum]) notesData[pageNum].forEach(n => list.innerHTML += `<div class="note-item">${n}</div>`);
}