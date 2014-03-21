Pixels = new Meteor.Collection('pixels');
Painters = new Meteor.Collection('painters');
Paintings = new Meteor.Collection('paintings');

var paintWidth = 40;
var paintHeight = 20;
var COLOR_SEPARATOR = '%%%';
var PNGlib;

if (Meteor.isClient) {
	Meteor.startup(function(){
		$('.colorDiv').each(function(i,div){
			$(div).css('background',$(div).attr('title'));
		});
		
		$('#screenshotModal').modal({show:false});
	});
	
	// COLOR CHOICE
	Template.colorPalette.events = {
		'click .colorDiv': function(event){
				$('.colorDiv').removeClass('selected');
				$(event.target).addClass('selected');
			}
	}
	
	// PAINTING
	Template.myPaint.pixels = function(){
		return Pixels.find({},{sort:{num:-1}});
	}
	
	Template.myPaint.mylist = function(items, options){
		var out = '';
		items.forEach(function(pixel, i){
			if (pixel.when) {
				pixel.when = myDateFormat(pixel.when);
			}
			
			if (i!=0 && i%paintWidth==0)
				out += '<br style="clear:both;">';
			out += options.fn(pixel);
		});
		
		return out;
	};
	
	Template.myPaint.events = {
		'click .singlePixel': function(event){
			if (checkPainterName()) {
				var painterName = $('#nameTF').val();
				// Add painter to list
				var count = Painters.find({name:painterName}).count();
				if (count==0) // New painter
					Painters.insert({name:painterName,status:'online'});
				else {
					// Set online status
					var painter = Painters.findOne({name:painterName});
					if (painter.status != 'online')
						Painters.update({_id:painter._id},{$set:{status:'online'}});
				}
				
				var pixel = Pixels.findOne({_id:event.target.id});
				// Put previous painter offline (if he has no more pixel)
				if (Pixels.find({painter:pixel.painter}).count()<=1) {
					var oldPainter = Painters.findOne({name:pixel.painter});
					Painters.update({_id:oldPainter._id},{$set:{status:'offline'}});
				}

				var chosenColor = rgbToHex($('.colorDiv.selected').css('background-color'));
				Pixels.update({_id:event.target.id},{$set:{color:chosenColor,painter:painterName,when:Date.now()}});
			}
		}
	}
	
	// PAINTERS
	Template.painters.painters = function(){
		return Painters.find({},{sort:{status:-1}});
	}

	// EXPORT
	Template.export.events = {
		'click .exportButt' : function(event){
				if (checkPainterName()) {
					Meteor.call('exportPainting',$('#nameTF').val(),function(error,result){
						alert(result.message);
					});
				}
			},
		'click .screenshotDiv dt img' : function(event){
				console.log(event.target.id.replace('thumb_',''));
				var painting = Paintings.findOne({_id:event.target.id.replace('thumb_','')});
				$('#screenshotModalLabel').html('Screenshot taken by '+painting.who+' - '+myDateFormat(painting.when));
				$('#screenshotModal .modal-body')
					.html($('<img>').attr('src','data:image/png;base64,'+colorArrayToBase64(painting.what, 22, 1, 40)));
					
				$('#screenshotModal').modal('show');
			}
	}
	
	Template.export.screenshots = function() {
		return Paintings.find({},{sort:{when:-1}});
	}
	
	Template.export.screenshotlist = function(items, options){
		var out = '';
		items.forEach(function(painting, i){
			if (painting.when) {
				painting.when = myDateFormat(painting.when);
			}
			
			if (painting.what) {
				painting.what = colorArrayToBase64(painting.what, 4, 0, 40);
			}
			
			out += options.fn(painting);
		});
		
		return out;
	};
}

