/**
* 此插件依赖jquery
*
*
*	API List
* 	{
*		setActiveTool,
*		setLineColor,
*		setLineBold,
*		deleteActiveObject,
*		bringToFront,
*		rotateActiveObject,
*		getActiveObject,
*		selectImageFn,
*		imageMoveFn,
*		blurFn,
*		undo
*	}
*
*		
*	Demo:
*	
*	type : Pencil | Eraser | Move | Pull | Text | 	
*
*	this.$el.Draw('setActiveTool', {
*					type: 'Eraser', fn: function () {
*						$("#drawingboard").Draw('setMouse', 'mouse-eraser');
*					}
*	});		
*
*/


(function(){
	var roomid = 10000,
		drawId = "10000_1",
		serverUrl = "https://demo.com/";

	var Demo = function(el, options){
		this.$el = $(el);

		this._init();
	}

	Demo.prototype = {
		_init : function(){
			this.$el.Draw({
				roomid: roomid, 
				drawId: drawId, 
				serverUrl: serverUrl, 
				selectImageFn: this.selectImageFn,
				imageMoveFn: this.imageMoveFn,
				blurFn: this.blurFn,
				setCursorPostion: this.setCursorPostion
			});
		},
		selectImageFn : function(){

		},
		imageMoveFn : function(){

		},
		blurFn : function(){

		},
		setCursorPostion : function(){
			
		}
	}

	$.fn.DEMO = function(options){
		new Demo(this, options);
	}
})()