function deepcopy(x) { return JSON.parse(JSON.stringify(x)) }

class Tool {
    emptyAction = { }
    allowSnap = true

    constructor(bp, ...args) {
        this.partialAction = deepcopy(this.emptyAction) // A tool may have started being used, and is incomplete
        this.bp = bp
    }
    forgetState()            { this.partialAction = deepcopy(this.emptyAction) }
    onMouseMove(canvasPoint) { this.partialAction.mousePosition = canvasPoint }
    onMouseDown(canvasPoint) { this.partialAction.mousePosition = canvasPoint }
    onMouseUp(canvasPoint)   { this.partialAction.mousePosition = canvasPoint }
    onDelete()               {}
    renderPreview(ctx)       {} // Render a preview for mouse hover, partial draw, etc.
    renderPreviewBefore(ctx) {}
    select()                 { this.forgetState(); }
    deselect()               { this.forgetState(); } // Just in case
    intersect(topLeft, size, mouse, border) {
        border ||= 0;
        return (topLeft.x - border <= mouse.x &&
                mouse.x <= topLeft.x + size.width + border &&
                topLeft.y - border <= mouse.y &&
                mouse.y <= topLeft.y + size.height + border)
    }
}

class RectangleTool extends Tool {
    emptyAction = { draw: false }
    onMouseDown(canvasPoint) {
        this.partialAction.draw = true
        this.partialAction.start = this.partialAction.mousePosition = canvasPoint
    }
    onMouseUp(canvasPoint) {
        if (!this.partialAction.draw) return
        const start = this.partialAction.start, stop=canvasPoint
        const [l, r] = [Math.min(start.x, stop.x), Math.max(start.x, stop.x)]
        const [t, b] = [Math.min(start.y, stop.y), Math.max(start.y, stop.y)]
        const rect = [[l, t], [r, t], [r, b], [l, b], [l, t]]
        if (this.bp.drawErase) {
            this.bp.doAction("Draw Rectangle", () => {
                this.bp.erasePoly([rect])
            })
        } else {
            this.bp.doAction("Erase Rectangle", () => {
                this.bp.addPoly([rect])
            })
        }
        this.forgetState()
        this.partialAction.mousePosition = canvasPoint
    }
    renderPreviewRectangle(ctx, start, stop) {
        // Show a preview of the huge draw rectangle
        ctx.fillStyle = "rgba(0, 255, 0, 0.5)"
        ctx.strokeStyle = "#0f0"
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(start.x, start.y)
        ctx.lineTo(start.x,  stop.y)
        ctx.lineTo( stop.x,  stop.y)
        ctx.lineTo( stop.x, start.y)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
    }
    renderPreviewDot(ctx, tl) {
        // Show a little preview rectangle as a mouse cursor
        const side = bp.snapSize
        ctx.fillStyle = "rgba(0, 0, 255, 0.5)"
        ctx.strokeStyle = "#66f"
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(tl.x, tl.y)
        ctx.lineTo(tl.x + side, tl.y)
        ctx.lineTo(tl.x + side, tl.y + side)
        ctx.lineTo(tl.x, tl.y+side)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
    }
    renderPreview(ctx) {
        if (!this.partialAction.mousePosition) return
        if (this.partialAction.draw) this.renderPreviewRectangle(ctx,
            this.partialAction.start,
            this.partialAction.mousePosition)
        else this.renderPreviewDot(ctx, this.partialAction.mousePosition)
    }
}

class IconTool extends Tool {
    persisted = ["topLeft", "icon"]

