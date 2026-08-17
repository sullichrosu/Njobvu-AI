// get url parameters

var state = 0;

function getUrlVars() {
    var vars = {};
    var parts = window.location.href.replace(/[?=&]+([^=&]+)=([^&]*)/gi, function(m, key, value) {
        vars[key] = value;
    });

    if (window.location.href.includes("/labelingV?")) {
        state = 1; //labeling validation mode
    }
    else {
        state = 0; //regular labeling mode
    }
    return vars;
}

// get classes and current class
var classes = document.getElementsByClassName('class-selection'),
    classNames = document.getElementsByClassName('selected-class'),
    temp = $('.classes');
curr_class = getUrlVars()["curr_class"];

var allClasses = []
for (var i = 0; i < temp.length; i++) {
    allClasses.push(temp[i].value);
}

// if current class wasn't set as a parameter in the url, then set current class as the first class
if (curr_class == undefined) {
    curr_class = allClasses[0];
    // curr_class = curr_class[0].value;
    //console.log(curr_class);
}
else {
    curr_class = curr_class;
}

//console.log("classes: ", classes);
//console.log("classNames", classNames);
//console.log("curr_class: ", curr_class);
//console.log("allClasses: ", allClasses);
// set url parameters
function updateURLParameter(url, param, paramVal) {
    var newAdditionalURL = "";
    var tempArray = url.split("?");
    var baseURL = tempArray[0];
    var additionalURL = tempArray[1];
    var temp = "";
    if (additionalURL) {
        tempArray = additionalURL.split("&");
        for (var i = 0; i < tempArray.length; i++) {
            if (tempArray[i].split('=')[0] != param) {
                newAdditionalURL += temp + tempArray[i];
                temp = "&";
            }
        }
    }

    var rows_txt = temp + "" + param + "=" + paramVal;
    return baseURL + "?" + newAdditionalURL + rows_txt;
}

// hex to rgba
function hex2rgba(hex, o) {
    var c;
    if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
        c = hex.substring(1).split('');
        if (c.length == 3) {
            c = [c[0], c[0], c[1], c[1], c[2], c[2]];
        }
        c = '0x' + c.join('');
        return 'rgba(' + [(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',') + ',' + o + ')';
    }
    throw new Error('Bad Hex');
}

