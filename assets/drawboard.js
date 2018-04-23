/**
 * @Draw 画板组件
 *
 * options {
 *      roomid 涉及到通信同步,需要socket通信
 *      drawId 存储画板数据的key值
 *      canvasid canvas id唯一标识
 * }
 *
 * interface:
 *
 * setActiveTool: 设置工具模式
 *
 * 模式:
 * Pencil 画笔
 * line  直线
 * triangle 三角形
 * rect  方形
 * circle   圆形
 * text     文字
 *
 *  example:
 *  $("#drawingboard").Draw('setActiveTool', {type:'Pencil',fn:function(){
 *     console.log('切换设置笔');
 *  }});
 *
 *  type first letter should be capitalized
 *
 *
 * setLineBold: 设置画笔粗细
 *
 * setLineColor: 设置画笔颜色
 *
 * disabledLine: 禁止写画
 *
 * clearAll: 清除所有
 *
 * undo: 撤销
 *
 * toImage: 将canvas转化为图片
 *
 * video 添加视频  http://124.205.69.131/mp4files/2235000001545D35/video-js.zencoder.com/oceans-clip.mp4
 *
 * 2016/12/8
 *
 * By TT
 */
//objsInCanvas 用于存储当前画布上的所有元素对象
var objsInCanvas = {objects:[]};

var actionHistory = new SimpleStack();

function SimpleStackException(msg) {
    this.message = msg;
    this.name = 'SimpleStackException';
}

function SimpleStack() {
    var MAX_ENTRIES = 2048;
    var self = this;
    self.sp = -1;
    self.entries = [];
    self.push = function(newEntry) {
        if (self.sp > MAX_ENTRIES - 1) {
            throw new SimpleStackException('Can not push on a full stack.');
        }
        self.sp++;
        self.entries[self.sp] = newEntry;
        self.entries.splice(self.sp + 1, self.entries.length);
    };
    self.pop = function() {
        if (self.sp < 0) {
            throw new SimpleStackException('Can not pop from an empty stack.');
        }
        var entry = self.entries[self.sp];
        self.sp--;
        return entry;
    };
    self.reversePop = function() {
        self.sp++;
        if (!self.entries[self.sp]) {
            self.sp--;
            throw new SimpleStackException('Can not reverse pop an entry that has never been created.');
        }
        return self.entries[self.sp];
    }
}
var lut = [];
for (var i = 0; i < 256; i++) {
    lut[i] = (i < 16 ? '0' : '') + (i).toString(16);
}

function generateUuid() {
    var d0 = Math.random() * 0xffffffff | 0;
    var d1 = Math.random() * 0xffffffff | 0;
    var d2 = Math.random() * 0xffffffff | 0;
    var d3 = Math.random() * 0xffffffff | 0;
    return lut[d0 & 0xff] + lut[d0 >> 8 & 0xff] + lut[d0 >> 16 & 0xff] + lut[d0 >> 24 & 0xff] + '-' + lut[d1 & 0xff] + lut[d1 >> 8 & 0xff] + '-' + lut[d1 >> 16 & 0x0f | 0x40] + lut[d1 >> 24 & 0xff] + '-' + lut[d2 & 0x3f | 0x80] + lut[d2 >> 8 & 0xff] + '-' + lut[d2 >> 16 & 0xff] + lut[d2 >> 24 & 0xff] + lut[d3 & 0xff] + lut[d3 >> 8 & 0xff] + lut[d3 >> 16 & 0xff] + lut[d3 >> 24 & 0xff];
}