if (Meteor.isServer) {
	var exportLimit = 300; // seconds - 5 minutes
	
  Meteor.startup(function () {
		// code to run on server at startup
		if (Pixels.find().count() === 0) {
			for(var i=0;i<(paintWidth*paintHeight);i++)
				Pixels.insert({color:'#00f',num:i});
		}
		
		// Collection permissions
		Painters.allow({
			insert: function (userId, doc) {
					return true;
				},
			update: function (userId, doc, fieldNames, modifier) {
					return true;
				}
		});
		
		Pixels.allow({
			insert: function (userId, doc) {
					return true;
				},
			update: function (userId, doc, fieldNames, modifier) {
					return true;
				}
		});
		
		// Server methods
		Meteor.methods({
			exportPainting : function(painter) {
				var lastExport = null;
				if (Paintings.find({},{sort:{when:-1}}).count()>0) {
					var lastScreenshot = Paintings.findOne({},{sort:{when:-1}});
					lastExport = lastScreenshot.when;
				}
				
				if(lastExport && ((Date.now() - lastExport) < exportLimit*1000 ))
					return {result:false,message:'Another screenshot?? Please, be patient and retry in a few minutes...'};
				else {
					lastExport = Date.now();
					var paintingString = '';
					Pixels.find({},{sort:{num:-1}}).forEach(function(pixel,i){
						paintingString += pixel.color+COLOR_SEPARATOR;
					});
					paintingString = paintingString.slice(0,-COLOR_SEPARATOR.length);
					
					if (Paintings.find({what:paintingString}).count()>0)
						return {result:false,message:'Ehi!! This screenshot already exists! Take a look at the export list...'};
					
					Paintings.insert({what:paintingString,when:lastExport,who:painter});
					
					return {result:true,message:'Painting successfully exported'};
				}
			}
		});
		
		// When server restarts check which painters are online/offline
		Painters.find().forEach(function(painter,i){
			if (Pixels.find({painter:painter.name}).count()>0)
				Painters.update({_id:painter._id},{$set:{status:'online'}});
			else
				Painters.update({_id:painter._id},{$set:{status:'offline'}});
		});
  });
}

// Functions
function myDateFormat(when) {
	var d = new Date(when);
	return d.getFullYear()+'/'+("0"+(d.getMonth()+1)).slice(-2)+'/'+d.getDate()+' '
		+("0"+d.getHours()).slice(-2)+':'+("0"+d.getMinutes()).slice(-2);
}

function checkPainterName(){
	$('#errorMessage').html('');
	var painterName = $('#nameTF').val();
	if (painterName && painterName!='') {
		return true;
	}
	else {
		$('#errorMessage').html('Please, enter your name!');
		return false;
	}
}

function hexToRgb (hex) {
    // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
    var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, function(m, r, g, b) {
        return r + r + g + g + b + b;
    });

    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function rgbToHex (rgb) {
     if (  rgb.search("rgb") == -1 ) {
          return rgb;
     }
     else {
          rgb = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+))?\)$/);
					
          function hex(x) {
               return ("0" + parseInt(x).toString(16)).slice(-2);
          }
          return "#" + hex(rgb[1]) + hex(rgb[2]) + hex(rgb[3]); 
     }
}

function drawPixel(p, pixelDim, hexcolor, borderHexcolor, borderWidth, x, y) {
	var pixelColor = hexToRgb(hexcolor);
	var borderColor = hexToRgb(borderHexcolor);
	for (var i=0; i<pixelDim; i++) {
		var pngColor;
		for (var j=0; j<pixelDim; j++) {
			if (j<=0+(borderWidth-1) || j>=pixelDim-borderWidth || i<=0+(borderWidth-1) || i>=pixelDim-borderWidth)
				pngColor = p.color(borderColor.r,borderColor.g,borderColor.b);
			else
				pngColor = p.color(pixelColor.r, pixelColor.g, pixelColor.b);
			p.buffer[p.index(i+(x*pixelDim),j+(y*pixelDim))] = pngColor;
		}
	}
	
	return p;
}

function colorArrayToBase64 (colorStr, pixelDim, pixelBorder, width) {
	colorArr = colorStr.split(COLOR_SEPARATOR);
	var maxWidth = width;
	var height = (maxWidth>=colorArr.length)? 1 : Math.floor(colorArr.length / maxWidth)+((colorArr.length % maxWidth == 0)?0:1);
	var png = new PNGlib(pixelDim*maxWidth, pixelDim*height, 256); // construcor takes height, weight and color-depth
	var background = png.color(0, 0, 0, 0); // set the background transparent
	var pixelCounter = 0;
	var x=0;
	var y=0;
	while (pixelCounter<colorArr.length) {
		drawPixel(png, pixelDim, rgbToHex(colorArr[pixelCounter]), '#000', pixelBorder, x, y);
		pixelCounter++;
		x++;
		if (x>=maxWidth) {
			x=0;
			y++;
		}
	}

	png.getBase64();
	return png.getBase64();
}