    selectIcon(icon) {
        this.partialAction.icon = icon
    }
    iconTopLeft(mouse, icon) {
        const size = bp.ICONS[this.partialAction.icon].size
        return {
            x: mouse.x - size.width,
            y: mouse.y - size.height,
        }
    }
    onMouseDown(canvasPoint) {
        super.onMouseDown(...arguments)
        if (!this.partialAction.icon) return

        this.bp.doAction("Place Icon", () => {
            this.bp.addObject({
                type: "icon",
                topLeft: this.iconTopLeft(this.partialAction.mousePosition, this.partialAction.icon),
                icon: this.partialAction.icon,
            })
        })
    }
    renderPreview(ctx) {
        if (!this.partialAction.mousePosition) return
        if (!this.partialAction.icon) return

        // Render a preview
        this.render(ctx, {
            type: "icon",
            topLeft: this.iconTopLeft(this.partialAction.mousePosition, this.partialAction.icon),
            icon: this.partialAction.icon,
            preview: true
        })
    }
    renderHighlight(ctx, selected, highlight, size) {
        if (!selected && !highlight)  return
        if (selected) {
            ctx.strokeStyle = "#55f"
            ctx.lineWidth = 2
        } else if (highlight) {
            ctx.fillStyle = "rgba(200, 200, 255, 0.5)"
            ctx.strokeStyle = "grey"
            ctx.lineWidth = 5
        }
        ctx.beginPath()
        const b = 5
        ctx.moveTo(-size.width/2-b, -size.height/2-b)
        ctx.lineTo( size.width/2+b, -size.height/2-b)
        ctx.lineTo( size.width/2+b,  size.height/2+b)
        ctx.lineTo(-size.width/2-b,  size.height/2+b)
        ctx.closePath()
        if (highlight) ctx.fill()
        ctx.stroke()
    }
    render(ctx, object) {
        if (!object.type == "icon") return

        const icon = bp.ICONS[object.icon]
        const {width, height} = icon.size
        const img = $(`.icon[data-value="${icon.id}"] img`)[0]
        const scaleX = bp.ROTATION.scaleX[icon.rotation]
        const rotation = bp.ROTATION.rotate[icon.rotation] / 180 * Math.PI
        const center = {x: object.topLeft.x + width/2, y: object.topLeft.y + height/2}

        ctx.translate(center.x, center.y)
        ctx.scale(scaleX, 1)
        ctx.rotate(rotation)

        if (object.preview) ctx.globalAlpha = 0.1
        this.renderHighlight(
            ctx,
            object.selected,
            object.highlight,
            icon.size,
        )

        ctx.drawImage(
            img,
            -width/2, -height/2,
            width, height
        )
    }
    intersect(object, mouse) {
        const size = bp.ICONS[object.icon].size
        return super.intersect(object.topLeft, size, mouse)
    }
}

class PanTool extends Tool {
    emptyAction = { dragging: false }
    allowSnap = false
    onMouseMove(canvasPoint) {
        super.onMouseMove(canvasPoint)
        if (this.partialAction.dragging) {
            const [dx, dy] = 
                [this.partialAction.startDrag.x - this.partialAction.mousePosition.x,
                 this.partialAction.startDrag.y - this.partialAction.mousePosition.y]
            const [tx, ty] = [
                this.partialAction.startOrigin.x + dx*bp.scale,
                this.partialAction.startOrigin.y + dy*bp.scale]
            this.origin = {x: tx, y: ty}
        }
    }
    onMouseDown(canvasPoint) {
        super.onMouseDown(canvasPoint)
        this.partialAction.dragging = true
        this.partialAction.startDrag = canvasPoint
        this.partialAction.startOrigin = bp.origin
    }
    onMouseUp(canvasPoint) {
        this.forgetState()
        if (this.origin) {
            bp.origin = this.origin
            delete this.origin
        }
        super.onMouseUp(canvasPoint)
    }
}

class SelectTool extends Tool { 
    /* Select, edit, or move */
    // TODO: Clicking in place is causing slight shift -- snap-related
    emptyAction = { mouseDown: false, selection: null }
    allowSnap = false // Complicated!