;
(function($, undefined) {
    var Draw = function(element, options) {
        this.el = $(element);
        this.exceptEraser = ['image'];
        this.options = $.extend($.fn.Draw.defaults, options);
        this.blurFn = !!this.options.blurFn ? this.options.blurFn : function() {};
        this.selectImageFn = !!this.options.selectImageFn ? this.options.selectImageFn : function() {};
        this.imageMoveFn = !!this.options.imageMoveFn ? this.options.imageMoveFn : function() {};
        this.type = !!this.options.type ? this.options.type : '';
        this.setCursorPostion = !!this.options.setCursorPostion ? this.options.setCursorPostion : function() {};

        var draw_width = this.options.width || document.documentElement.clientWidth || window.screen.width || document.body.offsetWidth,
            draw_height = this.options.height || document.documentElement.clientHeight || window.screen.height || document.body.offsetHeight;

        this.el.append('<canvas id="' + this.options.canvasid + '" width="' + draw_width + '" height="' + draw_height + '"></canvas>');
        this.ele_canvas = this.el.find('#' + this.options.canvasid);

        this.videoHtml = ['<div class="video-js-box" style="position:absolute;">',
            '<video id="video_player" class="video-js" width="640" height="360" controls="controls" poster="//vjs.zencdn.net/v/oceans.png" preload="auto">',
            '  <source src="/" type="video/mp4;"/>',
            '</video>',
            '</div>'
        ].join('');

        this._init();
        this._addEvents();
        this._initSocket();
        this._resetSize(draw_width, draw_height, 1);
    }

    Draw.prototype = {
        _init: function() {
            this.draging = false;
            this.moveing = false;
            this.erasering = false;
            this.roomid = this.options.roomid;
            this.drawId = this.options.drawId;
            this.canvas = new fabric.Canvas(this.options.canvasid);

            this._is('Pencil');
        },
        _addEvents: function() {
            var _this = this;

            this.canvas.on('object:added', function(e) {
                var object = e.target;

                if (!object.uuid) {
                    object.uuid = generateUuid();
                }

                if (!object.bypassHistory && object.type != 'i-text')
                    actionHistory.push({
                        type: 'object_added',
                        object: JSON.stringify(object)
                    });

                var transX = _this.canvas.viewportTransform[4];
                var transY = _this.canvas.viewportTransform[5];
                object.transX = transX;
                object.transY = transY;

                switch(object.type)
                {
                    case "path":
                        objsInCanvas.objects.push(object);
                        //添加path增量发送path数据
                        _this.socket.emit("addPath", _this.roomid, _this.drawId, type, JSON.stringify(object), _this.canvas.getWidth(), _this.canvas.getHeight());
                        break;
                    case "image":
                        objsInCanvas.objects.push(object);
                        //添加image增量发送image数据
                        _this.socket.emit("addImage",_this.roomid,_this.drawId, type, JSON.stringify(object), _this.canvas.getWidth(), _this.canvas.getHeight());
                        break;
                    case "i-text":
                        objsInCanvas.objects.push(object);
                        //添加text增量发送text数据
                        _this.socket.emit("addText",_this.roomid,_this.drawId, type, JSON.stringify(object), _this.canvas.getWidth(), _this.canvas.getHeight());
                        break;
                }

                //_this._drawUpdate("added");
            })

            // this.canvas.on('object:removed', function (e) {
            //     var object = e.target;
            //
            //     _this._drawUpdate('removed');
            // })
            this.canvas.on('object:rotating', function(e) {
                console.log('rotating:');
                console.log(e.target);
            })

            this.canvas.on('object:scaling', function(e) {
                var element = e.target,
                    type = element.type,
                    url = element.url;

                if (type == 'image' && !!url) {
                    if (!!_this.myPlayer) {
                        _this.myPlayer.pause() && _this.myPlayer.hide();
                    }
                }
            })

            this.canvas.on("object:selected", function(e) {
                e.target.set('lockRotation', true).setCoords();

                _this.selectImageFn(e.target);

                var type = e.target.type,
                    url = e.target.url;

                // if(type == 'image' && !!url){
                //     _this._initVideo(e.target);
                // }

            });

            this.canvas.on("object:dblclick", function(e) {
                var object = e.target;
                var type = e.target.type,
                    url = e.target.url;
                if (type == 'image' && !!url && _this.type == 1) {
                    _this._initVideo(e.target);
                }
            })

            this.canvas.on("object:disselected", function(e) {
                //_this.selectImageFn(e.target);
            });


            this.canvas.on('object:modified', function(e) {
                var object = e.target;
                var type = e.target.type,
                    url = e.target.url;

                if (type !== 'i-text') {
                    if (typeof latestTouchedObject == "undefined") latestTouchedObject = fabric.util.object.clone(object);
                    actionHistory.push({
                        type: 'object_modified',
                        objectOld: JSON.stringify(latestTouchedObject),
                        objectNew: JSON.stringify(object)
                    });
                }

                _this.selectImageFn(e.target);

                // if(type == 'image' && !!url){
                //     _this._initVideo(e.target);
                // }
                if (object.type == "image") {
                    objsInCanvas.objects.forEach(function(element,index,array) {
                        if (element.id == object.id) {
                            array.splice(index,1,object);
                        }
                    });
                    _this.socket.emit("dragImage",_this.roomid, _this.drawId, type, JSON.stringify(object), _this.canvas.getWidth(), _this.canvas.getHeight());
                }else if (object.type == "i-text"){
                    objsInCanvas.objects.forEach(function(element,index,array) {
                        if (element.id == object.id) {
                            array.splice(index,1,object);
                        }
                    });
                    _this.socket.emit("dragText",_this.roomid, _this.drawId, type, JSON.stringify(object), _this.canvas.getWidth(), _this.canvas.getHeight());
                }
                //_this._drawUpdate("modified");
            })

            this.canvas.on('text:changed', function(e) {
                var object = e.target;
                console.log(object.text);
                // actionHistory.push({
                //     type: 'text_changed',
                //     objectOld: JSON.stringify(latestTouchedObject),
                //     objectNew: JSON.stringify(object)
                // });
                //_this._drawUpdate('modified');
                _this.socket.emit("changeText",_this.roomid, _this.drawId, type, JSON.stringify(object), _this.canvas.getWidth(), _this.canvas.getHeight());
            })

            this.canvas.on('object:removed', function(e) {
                var object = e.target;
                if (!object.bypassHistory) {
                    actionHistory.push({
                        type: 'object_removed',
                        object: JSON.stringify(object)
                    });
                }
                if (object.type == "image") {
                    objsInCanvas.objects.forEach(function(element,index,array) {
                        if (element.id == object.id) {
                            array.splice(index,1);
                        }
                    });
                    _this.socket.emit("removeImage",_this.roomid,_this.drawId,JSON.stringify(object))
                }else if (object.type == "path") {
                    objsInCanvas.objects.forEach(function(element,index,array) {
                        if (element.id == object.id) {
                            array.splice(index,1);
                        }
                    });
                    _this.socket.emit("eraserPath",_this.roomid,_this.drawId,JSON.stringify(object));
                }else if (object.type == "i-text"){
                    objsInCanvas.objects.forEach(function(element,index,array) {
                        if (element.id == object.id) {
                            array.splice(index,1);
                        }
                    });
                    _this.socket.emit("removeText",_this.roomid,_this.drawId,JSON.stringify(object));
                }
                //_this._drawUpdate("removed");
            });

            this.canvas.on('mouse:down', function(options) {
                if (options.target) {
                    latestTouchedObject = fabric.util.object.clone(options.target);
                }
            });

            this.canvas.on("selection:cleared", function() {
                _this.canvas.renderAll();
                _this.blurFn();
            })

            this.canvas.on('mouse:up', $.proxy(this._mouseUp, this));
            this.canvas.on('mouse:down', $.proxy(this._mouseDown, this));
            this.canvas.on("mouse:move", $.proxy(this._mouseMove, this));
            this.canvas.on("mouse:over", $.proxy(this._mouseOver, this));

            this.canvas.on('after:render', function(opt) {
                this.calcOffset();
                if (opt == 'complete') {
                    _this.rendering = false;
                }
            });

            document.onkeydown = function(event) {
                var key;
                if (window.event) {
                    key = window.event.keyCode;
                } else {
                    key = event.keyCode;
                }

                switch (key) {
                    case 67:
                        // if(event.ctrlKey){
                        //     event.preventDefault();
                        //     _this._copy();
                        // }
                        break;
                    case 86:
                        // if(event.ctrlKey){
                        //     event.preventDefault();
                        //     _this._paste();
                        // }
                        break;
                    default:
                        break;
                }
            }

            window.addEventListener('offline', function() {
                // alert('You are offline! Reconnecting......');
            });

            window.addEventListener('online', function() {
                // if(typeof io != 'undefined'){
                //     var serverUrl = _this.options.serverUrl;
                //     _this.socket = io.connect(serverUrl, {path:'/wb', origins:'*:*',forceNew:true});
                // }

                _this.socket.emit('getDraw', _this.drawId).on('getDraw', function (canvas) {
                    if(!canvas){
                        _this.canvas.loadFromJSON({});
                    } else {
                        var json = JSON.parse(canvas);
                        json.objects.complete = true;
                        _this.canvas.loadFromJSON(json,_this.canvas.renderAll.bind(_this.canvas));
                    }

                    _this.canvas.renderAll();
                });
            });

            window.onresize = function () {
                // _this.width = document.documentElement.clientWidth || window.screen.width || document.body.offsetWidth;
                // _this.heigth = document.documentElement.clientHeight || window.screen.height || document.body.offsetHeight;
                // _this._resetSize(_this.width, _this.heigth);
                // _this.canvas.renderAll();
                // _this.canvas.calcOffset();
            }

        },
        //视频事件
        _addVideoEvents: function() {
            var _this = this;
            this.myPlayer.on('play', function() {
                if (_this.type == 1) {
                    _this.vdsocket.emit('play', _this.roomid);
                    _this.myPlayer.currentTime(_this.currentTime);
                    _this._addInterval();
                } else {
                    _this.myPlayer.show();
                }
            });

            this.myPlayer.on('pause', function() {
                if (_this.type == 1) {
                    var currentTime = _this.myPlayer.currentTime();
                    _this.vdsocket.emit('pause', _this.roomid, currentTime);
                    _this._clearInterval();
                }
                // _this.myPlayer.hide();
            });

            this.myPlayer.on('ended', function() {
                if (_this.type == 1) {
                    _this.vdsocket.emit('ended', _this.roomid);
                    _this._clearInterval();
                }

                var object = _this.activeVideoObject;
                var key = object.id;
                store.clearStore(key)
            })

            this.myPlayer.on('timeupdate', function() {
                var key = !!_this.activeVideoObject ? _this.activeVideoObject.id : '';
                _this.currentTime = _this.myPlayer.currentTime();
                store.setStore(key, _this.currentTime);
                _this.myPlayer.show();
                // this.vdsocket.emit('timeupdate', currentTime, _this.roomid);
            });

            // if(type == 1){
            //     this._addInterval();
            // }
        },
        _clearInterval: function() {
            var _this = this;
            clearInterval(_this.timer);
        },
        _addInterval: function() {
            var _this = this;
            if (!!this.timer) clearInterval(_this.timer);
            this.timer = setInterval(function() {
                var currentTime = _this.myPlayer.currentTime();
                _this.vdsocket.emit('timeupdate', currentTime, _this.roomid, _this.activeVideoObject);
            }, 5000);
        },
        _copy: function() {
            if (this.canvas.getActiveObject()) {
                var object = fabric.util.object.clone(this.canvas.getActiveObject());
                object.set("top", object.top + 20);
                object.set("left", object.left + 20);
                this.copiedObject = object;
            }
        },
        _paste: function() {
            if (this.copiedObject) {
                this.canvas.add(this.copiedObject);
            }
            this.canvas.renderAll();
        },
        _initSocket: function() {
            var _this = this;

            if (typeof io != 'undefined') {
                var serverUrl = this.options.serverUrl;
                this.socket = io.connect(serverUrl, {
                    path: '/wb',
                    origins: '*:*',
                    forceNew: true
                });
            }

            this.heartbeat = setInterval(function() {
                try {
                    _this.socket.emit('_ping', _this.roomid);
                } catch (e) {
                    clearInterval(_this.heartbeat);
                }
            }, 5000);

            this.socket.on('pong', function(pong) {
                var state = pong.state;
                if (state == "online") {
                    // console.log("在线");
                } else {
                    // console.log("下线");
                }
            })



            if (this.options.video) {
                this.vdsocket = io.connect(serverUrl, {
                    path: '/vd',
                    origins: '*:*',
                    forceNew: true
                });

                this.heartbeat = setInterval(function() {
                    try {
                        _this.vdsocket.emit('_ping', _this.roomid);
                    } catch (e) {
                        clearInterval(_this.heartbeat);
                    }
                }, 5000);

                this.vdsocket.on('pong', function(pong) {
                    var state = pong.state;
                    if (state == "online") {
                        console.log("视频在线");
                    } else {
                        console.log("视频下线");
                    }
                })

                this.vdsocket.emit('drawstart', this.roomid); //视频socket


                this.vdsocket.on('playVideo', function(t) {
                    _this._initBVideo(t);
                });

                this.vdsocket.on('play', function() {
                    _this.myPlayer.play();
                });

                this.vdsocket.on('pause', function(t) {
                    _this.myPlayer.currentTime(t);
                    _this.myPlayer.pause();
                });

                this.vdsocket.on('timeupdate', function(time, object) {
                    var key = object.id;
                    _this._initBVideo(object);

                    var localtime = _this.myPlayer.currentTime();
                    store.setStore(key, localtime);
                    console.log('localtime - time', localtime, time);
                    if (Math.abs(time - localtime) > 2) _this.myPlayer.currentTime(time);
                });

                this.vdsocket.on('ended', function() {
                    clearInterval(this.timer);
                });

                this.vdsocket.on('deleteVideo', function() {
                    _this.deleteVideo();
                })
            }

            this.socket.emit('drawstart', this.roomid);


            this.socket.emit('getDraw', this.drawId).on('getDraw', function(canvas) {
                _this.canvas.isDrawingMode = true;
                if (!canvas) {
                    _this.canvas.loadFromJSON({});
                } else {
                    var json = objsInCanvas = JSON.parse(canvas);
                    var zoom = json.zoom;
                    var transX = json.transX;
                    var transY = json.transY;
                    json.objects.complete = true;
                    _this.canvas.loadFromJSON(json, _this.canvas.renderAll.bind(_this.canvas));
                    typeof json.transX != "undefined" && _this.canvas.setViewportTransform([zoom, 0, 0, zoom, transX, transY], "refresh");
                }

                _this.canvas.renderAll();
            });

            this.socket.on('client_add', function(data) {
                if (data && data.length > 0) {
                    for (var i = 0, l = data.length; i < l; i++) {
                        _this.canvas.freeDrawingBrush.onMouseMove(data[i]);
                    }
                }
            })

            this.socket.on('drawUpdate', function(type, canvas, otherCanvasWidth, otherCanvasHeight) {
                fabric.otherCanvasWidth = otherCanvasWidth;
                fabric.otherCanvasHeight = otherCanvasHeight;
                _this.rendering = true;
                var json = null,
                    zoom = 1,
                    transX = _this.canvas.viewportTransform[4],
                    transY = _this.canvas.viewportTransform[5];
                if (!!canvas) {
                    json = JSON.parse(canvas);
                    zoom = typeof json.zoom == "undefined" ? 1 : json.zoom;
                    transX = typeof json.transX == "undefined" ? transX : json.transX;
                    transY = typeof json.transY == "undefined" ? transY : json.transY;
                    json.objects.complete = true;
                    json.ptype = type;
                }
                //此处解决当只有Path时，清除问题  不能与下面的判断合并  by shine
                // if(type != "undefined" && type == "removed"){
                //     //_this.canvas.clear();
                //     //_this.canvas._objects.length = 1;
                //    // _this.canvas.contextContainer.clearRect(0,0,_this.canvas.width,_this.canvas.height);
                // }
                _this.canvas.loadFromJSON(json, _this.canvas.renderAll.bind(_this.canvas));
                type == "drag" && _this.canvas.setViewportTransform([zoom, 0, 0, zoom, transX, transY], type);
                type == "zoom" && _this.canvas.setZoom(zoom, _this.getCenter(), type);
                if (type == 'rotate' || type == 'eraser' || type == 'modified')
                    _this.canvas.clear();
                _this.canvas.renderAll(type);
            });
            /**
             * 同步添加Path事件
             * @param  {[type]} type               [description]
             * @param  {[type]} data               [description]
             * @param  {[type]} otherCanvasWidth   [description]
             * @param  {[type]} otherCanvasHeight) {                           console.log("addPath");                var dataObj [description]
             * @return {[type]}                    [description]
             */
            this.socket.on("addPath",function(type, data, otherCanvasWidth, otherCanvasHeight) {
                var dataObj = JSON.parse(data);

                var path = new fabric.Path(dataObj.pathData,{
                    id: dataObj.id,
                   fill: null,
                   stroke: dataObj.stroke,
                   strokeWidth: dataObj.strokeWidth,
                   strokeLineCap: dataObj.strokeLineCap,
                   strokeLineJoin: dataObj.strokeLineJoin,
                   strokeDashArray: dataObj.strokeDashArray,
                   originX: 'center',
                   originY: 'center',
                   canvasWidth: dataObj.canvasWidth,
                   canvasHeight: dataObj.canvasHeight,
                   pathData: dataObj.pathData,
                   pathRatio: dataObj.pathRatio
                 },"asy");
                //});
                fabric.pathDataInfo = dataObj.pathData;
                path._set("canvas",_this.canvas);
                path.setCoords();

                _this.canvas._objects.push(path);
                // _this.canvas.add(path);   //该函数会调用emit("addPath")
                // contextContainer.canvas  里层canvas
                // contextTop.canvas 外层canvas
                // path.canvas = _this.canvas.contextCache.canvas;

                // path.render(_this.canvas.contextCache);

                // path.canvas = _this.canvas.contextTop.canvas;
                // path.render(_this.canvas.contextTop);

                // path.canvas = _this.canvas.contextContainer.canvas;
                // 之所以用三个是防止点击橡皮擦按钮会清空同步过来的元素
                var transX = _this.canvas.viewportTransform[4];
                var transY = _this.canvas.viewportTransform[5];
                path.render(_this.canvas.contextContainer, [1, 0, 0, 1, transX, transY]);
                path.render(_this.canvas.contextCache, [1, 0, 0, 1, transX, transY]);
                // path.render(_this.canvas.contextTop);
                //将新添加的path添加到objsInCanvas.objects中
                objsInCanvas.objects.push(dataObj);
                _this.canvas.setViewportTransform([1, 0, 0, 1, transX, transY], "drag");
            });
            // this.socket.on("addPath",function(type, data, otherCanvasWidth, otherCanvasHeight) {
            //     var dataObj = JSON.parse(data);
            //     var path = _this.canvas.freeDrawingBrush.createPath(dataObj.pathData);
            //     path.id = dataObj.id;
            //     path.stroke = dataObj.stroke;
            //     path.strokeWidth = dataObj.strokeWidth;
            //     path.strokeLineCap = dataObj.strokeLineCap;
            //     path.strokeLineJoin = dataObj.strokeLineJoin;
            //     path.strokeDashArray = dataObj.strokeDashArray;
            //     path.canvasWidth = dataObj.canvasWidth;
            //     path.canvasHeight = dataObj.canvasHeight;
            //     path.pathData = dataObj.pathData;
            //     path._set("canvas",_this.canvas);
            //     path.setCoords();
            //     _this.canvas._objects.push(path);
            //     // _this.canvas.add(path);   //该函数会调用emit("addPath")
            //     // contextContainer.canvas  里层canvas
            //     // contextTop.canvas 外层canvas
            //     // path.canvas = _this.canvas.contextCache.canvas;

            //     // path.render(_this.canvas.contextCache);

            //     // path.canvas = _this.canvas.contextTop.canvas;
            //     // path.render(_this.canvas.contextTop);

            //     // path.canvas = _this.canvas.contextContainer.canvas;
            //     // 之所以用三个是防止点击橡皮擦按钮会清空同步过来的元素
            //     path.render(_this.canvas.contextContainer);
            //     path.render(_this.canvas.contextCache);
            //     path.render(_this.canvas.contextTop);
            //     //将新添加的path添加到objsInCanvas.objects中
            //     objsInCanvas.objects.push(dataObj);
            // });

            this.socket.on("addText",function (type, data, otherCanvasWidth, otherCanvasHeight) {
                var dataObj = JSON.parse(data);
                var transX = _this.canvas.viewportTransform[4];
                var transY = _this.canvas.viewportTransform[5];
                //将新添加的text添加到objsInCanvas.objects中
                objsInCanvas.objects.push(dataObj);
                var text = new fabric.IText(dataObj.text, {
                    id: dataObj.id,
                    left: dataObj.left/otherCanvasWidth*_this.canvas.getWidth(),
                    top: dataObj.top/otherCanvasWidth*_this.canvas.getWidth(),
                    fontFamily: 'helvetica',
                    fill: 'black',
                    fontWeight: '',
                    originX: 'left',
                    hasRotatingPoint: true,
                    centerTransform: true,
                    selectable: true,
                    isEditing: false,
                    fontSize: dataObj.fontSize/otherCanvasWidth*_this.canvas.getWidth()
                });
                text._set("canvas",_this.canvas);
                text.setCoords();
                _this.canvas._objects.push(text);
                text.render(_this.canvas.contextContainer);
                text.render(_this.canvas.contextCache);
                // text.render(_this.canvas.contextTop);
                _this.canvas.setViewportTransform([1, 0, 0, 1, transX, transY], "drag")
            });
            /**
             * 同步添加Image事件
             * @param  {[type]} type               [description]
             * @param  {[type]} image              [description]
             * @param  {[type]} otherCanvasWidth   [description]
             * @param  {[type]} otherCanvasHeight) {                           console.table(JSON.parse(image));            } [description]
             * @return {[type]}                    [description]
             */
            this.socket.on("addImage",function(type, data, otherCanvasWidth, otherCanvasHeight) {
                var dataObj = JSON.parse(data);
                var transX = _this.canvas.viewportTransform[4];
                var transY = _this.canvas.viewportTransform[5];
                //将新添加的image添加到objsInCanvas.objects中
                objsInCanvas.objects.push(dataObj);
                var image = fabric.Image.fromURL(dataObj.src, function(oImage) {
                                oImage.set({
                                    id: dataObj.id,
                                    width: dataObj.width/otherCanvasWidth*_this.canvas.getWidth()*dataObj.scaleX,
                                    height: dataObj.height/otherCanvasWidth*_this.canvas.getWidth()*dataObj.scaleY,
                                    left: dataObj.left/otherCanvasWidth*_this.canvas.getWidth(),
                                    top: dataObj.top/otherCanvasWidth*_this.canvas.getWidth(),
                                    angle: 0,
                                    active: false
                                });
                                oImage._set("canvas",_this.canvas);
                                oImage.setCoords();
                                _this.canvas._objects.push(oImage);
                                oImage.render(_this.canvas.contextContainer);
                                oImage.render(_this.canvas.contextCache);
                                // oImage.render(_this.canvas.contextTop);
                                _this.canvas.setViewportTransform([1, 0, 0, 1, transX, transY], "drag")
                            },{
                                left: dataObj.left/otherCanvasWidth*_this.canvas.getWidth(),
                                top: dataObj.top/otherCanvasWidth*_this.canvas.getWidth(),
                                _width: dataObj.width/otherCanvasWidth*_this.canvas.getWidth()*dataObj.scaleX,
                                _height: dataObj.height/otherCanvasWidth*_this.canvas.getWidth()*dataObj.scaleY
                            });

            });


            /**
             * 同步旋转Image事件
             */
            this.socket.on("rotateImage",function(type, data, otherCanvasWidth, otherCanvasHeight) {
                var image = JSON.parse(data);
                objsInCanvas.objects.forEach(function(element,index,array) {
                    if (element.id == image.id) {
                        array.splice(index,1,image);
                        fabric.Image.fromURL(image.src, function(oImage) {
                            oImage.set({
                                id: image.id,
                                width: image.width/otherCanvasWidth*_this.canvas.getWidth()*image.scaleX, //*image.scaleX 同步拖动缩放比例
                                height: image.height/otherCanvasWidth*_this.canvas.getWidth()*image.scaleY,
                                left: image.left/otherCanvasWidth*_this.canvas.getWidth(),
                                top: image.top/otherCanvasWidth*_this.canvas.getWidth(),
                                angle: image.angle,
                                active: false
                            });
                            oImage._set("canvas",_this.canvas);
                            oImage.setCoords();
                            _this.canvas._objects.splice(index,1,oImage);
                            //_this.canvas.add(oImage);
                            // oImage.canvas = _this.canvas.contextContainer.canvas;

                            oImage.render(_this.canvas.contextCache);
                            oImage.render(_this.canvas.contextTop);
                            oImage.render(_this.canvas.contextContainer);
                            _this.canvas.loadFromJSON({object:_this.canvas._objects}, _this.canvas.renderAll.bind(_this.canvas));
                            _this.canvas.renderAll("rotateImage");
                        },{
                            left: image.left/otherCanvasWidth*_this.canvas.getWidth(),
                            top: image.top/otherCanvasWidth*_this.canvas.getWidth(),
                            _width: image.width/otherCanvasWidth*_this.canvas.getWidth()*image.scaleX,
                            _height: image.height/otherCanvasWidth*_this.canvas.getWidth()*image.scaleY
                        });
                    }
                });
                //_this.canvas.loadFromJSON({object:_this.canvas._objects}, _this.canvas.renderAll.bind(_this.canvas));
                // _this.canvas.renderAll("rotateImage");
            });
            /**
             * 同步拖动,缩放Image事件
             */
            this.socket.on("dragImage",function(type,data,otherCanvasWidth,otherCanvasHeight) {
                var image = JSON.parse(data);
                var transX = _this.canvas.viewportTransform[4];
                var transY = _this.canvas.viewportTransform[5];
                _this.canvas.setViewportTransform([1, 0, 0, 1, transX, transY], "drag")
                objsInCanvas.objects.forEach(function(element,index,array) {
                    if (element.id == image.id) {
                        array.splice(index,1,image);
                        fabric.Image.fromURL(image.src, function(oImage) {
                            oImage.set({
                                id: image.id,
                                width: image.width/otherCanvasWidth*_this.canvas.getWidth()*image.scaleX,
                                height: image.height/otherCanvasWidth*_this.canvas.getWidth()*image.scaleY,
                                left: image.left/otherCanvasWidth*_this.canvas.getWidth(),
                                top: image.top/otherCanvasWidth*_this.canvas.getWidth(),
                                angle: image.angle,
                                active: false
                            });
                            oImage._set("canvas",_this.canvas);
                            oImage.setCoords();
                            _this.canvas._objects.splice(index,1,oImage);
                            //_this.canvas.add(oImage);
                            // oImage.canvas = _this.canvas.contextContainer.canvas;

                            oImage.render(_this.canvas.contextCache);
                            oImage.render(_this.canvas.contextTop);
                            oImage.render(_this.canvas.contextContainer);
                            _this.canvas.loadFromJSON({object:_this.canvas._objects}, _this.canvas.renderAll.bind(_this.canvas));
                            _this.canvas.renderAll("rotateImage");
                        },{
                            left: image.left/otherCanvasWidth*_this.canvas.getWidth(),
                            top: image.top/otherCanvasWidth*_this.canvas.getWidth(),
                            _width: image.width/otherCanvasWidth*_this.canvas.getWidth()*image.scaleX,
                            _height: image.height/otherCanvasWidth*_this.canvas.getWidth()*image.scaleY
                        });
                    }
                });
            });
            /*
            同步改变文字事件
             */
            this.socket.on("changeText",function(type,data,otherCanvasWidth,otherCanvasHeight) {
                var Itext = JSON.parse(data);
                var transX = _this.canvas.viewportTransform[4];
                var transY = _this.canvas.viewportTransform[5];
                _this.canvas.setViewportTransform([1, 0, 0, 1, transX, transY], "drag")
                objsInCanvas.objects.forEach(function(element,index,array) {
                    if (element.id == Itext.id) {
                        array.splice(index,1,Itext);
                        var text = new fabric.IText(Itext.text, {
                            id: Itext.id,
                            left: Itext.left/otherCanvasWidth*_this.canvas.getWidth(),
                            top: Itext.top/otherCanvasWidth*_this.canvas.getWidth(),
                            fontFamily: 'helvetica',
                            fill: 'black',
                            fontWeight: '',
                            originX: 'left',
                            hasRotatingPoint: true,
                            centerTransform: true,
                            selectable: true,
                            isEditing: false,
                            fontSize: Itext.fontSize/otherCanvasWidth*_this.canvas.getWidth()
                        });
                        text._set("canvas",_this.canvas);
                        text.setCoords();
                        _this.canvas._objects.splice(index,1,text);
                        text.render(_this.canvas.contextContainer);
                        text.render(_this.canvas.contextCache);
                        text.render(_this.canvas.contextTop);
                        _this.canvas.loadFromJSON({object:_this.canvas._objects}, _this.canvas.renderAll.bind(_this.canvas));
                        _this.canvas.renderAll("dragText");
                    }
                });
            });

            /*
            * 同步拖动文字功能
            * */
            this.socket.on("dragText",function(type,data,otherCanvasWidth,otherCanvasHeight) {
                var Itext = JSON.parse(data);
                var transX = _this.canvas.viewportTransform[4];
                var transY = _this.canvas.viewportTransform[5];
                _this.canvas.setViewportTransform([1, 0, 0, 1, transX, transY], "drag")
                objsInCanvas.objects.forEach(function(element,index,array) {
                    if (element.id == Itext.id) {
                        array.splice(index,1,Itext);
                        var text = new fabric.IText(Itext.text, {
                            id: Itext.id,
                            left: Itext.left/otherCanvasWidth*_this.canvas.getWidth(),
                            top: Itext.top/otherCanvasWidth*_this.canvas.getWidth(),
                            fontFamily: 'helvetica',
                            fill: 'black',
                            fontWeight: '',
                            originX: 'left',
                            hasRotatingPoint: true,
                            centerTransform: true,
                            selectable: true,
                            isEditing: false,
                            fontSize: Itext.fontSize/otherCanvasWidth*_this.canvas.getWidth()
                        });
                        text._set("canvas",_this.canvas);
                        text.setCoords();
                        _this.canvas._objects.splice(index,1,text);
                        text.render(_this.canvas.contextContainer);
                        text.render(_this.canvas.contextCache);
                        text.render(_this.canvas.contextTop);
                        _this.canvas.loadFromJSON({object:_this.canvas._objects}, _this.canvas.renderAll.bind(_this.canvas));
                        _this.canvas.renderAll("dragText");
                    }
                });
            });
            /**
             * 同步删除Path事件
             */
            this.socket.on("eraserPath",function(jsonObj) {
                objsInCanvas.objects.forEach(function(element,index,array) {
                    if (element.id === JSON.parse(jsonObj).id) {
                        array.splice(index,1);
                        _this.canvas._objects.splice(index,1);
                    }
                });
                _this.canvas.loadFromJSON({object:_this.canvas._objects}, _this.canvas.renderAll.bind(_this.canvas));
                _this.canvas.renderAll("eraserPath");
            });

            this.socket.on('drawClear', function(roomid) {
                objsInCanvas.objects = [];
                _this._clear();
            });
            /**
             * 同步删除Image事件
             */
            this.socket.on("removeImage",function(jsonObj) {
                objsInCanvas.objects.forEach(function(element,index,array) {
                    if (element.id === JSON.parse(jsonObj).id) {
                        array.splice(index,1);
                        _this.canvas._objects.splice(index,1);
                    }
                });
                //_this.canvas.loadFromJSON({objects:_this.canvas._objects},_this.canvas.renderAll.bind(_this.canvas));
                _this.canvas.renderAll("removeImage");
            });
            /*
            * 同步删除Text事件
            * */
            this.socket.on("removeText",function(jsonObj) {
                objsInCanvas.objects.forEach(function(element,index,array) {
                    if (element.id === JSON.parse(jsonObj).id) {
                        array.splice(index,1);
                        _this.canvas._objects.splice(index,1);
                    }
                });
                //_this.canvas.loadFromJSON({objects:_this.canvas._objects},_this.canvas.renderAll.bind(_this.canvas));
                _this.canvas.renderAll("removeText");
            });
            //接收老师端传过来的实时坐标值,并通过div实现良好交互
            this.socket.on('moveCursor', function(params) {
                params.staticCanvasWidth = _this.canvas.getWidth();
                params.staticCanvasHeight = _this.canvas.getHeight();
                params.boundingLeft = _this.canvas.getBoundingRectLeftAndTop().left;
                params.boundingTop = _this.canvas.getBoundingRectLeftAndTop().top;
                _this.setCursorPostion(params);
            });
        },
        _resetSize: function(draw_width, draw_height, type) {
            if (draw_height && draw_width) {
                var v2 = draw_width / draw_height,
                    ratio = this.options.ratio || 1.77;
                if (v2 > ratio) {
                    draw_width = draw_height * ratio;
                } else {
                    draw_height = draw_width / ratio;
                }
                if(!!type){
                    draw_width = 1280;
                    draw_height = 720;
                }
                this._setSize(draw_width, draw_height);
                // this.el[0].style.marginLeft = - draw_width / 2 + "px";
                // this.el[0].style.marginTop = - draw_height / 2 + "px";
            }
        },
        _setSize: function(width, height) {
            this.canvas.setWidth(width);
            this.canvas.setHeight(height);
        },
        _drawUpdate: function(type, transX, transY) {
            if (!!this.socket) {
                var json = this.canvas.toJSON();
                json.zoom = this.canvas.getZoom();
                var canvasWidth = this.canvas.getWidth();
                var canvasHeight = this.canvas.getHeight();

                if (typeof transX != "undefined") json.transX = transX;
                if (typeof transY != "undefined") json.transY = transY;
                this.socket.emit("drawUpdate", this.roomid, this.drawId, type, JSON.stringify(json), canvasWidth, canvasHeight);
            }
        },
        _mouseUp: function() {
            this.moveing = false;
            var transX = this.canvas.viewportTransform[4], transY = this.canvas.viewportTransform[5]
            // if (actionHistory.sp > -1) {
            //     $(document.body).trigger('button.abled');
            //     // this.$undo.removeClass('disabled');
            //     return;
            // }

            if(this.pulling){
                var transX = this.canvas.viewportTransform[4], transY = this.canvas.viewportTransform[5];
                this._drawUpdate("drag",transX, transY);
                this.canvas.setViewportTransform([1, 0, 0, 1, transX, transY], "drag");
            }
            this.isPullStatue = false;
        },
        _mouseDown: function(e) {
            this.moveing = true;
            this.isPullStatue = true;
            var transX = this.canvas.viewportTransform[4], transY = this.canvas.viewportTransform[5];
            this.currentX = e.e.clientX-transX;
            this.currentY = e.e.clientY-transY;
        },
        _mouseMove: function(options) {
            //var activeObj = this.getActiveObject();
            var activeObj = this.canvas.findTarget(options);
            if (this.moveing) this.imageMoveFn();

            // if (this.type == '1') {
            //     var x = e.e.clientX - this.canvas.getBoundingRectLeftAndTop().left;
            //     var y = e.e.clientY - this.canvas.getBoundingRectLeftAndTop().top;
            //     var tranCanWidth = this.canvas.getWidth();
            //     var tranCanHeight = this.canvas.getHeight();
            //     this.socket.emit('moveCursor', this.roomid, {
            //         position: {
            //             x: x,
            //             y: y
            //         },
            //         tranCanWidth: tranCanWidth,
            //         tranCanHeight: tranCanHeight
            //     });
            // }

            if (this.erasering && this.moveing) {
                this.canvas.remove(activeObj);
                this.canvas.renderAll('eraser');
            }

            if(this.pulling && this.isPullStatue){
                var nowX = options.e.clientX, nowY = options.e.clientY;
                var moveX = nowX - this.currentX, moveY = nowY - this.currentY;
                //console.log(this.currentX,this.currentY);
                var zoom = 1;
                this.canvas.setViewportTransform([zoom, 0, 0, zoom, moveX, moveY], "drag");
            }
        },
        _mouseOver: function(options) {
            var _this = this;
            if (!!this.isEraser) {
                options.target.selectable = false;
            } else {
                options.target.selectable = true;
            }
            console.log(this.moveing);
            if (!!this.erasering && !!this.moveing && $.inArray(options.target.type, this.exceptEraser) == -1) {
                this.canvas.remove(options.target);
                this.canvas.renderAll('eraser');
                // objsInCanvas.objects.forEach(function(element,index,array) {
                //     if (element.id == options.target.id) {
                //         array.splice(index,1);
                //     }
                // });
                // _this.socket.emit("eraserPath",_this.roomid,_this.drawId,JSON.stringify(options.target));
            }
        },
        //设置当前选中的工具类型
        _is: function(shape) {
            var cache = this;

            if (cache.isEraser) { //如果是橡皮擦
                this.disabledLine();
                this.canvas.selection = true;
                this.canvas.interactive = true;
                this.draging = true;
                this.erasering = false;
                this.pulling = false;
            } else if (cache.isMove) {
                this.disabledLine();
                this.canvas.selection = true;
                this.canvas.interactive = false;
                this.draging = false;
                this.erasering = true;
                this.pulling = false;
            } else if (cache.isShape) {
                this.disabledLine();
                this.canvas.selection = false;
                this.canvas.interactive = false;
                this.draging = true;
                this.erasering = true;
                this.pulling = false;
            } else if (cache.isPencil) {
                this.canvas.isDrawingMode = false;
                this.draging = true;
                this.erasering = true;
                this.canvas.selection = false;
                this.canvas.interactive = false;
                this.pulling = false;
            } else if (cache.isText) {
                this.disabledLine();
                this.canvas.selection = false;
                this.canvas.interactive = false;
                this.draging = true;
                this.erasering = true;
                this.pulling = false;
            } else if (cache.isSelection) {
                this.disabledLine();
                this.canvas.selection = false;
                this.canvas.interactive = false;
                this.draging = true;
                this.erasering = true;
                this.pulling = false;
            } else if (cache.isImage) {
                this.disabledLine();
                this.canvas.selection = false;
                this.canvas.interactive = false;
                this.draging = true;
                this.erasering = true;
                this.pulling = false;
            } else if(cache.isPull){
                this.disabledLine();
                this.canvas.selection = true;
                this.canvas.interactive = true;
                this.draging = true;
                this.erasering = false;
                this.pulling = false;
            }

            cache.isLine = cache.isArc = cache.isMove = cache.isPencil = cache.isRectangle = cache.isEraser = cache.isText =
                cache.isSelection = cache.isShape = cache.isPull = false;

            cache['is' + shape] = true;

            if (cache.isEraser) {
                this.disabledLine();
                this.canvas.selection = false;
                this.canvas.interactive = false;
                this.draging = false;
                this.erasering = true;
                this.pulling = false;
            } else if (cache.isMove) {
                this.disabledLine();
                this.canvas.selection = true;
                this.canvas.interactive = true;
                this.draging = true;
                this.erasering = false;
                this.pulling = false;
            } else if (cache.isSelection) {
                this.disabledLine();
                this.canvas.selection = true;
                this.canvas.interactive = true;
                this.draging = false;
                this.erasering = false;
                this.pulling = true;
            } else if (cache.isShape) {
                this.disabledLine();
                this.canvas.selection = true;
                this.canvas.interactive = true;
                this.draging = false;
                this.erasering = false;
                this.pulling = false;
            } else if (cache.isPencil) {
                this.canvas.isDrawingMode = true;
                this.draging = false;
                this.erasering = false;
                this.canvas.selection = true;
                this.canvas.interactive = true;
                this.canvas.freeDrawingBrush.width = 3;
                this.pulling = false;
            } else if (cache.isText) {
                this.disabledLine();
                this.canvas.selection = true;
                this.canvas.interactive = true;
                this.draging = false;
                this.erasering = false;
                this.pulling = false;
            } else if (cache.isImage) {
                this.disabledLine();
                this.canvas.selection = true;
                this.canvas.interactive = true;
                this.draging = false;
                this.erasering = false;
                this.pulling = false;
            } else if(cache.isPull){
                this.disabledLine();
                this.canvas.selection = false;
                this.canvas.interactive = false;
                this.draging = false;
                this.erasering = false;
                this.pulling = true;
            }

            return this;
        },
        //清除白板数据
        _clear: function() {
            if (!!this.canvas) this.canvas.clear();
            this.deleteVideo();
        },
        //根据uuid 获取元素
        _getFabricObjectByUuid: function(uuid) {
            var fabircObject = null;

            this.canvas.getObjects().forEach(function(object) {
                if (typeof object.id != 'undefined' && object.id === uuid) {
                    fabircObject = object;
                }
            })

            return fabircObject;
        },
        //橡皮擦
        eraser: function() {
            this.disabledLine();
            this._is('Eraser');
            this.setBlur();
        },
        //直线
        line: function() {
            if (!!this.canvas) {
                this.canvas.add(new fabric.Line([50, 100, 200, 200], {
                    id: getRandomId(),
                    left: 100,
                    top: 200,
                    stroke: 'black'
                }));
            }
        },
        //三角形
        triangle: function() {
            if (!!this.canvas) {
                this.canvas.add(new fabric.Triangle({
                    id: getRandomId(),
                    width: 50,
                    height: 50,
                    left: 150,
                    top: 200,
                    fill: '#f0f0f0',
                    strokeWidth: 1,
                    stroke: "black"
                }));
            }
        },
        //方形
        rect: function() {
            if (!!this.canvas) {
                this.canvas.add(new fabric.Rect({
                    id: getRandomId(),
                    width: 50,
                    height: 50,
                    lockUniScaling: true,
                    left: this.getObjectCenter(50, 50).x,
                    top: this.getObjectCenter(50, 50).y,
                    fill: '#f0f0f0',
                    strokeWidth: 1,
                    stroke: "black"
                }));
            }
            this.disabledLine();
        },
        //圆形
        circle: function() {
            if (!!this.canvas) {
                this.canvas.add(new fabric.Circle({
                    id: getRandomId(),
                    radius: 40,
                    left: this.getObjectCenter(50, 50).x,
                    top: this.getObjectCenter(50, 50).y,
                    fill: '#f0f0f0',
                    strokeWidth: 1,
                    stroke: "black"
                        //opacity: 0.5
                }));
            }
        },
        //文字
        text: function() {
            var textSample = new fabric.IText('请输入文字', {
                id: getRandomId(),
                left: 200,
                top: 200,
                fontFamily: 'helvetica',
                fill: 'black',
                fontWeight: '',
                originX: 'left',
                hasRotatingPoint: true,
                centerTransform: true,
                selectable: true,
                isEditing: true
            });

            this.canvas.add(textSample);
        },
        image: function(url) {

            var img = new Image(),
                _this = this;

            img.onload = function() {
                var _w = this.width,
                    _h = this.height,
                    canvas_w = _this.canvas.width,
                    canvas_h = _this.canvas.height;
                var img_attr = setimgsize(_w, _h, canvas_w / 1.5, canvas_h / 1.5);
                var rdm = parseInt(10 * Math.random()) + 1;

                var left = (canvas_w - img_attr.Width) / rdm,
                    top = (canvas_h - img_attr.Height) / rdm;


                if (!!img) {
                    fabric.Image.fromURL(url, function(image) {
                        image.set({
                                id: getRandomId(),
                                width: img_attr.Width,
                                height: img_attr.Height,
                                left: left,
                                top: top,
                                angle: 0,
                                active: false
                            })
                            .setCoords();
                        _this.canvas.add(image);

                        _this.setActiveTool({
                            type: 'Move',
                            fn: function() {
                                $("#drag").addClass('active').siblings().removeClass('active');
                                _this.setMouse('mouse-move');
                            }
                        });
                    }, {
                        left: left,
                        top: top,
                        _width: img_attr.Width,
                        _height: img_attr.Height
                    });
                }
            };
            img.src = url;
        },
        //添加视频
        video: function(t) {
            //'http://124.205.69.131/mp4files/2235000001545D35/video-js.zencoder.com/oceans-clip.mp4'
            var _this = this,
                url = t.url;

            var img = new Image();
            img.onload = function() {
                var _w = this.width,
                    _h = this.height,
                    canvas_w = _this.canvas.width,
                    canvas_h = _this.canvas.height;
                var img_attr = setimgsize(_w, _h, canvas_w / 1.5, canvas_h / 1.5);
                var rdm = parseInt(10 * Math.random()) + 1;

                var left = (canvas_w - img_attr.Width) / rdm,
                    top = (canvas_h - img_attr.Height) / rdm;

                console.log(rdm, left, top);

                if (!!img) {
                    fabric.Image.fromURL("https://rc.hoozha.com/2017/0217d/38cpbf6su79lbcpb.png", function(image) {
                        image.set({
                                id: getRandomId(),
                                width: 640,
                                url: url,
                                height: 360,
                                left: left,
                                top: top,
                                angle: 0,
                                active: false,
                                ppts: []
                            })
                            .setCoords();
                        _this.canvas.add(image);

                        _this.setActiveTool({
                            type: 'Move',
                            fn: function() {
                                $("#drag").addClass('active').siblings().removeClass('active');
                                _this.setMouse('mouse-move');
                            }
                        });
                    }, {
                        left: left,
                        top: top,
                        _width: 640,
                        _height: 360,
                        url: url
                    });
                }
            };
            img.src = "https://rc.hoozha.com/2017/0217d/38cpbf6su79lbcpb.png";
        },
        _initVideo: function(t) {
            if (!this.myPlayer) $(this.el).append(this.videoHtml);

            this.activeVideoObject = t;

            if (!this.myPlayer) this.myPlayer = videojs('video_player');

            this.myPlayer.show();

            this.myPlayer.src(t.url);

            this._initOffset(t);

            this.myPlayer.play();

            var key = t.id,
                time;

            if (time = store.getStore(key)) {
                this.myPlayer.currentTime(time);
            }

            this._setControls();

            this._addVideoEvents();

            this.vdsocket.emit('playVideo', this.roomid, t);
        },
        //根据所选元素计算播放器的位置
        _initOffset: function(t, mine) {
            // var left = t.left, top = t.top, width = t.width * t.scaleX, height = t.height * t.scaleY;
            if (!!mine) {
                var left = fabric.StaticCanvasWidth * t.left / t.canvasWidth,
                    top = fabric.StaticCanvasHeight * t.top / t.canvasHeight,
                    width = fabric.StaticCanvasWidth * t.RatioOffset[0] * t.scaleX,
                    height = fabric.StaticCanvasHeight * t.RatioOffset[1] * t.scaleY;
            } else {
                var left = t.left,
                    top = t.top,
                    width = fabric.StaticCanvasWidth * t.RatioOffset[0] * t.scaleX,
                    height = fabric.StaticCanvasHeight * t.RatioOffset[1] * t.scaleY;
            }


            var offset = this.ele_canvas.offset();

            this.myPlayer.width(width).height(height);

            $(".video-js-box").css({
                left: left + offset.left,
                top: top + offset.top
            });
        },
        //接受对方传过来的播放视频指令
        _initBVideo: function(t) {
            if (!this.myPlayer) {
                $(this.el).append(this.videoHtml);

                this.myPlayer = videojs('video_player');

                this.myPlayer.src(t.url);
            }



            this._initOffset(t, '1');

            this.myPlayer.play();

            this._setControls();

            this._addVideoEvents();
        },

        _setControls: function() {
            if (this.type == '2') {
                this.myPlayer.controls(false);
            } else {
                this.myPlayer.controls(true);
            }

        },

        //删除视频
        deleteVideo: function() {
            this._clearInterval();
            if (!!this.myPlayer) {
                this.myPlayer.hide();
                this.myPlayer.dispose();

                $('.video-js-box').remove();

                delete this.myPlayer;
            }
            //只有创建者有权限删除
            if (type == 1) this.vdsocket.emit('deleteVideo', this.roomid);
        },
        //设置粗细
        setLineBold: function(t) {
            this.canvas.freeDrawingBrush.width = t.width || 2;
            !!t.fn && t.fn();
        },
        //设置颜色
        setLineColor: function(t) {
            this.canvas.freeDrawingBrush.color = t.color;
            !!t.fn && t.fn();
        },
        //禁止画写
        disabledLine: function() {
            this.canvas.isDrawingMode = false;
        },
        disableMove: function () {
            this._is("Eraser");
            this.erasering = false;
        },
        //激活画写
        activateLine : function () {
            this.canvas.isDrawingMode = true;
        },
        //设置active状态
        setActiveTool: function(t) {
            this._is(t.type) && t.fn();

            this.setBlur(); //失去焦点，将选中状态去掉

            return this;
        },
        //清除白板的所有数据
        clearAll: function() {
            if (!this.canvas.bypassHistory) {
                actionHistory.push({
                    type: 'canvas_cleared',
                    canvas: JSON.stringify(this.canvas)
                });
            }
            if (!!this.canvas) this._clear();
            objsInCanvas.objects = [];
            this.socket.emit('drawClear', this.roomid, this.drawId);
        },
        //失去焦点,并且将去掉选中状态
        setBlur: function() {
            this.canvas.deactivateAll();
            this.canvas.renderAll('blur');
            this.blurFn();
        },
        //撤销
        undo: function(t) {
            var _this = this,
                action, objectCandidate;

            try {
                action = actionHistory.pop();
                if (actionHistory.sp == -1) {
                    $(document.body).trigger('button.disabled');
                }
            } catch (e) {
                console.log(e.message);
                return;
            }

            if (action.type === 'object_added') {
                objectCandidate = JSON.parse(action.object);
                var object = _this._getFabricObjectByUuid(objectCandidate.id);
                object.bypassHistory = true;
                this.canvas.remove(object);
            } else if (action.type === 'object_removed') {
                objectCandidate = JSON.parse(action.object);
                fabric.util.enlivenObjects([objectCandidate], function(actualObjects) {
                    actualObjects[0].id = objectCandidate.id;
                    var object = actualObjects[0];
                    object.bypassHistory = true;
                    _this.canvas.add(object);
                    object.bypassHistory = false;
                })
            } else if (action.type === 'object_modified' || action.type === 'text_changed') {
                objectCandidate = JSON.parse(action.objectOld);
                fabric.util.enlivenObjects([objectCandidate], function(actualObjects) {
                    actualObjects[0].id = objectCandidate.id;
                    var object = actualObjects[0];
                    var existingObject = _this._getFabricObjectByUuid(objectCandidate.id);
                    if (existingObject) {
                        existingObject.bypassRemoveEvent = true;
                        existingObject.bypassHistory = true;
                        _this.canvas.remove(existingObject);
                    }
                    object.bypassHistory = true;
                    _this.canvas.add(object);
                    object.bypassHistory = false;
                })
            } else if (action.type === 'canvas_cleared') {
                var canvasPresentation = JSON.parse(action.canvas);
                _this.canvas.bypassHistory = true;
                _this.canvas.loadFromJSON(canvasPresentation);
                _this.canvas.renderAll();
                _this.canvas.bypassHistory = false;
                _this._drawUpdate("added");
            }
        },
        renderAll: function() {
            this.canvas.renderAll();
            this._drawUpdate('modified');
        },
        //获取选中的元素
        getActiveObject: function(t) {
            if (!!t && t.fn) {
                if (this.canvas) {
                    t.fn(this.canvas.getActiveObject());
                }
            } else {
                return this.canvas.getActiveObject();
            }
        },
        //删除选中的元素
        deleteActiveObject: function(t) {
            var _this = this;
            var activeObject = this.canvas.getActiveObject(),
                activeGroup = this.canvas.getActiveGroup();

            if (activeGroup) {
                var objectsInGroup = activeGroup.getObjects();
                this.canvas.discardActiveGroup();
                this.canvas.removeGroup(objectsInGroup);
                this._drawUpdate('modified');
                _this.canvas.renderAll("blur");
                // objectsInGroup.forEach(function(object) {
                //     if(object.type != 'image')  _this.canvas.removeGroup(object);
                // });
            } else {
                if (!!activeObject && ((typeof activeObject.isEditing == 'undefined') || !activeObject.isEditing)) this.canvas.remove(this.canvas.getActiveObject());
            }

            t.fn && t.fn(activeObject);
        },
        //旋转特定角度
        rotateActiveObject: function(t) {
            var _this = this;
            var activeObj = this.canvas.getActiveObject(),
                angle = activeObj.angle;

            activeObj.setAngle(angle + 90);

            this.canvas.renderAll();

            !!t.fn ? t.fn(activeObj) : '';
            //发送image旋转事件
            _this.socket.emit("rotateImage", _this.roomid, _this.drawId, type, JSON.stringify(activeObj), _this.canvas.getWidth(), _this.canvas.getHeight());
            objsInCanvas.objects.forEach(function(element,index,array) {
                if (element.id == activeObj.id) {
                    array.splice(index,1,activeObj);
                }
            });
            //this._drawUpdate('rotate');
        },

        sendBackwards: function() {
            var activeObject = this.canvas.getActiveObject();

            if (activeObject) this.canvas.sendBackwards(activeObject);
        },
        //将选中元素z-index降低
        sendToBack: function() {
            var activeObject = this.canvas.getActiveObject();

            if (activeObject) this.canvas.sendToBack(activeObject);
            this._drawUpdate("modified");
        },

        bringForward: function() {
            var activeObject = this.canvas.getActiveObject();
            if (activeObject) this.canvas.bringForward(activeObject);
        },
        //将选中元素z-index提升
        bringToFront: function() {
            var activeObject = this.canvas.getActiveObject();
            if (activeObject) this.canvas.bringToFront(activeObject);
            this._drawUpdate("modified");
        },

        reset: function() {

        },
        //获取canvas 对象
        getCanvas: function() {
            return this.canvas;
        },
        //获取canvas的数据
        getCanvasData: function(drawid) {
            if (!!drawid) {
                this.canvas.clear();
                this.drawId = drawid;
                this.socket.emit('getDraw', drawid);
            }
        },
        //锁定元素不可以操作
        lock: function(t) {
            var activeObject = this.canvas.getActiveObject();

            if (activeObject && !!t) {
                activeObject.set('lockMovementX', true).setCoords();
                activeObject.set('lockMovementY', true).setCoords();
                activeObject.set('lockScalingX', true).setCoords();
                activeObject.set('lockScalingY', true).setCoords();
                this.canvas.renderAll();
            } else {
                activeObject.set('lockMovementX', false).setCoords();
                activeObject.set('lockMovementY', false).setCoords();
                activeObject.set('lockScalingX', false).setCoords();
                activeObject.set('lockScalingY', false).setCoords();
                this.canvas.renderAll();
            }
        },
        //设置鼠标样式
        setMouse: function(type) {
            this.canvas.setStyleCursor(type);
        },
        //将canvas转化为图片
        toImage: function() {
            window.open(
                'data:image/svg+xml;utf8,' +
                encodeURIComponent(this.canvas.toSVG()));
        },
        resizeCanvas : function (a) {
            this.width = document.documentElement.clientWidth || window.screen.width || document.body.offsetWidth;
            this.heigth = document.documentElement.clientHeight || window.screen.height || document.body.offsetHeight;

            if(a == 1){
                this.width = (this.width - 116) / 2;
            } else {
                this.width = this.width - 116;
            }

            this.heigth = this.heigth - 146;

            this._resetSize(this.width, this.heigth, 1);
            this.canvas.renderAll();
            this.canvas.calcOffset();
        },
        setCanvas : function () {
            this.canvas.setWidth(200);
            this.canvas.setHeight(300);
        }
    }

    function setimgsize(imgWidth, imgHeight, maxWidth, maxHeight) {
        var maxWidth = maxWidth || 900,
            maxHeight = maxHeight || 1000,
            maxconsult = maxWidth / maxHeight,
            imgconsult = imgWidth / imgHeight,
            imgW, imgH;
        if (imgHeight >= maxHeight && imgWidth < maxWidth) {
            imgW = (maxHeight * imgWidth) / imgHeight;
            imgH = maxHeight;
        } else if (imgHeight < maxHeight && imgWidth >= maxWidth) {
            //图高<最大高 图宽>最大宽
            imgH = (maxWidth * imgHeight) / imgWidth;
            imgW = maxWidth;
        } else if (imgWidth <= maxWidth && imgHeight <= maxHeight) {
            //图宽<=最大宽 图高<=最大高
            imgW = imgWidth;
            imgH = imgHeight;
        } else if (imgconsult >= maxconsult && imgWidth > maxWidth && imgHeight > maxHeight) {
            //图高>最大高 图宽>最大宽 图比>=最大比
            imgW = maxWidth;
            imgH = (maxWidth * imgHeight) / imgWidth;
        } else if (imgconsult < maxconsult && imgWidth > maxWidth && imgHeight > maxHeight) {
            //图高>最大高 图宽>最大宽 图比<最大比
            imgH = maxHeight;
            imgW = (maxHeight * imgWidth) / imgHeight;
        }
        imgWidth = parseInt(imgW);
        imgHeight = parseInt(imgH);

        return {
            Width: imgWidth,
            Height: imgHeight
        };
    }

    $.fn.Draw = function(option, t) {
        var ob = "";

        this.each(function() {
            var $this = $(this),
                data = $this.data('Draw'),
                options = typeof option == 'object' && option;

            if (!data) {
                $this.data('Draw', (data = new Draw(this, options)));
            } else {
                data.reset(options);
            }

            if (typeof option == 'string') data[option](t);

            ob = data;
        })

        return ob;
    }

    $.fn.Draw.defaults = {
        canvasid: getRandomId(),
        roomid: '1000',
        serverUrl: '',
        video: false
    }
}(window.jQuery || window.Zepto))