var ShapeDrawer = (function() {
    function ShapeDrawer(canvas, shapeStrategy) {
        this.canvas = canvas;
        this.shapeStrategy = shapeStrategy;
        this.isDrawing = false;
        this.currObject = -1;
        this.currentDrawingShape = null;
        this.bindEvents();
    }

    ShapeDrawer.prototype.bindEvents = function() {
        var inst = this;
        inst.canvas.on('mouse:down', function(o) {
            inst.onMouseDown(o);
        });
        inst.canvas.on('mouse:move', function(o) {
            inst.onMouseMove(o);
        });
        inst.canvas.on('mouse:up', function(o) {
            inst.onMouseUp(o);
        });
        inst.canvas.on('object:moving', function(o) {
            inst.disable();
        });
        inst.canvas.on('mouse:hover', function(o) {
            //console.log('mouse:hover')
        });
        inst.canvas.on('mouse:wheel', function(o) {
            inst.onMouseWheel(o);
        });
    };


    ShapeDrawer.prototype.onMouseUp = function(o) {
        var inst = this;

        if (inst.currentDrawingShape != null) {
            var activeObj = inst.currentDrawingShape;

            if (inst.shapeStrategy === RectangleStrategy) {
                var w = activeObj.width;
                var h = activeObj.height;
                console.log("[onMouseUp] activeObj.id:", activeObj.id, "width:", w, "height:", h, "scaledW:", w / diff_width_ratio, "scaledH:", h / diff_width_ratio, "diff_width_ratio:", diff_width_ratio);

                $(".label-" + activeObj.id + ".label-w").val(w / diff_width_ratio);
                $(".label-" + activeObj.id + ".label-h").val(h / diff_width_ratio);
            }
            activeObj.lockMovementX = true;
            activeObj.lockMovementY = true;
            inst.currentDrawingShape = null;
        }

        if (inst.shapeStrategy === RectangleStrategy) {
            inst.disable();
        }
    };


    ShapeDrawer.prototype.onMouseDown = function(o) {
        var inst = this;


        // Case 1: Already in polygon drawing mode
        if (inst.isDrawing) {

            // If we have a shape being drawn and the strategy supports adding points
            if (inst.currentDrawingShape && inst.shapeStrategy.addPoint) {
                var pointer = inst.canvas.getPointer(o.e);

                var result = inst.shapeStrategy.addPoint(inst.currentDrawingShape, pointer, inst.canvas);

                if (result && result.segmentationComplete) {
                    inst.currentDrawingShape = null;  // Clear the reference
                    inst.disable();
                }
                return;
            }

            if (o.target && (o.target.excludeFromExport || o.target.polygonId)) {

                inst.disable();
                return;
            }
            return;
        }

        // Case 2: Not drawing yet
        if (o.target == null) {


            if (inst.currObject != -1) {
                for (var i = inst.canvas.getObjects().length - 1; i >= 0; i--) {
                    var obj = inst.canvas.item(i);
                    if (!obj) continue;
                    if (obj.id == inst.currObject) {
                        obj.set({ fill: 'transparent' });
                    }
                    if (obj.get && obj.get("type") === 'text') {
                        inst.canvas.remove(obj);
                    }
                }
            }

            inst.enable();

            var pointer = inst.canvas.getPointer(o.e);
            origX = pointer.x;
            origY = pointer.y;
            var id = Math.floor(Math.random() * (1000000000 - 100000)) + 100000;

            var shape = inst.shapeStrategy.createShape(id, pointer, curr_class, allClasses, inst.canvas);
            counter += 1;

            if (inst.shapeStrategy !== SegmentationStrategy) {
                addLabelToForm(id, curr_class, origX, origY, diff_width_ratio);
                //Segmentation labels are appended in finalize shape
            }

            $('#labels-counter').val(counter);
            inst.currObject = id;
            inst.canvas.add(shape).setActiveObject(shape);
            inst.currentDrawingShape = shape;
        } else {
            if (inst.currObject != -1) {
                for (var i = inst.canvas.getObjects().length - 1; i >= 0; i--) {
                    var obj = inst.canvas.item(i);
                    if (!obj) continue;
                    if (obj.id == inst.currObject) {
                        obj.set({ fill: 'transparent' });
                    }
                    if (obj.get && obj.get("type") === 'text') {
                        inst.canvas.remove(obj);
                    }
                }
            }

            if (o.target.excludeFromExport || o.target.polygonId) {
                return;
            }

            inst.currObject = o.target.id;
            o.target.set({ fill: o.target.stroke.replace(')', ', 0.33)').replace('rgb', 'rgba') });

            if (state == 1) {
                var text = new fabric.Text(String(o.target.class) + " (" + String(o.target.id) + ")", {
                    id: o.target.id,
                    selectable: false,
                    textAlign: 'center',
                    backgroundColor: "white",
                });
            } else {
                var text = new fabric.Text(String(o.target.class), {
                    id: o.target.id,
                    selectable: false,
                    textAlign: 'center',
                    backgroundColor: "white",
                });
            }

            while (((text.height > o.target.height) || (text.width > o.target.width)) && text.fontSize > 18) {
                text.set("fontSize", text.fontSize - 1);
            }
            text.set("width", o.target.width);
            text.set("top", (o.target.top + (o.target.height / 2)) - (text.height / 2));
            text.set("left", (o.target.left + o.target.width / 2) - (text.width / 2));

            text.lockMovementX = true;
            text.lockMovementY = true;

            inst.canvas.add(text);
        }
    };

    ShapeDrawer.prototype.onMouseMove = function(o) {
        var inst = this;

        if (!inst.isEnable()) { return; }

        if (inst.currentDrawingShape != null) {
            var pointer = inst.canvas.getPointer(o.e);
            var activeObj = inst.currentDrawingShape;

            inst.shapeStrategy.updateShape(activeObj, origX, origY, pointer, inst.canvas);

            // Add null check before accessing ID
            if (activeObj.id) {
                console.log("[onMouseMove] activeObj.id:", activeObj.id, "left:", activeObj.left, "top:", activeObj.top, "scaledX:", activeObj.left / diff_width_ratio, "scaledY:", activeObj.top / diff_width_ratio, "diff_width_ratio:", diff_width_ratio);
                $(".label-" + activeObj.id + ".label-x").val(activeObj.left / diff_width_ratio);
                $(".label-" + activeObj.id + ".label-y").val(activeObj.top / diff_width_ratio);
            }

            activeObj.setCoords();

            // Shape styling
            activeObj.stroke = classes[allClasses.indexOf(curr_class)].style.backgroundColor;
            activeObj.strokeWidth = 2 / inst.canvas.getZoom();
            activeObj.fill = activeObj.stroke.replace(')', ', 0.33)').replace('rgb', 'rgba');

            inst.canvas.renderAll();
        }
    };

    function addLabelToForm(id, curr_class, origX, origY, diff_width_ratio) {
        console.log("[addLabelToForm] id:", id, "curr_class:", curr_class, "origX:", origX, "origY:", origY, "diff_width_ratio:", diff_width_ratio, "scaledX:", origX / diff_width_ratio, "scaledY:", origY / diff_width_ratio);
        $('#dynamic_form').append(
            '<input class="labels label-' + id + ' label-id" type="hidden" name="LabelingID" value="' + id + '">' +
            '<input class="labels label-' + id + ' label-c" type="hidden" name="CName" value="' + curr_class + '">' +
            '<input class="labels label-' + id + ' label-x" type="hidden" name="X" value="' + (origX / diff_width_ratio) + '">' +
            '<input class="labels label-' + id + ' label-y" type="hidden" name="Y" value="' + (origY / diff_width_ratio) + '">' +
            '<input class="labels label-' + id + ' label-w" type="hidden" name="W" value="0">' +
            '<input class="labels label-' + id + ' label-h" type="hidden" name="H" value="0">'
        );
    }

    ShapeDrawer.prototype.isEnable = function() {
        return this.isDrawing;
    };

    ShapeDrawer.prototype.enable = function() {
        this.isDrawing = true;
    };

    ShapeDrawer.prototype.disable = function() {
        this.isDrawing = false;
    };

    ShapeDrawer.prototype.onMouseWheel = function(o) {
        var delta = o.e.deltaY;
        var pointer = canvas.getPointer(o.e);
        var zoom = canvas.getZoom();
        zoom *= 0.999 ** delta;
        if (zoom > 20) zoom = 20;
        if (zoom < 1) zoom = 1;

        canvas.zoomToPoint({ x: o.e.offsetX, y: o.e.offsetY }, zoom);
        canvas.forEachObject(function(obj) {
            if (obj.class != 'text') {
                obj.set('strokeWidth', 2 / zoom);
            }
        });
        o.e.preventDefault();
        o.e.stopPropagation();
        var vpt = this.canvas.viewportTransform;

        if (zoom < 1) {
            vpt[4] = new_width * zoom;
            vpt[5] = new_height * zoom;
        } else {
            if (vpt[4] >= 0) {
                vpt[4] = 0;
            } else if (vpt[4] < canvas.getWidth() - new_width * zoom) {
                vpt[4] = canvas.getWidth() - new_width * zoom;
            }
            if (vpt[5] >= 0) {
                vpt[5] = 0;
            } else if (vpt[5] < canvas.getHeight() - new_height * zoom) {
                vpt[5] = canvas.getHeight() - new_height * zoom;
            }
        }
    };

    return ShapeDrawer;
})();