    onMouseMove(canvasPoint) {
        this.partialAction.mousePosition = canvasPoint

        if (this.partialAction.selection && this.partialAction.mouseDown) {
            const [dx, dy] = [canvasPoint.x - this.partialAction.startDrag.x, canvasPoint.y - this.partialAction.startDrag.y]
            // Update preview
            this.partialAction.selection.topLeft = {
                x: dx + this.partialAction.originalTopLeft.x,
                y: dy + this.partialAction.originalTopLeft.y
            }
        }
    }
    onMouseDown(canvasPoint) {
        // Select a thing
        this.selectObject(this.findThing(canvasPoint))
        this.partialAction.mouseDown = true

        this.partialAction.mousePosition = this.partialAction.startDrag = canvasPoint
        if (this.partialAction.selection) {
            this.allowSnap = true // Moving snaps
            this.partialAction.originalTopLeft = this.partialAction.selection.topLeft
        }
    }
    selectObject(thing) {
        const old = this.partialAction.selection
        this.partialAction.selection = thing
        if (old && thing !== old && bp.TOOLS[old.type].stopEdit)
            bp.TOOLS[old.type].stopEdit(old)
        return old
    }
    editObject(object) {
        if (object.edited) return
        if (bp.TOOLS[object.type].edit) bp.TOOLS[object.type].edit(object)
    }
    deselect() {
        this.selectObject(null)
        super.deselect()
    }
    selectFont(font) {
        this.partialAction.selection.font = font // Text editing magic woo
    }
    textEdited(text) {
        this.partialAction.selection.text = text // Text editing magic woo
    }
    onMouseUp(canvasPoint) {
        const selection = this.partialAction.selection
        if (selection && !selection.edited) { // Move
            // Undo the move preview, so we can record the original position in the action
            this.onMouseMove(canvasPoint)
            const finalPos = this.partialAction.selection.topLeft
            this.partialAction.selection.topLeft = this.partialAction.originalTopLeft
            delete this.partialAction.originalTopLeft

            // Record the full move as an action
            bp.doAction("Move Object", () => {
                this.partialAction.selection.topLeft = finalPos
            })
        }

        // Reset drag
        this.partialAction.mousePosition = canvasPoint
        this.partialAction.mouseDown = false
        this.allowSnap = false
        delete this.partialAction.startDrag

        // Selection does not change

        // Open editor
        if (selection) this.editObject(selection)
    }
    onDelete() {
        if (!this.partialAction.selection) return
        // Delete the selected thing
        const old = this.selectObject(null); // Un-edit the thing
        bp.doAction("Delete Object", () => {
            bp.deleteObject(old)
        })
    }
    findThing(mouse) {
        if (!mouse) return
        // Find the object under the mouse, if any
        for (var obj of bp.objects) {
            if (bp.TOOLS[obj.type].intersect(obj, mouse)) return obj
        }
    }
    renderPreviewBefore() { 
        const hover = this.findThing(this.partialAction.mousePosition)
        const selected = this.partialAction.selection
        const dragging = this.partialAction.mouseDown

        // While something is selected, show it specially.
        if (selected) selected.selected = true
        // While mouse is up AND mouse is over something not selected, draw it highlighted in a border
        if (!dragging && hover && !hover.selected) hover.highlight = true
    }
    renderPreview(ctx) { 
        const hover = this.findThing(this.partialAction.mousePosition)
        const dragging = this.partialAction.mouseDown
        const selected = this.partialAction.selection
        if (hover) delete hover.highlight

        // While something is selected, show it specially.
        // (While mouse is down AND something is selected, show it being dragged)
        if (selected) delete selected.selected

        // Mouse icon
        var mouse = ""
        if (dragging && selected)        mouse = "grabbing"
        else if (dragging && !selected)  mouse = "" // "crosshair"
        else if (!dragging && hover && hover == selected)
            if (selected.type == "text") mouse = "text"
            else                         mouse = "grab"
        else if (!dragging && hover)     mouse = "grab"
        else if (!dragging)              mouse = "" // "crosshair"
        else                             mouse = ""
        $("canvas").css("cursor", mouse)
    } 
}

class PolygonTool extends Tool {

}

class TextTool extends Tool { 
    persisted = ["topLeft", "text", "font"]

