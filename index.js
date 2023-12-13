function deepcopy(x) { return JSON.parse(JSON.stringify(x)); }

class Tool {
    emptyAction = { };
    allowSnap = true;
    constructor(bp, ...args) {
        this.partialAction = deepcopy(this.emptyAction); // A tool may have started being used, and is incomplete
        this.bp = bp;
    }
    forgetState() { this.partialAction = deepcopy(this.emptyAction); }
    onMouseMove(canvasPoint) { this.partialAction.mousePosition = canvasPoint; }
    onMouseDown(canvasPoint) { this.partialAction.mousePosition = canvasPoint; }
    onMouseUp(canvasPoint) { this.partialAction.mousePosition = canvasPoint; }
    onDelete() {}
    renderPreview(ctx) { } // Render a preview for mouse hover, partial draw, etc.
    renderPreviewBefore(ctx) { }
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
        if (!this.partialAction.draw) return;
        const start = this.partialAction.start, stop=canvasPoint;
        const [l, r] = [Math.min(start.x, stop.x), Math.max(start.x, stop.x)];
        const [t, b] = [Math.min(start.y, stop.y), Math.max(start.y, stop.y)];
        const rect = [[l, t], [r, t], [r, b], [l, b], [l, t]];
        if (this.bp.drawErase) {
            this.bp.doAction("Draw Rectangle", () => {
                this.bp.erasePoly([rect]);
            });
        } else {
            this.bp.doAction("Erase Rectangle", () => {
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
    emptyAction = { icon: null };
    selectIcon(icon) {
        this.partialAction.icon = icon;
    }
    onMouseDown(canvasPoint) {
        if (!this.partialAction.icon) return;

        this.partialAction.mousePosition = canvasPoint;
        this.bp.doAction("Place Icon", () => {
            this.bp.addObject({
                type: "icon",
                bottomRight: this.partialAction.mousePosition,
                icon: this.partialAction.icon,
            });
        });
    }
    renderPreview(ctx) {
        if (!this.partialAction.mousePosition) return;
        if (!this.partialAction.icon) return;

        // Render a preview
        this.render(ctx, {
            type: "icon",
            bottomRight: this.partialAction.mousePosition,
            icon: this.partialAction.icon,
            preview: true
        });
    }
    render(ctx, object) {
        if (!object.type == "icon") return;
        ctx.save()

        const icon = bp.ICONS[object.icon];
        const [width, height] = icon.size || [32, 32];
        const img = $(`.icon[data-value="${icon.id}"] img`)[0];
        const scaleX = bp.ROTATION.scaleX[icon.rotation];
        const rotation = bp.ROTATION.rotate[icon.rotation] / 180 * Math.PI;
        const [x, y] = [object.bottomRight.x - width/2, object.bottomRight.y - height/2];

        ctx.translate(x, y);
        ctx.scale(scaleX, 1);
        ctx.rotate(rotation);

        if (object.preview) ctx.globalAlpha = 0.1;
        if (object.selected || object.highlight) {
            if (object.selected) {
                ctx.strokeStyle = "#55f";
                ctx.lineWidth = 2;
            } else if (object.highlight) {
                ctx.fillStyle = "rgba(200, 200, 255, 0.5)";
                ctx.strokeStyle = "grey";
                ctx.lineWidth = 5;
            }
            ctx.beginPath();
            const b = 5;
            ctx.moveTo(-width/2-b, -height/2-b);
            ctx.lineTo( width/2+b, -height/2-b);
            ctx.lineTo( width/2+b,  height/2+b);
            ctx.lineTo(-width/2-b,  height/2+b);
            ctx.closePath();
            if (object.highlight) ctx.fill();
            ctx.stroke();
        }
        ctx.drawImage(
            img,
            -width/2, -height/2,
            width, height
        );

        ctx.restore()
    }
}
class PanTool extends Tool {
    emptyAction = { dragging: false };
    allowSnap = false;
    onMouseMove(canvasPoint) {
        super.onMouseMove(canvasPoint);
        if (this.partialAction.dragging) {
            const [dx, dy] = 
                [this.partialAction.startDrag.x - this.partialAction.mousePosition.x,
                 this.partialAction.startDrag.y - this.partialAction.mousePosition.y];
            const [tx, ty] = [
                this.partialAction.startOrigin.x + dx*bp.scale,
                this.partialAction.startOrigin.y + dy*bp.scale];
            this.origin = {x: tx, y: ty};
        }
    }
    onMouseDown(canvasPoint) {
        super.onMouseDown(canvasPoint);
        this.partialAction.dragging = true;
        this.partialAction.startDrag = canvasPoint;
        this.partialAction.startOrigin = bp.origin;
    }
    onMouseUp(canvasPoint) {
        this.forgetState();
        if (this.origin) {
            bp.origin = this.origin;
            delete this.origin;
        }
        super.onMouseUp(canvasPoint);
    }
}
class SelectTool extends Tool { 
    /* Select, edit, or move */
    emptyAction = { mouseDown: false, selection: null };
    allowSnap = false; // Complicated!

    onMouseMove(canvasPoint) {
        this.partialAction.mousePosition = canvasPoint;

        if (this.partialAction.selection && this.partialAction.mouseDown) {
            const [dx, dy] = [canvasPoint.x - this.partialAction.startDrag.x, canvasPoint.y - this.partialAction.startDrag.y];
            // Update preview
            this.partialAction.selection.bottomRight = {
                x: dx + this.partialAction.originalBottomRight.x,
                y: dy + this.partialAction.originalBottomRight.y
            };
        }
    }
    onMouseDown(canvasPoint) {
        // Select a thing
        this.partialAction.selection = this.findThing(canvasPoint);
        this.partialAction.mouseDown = true;

        this.partialAction.mousePosition = this.partialAction.startDrag = canvasPoint;
        if (this.partialAction.selection) {
            this.allowSnap = true; // Moving snaps
            this.partialAction.originalBottomRight = this.partialAction.selection.bottomRight;
        }
    }
    onMouseUp(canvasPoint) {
        if (this.partialAction.selection) { // Move
            // Undo the move preview, so we can record the original position in the action
            this.onMouseMove(canvasPoint);
            const finalPos = this.partialAction.selection.bottomRight;
            this.partialAction.selection.bottomRight = this.partialAction.originalBottomRight;
            delete this.partialAction.originalBottomRight;

            // Record the full move as an action
            bp.doAction("Move Object", () => {
                this.partialAction.selection.bottomRight = finalPos;
            });
        }

        // Reset drag
        this.partialAction.mousePosition = canvasPoint;
        this.partialAction.mouseDown = false;
        this.allowSnap = false;
        delete this.partialAction.startDrag;

        // Selection does not change
    }
    onDelete() {
        if (!this.partialAction.selection) return;
        // Delete the selected thing
        bp.doAction("Delete Object", () => {
            bp.deleteObject(this.partialAction.selection);
        });
        this.partialAction.selection = null;
    }
    findThing(mouse) {
        // Find the object under the mouse, if any
        for (var obj of bp.objects) {
            if (this.intersect(obj, mouse)) return obj;
        }
    }
    intersect(object, mouse) {
        if (object.type == "icon") {
            const icon = bp.ICONS[object.icon];
            const [width, height] = icon.size || [32, 32];
            return (object.bottomRight.x - width <= mouse.x &&
                    mouse.x <= object.bottomRight.x &&
                    object.bottomRight.y - height <= mouse.y &&
                    mouse.y <= object.bottomRight.y);
        }

    }
    renderPreviewBefore(ctx) { 
        const hover = this.findThing(this.partialAction.mousePosition);
        const selected = this.partialAction.selection;
        const dragging = this.partialAction.dragging;

        // While something is selected, show it specially.
        if (selected) selected.selected = true;
        // While mouse is up AND mouse is over something not selected, draw it highlighted in a border
        if (!dragging && hover && !hover.selected) hover.highlight = true;

    }
    renderPreview(ctx) { 
        const hover = this.findThing(this.partialAction.mousePosition);
        const dragging = this.partialAction.dragging;
        const selected = this.partialAction.selection;
        if (hover) delete hover.highlight;

        // While something is selected, show it specially.
        // (While mouse is down AND something is selected, show it being dragged)
        if (selected) delete selected.selected;

        // TODO: While mouse is up AND mouse is over something already selected, show a special icon

        
        // TODO: While mouse is down AND nothing is selected, show a rectangle selection preview of multi-select

    } 
}
class PolygonTool extends Tool {

}
class TextTool extends Tool { }

class Blueprint {
    constructor() {
        this.persisted = ["polygons", "objects", "title", "autosave"];
        // NOT persisted: viewport position and zoom, tool state, undo/redo history
        this.origin = {x: 0, y: 0};

        // A "MultiPolygon": Array of polygons
        // A "Polygon": Array of rings (first exterior, others "holes")
        // Ring: Array of coordinates (first and last the same)
        // Coordinate: Array of two floats
        this.polygons = []; // A multi-polygon
        this.drawErase = false;
        this.objects = [];
        this.gridSnap = true;
        this.gridSize = 20;
        this.snapSize = 10;
        this.selectedIcon = null;
        this.title = "";
        this.scale = 1.0;
        this.history = [];
        this.redoHistory = [];
        this.autosave = true;
        this.saveKey = "blueprint";

        this.TOOLS = {
            rectangle: new RectangleTool(this),
            pan: new PanTool(this),
            select: new SelectTool(this),
            poly: new PolygonTool(this),
            icon: new IconTool(this),
            text: new TextTool(this),
        };
        this.ROTATION = {
            name: ["North", "East", "West", "South", "North, Flipped", "East, Flipped", "West, Flipped", "South, Flipped"],
            scaleX: [1,1,1,1,-1,-1,-1,-1],
            rotate: [0, 90, 180, 270, 0, 90, 180, 270],
        }
        const ROT2 = [0,1];
        const ROT4 = [0,1,2,3];
        const ROT8 = [0,4,1,5,2,6,3,7];
        const ICONS = [
            {name:"Window", image:"image/icon-window.png", rotations: ROT4},
            {name:"Door", image:"image/icon-door.png", rotations: ROT8},
            {name:"Outlet", image:"image/icon-outlet.png", rotations: ROT2},
            {name:"HVAC", image:"image/icon-square.png", text: "HVAC"},
            {name:"Fridge", image:"image/icon-square.png", text: "Fridge"},
            {name:"Stove", image:"image/icon-square.png", text: "Stove"},
            {name:"Water Heater", image:"image/icon-square.png", text: "Water Heater"},
            {name:"Sump Pump", image:"image/icon-square.png", text: "Sump"},
        ];
        this.ICONS = {};
        for (var icon of ICONS) {
            if (icon.rotations) {
                for (var r of icon.rotations) {
                    const copy = deepcopy(icon);
                    delete copy.rotations;
                    copy.rotation = r;
                    copy.id = `${icon.name} : ${r}`;
                    //copy.name = `${icon.name} (${this.ROTATION.name[r]})`;
                    this.ICONS[copy.id] = copy;
                }
            } else {
                icon.id = icon.name;
                this.ICONS[icon.id] = icon;
            }
        }

        for (var [id, icon] of Object.entries(this.ICONS)) {
            const [width, height] = icon.size || [32, 32];
            const iconSelector = $(`<div class="icon action" data-function="selectIcon" data-value="${icon.id}"><img src="${icon.image}" alt="${icon.text}" width=${width} height=${height}/><span class="icon-name">${icon.name}</span></div>`);
            if (icon.rotation) {
                var transforms = [];
                const [scaleX, rotation] = [this.ROTATION.scaleX[icon.rotation], this.ROTATION.rotate[icon.rotation]];
                if (scaleX !== 1) transforms.push(`scaleX(${scaleX})`);
                if (rotation !== 0) transforms.push(`rotate(${rotation}deg)`);
                const transform = transforms.join(" ");
                iconSelector.find("img").css("transform", transform);
            }
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
        localStorage.setItem(this.saveKey, JSON.stringify(this.state));
    }
    restore() {
        if (localStorage.getItem(this.saveKey)) {
          this.state = JSON.parse(localStorage.getItem(this.saveKey));
        }
        this.redraw();
    }
    addPoly(poly) {
        this.polygons = polygonClipping.union(this.polygons, poly);
    }
    erasePoly(poly) {
        this.polygons = polygonClipping.difference(this.polygons, poly);
    }
    addObject(object) {
        this.objects.push(object);
    } 
    deleteObject(object) {
        const index = this.objects.findIndex(e => e===object);
        if (index < 0) return;
        this.objects.splice(index, 1);
    }
    redraw() {
        const canvas = this.canvas;
        canvas.height = window.innerHeight;
        canvas.width = window.innerWidth;
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        const origin = (this.currentTool && this.currentTool.origin) || this.origin;
        ctx.translate(-origin.x, -origin.y);
        ctx.scale(this.scale, this.scale);
        const size = { width: canvas.width / this.scale,
                       height: canvas.height / this.scale }

        // Draw grid dots. Complicated because there are infinity of them.
        var dotSpacing = this.gridSize;
        // Draw less dots when you zoom out, to improve performance
        while (Math.max(size.width, size.height) / dotSpacing > 100) dotSpacing *= 2;

        const originScaled = {x: origin.x / this.scale, y: origin.y / this.scale};
        for (var i = Math.floor(originScaled.x/dotSpacing); i <= (originScaled.x + size.width) / dotSpacing; i++) {
            for (var j = Math.floor(originScaled.y/dotSpacing); j <= (originScaled.y + size.height) / dotSpacing; j++) {
                ctx.fillStyle = "#000";
                ctx.strokeWidth = 1;
                ctx.beginPath();
                const radius = Math.max(0.5, 0.5/this.scale);
                ctx.arc(dotSpacing * i, dotSpacing * j, radius, 0, 2 * Math.PI);
                ctx.fill();
            }
        }

        if (this.currentTool) this.currentTool.renderPreviewBefore(ctx);

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

        // Draw icons
        for (var object of this.objects) {
            if (object.type == "icon") this.TOOLS.icon.render(ctx, object);
        }

        // TODO: Draw text

        // Draw current tool preview
        if (this.currentTool) this.currentTool.renderPreview(ctx);
    }
    doAction(name, a) {
        this.history.push({
            name: name,
            state: deepcopy(this.state)
        });
        a();
        this.redoHistory = [];
        this.redraw();
        if (this.autosave) this.save();
    }
    undo() {
        if (this.history.length == 0) return;
        const action = this.history.pop();
        this.redoHistory.push({
            name: action.name,
            state: this.state
        });
        this.state = action.state;
        this.redraw();
        if (this.autosave) this.save();
    }
    redo() {
        if (this.redoHistory.length == 0) return;
        const action = this.redoHistory.pop();
        this.history.push({
            name: action.name,
            state: this.state
        })
        this.state = action.state;
        this.redraw();
        if (this.autosave) this.save();
    }
    snap(point) {
        return {
            x: Math.round(point.x/this.snapSize)*this.snapSize,
            y: Math.round(point.y/this.snapSize)*this.snapSize,
        }
    }
    selectIcon(options) {
        const icon = options.value;
        $(".icon.selected").removeClass("selected");
        $(`.icon[data-value="${icon}"]`).addClass("selected");
        this.selectedIcon = icon;
        this.currentTool.selectIcon(icon);
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
    addUrlParameter(url, name, value) {
        name = encodeURIComponent(name);
        value = encodeURIComponent(value);
        return `${url}?${name}=${value}`
    }
    shareLink() {
        const state = JSON.stringify(this.state);
        const link = this.addUrlParameter(window.location.href, "share", state);
        navigator.clipboard.writeText(link);
        alert("Copied link to clipboard");
    }
    loadSharedLink() {
        const sharedState = new URLSearchParams(window.location.search).get("share");
        if (sharedState) {
            this.saveKey = "shared"; // Avoid overwriting your save with the shared link
            this.state = JSON.parse(decodeURIComponent(sharedState));
        }
        this.redraw();
    }
    clear() {
        if (!window.confirm("Are you sure you want to delete your blueprint?")) return;
        this.origin = {x: 0, y: 0};
        this.polygons = [];
        this.objects = [];
        this.title = "";
        this.scale = 1.0;
        this.history = [];
        this.redoHistory = [];
        this.save();
        this.redraw();
    }
    
    canvasPos(ev, allowSnap) {
        // Convert mouse coordinates
        const rect = bp.canvas.getBoundingClientRect();
        var p = { x: ev.clientX, y: ev.clientY }
        p = {
            x: p.x - rect.left,
            y: p.y - rect.top,
        };

        // Un-Transform
        p = {
            x: p.x + this.origin.x,
            y: p.y + this.origin.y,
        }

        // Un-Scale
        p = {
            x: p.x / this.scale,
            y: p.y / this.scale,
        };

        // Snap
        if (this.gridSnap && allowSnap) p = this.snap(p);
        return p;
    }
    zoom(pos, factor) {
        // We scale up, and then want "pos" to be a fixpoint of the zoom+translate
        const oldScale = this.scale;
        this.scale = Math.max(Math.min(this.scale*factor, 10.0), 0.1);
        const s = 1 - (this.scale / oldScale);
        const [dx, dy] = [pos.x * s, pos.y * s];
        this.origin.x -= dx * oldScale;
        this.origin.y -= dy * oldScale;
        this.redraw();
    }
    bindMouse() {
        $(document).on("mousemove", (ev) => {
            if(!bp.currentTool) return;
            bp.currentTool.onMouseMove(bp.canvasPos(ev, bp.currentTool.allowSnap));
            bp.redraw();
        }).on("mousedown", (ev) => {
            if(!bp.currentTool) return;
            if (event.button == 0 && ev.target.nodeName == "CANVAS") {
                bp.currentTool.onMouseDown(bp.canvasPos(ev, bp.currentTool.allowSnap));
                bp.redraw();
            }
            // TODO: Right click to pan
        }).on("mouseup", (ev) => {
            if(!bp.currentTool) return;
            if (event.button == 0) {
                bp.currentTool.onMouseUp(bp.canvasPos(ev, bp.currentTool.allowSnap));
                bp.redraw();
            }
        });
        $(window).on('mousewheel', (ev) => {
            ev = ev.originalEvent;
            const pos = bp.canvasPos(ev, false);
            bp.zoom(pos, Math.exp(0.0003 * -ev.deltaY));
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
                case 'Delete':
                case 'Backspace':
                    ev.preventDefault();
                    if (bp.currentTool) bp.currentTool.onDelete()
                    break;
            }
        });
    }
}

$(document).ready((ev) => {
    const bp = window.bp = new Blueprint();
    bp.restore(); // Restore save
    bp.loadSharedLink(); // Load state from get parameter
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
        const dispatch = $(ev.currentTarget).data("function");
        const options = $(ev.currentTarget).data();
        bp[dispatch].bind(bp)(options);
    });
    $("img").attr("draggable", "false");

    if (window.location.origin == "file://") $("body").addClass("local");
});