var SegmentationStrategy = {
    minPoints: 3,

    createShape: function(id, pointer, curr_class, allClasses, canvas) {


        var points = [];

        var point = new fabric.Circle({
            id: id + '_point_0',
            polygonId: id,
            radius: 2,
            fill: '#ffffff',
            stroke: '#000000',
            strokeWidth: 2 / canvas.getZoom(),
            left: pointer.x,
            top: pointer.y,
            selectable: false,
            hasBorders: false,
            hasControls: false,
            originX: 'center',
            originY: 'center',
            hoverCursor: 'pointer',
            excludeFromExport: true
        });

        points.push({ x: pointer.x, y: pointer.y, marker: point });

        if (canvas) {
            canvas.add(point);
        }

        var polygon = new fabric.Polygon([
            { x: pointer.x, y: pointer.y },
            { x: pointer.x, y: pointer.y }
        ], {
            id: id,
            left: pointer.x,
            top: pointer.y,
            originX: 'left',
            originY: 'top',
            fill: 'transparent',
            stroke: '#000000',
            strokeWidth: 2 / canvas.getZoom(),
            selectable: false,
            hasBorders: false,
            hasControls: false,
            objectCaching: false,
            class: curr_class,
            classId: allClasses.indexOf(curr_class) + 1,
            isTemporaryRect: true,
            segmentationPoints: points,
            pointMarkers: [point]
        });


        return polygon;
    },

    updateShape: function(shape, origX, origY, pointer, canvas) {
        if (!shape || !shape.isTemporaryRect) return;

        var x = Math.max(0, Math.min(pointer.x, canvas.getWidth()));
        var y = Math.max(0, Math.min(pointer.y, canvas.getHeight()));

        var pts = shape.points.slice();
        pts[pts.length - 1] = { x: x, y: y };

        shape.set({ points: pts });
        shape.setCoords();
    },

    addPoint: function(shape, pointer, canvas) {

        if (!shape || !shape.isTemporaryRect) {
            return shape;
        }

        var id = shape.id;
        var curr_class = shape.class;

        var points = shape.segmentationPoints || [];

        var x = Math.max(0, Math.min(pointer.x, canvas.getWidth()));
        var y = Math.max(0, Math.min(pointer.y, canvas.getHeight()));

        // Check if clicking near first point to close polygon
        if (points.length >= this.minPoints) {
            var firstPoint = points[0];
            var distance = Math.sqrt(
                Math.pow(x - firstPoint.x, 2) +
                Math.pow(y - firstPoint.y, 2)
            );


            if (distance < 5) {
                return this.finalizeShape(shape, canvas);
            }
        }

        // Create point marker
        var pointMarker = new fabric.Circle({
            id: id + '_point_' + points.length,
            polygonId: id,
            radius: 2,
            fill: '#ffffff',
            stroke: '#000000',
            strokeWidth: 2 / canvas.getZoom(),
            left: x,
            top: y,
            selectable: false,
            hasBorders: false,
            hasControls: false,
            originX: 'center',
            originY: 'center',
            hoverCursor: 'pointer',
            excludeFromExport: true
        });


        points.push({ x: x, y: y, marker: pointMarker });

        canvas.add(pointMarker);

        // Update polygon points
        var pts = shape.points.slice();
        pts[pts.length - 1] = { x: x, y: y };
        pts.push({ x: x, y: y }); // Add new preview point

        shape.set({
            points: pts,
            segmentationPoints: points
        });

        shape.setCoords();
        canvas.renderAll();

        return shape;
    },

    finalizeShape: function(shape, canvas) {

        if (!shape || !shape.isTemporaryRect) {
            return shape;
        }

        var points = shape.segmentationPoints || [];

        for (var l = 0; l < points.length; l++) {
            console.log(`Point ${l} x: ${points[l].x} y: ${points[l].y}`);
        }

        var pts = shape.points.slice(0, -1);

        // Calculate bounding box
        var minX = Math.min.apply(Math, pts.map(function(p) { return p.x; }));
        var maxX = Math.max.apply(Math, pts.map(function(p) { return p.x; }));
        var minY = Math.min.apply(Math, pts.map(function(p) { return p.y; }));
        var maxY = Math.max.apply(Math, pts.map(function(p) { return p.y; }));

        var width = maxX - minX;
        var height = maxY - minY;

        var normalizedPoints = pts.map(function(p) {
            return { x: p.x - minX, y: p.y - minY };
        });

        for (var i = 0; i < normalizedPoints.length; i++) {
            console.log(`[finalizeShape] normalizedPoints x:${normalizedPoints[i].x} y:${normalizedPoints[i].y}`);
        }
        console.log(`Left: ${minX}`);
        console.log(`Top: ${minY}`);
        var finalPolygon = new fabric.Polygon(normalizedPoints, {
            id: shape.id,
            left: minX,
            top: minY,
            originX: 'left',
            originY: 'top',
            width: width,
            height: height,
            fill: 'transparent',
            stroke: shape.stroke,
            strokeWidth: 2 / canvas.getZoom(),
            selectable: true,
            hasBorders: false,
            hasControls: false,
            objectCaching: false,
            class: shape.class,
            classId: shape.classId,
            segmentationComplete: true,
            segmentationPoints: points
        });


        points.forEach(function(pt) {
            if (pt.marker) {
                canvas.remove(pt.marker);
            }
        });

        canvas.remove(shape);
        canvas.add(finalPolygon);
        canvas.setActiveObject(finalPolygon);

        var xPoints = [];
        var yPoints = [];

        for (var i = 0; i < shape.segmentationPoints.length; i++) {
            xPoints[i] = shape.segmentationPoints[i].x;
            yPoints[i] = shape.segmentationPoints[i].y;
        }

        $('#dynamic_form').append(
            '<input class="labels label-' + shape.id + ' label-id" type="hidden" name="LabelingID" value="' + shape.id + '">' +
            '<input class="labels label-' + shape.id + ' label-c" type="hidden" name="CName" value="' + curr_class + '">' +
            '<input class="labels label-' + shape.id + ' label-x" type="hidden" name="X" value="' + (xPoints) + '">' +
            '<input class="labels label-' + shape.id + ' label-y" type="hidden" name="Y" value="' + (yPoints) + '">' +
            '<input class="labels label-' + shape.id + ' label-w" type="hidden" name="W" value="' + 0 + '">' +
            '<input class="labels label-' + shape.id + ' label-h" type="hidden" name="H" value="' + 0 + '">'
        );

        canvas.renderAll();
        return finalPolygon;
    },

    cancelDrawing: function(canvas, shape) {

        if (!shape) {
            return;
        }
        var points = shape.segmentationPoints || [];

        points.forEach(function(pt) {
            if (pt.marker) {
                canvas.remove(pt.marker);
            }
        });

        if (canvas.contains(shape)) {
            canvas.remove(shape);
        }

        canvas.renderAll();
    }
};