    onMouseDown(canvasPoint) {
        // Deliberately not persisted, because it's still empty.
        bp.doAction("Add Text", () => {
            const text = this.bp.addObject({
                type: "text",
                topLeft: canvasPoint,
                text: "",
                font: this.font,
            })
            bp.selectTool({
                tool: "select",
                selection: text
            })
        })
    }
    selectFont(font) { this.font = font }
    intersect(object, mouse) {
        if (!object._size) return false
        if (!object._actualTopLeft) return false
        return super.intersect(object._actualTopLeft, object._size, mouse, 5)
    }
    edit(object) {
        console.log("Start editing text")
        object.edited = true
        this.orig = deepcopy(object)

        $(".text-bar").addClass("active")
        $(".text-editor").show()

        const taj = $(".text-editor textarea")
        //taj.css("font", object.font || "")
        const ta = taj[0]
        ta.value = object.text
        function focus() {
            ta.focus()
            ta.setSelectionRange(object.text.length, object.text.length)
        }
        focus()
        setTimeout(focus, 0)

        if (object.font) bp.selectFont({value: object.font});
    }
    stopEdit(object) {
        console.log("Stop editing text")
        delete object.edited
        const ta = $(".text-editor textarea")[0]
        const newText = ta.value
        const newFont = object.font
        $(".text-bar").removeClass("active")
        $(".text-editor").hide()

        // Persist changes
        if (newText != this.orig.text || (!!newText & !!this.orig.text && newFont != this.orig.font)) {
            object.text = this.orig.text
            object.font = this.orig.font
            delete this.orig
            bp.doAction("Edit Text", () => {
                if (!newText) bp.deleteObject(object);
                object.text = newText
                if (newFont) object.font = newFont
            })
        } else if (!newText) {
            bp.deleteObject(object);
        }
    }
    renderHighlight(ctx, selected, highlight, pos, size) {
        // Draw border if it's being edited.
        if (!selected && !highlight) return
        ctx.beginPath()
        if (selected) {
            ctx.strokeStyle = "#55f"
            ctx.lineWidth = 2
        } else if (highlight) {
            ctx.fillStyle = "rgba(200, 200, 255, 0.5)"
            ctx.strokeStyle = "grey"
            ctx.lineWidth = 5
        }
        const b = 5
        ctx.moveTo(pos.x - b,              pos.y - b)
        ctx.lineTo(pos.x + b + size.width, pos.y - b)
        ctx.lineTo(pos.x + b + size.width, pos.y + b + size.height)
        ctx.lineTo(pos.x - b,              pos.y + b + size.height)
        ctx.closePath()
        if (highlight) ctx.fill()
        ctx.stroke()
    }
    renderCursor(ctx, center) {
        // Show a little circle cursor
        const radius = 2
        ctx.beginPath()
        ctx.fillStyle = "rgba(0, 0, 255, 0.5)"
        ctx.strokeStyle = "#66f"
        ctx.lineWidth = 1.5
        ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI)
        ctx.fill()
        ctx.stroke()
    }
    render(ctx, object) {
        if (object.type != "text") return

        const {x, y} = object.topLeft
        const text = object.text
        if (object.font) ctx.font = object.font
        const tm = ctx.measureText(text)
        const pos = {
            x: object.topLeft.x,
            y: object.topLeft.y - tm.actualBoundingBoxAscent
        }
        const size = {
            width: tm.width,
            height: tm.actualBoundingBoxAscent + tm.actualBoundingBoxDescent
        }

        object._actualTopLeft = pos
        object._size = size
        //if (!object.edited)
            ctx.fillText(text, object.topLeft.x, object.topLeft.y)

        this.renderHighlight(ctx, object.selected, object.highlight,
            pos, size)
    }
    renderPreview(ctx) {
        if (!this.partialAction.mousePosition) return
        this.renderCursor(ctx, this.partialAction.mousePosition)
    }
}

