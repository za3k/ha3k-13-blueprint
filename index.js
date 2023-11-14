function deepcopy(x) { return JSON.parse(JSON.stringify(x)); }

class Tool {
    emptyAction = { };
    constructor(bp, ...args) {
        this.partialAction = deepcopy(this.emptyAction); // A tool may have started being used, and is incomplete
        this.bp = bp;
    }
    forgetState() { this.partialAction = deepcopy(this.emptyAction); }
    onMouseMove(canvasPoint) { this.partialAction.mousePosition = canvasPoint; }
    onMouseDown(canvasPoint) { this.partialAction.mousePosition = canvasPoint; }
    onMouseUp(canvasPoint) { this.partialAction.mousePosition = canvasPoint; }
    renderPreview(ctx) { } // Render a preview for mouse hover, partial draw, etc.
}

// Single-click, multiple clicks, drag motion

class RectangleTool extends Tool {
    emptyAction = { draw: false };
    constructor(...args) {
        super(...args);
    }
    forgetState() {
        this.partialAction = { draw: false };
    }
    onMouseMove(canvasPoint) {
        this.partialAction.mousePosition = canvasPoint;
    }
    onMouseDown(canvasPoint) {
        this.partialAction.draw = true;
        this.partialAction.start = this.partialAction.mousePosition = canvasPoint;
    }
    onMouseUp(canvasPoint) {
        const start = this.partialAction.start, stop=canvasPoint;
        const [l, r] = [Math.min(start.x, stop.x), Math.max(start.x, stop.x)];
        const [t, b] = [Math.min(start.y, stop.y), Math.max(start.y, stop.y)];
        const rect = [[l, t], [r, t], [r, b], [l, b], [l, t]];
        if (this.bp.drawErase) {
            this.bp.doAction(() => {
                this.bp.erasePoly([rect]);
            });
        } else {
            this.bp.doAction(() => {
                this.bp.addPoly([rect]);
            });
        }
        this.forgetState();
        this.partialAction.mousePosition = canvasPoint;
    }
    renderPreview(ctx) { // Render a preview for mouse hover, partial draw, etc.
        if (!this.partialAction.mousePosition) return;
        if (this.partialAction.draw) {
            // Show a preview of the huge draw rectangle
            const start = this.partialAction.start;
            const stop=this.partialAction.mousePosition;

            ctx.fillStyle = "rgba(0, 255, 0, 0.5)";
            ctx.strokeStyle = "#0f0";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(start.x,  stop.y);
            ctx.lineTo( stop.x,  stop.y);
            ctx.lineTo( stop.x, start.y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        } else {
            // Show a little preview rectangle
            const side = bp.snapSize;
            const tl = this.partialAction.mousePosition;

            ctx.fillStyle = "rgba(0, 0, 255, 0.5)";
            ctx.strokeStyle = "#66f";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(tl.x, tl.y);
            ctx.lineTo(tl.x + side, tl.y);
            ctx.lineTo(tl.x + side, tl.y + side);
            ctx.lineTo(tl.x, tl.y+side);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
    }
}
class IconTool extends Tool {
}
class PanTool extends Tool { }
class SelectTool extends Tool { }
class PolygonTool extends Tool { }
class TextTool extends Tool { }

class Blueprint {
    constructor() {
        this.persisted = ["polygons", "icons", "title", "autosave"];
        // NOT persisted: viewport position and zoom, tool state, undo/redo history
        this.origin = [0,0];

        // A "MultiPolygon": Array of polygons
        // A "Polygon": Array of rings (first exterior, others "holes")
        // Ring: Array of coordinates (first and last the same)
        // Coordinate: Array of two floats
        this.polygons = []; // A multi-polygon
        this.drawErase = false;
        this.icons = [];
        this.gridSnap = true;
        this.gridSize = 20;
        this.snapSize = 10;
        this.title = "";
        this.zoom = 1.0;
        this.history = [];
        this.redoHistory = [];
        this.autosave = true;

        this.TOOLS = {
            rectangle: new RectangleTool(this),
            pan: new PanTool(this),
            select: new SelectTool(this),
            poly: new PolygonTool(this),
            icon: new IconTool(this),
            text: new TextTool(this),
        };
        const ICONS = [
            {name:"Window", image:"image/window.jpg", rotations: 4},
            {name:"Door", image:"image/door.jpg", rotations: 4},
            {name:"Outlet", image:"image/outlet.jpg", rotations: 4},
            {name:"HVAC", image:"image/square.jpg", text: "HVAC"},
            {name:"Fridge", image:"image/square.jpg", text: "Fridge"},
            {name:"Stove", image:"image/square.jpg", text: "Stove"},
            {name:"Water Heater", image:"image/square.jpg", text: "Water Heater"},
            {name:"Sump Pump", image:"image/square.jpg", text: "Sump"},
        ];
        this.ICONS = {};
        for (var icon of ICONS) {
            if (icon.rotations) {
                for (var r = 0; r<icon.rotations; r++) {
                    const copy = deepcopy(icon);
                    delete copy.rotations;
                    copy.rotation = r;
                    copy.id = `${icon.name} : ${r}`;
                    const ROTATION = ["North", "East", "West", "South"];
                    copy.name = `${icon.name} (${ROTATION[r]})`;
                    this.ICONS[copy.id] = copy;
                }
            } else {
                icon.id = icon.name;
                this.ICONS[icon.id] = icon;
            }
        }

        for (var [id, icon] of Object.entries(this.ICONS)) {
            const iconSelector = $(`<div class="icon action" data-function="selectIcon" data-value="${icon.id}"><img src="${icon.image}" alt="${icon.text}"/><span class="icon-name">${icon.name}</span></div>`);
            $(".icons").append(iconSelector);
        }
    }
    get canvas() {
        return $(".draw-area > canvas")[0];
    }
    get state() {
        var s = {};
        for (var index of this.persisted) {
            s[index] = this[index];
        }
        return s;
    }
    set state(s) {
        for (var index of this.persisted) {
            this[index] = s[index];
        }
    }
    save() {
        localStorage.setItem("blueprint", JSON.stringify(this.state));
    }
    restore() {
        if (localStorage.getItem("blueprint"))
          this.state = JSON.parse(localStorage.getItem("blueprint"));
        this.redraw();
    }
    addPoly(poly) {
        this.polygons = polygonClipping.union(this.polygons, poly);
    }
    erasePoly(poly) {
        this.polygons = polygonClipping.difference(this.polygons, poly);
    }
    redraw() {
        const canvas = this.canvas;
        canvas.height = window.innerHeight;
        canvas.width = window.innerWidth;
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Draw grid dots
        for (var i = -this.gridSize; i < canvas.width + this.gridSize; i+= this.gridSize) {
            for (var j = -this.gridSize; j < canvas.height + this.gridSize; j+= this.gridSize) {
                ctx.fillStyle = "#000";
                ctx.strokeWidth = 1;
                ctx.beginPath();
                const radius = 0.5 / this.zoom;
                ctx.arc(i, j, radius, 0, 2 * Math.PI);
                ctx.fill();
            }
        }

        // Draw polygons
        ctx.fillStyle = "brown";
        ctx.strokeStyle = "black";
        ctx.strokeWidth = 5;
        ctx.beginPath();
        for (var poly of this.polygons) {
            for (var ring of poly) {
                ctx.moveTo(ring[0][0], ring[0][1]);
                for (var point of ring.slice(1)) {
                    ctx.lineTo(point[0], point[1]);
                }
                ctx.closePath();
            }
        }
        ctx.fill()
        ctx.stroke()

        if (this.currentTool) {
            this.currentTool.renderPreview(ctx);
        }
    }
    doAction(a) {
        // TODO: Add action name to the history
        this.history.push(deepcopy(this.state));
        a();
        this.redoHistory = [];
        this.redraw();
        if (this.autosave) this.save();
    }
    undo() {
        if (this.history.length == 0) return;
        this.redoHistory.push(this.state);
        this.state = this.history.pop();
        this.redraw();
    }
    redo() {
        if (this.redoHistory.length == 0) return;
        this.history.push(this.state);
        this.state = this.redoHistory.pop();
        this.redraw();
    }
    snap(point) {
        return {
            x: Math.round(point.x/this.snapSize)*this.snapSize,
            y: Math.round(point.y/this.snapSize)*this.snapSize,
        }
    }
    selectTool(options) {
        const tool = options.tool
        console.log(`Tool ${tool} selected`);
        $(".tool.selected").removeClass("selected");
        $(`.tool[data-tool=${tool}]`).addClass("selected");
        $(".icons").toggle(tool === "icon");

        if (!this.TOOLS[options.tool]) {
            console.log(`tool ${tool} not implemented`);
            return;
        }

        if (this.currentTool !== this.TOOLS[options.tool]) {
            if (this.currentTool) this.currentTool.forgetState();
            this.currentTool = this.TOOLS[options.tool];
            this.currentTool.forgetState(); // SHOULD not be needed but just in case.
        }
    }
    toggle(options) {
        const {toggles, value} = options;
        this[options.toggles] = options.value;
        console.log(`Toggled ${toggles} to ${value}`)
        $(`.toggle[data-toggles=${toggles}] .toggle-option[data-value=true]`).toggleClass("selected", value);
        $(`.toggle[data-toggles=${toggles}] .toggle-option[data-value=false]`).toggleClass("selected", !value);
    }
    shareLink()         { console.log("shareLink not implemented"); }
    clear() {
        if (!window.confirm("Are you sure you want to delete your blueprint?")) return;
        this.origin = [0,0];
        this.polygons = [];
        this.icons = [];
        this.title = "";
        this.zoom = 1.0;
        this.history = [];
        this.redoHistory = [];
        this.save();
        this.redraw();
    }
    
    canvasPos(ev) {
        const rect = bp.canvas.getBoundingClientRect();
        var p = { x: ev.clientX, y: ev.clientY }
        p = {
            x: p.x - rect.left,
            y: p.y - rect.top,
        };
        if (this.gridSnap) p = this.snap(p);
        return p;
    }
    bindMouse() {
        $(document).on("mousemove", (ev) => {
            if(!bp.currentTool) return;
            bp.currentTool.onMouseMove(bp.canvasPos(ev));
            bp.redraw();
        }).on("mousedown", (ev) => {
            if(!bp.currentTool) return;
            bp.currentTool.onMouseDown(bp.canvasPos(ev));
            bp.redraw();
        }).on("mouseup", (ev) => {
            if(!bp.currentTool) return;
            bp.currentTool.onMouseUp(bp.canvasPos(ev));
            bp.redraw();
        });
    }
    bindKeys() {
        $(document).on("keydown", (ev) => {
            switch (ev.key) {
                case ev.ctrlKey && 'z':
                    ev.preventDefault();
                    this.undo();
                    break;
                case ev.ctrlKey && 'y':
                    ev.preventDefault();
                    this.redo();
                    break;
            }
        });
    }
}

$(document).ready((ev) => {
    const bp = window.bp = new Blueprint();
    bp.restore(); // Restore save
    bp.bindMouse();
    bp.bindKeys();
    $(window).on("resize", bp.redraw.bind(bp));

    // Initialize toggles
    $(".toggle").each((i, t) => {
        t = $(t);
        var varName = t.data("toggles");
        t.append(`<div class="toggle-title">${t.data("toggle-name")}</div>`)
         .append(`<div class="toggle-option action" data-function="toggle" data-toggles="${varName}" data-value="false">${t.data("false-name")}</div>`)
         .append(`<div class="toggle-option action" data-function="toggle" data-toggles="${varName}" data-value="true">${t.data("true-name")}</div>`);
        bp.toggle({toggles: varName, value: bp[varName]});
    });

    //  Initialize tool icons in toolbar
    $(".tool").data("function", "selectTool").addClass("action");
    // TODO: Tooltips for tool icons
    bp.selectTool({tool: $(".tool.selected").data("tool")});

    // Hook up click actions
    $(".action").on("click", (ev) => {
        const dispatch = $(ev.target).data("function");
        const options = $(ev.target).data();
        bp[dispatch].bind(bp)(options);
    });

});