// Rectangle Strategy
var RectangleStrategy = {
    createShape: function(id, pointer, curr_class, allClasses) {
        return new fabric.Rect({
            id: id,
            left: pointer.x,
            top: pointer.y,
            originX: 'left',
            originY: 'top',
            width: 0,
            height: 0,
            angle: 0,
            transparentCorners: false,
            hasBorders: false,
            hasControls: false,
            selectable: true,
            class: curr_class,
            classId: allClasses.indexOf(curr_class) + 1
        });
    },

    updateShape: function(shape, origX, origY, pointer, canvas) {
        var left_x = Math.min(origX, Math.max(pointer.x, 0));
        var top_y = Math.min(origY, Math.max(pointer.y, 0));
        var right_x = Math.max(origX, Math.min(pointer.x, canvas.getWidth() - 5));
        var bottom_y = Math.max(origY, Math.min(pointer.y, canvas.getHeight() - 5));

        shape.set({
            left: left_x,
            top: top_y,
            width: Math.abs(left_x - right_x),
            height: Math.abs(top_y - bottom_y)
        });
        shape.setCoords();
    }
};

// create main canvas
var canvas = new fabric.Canvas('canvas', {
    selection: false
});

//set available shapes
console.log("Initializing segmentation strategy");
var shapetool = new ShapeDrawer(canvas, RectangleStrategy);

