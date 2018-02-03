// All material copyright ESRI, All Rights Reserved, unless otherwise specified.
// See http://js.arcgis.com/3.20/esri/copyright.txt for details.
//>>built
define("esri/plugins/moment","require exports dojo/_base/kernel moment/moment".split(" "),function(k,b,h,e){var f={};b.load=function(a,b,g){a=h.locale;var c=
a in f;if(!c){var d=a.split("-");1<d.length&&d[0]in f&&(a=d[0],c=!0)}c?b(["moment/locale/"+a],function(){g(e)}):g(e)}});