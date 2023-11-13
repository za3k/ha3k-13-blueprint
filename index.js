class Tool {
    constructor(bp) {
        this.partialAction = { draw: false }; // A tool may have started being used, and is incomplete
        this.bp = bp;
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
        this.bp.doAction(() => {
            this.bp.polygons.push(rect);
        });
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
            //ctx.stroke();
        } else {
            // Show a little preview rectangle
            const side = bp.snapSize;
            const tl = this.partialAction.mousePosition;

            ctx.fillStyle = "rgba(0, 0, 255, 0.5)";
            ctx.strokeStyle = "#00f";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(tl.x, tl.y);
            ctx.lineTo(tl.x + side, tl.y);
            ctx.lineTo(tl.x + side, tl.y + side);
            ctx.lineTo(tl.x, tl.y+side);
            ctx.closePath();
            ctx.fill();
            //ctx.stroke();
        }
    }
}

// Single-click, multiple clicks, drag motion

class PanTool extends Tool { }
class SelectTool extends Tool { }
class RectangleTool extends Tool { }
class PolygonTool extends Tool { }
class IconTool extends Tool { }
class TextTool extends Tool { }


class Blueprint {
    constructor() {
        this.persisted = ["polygons", "icons", "title", "autosave"];
        // NOT persisted: viewport position and zoom, tool state, undo/redo history
        this.origin = [0,0];
        this.polygons = [ // Polygons go clockwise
            [[5,5], [100,5], [100, 50], [15, 50], [5, 5],],      // One quadralateral
            [[105,5], [200,5], [200, 50], [115, 50], [105, 5],], // One quadralateral
        ];
        this.holes = []; // Holes are polygons draw counter-clockwise.
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
        localStorage.setItem("blueprint", this.state);
    }
    restore() {
        if (localStorage.getItem("blueprint"))
          this.state = localStorage.getItem("blueprint");
    }
    redraw() {
        const canvas = this.canvas;
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Draw grid dots
        for (var i = -this.gridSize; i < canvas.width + this.gridSize; i+= this.gridSize) {
            for (var j = -this.gridSize; j < canvas.height + this.gridSize; j+= this.gridSize) {
                ctx.fillStyle = "#000";
                ctx.beginPath();
                const radius = 0.5 / this.zoom;
                ctx.arc(i, j, radius, 0, 2 * Math.PI);
                ctx.fill();
            }
        }

        // Draw polygons
        // TODO: Add holes counter-clockwise
        ctx.fillStyle = "#f00";
        ctx.beginPath();
        for (var poly of this.polygons) {
            ctx.moveTo(poly[0][0], poly[0][1]);
            for (var point of poly.slice(1)) {
                ctx.lineTo(point[0], point[1]);
            }
            ctx.closePath();
        }
        ctx.fill()

        if (this.currentTool) {
            this.currentTool.renderPreview(ctx);
        }
    }
    doAction(a) {
        // TODO: Add action name to the history
        this.history.push(this.state);
        a();
        this.redoHistory = [];
        this.redraw();
        if (this.autosave) this.save();
    }
    undo() {
        this.redoHistory.push(this.state);
        this.state = this.history.pop();
        this.redraw();
    }
    redo() {
        this.history.push(this.state);
        this.sate = this.redoHistory.pop();
        this.redraw();
    }
    snap(point) {
        return point;
    }
    selectTool(options) {
        const tool = options.tool
        console.log(`Tool ${tool} selected`);
        $(".tool.selected").removeClass("selected");
        $(`.tool[data-tool=${tool}]`).addClass("selected");

        if (!this.TOOLS[options.tool]) {
            console.log(`tool ${tool} not implemented`);
            return;
        }

        if (this.currentTool !== this.TOOLS[options.tool]) {
            if (this.currentTool) this.currentTool.forgetState();
            this.currentTool = this.TOOLS[options.tool];
            this.currentTool.forgetState(); // SHOULD not be needed but just in case.
        }
        // TODO: Add a click handler
    }
    shareLink()         { console.log("shareLink not implemented"); }
    toggle(options) {
        const {toggles, value} = options;
        this[options.toggles] = options.value;
        console.log(`Toggled ${toggles} to ${value}`)
        $(`.toggle[data-toggles=${toggles}] .toggle-option[data-value=true]`).toggleClass("selected", value);
        $(`.toggle[data-toggles=${toggles}] .toggle-option[data-value=false]`).toggleClass("selected", !value);
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
}

$(document).ready((ev) => {
    const bp = window.bp = new Blueprint();
    //bp.restore();
    bp.redraw();

    // Initialize toggles
    $(".toggle").each((i, t) => {
        t = $(t);
        var varName = t.data("toggles");
        t.append(`<div class="toggle-title">${t.data("toggle-name")}</div>`)
         .append(`<div class="toggle-option action" data-function="toggle" data-toggles="${varName}" data-value="false">${t.data("false-name")}</div>`)
         .append(`<div class="toggle-option action" data-function="toggle" data-toggles="${varName}" data-value="true">${t.data("true-name")}</div>`);
        bp.toggle({toggles: varName, value: bp[varName]});
    });

    //  Initialize tools
    $(".tool").data("function", "selectTool").addClass("action");
    // TODO: Tooltips for tool icons
    bp.selectTool({tool: $(".tool.selected").data("tool")});

    // Hook up click actions
    $(".action").on("click", (ev) => {
        const dispatch = $(ev.target).data("function");
        const options = $(ev.target).data();
        bp[dispatch].bind(bp)(options);
    });

    bp.bindMouse();
});
