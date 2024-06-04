// get url parameters

var state = 0;

function getUrlVars() {
    var vars = {};
    var parts = window.location.href.replace(/[?=&]+([^=&]+)=([^&]*)/gi, function(m,key,value) {
        vars[key] = value;
    });

    if(window.location.href.includes("/labelingV?")){
        state = 1; //labeling validation mode
    }
    else{
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
for(var i = 0; i<temp.length; i++)
{
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
function updateURLParameter(url, param, paramVal){
    var newAdditionalURL = "";
    var tempArray = url.split("?");
    var baseURL = tempArray[0];
    var additionalURL = tempArray[1];
    var temp = "";
    if (additionalURL) {
        tempArray = additionalURL.split("&");
        for (var i=0; i<tempArray.length; i++){
            if(tempArray[i].split('=')[0] != param){
                newAdditionalURL += temp + tempArray[i];
                temp = "&";
            }
        }
    }

    var rows_txt = temp + "" + param + "=" + paramVal;
    return baseURL + "?" + newAdditionalURL + rows_txt;
}

// hex to rgba
function hex2rgba(hex, o){
    var c;
    if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){
        c= hex.substring(1).split('');
        if(c.length== 3){
            c= [c[0], c[0], c[1], c[1], c[2], c[2]];
        }
        c= '0x'+c.join('');
        return 'rgba('+[(c>>16)&255, (c>>8)&255, c&255].join(',')+','+o+')';
    }
    throw new Error('Bad Hex');
}

// draw rectangles on canvas
var Rectangles = (function () {

    function Rectangles(canvas) {
        var inst = this;
        this.canvas = canvas;
        this.className = 'Rectangle';
        this.isDrawing = false;
        this.selectable = true;
        this.curr_object = -1;
        this.origin_width =
        this.bindEvents();
    }

    Rectangles.prototype.bindEvents = function () {
        var inst = this;
        inst.canvas.on('mouse:down', function (o) {
            //console.log('mouse:down')
            inst.onMouseDown(o);
        });
        inst.canvas.on('mouse:move', function (o) {
            //console.log('mouse:move')
            inst.onMouseMove(o);
        });
        inst.canvas.on('mouse:up', function (o) {
            //console.log('mouse:up')
            inst.onMouseUp(o);
        });
        inst.canvas.on('object:moving', function (o) {
            //console.log('object:moving')
            inst.disable();
        });
        inst.canvas.on('mouse:hover', function (o) {
            //console.log('mouse:hover')
        })
        inst.canvas.on('mouse:wheel', function (o) {
            //console.log('mouse:wheel')
            inst.onMouseWheel(o);
        })
    }
    Rectangles.prototype.onMouseUp = function (o) {
        var inst = this;
        //console.log(inst.canvas.getActiveObject())
        if(inst.canvas.getActiveObject() != null) {
            if ($(".label-"+inst.canvas.getActiveObject().id).length == 6){
                // Do something if class does exist
            } else {
                // Do something if class does not exist
                var w = inst.canvas.getActiveObject().width;
                var h = inst.canvas.getActiveObject().height;
                
                $('#dynamic_form').append(
                    '<input class="labels label-'+inst.canvas.getActiveObject().id+' label-w" type="hidden" name="W" value="' + (w/diff_width_ratio) + '">' +
                    '<input class="labels label-'+inst.canvas.getActiveObject().id+' label-h" type="hidden" name="H" value="' + (h/diff_width_ratio) + '">'
                );
                // $('#dynamic_form').append(
                //     '<input class="labels label-'+inst.canvas.getActiveObject().id+' label-w" type="hidden" name="W" value="' + (w/diff_height_ratio) + '">' +
                //     '<input class="labels label-'+inst.canvas.getActiveObject().id+' label-h" type="hidden" name="H" value="' + (h/diff_height_ratio) + '">'
                // );

                inst.canvas.getActiveObject().lockMovementX = true;
                inst.canvas.getActiveObject().lockMovementY = true;
            }
        }
        inst.disable();
    };

    Rectangles.prototype.onMouseMove = function (o) {
        var inst = this;
        if (!inst.isEnable()) { return; }
        if(inst.canvas.getActiveObject() != null) {
            var pointer = inst.canvas.getPointer(o.e);
            var activeObj = inst.canvas.getActiveObject();
			//console.log(activeObj);
			//console.log(classNames);
			// activeObj.stroke = classes[curr_class].style.backgroundColor;
			activeObj.stroke = classes[allClasses.indexOf(curr_class)].style.backgroundColor;
			// activeObj.stroke = classNames[0].style.backgroundColor;
            activeObj.strokeWidth = 2;
            activeObj.fill = activeObj.stroke.replace(')', ', 0.33)').replace('rgb', 'rgba');

            left_x = Math.min(origX, Math.max(pointer.x, 0))
            top_y = Math.min(origY, Math.max(pointer.y, 0))
            right_x = Math.max(origX, Math.min(pointer.x, canvas.getWidth()-5))
            bottom_y = Math.max(origY, Math.min(pointer.y, canvas.getHeight()-5))

            activeObj.set({ left: left_x });
            activeObj.set({ top: top_y });

            activeObj.set({ width: Math.abs(left_x - right_x) });
            activeObj.set({ height: Math.abs(top_y - bottom_y) });
            
            $(".label-"+inst.canvas.getActiveObject().id+".label-x").val(left_x/diff_width_ratio);
            $(".label-"+inst.canvas.getActiveObject().id+".label-y").val(top_y/diff_width_ratio);
            // $(".label-"+inst.canvas.getActiveObject().id+".label-x").val(left_x/diff_height_ratio);
            // $(".label-"+inst.canvas.getActiveObject().id+".label-y").val(top_y/diff_height_ratio);

            activeObj.setCoords();
            inst.canvas.renderAll();
        }
    };

    Rectangles.prototype.onMouseDown = function (o) {
        var inst = this;
        // Distinguish between two modes (drawing and resizing)
        if (!this.isDrawing) {
            if (o.target == null) {
                if(this.curr_object != -1) {
                    console.log("HERE");
                    for (var i = 0; i < canvas.getObjects().length; i++) {
						console.log(canvas.item(i));
                        if (canvas.item(i).id == this.curr_object) {
							console.log("Is the current object: ", canvas.item(i));
                            canvas.item(i).set({ fill: 'transparent' });
                            // break;
                        }
						if (canvas.item(i).get("type") === 'text')
						{
                            console.log("REMOVE", canvas.item(i));
							canvas.remove(canvas.item(i));
						}
                    }
                }
                inst.enable();
                var pointer = inst.canvas.getPointer(o.e);
                origX = pointer.x;
                origY = pointer.y;
                var w = pointer.x - origX;
                var h = pointer.y - origY;
                var id =  Math.floor(Math.random() * (1000000000 - 100000)) + 100000;
                var rect = new fabric.Rect({
                    id: id,
                    left: origX,
                    top: origY,
                    originX: 'left',
                    originY: 'top',
                    width: pointer.x - origX,
                    height: pointer.y - origY,
                    angle: 0,
                    transparentCorners: false,
                    hasBorders: false,
                    hasControls: false,
                    selectable: true,
                    modified: false,
                    class: curr_class,
					classId: allClasses.indexOf(curr_class) + 1
                });
                counter += 1;
                $('#dynamic_form').append(
                    '<input class="labels label-'+id+' label-id" type="hidden" name="LabelingID" value="' + id + '">' +
                    '<input class="labels label-'+id+' label-c" type="hidden" name="CName" value="' + curr_class + '">' +
                    '<input class="labels label-'+id+' label-x" type="hidden" name="X" value="' + (origX/diff_width_ratio) + '">' +
                    '<input class="labels label-'+id+' label-y" type="hidden" name="Y" value="' + (origY/diff_width_ratio) + '">'
                );
                // $('#dynamic_form').append(
                //     '<input class="labels label-'+id+' label-id" type="hidden" name="LabelingID" value="' + id + '">' +
                //     '<input class="labels label-'+id+' label-c" type="hidden" name="CStaticID" value="' + curr_class + '">' +
                //     '<input class="labels label-'+id+' label-x" type="hidden" name="X" value="' + (origX/diff_height_ratio) + '">' +
                //     '<input class="labels label-'+id+' label-y" type="hidden" name="Y" value="' + (origY/diff_height_ratio) + '">'
                // );
                $('#labels-counter').val(counter);
                this.curr_object = id;
                inst.canvas.add(rect).setActiveObject(rect);
            } else {
                if(this.curr_object != -1) {
                    for (var i = 0; i < canvas.getObjects().length; i++) {
                        if (canvas.item(i).id == this.curr_object) {
                            canvas.item(i).set({ fill: 'transparent' });
                            //break;
                        }
						if (canvas.item(i).get("type") === 'text')
						{
							canvas.remove(canvas.item(i));
						}
                    }
                }
                this.curr_object = o.target.id;
				// console.log(o.target)
                o.target.set({ fill: o.target.stroke.replace(')', ', 0.33)').replace('rgb', 'rgba')});
				
				//Display class in rect
                if(state == 1){
                    var text = new fabric.Text(String(o.target.class) + " (" + String(o.target.id) +  ")", {
                        id: o.target.id,
                        selectable: false,
                        textAlign: 'center',
                        backgroundColor: "white",
                        // fontSize: 90,
                    });
                }
                else{
                    var text = new fabric.Text(String(o.target.class), {
                        id: o.target.id,
                        selectable: false,
                        textAlign: 'center',
                        backgroundColor: "white",
                        // fontSize: 90,
                    });
                }

				while (((text.height > o.target.height) || (text.width > o.target.width)) && text.fontSize > 18) {
					text.set("fontSize", text.fontSize-1);
				}
				text.set("width", o.target.width);
				text.set("top", (o.target.top + (o.target.height / 2)) - (text.height / 2));
				text.set("left", (o.target.left + o.target.width / 2) - (text.width / 2));

				// text.set("top", o.target.top);
				// text.set("left", o.target.left);

				text.lockMovementX = true,
				text.lockMovementY = true;
			
				inst.canvas.add(text)

                //add labelID for each image
                // while (((idText.height > o.target.height) || (idText.width > o.target.width)) && idText.fontSize > 18) {
				// 	idText.set("fontSize", idText.fontSize-1);
				// }
				// idText.set("width", o.target.width / 2);
				// idText.set("top", (o.target.top + (o.target.height)) - (idText.height));
				// idText.set("left", (o.target.left + o.target.width) - (text.width / 2));

				// idText.lockMovementX = true,
				// idText.lockMovementY = true;
			
				// inst.canvas.add(idText)
            }
        }
    };
    Rectangles.prototype.isEnable = function () {
        return this.isDrawing;
    }
    Rectangles.prototype.enable = function () {
        this.isDrawing = true;
    }
    Rectangles.prototype.disable = function () {
        this.isDrawing = false;
    }
    Rectangles.prototype.onMouseWheel = function (o) {
        var delta = o.e.deltaY;
        var pointer = canvas.getPointer(o.e);
        var zoom = canvas.getZoom();
        //zoom = zoom + delta/200;
        zoom *= 0.999 ** delta;
        if (zoom > 20) zoom = 20;
        if (zoom < 1) zoom = 1;
        //console.log(zoom)
        //TODO
        //http://fabricjs.com/fabric-intro-part-5
        canvas.zoomToPoint({ x: o.e.offsetX, y: o.e.offsetY }, zoom);
        o.e.preventDefault();
        o.e.stopPropagation();
        var vpt = this.canvas.viewportTransform;
        //console.log("zoom: ", zoom);
        //console.log("vpt[4]: ",vpt[4]);
        //console.log("vpt[5]: ",vpt[5]);
        
        if (zoom < 1)
        {
            //console.log("zoom < 1");
            vpt[4] = new_width * zoom;
            vpt[5] = new_height * zoom;
        } 
        else 
        {
            //console.log("else");
            if (vpt[4] >= 0)
            {
                //console.log("vpt[4] >= 0");
                vpt[4] = 0;
                //vpt[4] = canvas.getWidth() - new_width * zoom;
                //console.log("vpt[4]: ", vpt[4]);
            }
            else if (vpt[4] < canvas.getWidth() - new_width * zoom)
            {
                vpt[4] = canvas.getWidth() - new_width * zoom;
                //vpt[4] = 0;
            }
            if (vpt[5] >= 0)
            {
                vpt[5] = 0;
                //vpt[5] = canvas.getHeight() - new_height * zoom;
            }
            else if (vpt[5] < canvas.getHeight() - new_height * zoom)
            {
                //vpt[5] = 0;
                vpt[5] = canvas.getHeight() - new_height * zoom;
            }
        }
        //console.log("vpt[4]: ",vpt[4]);
        //console.log("vpt[5]: ",vpt[5]);
    };
    return Rectangles;
}());

// create main canvas
var canvas = new fabric.Canvas('canvas', {
        selection: false
    }),
    rects = new Rectangles(canvas);

// set cursor when hover over canvas to cross
canvas.hoverCursor = 'crosshair';

// get labels counter and list of labels
var counter = parseInt($('#labels-counter').val()),
    list_labels = $('.labels');

// Define the URL where your background image is located
var imageUrl = $("#image_path").val(),
    scaleFactor = $("#image_ratio").val();

// set the height of the canvas to 75% of the window size originally
var origin_height = $("#origin_image_height").val(),
    origin_width = $("#origin_image_width").val(),
    new_height = $(window).height() * .75,
    new_width = new_height / scaleFactor,
    diff_width_ratio = new_width / origin_width;

// set the width of the canvas to 93% of window size for ultrawide aspect ratio
if(new_width > $(window).width()){
    new_width = $(window).width() * .95,
    new_height = new_width * scaleFactor,
    diff_width_ratio = new_width / origin_width;
}

$("#image_width").val(new_width);
$("#image_height").val(new_height);

canvas.setWidth(new_width);
canvas.setHeight(new_height);

// set background
canvas.setBackgroundImage(imageUrl, canvas.renderAll.bind(canvas), {
    width: $("#canvas").width(),
    height: $("#canvas").height()
});
canvas.calcOffset();

//Converting from .tiff to image
if(imageUrl.includes(".tiff") || imageUrl.includes(".tif") || imageUrl.includes(".SCN")){
    Tiff.initialize({TOTAL_MEMORY: 16777216 * 10});
    var xhr = new XMLHttpRequest();
    xhr.responseType = 'arraybuffer';
    xhr.open('GET', imageUrl);
    xhr.onload = function (e) {
        //console.log(xhr.response)
        var tiff = new Tiff({buffer: xhr.response});
        canvas.setBackgroundImage(tiff.toDataURL(), canvas.renderAll.bind(canvas), {
            width: $("#canvas").width(),
            height: $("#canvas").height()
        });
        canvas.calcOffset();
    };
    xhr.send();
}

// TODO: reize rectangles when canvas is resized
function resizeRectangles(diff_width_ratio){
    //console.log(canvas.getObjects());
    for (var i = 0; i < canvas.getObjects().length; i++) {
        canvas.item(i).lockMovementX = false;
        canvas.item(i).lockMovementY = false;
        canvas.item(i).set({
            left: $(".label-"+canvas.item(i).id+".label-x").val() * diff_width_ratio,
            top: $(".label-"+canvas.item(i).id+".label-y").val() * diff_width_ratio,
            width: $(".label-"+canvas.item(i).id+".label-w").val() * diff_width_ratio,
            height: $(".label-"+canvas.item(i).id+".label-h").val() * diff_width_ratio
        })
        // canvas.item(i).set({
        //     left: $(".label-"+canvas.item(i).id+".label-x").val() * diff_height_ratio,
        //     top: $(".label-"+canvas.item(i).id+".label-y").val() * diff_height_ratio,
        //     width: $(".label-"+canvas.item(i).id+".label-w").val() * diff_height_ratio,
        //     height: $(".label-"+canvas.item(i).id+".label-h").val() * diff_height_ratio
        // })
        text.set("top", o.target.top + o.target.height / 2.5);
        text.set("left", o.target.left + o.target.width / 2.2);

        canvas.item(i).lockMovementX = true;
        canvas.item(i).lockMovementY = true;
        
    }
}
classes[allClasses.indexOf(curr_class)].style.backgroundColor;
// draw all rectangles that came from the database
for (var i = 0; i < list_labels.length; i += 6) {
	console.log("list_labels[i+1]: ", list_labels[i + 1].value);
    var rect = new fabric.Rect({
        id: list_labels[i].value,
        stroke: classes[allClasses.indexOf(list_labels[i + 1].value)].style.backgroundColor,
        strokeWidth: 2,
        fill: "transparent",
        left: parseInt(list_labels[i + 2].value) * diff_width_ratio,
        top: parseInt(list_labels[i + 3].value) * diff_width_ratio,
        originX: 'left',
        originY: 'top',
        width: parseInt(list_labels[i + 4].value) * diff_width_ratio,
        height: parseInt(list_labels[i + 5].value) * diff_width_ratio,
        angle: 0,
        transparentCorners: false,
        hasBorders: false,
        hasControls: false,
        selectable: true,
		class: list_labels[i + 1].value,
		classId: allClasses.indexOf(list_labels[i + 1].value) + 1
        // class: parseInt(list_labels[i + 1].value)
    });
    // var rect = new fabric.Rect({
    //     id: list_labels[i].value,
    //     stroke: classes[parseInt(list_labels[i + 1].value)].style.backgroundColor,
    //     strokeWidth: 1,
    //     fill: "transparent",
    //     left: parseInt(list_labels[i + 2].value) * diff_height_ratio,
    //     top: parseInt(list_labels[i + 3].value) * diff_width_ratio,
    //     originX: 'left',
    //     originY: 'top',
    //     width: parseInt(list_labels[i + 4].value) * diff_height_ratio,
    //     height: parseInt(list_labels[i + 5].value) * diff_height_ratio,
    //     angle: 0,
    //     transparentCorners: false,
    //     hasBorders: false,
    //     hasControls: false,
    //     selectable: true,
    //     class: parseInt(list_labels[i + 1].value)
    // });
    rect.lockMovementX = true,
    rect.lockMovementY = true;

	// var text = new fabric.Text(list_labels[i + 1].value, {});
	// text.set("top", parseInt(list_labels[i + 3].value) * diff_width_ratio);
	// text.set("left", parseInt(list_labels[i + 2].value) * diff_width_ratio);

	// var group = new fabric.Group([rect, text])
	// canvas.add(group)
    canvas.add(rect);
    canvas.renderAll();

}
canvas.renderAll();

// change review status
function reviewStatus(){
    console.log("reviewStatus");
    //console.log("before edit")
    //console.log($('#rev_image').val());
    if($('#rev_image').val() == 0){
        $('#rev_image').val(1);
        //console.log("after edit:");
        //console.log($('#rev_image').val());
        document.getElementById("Review").style.backgroundColor = "red";
        $("#form-save").trigger('click');
    }
    else{
        $('#rev_image').val(0);
        //console.log("after edit:");
        //console.log($('#rev_image').val());
        document.getElementById("Review").style.backgroundColor = "white";
        $("#form-save").trigger('click');
    }
}
$(".rev-button").click(reviewStatus);

// selection of class action
$(".class-selection").click(function () {
    $(".class-selection:eq("+allClasses.indexOf(curr_class)+")").removeClass("selected-class");
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
        if (confirm('Are you sure?')) {
			
            $(".label-"+activeObject.id).remove();
            canvas.remove(activeObject);
            for (var i = 0; i < canvas.getObjects().length; i++) {
                if (canvas.item(i).get("type") === 'text')
                {
                    canvas.remove(canvas.item(i));
                }
            }
            counter -= 1;
            $('#labels-counter').val(counter);
        }
    }
    else if (activeGroup) {
        if (confirm('Are you sure?')) {
            var objectsInGroup = activeGroup.getObjects();
            canvas.discardActiveGroup();
            objectsInGroup.forEach(function (object) {
                canvas.remove(object);
                counter -= 1;
                $('#labels-counter').val(counter);
            });
        }
    }
}

// reset labels action
function resetLabels(){
    if (confirm('Do you want to remove all the labels?')) {
        counter = 0;
        $('#labels-counter').val(counter);
        $( ".labels" ).remove();
        canvas.clear();
        canvas.setBackgroundImage(imageUrl, canvas.renderAll.bind(canvas), {
            width: $("#canvas").width(),
            height: $("#canvas").height()
        });
    }
}
$("#reset-labeling").click(resetLabels);

// undo label action
function undoLabel(){
    canvas.setBackgroundImage(imageUrl, canvas.renderAll.bind(canvas), {
        width: $("#canvas").width(),
        height: $("#canvas").height()
    });
    if($(".labels").length != 0){
        $( ".labels" ).last().remove();
        $( ".labels" ).last().remove();
        $( ".labels" ).last().remove();
        $( ".labels" ).last().remove();
        $( ".labels" ).last().remove();
        for (var i = 0; i < canvas.getObjects().length; i++) {
            if (canvas.item(i).id == $( ".labels" ).last().val()) {
                canvas.item(i).remove();
                break;
            }
        }
        $( ".labels" ).last().remove();
        counter -= 1;
        $('#labels-counter').val(counter);
    }
}
$("#undo-labeling").click(undoLabel);

// Reset Zoom
function resetZoom(){
    canvas.setViewportTransform([1,0,0,1,0,0]); 
}
$("#reset-zoom").click(resetZoom);

// key mapping
$(document).keydown(function (event) {

    var key = (event.keyCode ? event.keyCode : event.which) - 49;
    //console.log(key)
    if(0 <= key && key < Math.min(10, classes.length)){
        $(".class-selection:eq("+allClasses.indexOf(curr_class)+")").removeClass("selected-class");
        curr_class = allClasses[parseInt(classes[key].innerHTML.split(":")[0])-1];
        $(".class-selection:eq("+key+")").addClass("selected-class");
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
		$(".class-selection:eq("+allClasses.indexOf(curr_class)+")").removeClass("selected-class");
        idx += 1
		if(idx >= classes.length) {
            curr_class = allClasses[0]
			idx = 0
        }
		else
		{
        	curr_class = allClasses[parseInt(classes[idx].innerHTML.split(":")[0])-1];
        }

		$(".class-selection:eq("+idx+")").addClass("selected-class");
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
    else if (key == 20){ // e
        deleteObjects();
    }
    else if (key == 24){ // i
        // info
        $('#info_modal').modal('toggle');
    }
    else if (key == 41 || key == 42){ // z
        // reset zoom
        resetZoom();
    }

});

//TODO update to fix image rescale with zoom
// when window resize, rescale canvas
$(window).resize(function() {
    origin_height = $("#origin_image_height").val();
    //origin_width = $("#origin_image_width").val();
    // new_width = $(window).width() * .95;
    // new_height = new_width * scaleFactor;
    new_height = $(window).height() * .8;
    new_width = new_height / scaleFactor;
    diff_width_ratio = new_width / origin_width;
    //diff_height_ratio = new_height / origin_height;
    //console.log(new_width);
    //console.log(new_height);
    $("#image_width").val(new_width);
    $("#image_height").val(new_height);
    canvas.setWidth(new_width);
    canvas.setHeight(new_height);
    canvas.setBackgroundImage(imageUrl, canvas.renderAll.bind(canvas), {
        width: $("#canvas").width(),
        height: $("#canvas").height()
    });
    canvas.calcOffset();
    resizeRectangles(diff_width_ratio);
    //resizeRectangles(diff_height_ratio);
});

// delete unwanted objects (simple clicks on canvas creates unwanted objects)
setInterval(function(){
    for (var i = 0; i < canvas.getObjects().length; i++) {
        if($(".label-"+canvas.item(i).id+".label-w").val() < 5 || $(".label-"+canvas.item(i).id+".label-h").val() < 5) {
            if(!canvas.isDrawing){
                $(".label-"+canvas.item(i).id).remove();
                canvas.remove(canvas.item(i));
                counter -= 1;
                $('#labels-counter').val(counter);
            }
        }
    }
}, 1000);

