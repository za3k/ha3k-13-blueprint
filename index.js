class Blueprint {
    constructor() {
        this.persisted = ["polygons", "icons", "title", "autosave"];
        // NOT persisted: viewport position and zoom, tool state, undo/redo history
        this.origin = [0,0];
        this.polygons = [
            [[5,5], [100,5], [100, 50], [15, 50], [5, 5],],      // One quadralateral
            [[105,5], [200,5], [200, 50], [115, 50], [105, 5],], // One quadralateral
        ];
        this.drawErase = false;
        this.icons = [];
        this.gridSnap = true;
        this.title = "";
        this.zoom = 1.0;
        this.history = [];
        this.redoHistory = [];
        this.autosave = true;
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
    redraw(canvas) {
        canvas = canvas || $(".draw-area > canvas")[0];

        var ctx = canvas.getContext('2d');
        for (var poly of this.polygons) {
            ctx.fillStyle = "#f00";
            ctx.beginPath();
            ctx.moveTo(poly[0][0], poly[0][1]);
            for (var point of poly.slice(1)) {
                ctx.lineTo(point[0], point[1]);
            }
            ctx.closePath();
            ctx.fill()
        }
    }
    doAction(a) {
        this.history.append(this.state);
        a();
        this.redoHistory = [];
        this.redraw();
        if (this.autosave) this.save();
    }
    undo() {
        this.redoHistory.append(this.state);
        this.state = this.history.pop();
        this.redraw();
    }
    redo() {
        this.history.append(this.state);
        this.sate = this.redoHistory.pop();
        this.redraw();
    }
    selectTool(options) {
        const tool = options.tool
        console.log(`Tool ${tool} selected`);
        $(".tool.selected").removeClass("selected");
        $(options.target).addClass("selected");
        // TODO: Change display icon under mouse?
        // TODO: Show something on hover
        // TODO: Add a click handler
    }
    shareLink()         { console.log("shareLink not implemented"); }
    toggle(options) {
        this[options.toggles] = options.value;
        console.log(`Toggled ${options.toggles} to ${options.value}`)
        $(options.target).parent().children(".toggle-option[data-value=true]").toggleClass("selected", options.value);
        $(options.target).parent().children(".toggle-option[data-value=false]").toggleClass("selected", !options.value);
    }
}

$(document).ready((ev) => {
    const bp = new Blueprint();
    bp.restore();
    $(".toggle").each((i, t) => {
        t = $(t);
        var varName = t.data("toggles");
        const optionF = $(`<div class="toggle-option action" data-function="toggle" data-toggles="${varName}" data-value="false">${t.data("false-name")}</div>`)
        const optionT = $(`<div class="toggle-option action" data-function="toggle" data-toggles="${varName}" data-value="true">${t.data("true-name")}</div>`);

        $(t).append(`<div class="toggle-title">${t.data("toggle-name")}</div>`).append(optionF).append(optionT);
        bp.toggle({toggles: varName, value: bp[varName], target: optionF});
    });
    $(".tool").data("function", "selectTool").addClass("action");
    $(".action").on("click", (ev) => {
        const dispatch = $(ev.target).data("function");
        const options = $(ev.target).data();
        options.target = ev.target;
        bp[dispatch].bind(bp)(options);
    });
    bp.selectTool({tool: $(".tool.selected").data("tool"), target: $(".tool.selected")});
    // TODO: Redraw on window resize possibly?
    bp.redraw();
    window.bp = bp;
});