class Blueprint {
    constructor() {
        this.persisted = ["polygons", "objects", "title", "autosave"]
        // NOT persisted: viewport position and zoom, settings, tool selection, tool state, undo/redo history

        this.origin = {x: 0, y: 0}

        // A "MultiPolygon": Array of polygons
        // A "Polygon": Array of rings (first exterior, others "holes")
        // Ring: Array of coordinates (first and last the same)
        // Coordinate: Array of two floats
        this.polygons = [] // A multi-polygon
        this.drawErase = false
        this.objects = []
        this.gridSnap = true
        this.gridSize = 20
        this.snapSize = 10
        this.selectedIcon = null
        this.title = ""
        this.scale = 1.0
        this.history = []
        this.redoHistory = []
        this.autosave = true
        this.saveKey = "blueprint"

        this.TOOLS = {
            rectangle: new RectangleTool(this),
            pan: new PanTool(this),
            select: new SelectTool(this),
            poly: new PolygonTool(this),
            icon: new IconTool(this),
            text: new TextTool(this),
        }
        this.ROTATION = {
            name: ["North", "East", "West", "South", "North, Flipped", "East, Flipped", "West, Flipped", "South, Flipped"],
            scaleX: [1,1,1,1,-1,-1,-1,-1],
            rotate: [0, 90, 180, 270, 0, 90, 180, 270],
        }
        this.FONTS = [
            "14pt PermanentMarker",
            "18pt PermanentMarker",
            "24pt PermanentMarker",
            "36pt PermanentMarker",
            "10pt serif",
            "12pt serif",
            "14pt serif",
            "18pt serif",
            "24pt serif",
            "36pt serif",
        ]
        this.TOOLS.text.font = this.FONTS[0] // default font
        const ROT2 = [0,1]
        const ROT4 = [0,1,2,3]
        const ROT8 = [0,4,1,5,2,6,3,7]
        const ICONS = [
            {name:"Window", image:"image/icon-window.png", rotations: ROT4},
            {name:"Door", image:"image/icon-door.png", rotations: ROT8},
            {name:"Outlet", image:"image/icon-outlet.png", rotations: ROT2},
            {name:"HVAC", image:"image/icon-square.png", text: "HVAC"},
            {name:"Fridge", image:"image/icon-square.png", text: "Fridge"},
            {name:"Stove", image:"image/icon-square.png", text: "Stove"},
            {name:"Water Heater", image:"image/icon-square.png", text: "Water Heater"},
            {name:"Sump Pump", image:"image/icon-square.png", text: "Sump"},
        ]
        this.ICONS = {}
        for (var icon of ICONS) {
            if (icon.rotations) {
                for (var r of icon.rotations) {
                    const copy = deepcopy(icon)
                    delete copy.rotations
                    copy.rotation = r
                    copy.id = `${icon.name} : ${r}`
                    //copy.name = `${icon.name} (${this.ROTATION.name[r]})`
                    this.ICONS[copy.id] = copy
                }
            } else {
                icon.id = icon.name
                this.ICONS[icon.id] = icon
            }
        }
        for (var icon of Object.values(this.ICONS)) icon.size ||= { width: 32, height: 32 }

        for (var font of this.FONTS) {
            const fontSelector = $(`<div class="font action" data-function="selectFont" data-value="${font}">Aa</div>`)
            fontSelector.css("font", font)
            $(".fonts > div").append(fontSelector)
        }
        for (var [id, icon] of Object.entries(this.ICONS)) {
            const iconSelector = $(`<div class="icon action" data-function="selectIcon" data-value="${icon.id}"><img src="${icon.image}" alt="${icon.text}" width=${icon.size.width} height=${icon.size.height}/><span class="icon-name">${icon.name}</span></div>`)
            if (icon.rotation) {
                var transforms = []
                const [scaleX, rotation] = [this.ROTATION.scaleX[icon.rotation], this.ROTATION.rotate[icon.rotation]]
                if (scaleX !== 1) transforms.push(`scaleX(${scaleX})`)
                if (rotation !== 0) transforms.push(`rotate(${rotation}deg)`)
                const transform = transforms.join(" ")
                iconSelector.find("img").css("transform", transform)
            }
            $(".icons > div").append(iconSelector)
        }
    }
    get canvas() {
        return $(".draw-area > canvas")[0]
    }
    get state() {
        var s = {}
        for (var index of this.persisted) s[index] = this[index]
        // Only the persistent parts of 'this.objects'
        s.objects = []
        for (var [index, orig] of Object.entries(this.objects)) {
            var o = { type: orig.type }
            var sp = this.TOOLS[orig.type].persisted
            for (var si of sp) o[si] = orig[si]
            s.objects[index] = o
        }
        return s
    }
    set state(s) {
        for (var index of this.persisted) {
            this[index] = s[index]
        }
    }
    save() {
        localStorage.setItem(this.saveKey, JSON.stringify(this.state))
    }
    restore() {
        if (localStorage.getItem(this.saveKey)) {
          this.state = JSON.parse(localStorage.getItem(this.saveKey))
        }
        this.redraw()
    }
    addPoly(poly) {
        this.polygons = polygonClipping.union(this.polygons, poly)
    }
    erasePoly(poly) {
        this.polygons = polygonClipping.difference(this.polygons, poly)
    }
    addObject(object) {
        this.objects.push(object)
        return object
    } 
    deleteObject(object) {
        const index = this.objects.findIndex(e => e===object)
        if (index < 0) return
        this.objects.splice(index, 1)
    }
    redraw() {
        const canvas = this.canvas
        canvas.height = window.innerHeight
        canvas.width = window.innerWidth
        var ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
        const origin = (this.currentTool && this.currentTool.origin) || this.origin
        ctx.translate(-origin.x, -origin.y)
        ctx.scale(this.scale, this.scale)
        const size = { width: canvas.width / this.scale,
                       height: canvas.height / this.scale }

        // Draw grid dots. Complicated because there are infinity of them.
        // Draw less dots when you zoom out, to improve performance
        ctx.save()
        for (var dotSpacing = this.gridSize; Math.max(size.width, size.height) / dotSpacing > 100; dotSpacing *= 2);
        ctx.fillStyle = "#000"
        ctx.strokeWidth = 1
        const originScaled = {x: origin.x / this.scale, y: origin.y / this.scale}
        for (var i = Math.floor(originScaled.x/dotSpacing); i <= (originScaled.x + size.width) / dotSpacing; i++) {
            for (var j = Math.floor(originScaled.y/dotSpacing); j <= (originScaled.y + size.height) / dotSpacing; j++) {
                ctx.beginPath()
                const radius = Math.max(0.5, 0.5/this.scale)
                ctx.arc(dotSpacing * i, dotSpacing * j, radius, 0, 2 * Math.PI)
                ctx.fill()
            }
        }
        ctx.restore()

        // Do highlights, selection
        ctx.save()
        if (this.currentTool) this.currentTool.renderPreviewBefore(ctx)
        ctx.restore()

        // Draw polygons
        ctx.save()
        ctx.fillStyle = "brown"
        ctx.strokeStyle = "black"
        ctx.strokeWidth = 5
        for (var poly of this.polygons) {
            ctx.beginPath()
            for (var ring of poly) {
                ctx.moveTo(ring[0][0], ring[0][1])
                for (var point of ring.slice(1)) {
                    ctx.lineTo(point[0], point[1])
                }
            }
            ctx.closePath()
            ctx.stroke()
            ctx.fill()
        }
        ctx.restore()

        // Draw icons, text
        for (var layer of ["icon", "text"]) {
            for (var object of this.objects) {
                if (object.type == layer) {
                    ctx.save()
                    this.TOOLS[layer].render(ctx, object)
                    ctx.restore()
                }
            }
        }

        // Draw current tool preview
        ctx.save()
        if (this.currentTool) this.currentTool.renderPreview(ctx)
        ctx.restore()
    }
    doAction(name, a) {
        // TODO: Undo/redo should really use a didAction() interface (and restore to right after two actions ago)
        // Current strategy is to persist right before a(), but this fails because of all kinds of crazy transient stuff we do like live-editing for previews, or not adding empty text nodes in an action
        this.history.push({
            name: name,
            state: deepcopy(this.state)
        })
        console.log(name, this.state.objects)
        a()
        this.redoHistory = []
        this.redraw()
        if (this.autosave) this.save()
    }
    undo() {
        if (this.history.length == 0) return
        const action = this.history.pop()
        this.showAlert("Undo", action.name)
        this.redoHistory.push({
            name: action.name,
            state: this.state
        })
        this.state = action.state
        this.redraw()
        if (this.autosave) this.save()
    }
    redo() {
        if (this.redoHistory.length == 0) return
        const action = this.redoHistory.pop()
        this.showAlert("Redo", action.name)
        this.history.push({
            name: action.name,
            state: this.state
        })
        this.state = action.state
        this.redraw()
        if (this.autosave) this.save()
    }
    snap(point) {
        return {
            x: Math.round(point.x/this.snapSize)*this.snapSize,
            y: Math.round(point.y/this.snapSize)*this.snapSize,
        }
    }
    selectIcon(options) {
        const icon = options.value
        $(".icon.selected").removeClass("selected")
        $(`.icon[data-value="${icon}"]`).addClass("selected")
        this.selectedIcon = icon
        this.currentTool.selectIcon(icon)
    }
    selectFont(options) {
        const font = options.value
        $(".font.selected").removeClass("selected")
        $(`.font[data-value="${font}"]`).addClass("selected")
        this.currentTool.selectFont(font)
        //$(".text-editor textarea").css("font", font);
        const textEditing = $(".text-editor").css("display") != "none"
        if (textEditing) $(".text-editor textarea")[0].focus()
        bp.redraw()
    }
    selectTool(options) {
        const tool = options.tool
        //console.log(`Tool ${tool} selected`)
        $(".tool.selected").removeClass("selected")
        $(`.tool[data-tool=${tool}]`).addClass("selected")
        $(".icon-bar").toggleClass("active", tool=="icon");
        $("canvas").css("cursor", "") // Clear any style on the cursor

        if (!this.TOOLS[options.tool]) {
            console.log(`tool ${tool} not implemented`)
            return
        }

        if (this.currentTool !== this.TOOLS[options.tool]) {
            if (this.currentTool) this.currentTool.deselect()
            this.currentTool = this.TOOLS[options.tool]
            this.currentTool.select()
            if (this.currentTool.font) this.selectFont({value: this.currentTool.font})
        }

        if (this.currentTool == this.TOOLS["select"] && options.selection) {
            this.currentTool.selectObject(options.selection)
            this.currentTool.editObject(options.selection)
        }
    }
    toggle(options) {
        const {toggles, value} = options
        this[options.toggles] = options.value
        //console.log(`Toggled ${toggles} to ${value}`)
        $(`.toggle[data-toggles=${toggles}] .toggle-option[data-value=true]`).toggleClass("selected", value)
        $(`.toggle[data-toggles=${toggles}] .toggle-option[data-value=false]`).toggleClass("selected", !value)
    }
    addUrlParameter(url, name, value) {
        name = encodeURIComponent(name)
        value = encodeURIComponent(value)
        return `${url}?${name}=${value}`
    }
    shareLink() {
        const state = JSON.stringify(this.state)
        const link = this.addUrlParameter(window.location.href, "share", state)
        navigator.clipboard.writeText(link)
        alert("Copied link to clipboard")
    }
    loadSharedLink() {
        const sharedState = new URLSearchParams(window.location.search).get("share")
        if (sharedState) {
            this.saveKey = "shared" // Avoid overwriting your save with the shared link
            this.state = JSON.parse(decodeURIComponent(sharedState))
            this.autosave = false
        }
        this.redraw()
    }
    clear() {
        if (!window.confirm("Are you sure you want to delete your blueprint?")) return
        this.origin = {x: 0, y: 0}
        this.polygons = []
        this.objects = []
        this.title = ""
        this.scale = 1.0
        this.history = []
        this.redoHistory = []
        this.save()
        this.redraw()
    }
    help() {
        $(".help-bar").toggle()
    }
    canvasPos(ev, allowSnap) {
        // Convert mouse coordinates
        const rect = bp.canvas.getBoundingClientRect()
        var p = { x: ev.clientX, y: ev.clientY }
        p = {
            x: p.x - rect.left,
            y: p.y - rect.top,
        }

        // Un-Transform
        p = {
            x: p.x + this.origin.x,
            y: p.y + this.origin.y,
        }

        // Un-Scale
        p = {
            x: p.x / this.scale,
            y: p.y / this.scale,
        }

        // Snap
        if (this.gridSnap && allowSnap) p = this.snap(p)
        return p
    }
    zoom(pos, factor) {
        // We scale up, and then want "pos" to be a fixpoint of the zoom+translate
        const oldScale = this.scale
        this.scale = Math.max(Math.min(this.scale*factor, 10.0), 0.1)
        const s = 1 - (this.scale / oldScale)
        const [dx, dy] = [pos.x * s, pos.y * s]
        this.origin.x -= dx * oldScale
        this.origin.y -= dy * oldScale
        this.redraw()
    }
    showAlert(title, details) {
        $(".alert .action").text(title);
        $(".alert .detail").text(details);
        $(".alert").show();
        setTimeout(() => {
            $(".alert").fadeOut()
        }, 2000);
    }
    bindMouse() {
        $(document).on("mousemove", (ev) => {
            if(!bp.currentTool) return
            bp.currentTool.onMouseMove(bp.canvasPos(ev, bp.currentTool.allowSnap))
            bp.redraw()
        }).on("mousedown", (ev) => {
            if(!bp.currentTool) return
            if (event.button == 0 && ev.target.nodeName == "CANVAS") {
                bp.currentTool.onMouseDown(bp.canvasPos(ev, bp.currentTool.allowSnap))
                bp.redraw()
            }
        }).on("mouseup", (ev) => {
            if(!bp.currentTool) return
            if (event.button == 0) {
                bp.currentTool.onMouseUp(bp.canvasPos(ev, bp.currentTool.allowSnap))
                bp.redraw()
            }
        })
        $(window).on('mousewheel', (ev) => {
            ev = ev.originalEvent
            const pos = bp.canvasPos(ev, false)
            bp.zoom(pos, Math.exp(0.0003 * -ev.deltaY))
        })
    }
    bindKeys() {
        $(document).on("keydown", (ev) => {
            const textEditing = $(".text-editor").css("display") != "none"
            switch (ev.key) {
                case ev.ctrlKey && 'z':
                    ev.preventDefault()
                    this.undo()
                    break
                case ev.ctrlKey && 'y':
                    ev.preventDefault()
                    this.redo()
                    break
                case !textEditing && 'Delete':
                case !textEditing && 'Backspace':
                    ev.preventDefault()
                    if (bp.currentTool) bp.currentTool.onDelete()
                    break
                case textEditing && !ev.shiftKey && 'Enter':
                    ev.preventDefault()
                    bp.currentTool.selectObject(null)
                    break
            }
        })
        $(".text-editor textarea").on("input", (ev) => {
            if (bp.currentTool.textEdited) bp.currentTool.textEdited(ev.target.value)
            bp.redraw()
        })
    }
}