// // Swap tool button
$("#swap-tool").click(function() {

    if (shapetool.shapeStrategy === RectangleStrategy) {
        shapetool.shapeStrategy = SegmentationStrategy;
    } else {
        shapetool.shapeStrategy = RectangleStrategy;
    }
});

// set cursor when hover over canvas to cross
canvas.hoverCursor = 'crosshair';

// crosshair lines

var verticalLine = new fabric.Line([0, 0, 0, canvas.height], {
    selectable: false,
    evented: false
});

var horizontalLine = new fabric.Line([0, 0, canvas.width, 0], {
    selectable: false,
    evented: false
});

canvas.add(verticalLine);
canvas.add(horizontalLine);

canvas.on('mouse:move', function(options) {
    var pointer = canvas.getPointer(options.e);
    var classColor = classes[allClasses.indexOf(curr_class)].style.backgroundColor;

    verticalLine.set({
        x1: pointer.x,
        x2: pointer.x,
        y1: 0,
        y2: canvas.height,
        stroke: classColor
    });

    horizontalLine.set({
        x1: 0,
        x2: canvas.width,
        y1: pointer.y,
        y2: pointer.y,
        stroke: classColor
    });
    canvas.renderAll();

});

// get labels counter and list of labels
var counter = parseInt($('#labels-counter').val()),
    list_labels = $('.labels');

// Define the URL where your background image is located
var imageUrl = $("#image_path").val(),
    scaleFactor = parseFloat($("#image_ratio").val());

// set the height of the canvas to 75% of the window size originally
var origin_height = parseFloat($("#origin_image_height").val()),
    origin_width = parseFloat($("#origin_image_width").val());

function getCanvasDimensions() {
    var nh = $(window).height() * .75;
    var nw = nh / scaleFactor;
    var r = nw / origin_width;

    // set the width of the canvas to 93% of window size for ultrawide aspect ratio
    if (nw > $(window).width()) {
        nw = $(window).width() * .95;
        nh = nw * scaleFactor;
        r = nw / origin_width;
    }
    return { width: nw, height: nh, ratio: r };
}

var dims = getCanvasDimensions();
var new_width = dims.width,
    new_height = dims.height,
    diff_width_ratio = dims.ratio;


$("#image_width").val(new_width);
$("#image_height").val(new_height);

canvas.setWidth(new_width);
canvas.setHeight(new_height);

// set background
canvas.setBackgroundImage(imageUrl, canvas.renderAll.bind(canvas), {
    width: canvas.getWidth(),
    height: canvas.getHeight()
});
canvas.calcOffset();

//Converting from .tiff to image
if (imageUrl.includes(".tiff") || imageUrl.includes(".tif") || imageUrl.includes(".SCN")) {
    Tiff.initialize({ TOTAL_MEMORY: 16777216 * 10 });
    var xhr = new XMLHttpRequest();
    xhr.responseType = 'arraybuffer';
    xhr.open('GET', imageUrl);
    xhr.onload = function(e) {
        //console.log(xhr.response)
        var tiff = new Tiff({ buffer: xhr.response });
        canvas.setBackgroundImage(tiff.toDataURL(), canvas.renderAll.bind(canvas), {
            width: canvas.getWidth(),
            height: canvas.getHeight()
        });
        canvas.calcOffset();
    };
    xhr.send();
}

