// All material copyright ESRI, All Rights Reserved, unless otherwise specified.
// See http://js.arcgis.com/3.32/esri/copyright.txt for details.
//>>built
define("esri/dijit/geoenrichment/utils/htmlToSvg/supportClasses/VisibilityChecker",["./dom-style"],function(b){return{checkNode:function(a){b.cacheComputedStyle(a);if("hidden"===b.get(a,"visibility")||"none"===b.get(a,"display")||.01>=Number(b.get(a,"opacity")))return b.clearCache(a),!1;b.clearCache(a);return!0},checkRect:function(a){return!!a.style.getBackground().opacity&&(0<a.style.getBorder().radius||0<a.style.getBorder().ew||0<a.style.getBorder().eh||0<a.style.getPaddings().bw||0<a.style.getPaddings().bh)},
checkBorder:function(a){return!!a.width&&!!a.opacity}}});