$(document).ready((ev) => {
    const bp = window.bp = new Blueprint()
    bp.restore() // Restore save
    bp.loadSharedLink() // Load state from get parameter
    bp.bindMouse()
    bp.bindKeys()
    $(window).on("resize", bp.redraw.bind(bp))

    // Initialize toggles
    $(".toggle").each((i, t) => {
        t = $(t)
        var varName = t.data("toggles")
        t.append(`<span class="toggle-title">${t.data("toggle-name")}</span>`)
         .append(`<div class="toggle-option action" data-function="toggle" data-toggles="${varName}" data-value="false">${t.data("false-name")}</div>`)
         .append(`<div class="toggle-option action" data-function="toggle" data-toggles="${varName}" data-value="true">${t.data("true-name")}</div>`)
        bp.toggle({toggles: varName, value: bp[varName]})
    })

    //  Initialize tool icons in toolbar
    $(".tool").data("function", "selectTool").addClass("action")
    $(".tools > .section > *").each((i, t) => {
        t = $(t)
        const toolName = t.data("name")
        const tooltip = $(`<span class="tooltip">${toolName}</span>`)
        t.append(tooltip)
        const dx = tooltip.outerWidth() - t.outerWidth()
        tooltip.css("left", `${5-Math.floor(dx/2)}px`)
    })
    bp.selectTool({tool: $(".tool.selected").data("tool")})

    // Hook up click actions
    $(".action").on("click", (ev) => {
        const dispatch = $(ev.currentTarget).data("function")
        const options = $(ev.currentTarget).data()
        bp[dispatch].bind(bp)(options)
    })
    $("img").attr("draggable", "false")

    if (window.location.origin == "file://") $("body").addClass("local")
})