// TODO: reize rectangles when canvas is resized
function resizeRectangles(diff_width_ratio) {
    console.log("[resizeRectangles] diff_width_ratio:", diff_width_ratio);
    for (var i = 0; i < canvas.getObjects().length; i++) {
        var obj = canvas.item(i);
        if (!obj || !obj.id) continue;
        if (obj.get("type") !== 'rect') continue;

        obj.lockMovementX = false;
        obj.lockMovementY = false;

        var inputX = $(".label-" + obj.id + ".label-x").val();
        var inputY = $(".label-" + obj.id + ".label-y").val();
        var inputW = $(".label-" + obj.id + ".label-w").val();
        var inputH = $(".label-" + obj.id + ".label-h").val();
        console.log("[resizeRectangles] obj.id:", obj.id, "inputX:", inputX, "inputY:", inputY, "inputW:", inputW, "inputH:", inputH, "newLeft:", parseFloat(inputX) * diff_width_ratio, "newWidth:", parseFloat(inputW) * diff_width_ratio);

        obj.set({
            left: parseFloat(inputX) * diff_width_ratio,
            top: parseFloat(inputY) * diff_width_ratio,
            width: parseFloat(inputW) * diff_width_ratio,
            height: parseFloat(inputH) * diff_width_ratio
        });

        obj.lockMovementX = true;
        obj.lockMovementY = true;

        // find text label associated with this rect and update its position
        var textObj = canvas.getObjects().find(o => o.get("type") === 'text' && o.id === obj.id);
        if (textObj) {
            textObj.set({
                width: obj.width,
                top: (obj.top + (obj.height / 2)) - (textObj.height / 2),
                left: (obj.left + obj.width / 2) - (textObj.width / 2)
            });
        }
    }
}
classes[allClasses.indexOf(curr_class)].style.backgroundColor;
// draw all rectangles that came from the database
for (var i = 0; i < list_labels.length; i += 6) {
    var labelId = list_labels[i].value;
    var className = list_labels[i + 1].value;

    var xVal = list_labels[i + 2].value;
    var yVal = list_labels[i + 3].value;

    var wVal = list_labels[i + 4].value;
    var hVal = list_labels[i + 5].value;

    console.log("[redraw loop] labelId:", labelId, "className:", className, "xVal:", xVal, "yVal:", yVal, "wVal:", wVal, "hVal:", hVal, "diff_width_ratio:", diff_width_ratio);

    if (!xVal.includes(",") && !yVal.includes(",")) { //This is a rectangle
        console.log("[redraw] Rectangle:", labelId, "left:", parseFloat(xVal) * diff_width_ratio, "width:", parseFloat(wVal) * diff_width_ratio);
        var rect = new fabric.Rect({
            id: labelId,

            stroke: classes[allClasses.indexOf(className)].style.backgroundColor,
            strokeWidth: 2 / canvas.getZoom(),
            fill: "transparent",

            left: parseFloat(xVal) * diff_width_ratio,
            top: parseFloat(yVal) * diff_width_ratio,

            originX: 'left',
            originY: 'top',

            width: parseFloat(wVal) * diff_width_ratio,
            height: parseFloat(hVal) * diff_width_ratio,

            angle: 0,
            transparentCorners: false,
            hasBorders: false,
            hasControls: false,
            selectable: true,
            class: list_labels[i + 1].value,
            classId: allClasses.indexOf(className) + 1
        });
        rect.lockMovementX = true,
            rect.lockMovementY = true;


        canvas.add(rect);
    } else { //This is a polygon
        console.log("[redraw] Attempting to load polygon", labelId);
        var xCoords = xVal.split(',');
        var yCoords = yVal.split(',');

        // Create points array for fabric.Polygon
        var points = [];
        for (var j = 0; j < xCoords.length; j++) {
            points.push({ x: parseFloat(xCoords[j]), y: parseFloat(yCoords[j]) });
        }

        // Calculate bounding box for the polygon
        var minX = Math.min(...xCoords);
        var maxX = Math.max(...xCoords);
        var minY = Math.min(...yCoords);
        var maxY = Math.max(...yCoords);


        // Normalize points relative to bounding box
        var normalizedPoints = points.map(function(p) {
            return { x: p.x - minX, y: p.y - minY };
        });

        var polygon = new fabric.Polygon(normalizedPoints, {
            id: labelId,
            left: minX,
            top: minY,

            originX: 'left',
            originY: 'top',

            fill: 'transparent',
            stroke: classes[allClasses.indexOf(className)].style.backgroundColor,
            strokeWidth: 2 / canvas.getZoom(),

            selectable: true,
            hasBorders: false,
            hasControls: false,
            objectCaching: false,

            class: className,
            classId: allClasses.indexOf(className) + 1,
            segmentationComplete: true
        });

        polygon.lockMovementX = true;
        polygon.lockMovementY = true;

        canvas.add(polygon);
        canvas.renderAll();
    }
    canvas.renderAll();

}
canvas.renderAll();