/**
* A handy class to calculate color values.
*
* @version 1.0
* @author Robert Eisele <robert@xarg.org>
* @copyright Copyright (c) 2010, Robert Eisele
* @link http://www.xarg.org/2010/03/generate-client-side-png-files-using-javascript/
* @license http://www.opensource.org/licenses/bsd-license.php BSD License
*
*/

(function() {

	// helper functions for that ctx
	function write(buffer, offs) {
		for (var i = 2; i < arguments.length; i++) {
			for (var j = 0; j < arguments[i].length; j++) {
				buffer[offs++] = arguments[i].charAt(j);
			}
		}
	}

	function byte2(w) {
		return String.fromCharCode((w >> 8) & 255, w & 255);
	}

	function byte4(w) {
		return String.fromCharCode((w >> 24) & 255, (w >> 16) & 255, (w >> 8) & 255, w & 255);
	}

	function byte2lsb(w) {
		return String.fromCharCode(w & 255, (w >> 8) & 255);
	}

	PNGlib = function(width,height,depth) {

		this.width   = width;
		this.height  = height;
		this.depth   = depth;

		// pixel data and row filter identifier size
		this.pix_size = height * (width + 1);

		// deflate header, pix_size, block headers, adler32 checksum
		this.data_size = 2 + this.pix_size + 5 * Math.floor((0xfffe + this.pix_size) / 0xffff) + 4;

		// offsets and sizes of Png chunks
		this.ihdr_offs = 0;									// IHDR offset and size
		this.ihdr_size = 4 + 4 + 13 + 4;
		this.plte_offs = this.ihdr_offs + this.ihdr_size;	// PLTE offset and size
		this.plte_size = 4 + 4 + 3 * depth + 4;
		this.trns_offs = this.plte_offs + this.plte_size;	// tRNS offset and size
		this.trns_size = 4 + 4 + depth + 4;
		this.idat_offs = this.trns_offs + this.trns_size;	// IDAT offset and size
		this.idat_size = 4 + 4 + this.data_size + 4;
		this.iend_offs = this.idat_offs + this.idat_size;	// IEND offset and size
		this.iend_size = 4 + 4 + 4;
		this.buffer_size  = this.iend_offs + this.iend_size;	// total PNG size

		this.buffer  = new Array();
		this.palette = new Object();
		this.pindex  = 0;

		var _crc32 = new Array();

		// initialize buffer with zero bytes
		for (var i = 0; i < this.buffer_size; i++) {
			this.buffer[i] = "\x00";
		}

		// initialize non-zero elements
		write(this.buffer, this.ihdr_offs, byte4(this.ihdr_size - 12), 'IHDR', byte4(width), byte4(height), "\x08\x03");
		write(this.buffer, this.plte_offs, byte4(this.plte_size - 12), 'PLTE');
		write(this.buffer, this.trns_offs, byte4(this.trns_size - 12), 'tRNS');
		write(this.buffer, this.idat_offs, byte4(this.idat_size - 12), 'IDAT');
		write(this.buffer, this.iend_offs, byte4(this.iend_size - 12), 'IEND');

		// initialize deflate header
		var header = ((8 + (7 << 4)) << 8) | (3 << 6);
		header+= 31 - (header % 31);

		write(this.buffer, this.idat_offs + 8, byte2(header));

		// initialize deflate block headers
		for (var i = 0; (i << 16) - 1 < this.pix_size; i++) {
			var size, bits;
			if (i + 0xffff < this.pix_size) {
				size = 0xffff;
				bits = "\x00";
			} else {
				size = this.pix_size - (i << 16) - i;
				bits = "\x01";
			}
			write(this.buffer, this.idat_offs + 8 + 2 + (i << 16) + (i << 2), bits, byte2lsb(size), byte2lsb(~size));
		}

		/* Create crc32 lookup table */
		for (var i = 0; i < 256; i++) {
			var c = i;
			for (var j = 0; j < 8; j++) {
				if (c & 1) {
					c = -306674912 ^ ((c >> 1) & 0x7fffffff);
				} else {
					c = (c >> 1) & 0x7fffffff;
				}
			}
			_crc32[i] = c;
		}

		// compute the index into a png for a given pixel
		this.index = function(x,y) {
			var i = y * (this.width + 1) + x + 1;
			var j = this.idat_offs + 8 + 2 + 5 * Math.floor((i / 0xffff) + 1) + i;
			return j;
		}

		// convert a color and build up the palette
		this.color = function(red, green, blue, alpha) {

			alpha = alpha >= 0 ? alpha : 255;
			var color = (((((alpha << 8) | red) << 8) | green) << 8) | blue;

			if (typeof this.palette[color] == "undefined") {
				if (this.pindex == this.depth) return "\x00";

				var ndx = this.plte_offs + 8 + 3 * this.pindex;

				this.buffer[ndx + 0] = String.fromCharCode(red);
				this.buffer[ndx + 1] = String.fromCharCode(green);
				this.buffer[ndx + 2] = String.fromCharCode(blue);
				this.buffer[this.trns_offs+8+this.pindex] = String.fromCharCode(alpha);

				this.palette[color] = String.fromCharCode(this.pindex++);
			}
			return this.palette[color];
		}

		// output a PNG string, Base64 encoded
		this.getBase64 = function() {

			var s = this.getDump();

			var ch = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
			var c1, c2, c3, e1, e2, e3, e4;
			var l = s.length;
			var i = 0;
			var r = "";

			do {
				c1 = s.charCodeAt(i);
				e1 = c1 >> 2;
				c2 = s.charCodeAt(i+1);
				e2 = ((c1 & 3) << 4) | (c2 >> 4);
				c3 = s.charCodeAt(i+2);
				if (l < i+2) { e3 = 64; } else { e3 = ((c2 & 0xf) << 2) | (c3 >> 6); }
				if (l < i+3) { e4 = 64; } else { e4 = c3 & 0x3f; }
				r+= ch.charAt(e1) + ch.charAt(e2) + ch.charAt(e3) + ch.charAt(e4);
			} while ((i+= 3) < l);
			return r;
		}

		// output a PNG string
		this.getDump = function() {

			// compute adler32 of output pixels + row filter bytes
			var BASE = 65521; /* largest prime smaller than 65536 */
			var NMAX = 5552;  /* NMAX is the largest n such that 255n(n+1)/2 + (n+1)(BASE-1) <= 2^32-1 */
			var s1 = 1;
			var s2 = 0;
			var n = NMAX;

			for (var y = 0; y < this.height; y++) {
				for (var x = -1; x < this.width; x++) {
					s1+= this.buffer[this.index(x, y)].charCodeAt(0);
					s2+= s1;
					if ((n-= 1) == 0) {
						s1%= BASE;
						s2%= BASE;
						n = NMAX;
					}
				}
			}
			s1%= BASE;
			s2%= BASE;
			write(this.buffer, this.idat_offs + this.idat_size - 8, byte4((s2 << 16) | s1));

			// compute crc32 of the PNG chunks
			function crc32(png, offs, size) {
				var crc = -1;
				for (var i = 4; i < size-4; i += 1) {
					crc = _crc32[(crc ^ png[offs+i].charCodeAt(0)) & 0xff] ^ ((crc >> 8) & 0x00ffffff);
				}
				write(png, offs+size-4, byte4(crc ^ -1));
			}

			crc32(this.buffer, this.ihdr_offs, this.ihdr_size);
			crc32(this.buffer, this.plte_offs, this.plte_size);
			crc32(this.buffer, this.trns_offs, this.trns_size);
			crc32(this.buffer, this.idat_offs, this.idat_size);
			crc32(this.buffer, this.iend_offs, this.iend_size);

			// convert PNG to string
			return "\211PNG\r\n\032\n"+this.buffer.join('');
		}
	}

})();