// change review status
function reviewStatus() {
    console.log("reviewStatus");
    //console.log("before edit")
    //console.log($('#rev_image').val());
    if ($('#rev_image').val() == 0) {
        $('#rev_image').val(1);
        //console.log("after edit:");
        //console.log($('#rev_image').val());
        document.getElementById("Review").style.backgroundColor = "red";
        $("#form-save").trigger('click');
    }
    else {
        $('#rev_image').val(0);
        //console.log("after edit:");
        //console.log($('#rev_image').val());
        document.getElementById("Review").style.backgroundColor = "white";
        $("#form-save").trigger('click');
    }
}
$(".rev-button").click(reviewStatus);

// selection of class action
$(".class-selection").click(function() {
    $(".class-selection:eq(" + allClasses.indexOf(curr_class) + ")").removeClass("selected-class");
    // curr_class = parseInt($(this).text().split(":")[0]) - 1;
    curr_class = allClasses[parseInt($(this).text().split(":")[0]) - 1];
    $(this).addClass("selected-class");
    // pass current class to other pages when labeling
    $('.pass-class').each(function(event) {
        var url = $(this).attr('href');
        url = updateURLParameter(url, 'curr_class', curr_class)
        $(this).attr("href", url);
    });

    // update current class in form so when saved the class will be presented the same
    $("#curr_class").val(curr_class);

});

// delete a rect
function deleteObjects() {
    var activeObject = canvas.getActiveObject(),
        activeGroup = canvas.getActiveGroup();
    if (activeObject) {
        // if (confirm('Are you sure?')) {

        $(".label-" + activeObject.id).remove();
        canvas.remove(activeObject);
        for (var i = 0; i < canvas.getObjects().length; i++) {
            if (canvas.item(i).get("type") === 'text') {
                canvas.remove(canvas.item(i));
            }
        }
        counter -= 1;
        $('#labels-counter').val(counter);

        // }
    }
    else if (activeGroup) {
        if (confirm('Are you sure?')) {
            var objectsInGroup = activeGroup.getObjects();
            canvas.discardActiveGroup();
            objectsInGroup.forEach(function(object) {
                canvas.remove(object);
                counter -= 1;
                $('#labels-counter').val(counter);
            });
        }
    }
}

// reset labels action
function resetLabels() {
    if (confirm('Do you want to remove all the labels?')) {
        counter = 0;
        $('#labels-counter').val(counter);
        $(".labels").remove();
        canvas.clear();
        canvas.setBackgroundImage(imageUrl, canvas.renderAll.bind(canvas), {
            width: canvas.getWidth(),
            height: canvas.getHeight()
        });
    }
}
$("#reset-labeling").click(resetLabels);

// undo label action
function undoLabel() {
    canvas.setBackgroundImage(imageUrl, canvas.renderAll.bind(canvas), {
        width: canvas.getWidth(),
        height: canvas.getHeight()
    });
    if ($(".labels").length != 0) {
        $(".labels").last().remove();
        $(".labels").last().remove();
        $(".labels").last().remove();
        $(".labels").last().remove();
        $(".labels").last().remove();
        for (var i = 0; i < canvas.getObjects().length; i++) {
            if (canvas.item(i).id == $(".labels").last().val()) {
                canvas.item(i).remove();
                break;
            }
        }
        $(".labels").last().remove();
        counter -= 1;
        $('#labels-counter').val(counter);
    }
}
$("#undo-labeling").click(undoLabel);

// Reset Zoom
function resetZoom() {
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    canvas.forEachObject(function(obj) {
        if (obj.class != 'text') {
            obj.set('strokeWidth', 2);
        }
    });
}
$("#reset-zoom").click(resetZoom);

// cancel any partially drawn polygons
function cancelInProgressPolygon() {
    if (shapetool.isDrawing && shapetool.shapeStrategy === SegmentationStrategy
        && shapetool.currentDrawingShape) {
        var shape = shapetool.currentDrawingShape;
        // remove partial entries
        $(".label-" + shape.id).remove();
        SegmentationStrategy.cancelDrawing(canvas, shape);
        shapetool.currentDrawingShape = null;
        shapetool.disable();
        counter -= 1;
        $('#labels-counter').val(counter);
    }
}

$("#form-save").on('click', function() {
    cancelInProgressPolygon();
})

// key mapping
$(document).keydown(function(event) {

    if (event.keyCode === 27) {
        cancelInProgressPolygon();
    }

    var key = (event.keyCode ? event.keyCode : event.which) - 49;
    //console.log(key)
    if (0 <= key && key < Math.min(10, classes.length)) {
        $(".class-selection:eq(" + allClasses.indexOf(curr_class) + ")").removeClass("selected-class");
        curr_class = allClasses[parseInt(classes[key].innerHTML.split(":")[0]) - 1];
        $(".class-selection:eq(" + key + ")").addClass("selected-class");
        // pass current class to other pages when labeling
        $('.pass-class').each(function(event) {
            var url = $(this).attr('href');
            url = updateURLParameter(url, 'curr_class', curr_class)
            $(this).attr("href", url);
        });

        // update current class in form so when saved the class will be presented the same
        $("#curr_class").val(curr_class);

    }
    else if (key == 36 || key == 32) { // u or q
        undoLabel()
    }
    else if (key == 33) { // r
        resetLabels()
    }
    else if (key == 18) { //c
        reviewStatus()
    }
    else if (key == 38) { // w
        var idx = allClasses.indexOf(curr_class);
        $(".class-selection:eq(" + allClasses.indexOf(curr_class) + ")").removeClass("selected-class");
        idx += 1
        if (idx >= classes.length) {
            curr_class = allClasses[0]
            idx = 0
        }
        else {
            curr_class = allClasses[parseInt(classes[idx].innerHTML.split(":")[0]) - 1];
        }

        $(".class-selection:eq(" + idx + ")").addClass("selected-class");
        // pass current class to other pages when labeling
        $('.pass-class').each(function(event) {
            var url = $(this).attr('href');
            url = updateURLParameter(url, 'curr_class', curr_class)
            $(this).attr("href", url);
        });
        //console.log("curr_class: ", curr_class);
        // update current class in form so when saved the class will be presented the same
        $("#curr_class").val(curr_class);
        //$("#curr_class").val(curr_class);

    }
    else if (key == 28) { // m
        // navigation
        $('#menu_modal').modal('toggle');
    }
    else if (key == 34) { // s
        // save
        $("#form-save").trigger('click');
    }
    else if (key == -12 || key == 16) { // left or a
        // prev
        $("#auto-prev").trigger('click');
        $("#auto-prevV").trigger('click');
        $(location).attr('href', $("#prev").attr("href"))
    }
    else if (key == -10 || key == 19) { // right or d
        // next
        $("#auto-next").trigger('click');
        $("#auto-nextV").trigger('click');
        $(location).attr('href', $("#next").attr("href"))
    }
    else if (key == 20) { // e
        deleteObjects();
    }
    else if (key == 24) { // i
        // info
        $('#info_modal').modal('toggle');
    }
    else if (key == 41 || key == 42) { // z
        // reset zoom
        resetZoom();
    }

});

//TODO update to fix image rescale with zoom
// when window resize, rescale canvas
$(window).resize(function() {
    origin_height = $("#origin_image_height").val();
    var dims = getCanvasDimensions();
    new_width = dims.width;
    new_height = dims.height;
    diff_width_ratio = dims.ratio;

    $("#image_width").val(new_width);
    $("#image_height").val(new_height);
    canvas.setWidth(new_width);
    canvas.setHeight(new_height);
    canvas.setBackgroundImage(imageUrl, canvas.renderAll.bind(canvas), {
        width: canvas.getWidth(),
        height: canvas.getHeight()
    });
    canvas.calcOffset();
    resizeRectangles(diff_width_ratio);
    //resizeRectangles(diff_height_ratio);
});

// Force resize trigger after full window load
$(window).on('load', function() {
    $(window).trigger('resize');
});

// delete unwanted objects (simple clicks on canvas creates unwanted objects)
setInterval(function() {
    for (var i = 0; i < canvas.getObjects().length; i++) {
        var currObject = canvas.item(i);

        if (currObject.isTemporaryRect) continue;
        if (currObject.excludeFromExport || currObject.polygonId) continue;

        var height = currObject.height;
        // console.log(`Current obejct height: ${height}`);
        var width = currObject.width;
        // console.log(`Current object width ${width}`);

        if (height < 5 && width < 5 && !shapetool.isDrawing) {
            console.log(`Too short removing ${canvas.item(i)}`);
            $(".label-" + canvas.item(i).id).remove();
            canvas.remove(currObject);
            counter -= 1;

            $('#labels-counter').val(counter);
            i--;

        }
    }
}, 1000);
