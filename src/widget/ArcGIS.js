/*
    ArcGIS Widget
    ========================
    @file      : arcgis.js
    @version   : 1.2.2
    @author    : Ivo Sturm
    @date      : 04-08-2019
    @copyright : First Consulting
    @license   : Apache v2
	
	Documentation
	========================	
	This widget caters for simple usage of predefined ArcGIS layers, using the JavaScript API. The full API is loaded into the filesystem, because it gave too many problems with the Mendix Dojo implementation.
	
	Releases
	========================
	v1.0	First version. Features supported: 
	- Loosely connect ArcGIS and Mendix database with single ArcGIS ObjectID in Mendix;
	- Plot both Map Server and Feature Server Layers;
	- Toggling Layer visibility;
	- Show all objects in Layer or only restrict to objects in Mendix
		o	XPath;
		o	DataSource;
		o	ListenToGrid;
	- Fully customize InfoWindow;
		o	On Click Microflow to trigger Mendix logic from infowindow;
	- Customize marker by changing symbol and color;
	- Legend;
		o	Set a label in the legend per Color
	- Search widget with autocomplete to easily zoom to certain address;
	- Custom styling settings to incorporate company specific coloring;
	
	v1.1.0	Upgrade to Mendix 7
	- change in lib/esri/kernel.js file
	- introduced relative paths for all libraries loaded, since in Mendix 7 Mendix sometimes tried to retrieve from clientsystem instead of ArcGIS folders..
	- got rid of deprecated store.caller and changed it to origin.
	
	v1.1.1
	- added enabling / disabling for custom styling of polygons (coloring) and point (coloring + marker type)
	
	v1.2.0
	- no change, only updated uglified js version which gave multiDefine errors
	
	v1.2.1
	- changed relative path for dojox folders to ArcGIS/lib/dojox since as of Mendix 7.22 some dojox modules have been removed from Mendix hence should be retrieved from widget instead.
 	
	v1.2.2
	- fix for unsubscribe not working in listen-to-grid scenario in Mendix 7.23.6 not working anymore. removed some obsolete logging as well
	
	Not in this version
	========================
	- Editing / Drawing
	- Authentication
		
*/

var dojoConfig = {
	async: false,
	locale: "en",
	paths: {
		dojox: "../../widgets/ArcGIS/lib/dojox",
		esri: "../../widgets/ArcGIS/lib/esri",
		moment: "../../widgets/ArcGIS/lib/moment",
		eDojo: "../../widgets/ArcGIS/lib/dojo"
	}
};

require(dojoConfig, [], function() {
	var skipCheckDefine = define;
	return skipCheckDefine(
		"ArcGIS/widget/ArcGIS",
		[
			/*~♦~♦ Dojo ♦~♦~*/
			"eDojo/global",
			"dojo/_base/declare",
			"dojo/_base/array",
			"dojo/_base/event",
			"dojo/_base/lang",

			"dojo/on",
			"dojo/dom-style",
			"dojo/dom-construct",
			"dojo/query",

			"dojo/text!./template/ArcGIS.html",

			/*~♦~♦ DojoX ♦~♦~*/

			"dojox/gfx/Moveable",

			/*~♦~♦ Dijit ♦~♦~*/
			"dijit/_TemplatedMixin",
			"dijit/layout/BorderContainer",
			"dijit/layout/ContentPane",
			"dijit/form/Button",
			"dijit/layout/AccordionContainer",

			/*~♦~♦ Mendix ♦~♦~*/
			"mxui/widget/_WidgetBase",
			"mxui/dom",

			/*~♦~♦ Esri ♦~♦~*/
			"esri/Color",
			"esri/InfoTemplate",
			"esri/map",
			"esri/basemaps",
			"esri/SpatialReference",
			"esri/graphic",

			"esri/tasks/GeometryService",
			"esri/tasks/QueryTask",
			"esri/tasks/query",

			"esri/toolbars/edit",

			"esri/dijit/Popup",
			"esri/dijit/PopupTemplate",
			"esri/dijit/BasemapToggle",
			"esri/dijit/Search",

			"esri/symbols/SimpleFillSymbol",
			"esri/symbols/SimpleLineSymbol",
			"esri/symbols/SimpleMarkerSymbol",

			"esri/geometry/Point",
			"esri/geometry/Multipoint",
			"esri/geometry/Polyline",

			"esri/layers/ImageParameters",
			"esri/layers/ArcGISDynamicMapServiceLayer",
			"esri/layers/FeatureLayer",
			"esri/layers/GraphicsLayer",

			"esri/renderers/UniqueValueRenderer",

			"esri/dijit/Legend",

			/*-+-+-+ Pure import dependencies +-+-+-*/
			"dojox/gfx/Mover",
			"dojox/gfx/_base",
			"dojox/gfx/matrix",
			"moment/moment"
		],
		function(
			global,
			declare,
			arrayUtils,
			event,
			lang,
			on,
			domStyle,
			domConstruct,
			domQuery,
			widgetHTMLTemplate,

			Moveable,

			_TemplatedMixin,
			BorderContainer,
			ContentPane,
			Button,
			AccordionContainer,

			_MxWidgetBase,
			mxDom,

			Color,
			InfoTemplate,
			Map,
			basemaps,
			SpatialReference,
			Graphic,
			GeometryService,
			QueryTask,
			Query,
			Edit,
			Popup,
			PopupTemplate,
			BasemapToggle,
			Search,
			SimpleFillSymbol,
			SimpleLineSymbol,
			SimpleMarkerSymbol,
			Point,
			Multipoint,
			Polyline,
			ImageParameters,
			ArcGISDynamicMapServiceLayer,
			FeatureLayer,
			GraphicsLayer,
			UniqueValueRenderer,
			Legend
		) {
			"use strict";

			return declare("ArcGIS.widget.ArcGIS", [_MxWidgetBase, _TemplatedMixin], {
				templateString: widgetHTMLTemplate,
				_progressID: null,
				_handle: null,
				_contextObj: null,
				_gisMap: null,
				_logNode: "ArcGIS Widget: ",
				visibleLayerIds: [],
				legendLayers: [],
				arcGisLayerArr: [],
				layerArr: [],
				hostName: null,
				midFix: "/arcgis/rest/services/",
				deferred: null,
				popupTemplate: null,
				_SpatialReference: null,
				queryOutFieldsArr: [],
				fieldInfosArr: [],
				_singleObjectZoom: 12,
				defaultZoom: 3,
				_editBtn: null,
				_removeBtn: null,
				_mfBtn: null,
				_newMxObjects: [],
				_queryDefinition: null,
				_queryLayerObj: null,
				_originalRenderer: null, // used to store updated symbols for graphis in, see renderer functions

				constructor: function(params, srcNodeRef) {
					if (this.consoleLogging) {
						console.log(this.id + ".constructor");
					}
				},
				postCreate: function() {
					if (this.consoleLogging) {
						console.log(this.id + ".postCreate");
					}
					// reset all variables storing layers and legends since sometimes variables are not reset strangely...
					this._gisMap = null;
					this.layerArr = [];
					this.arcGisLayerArr = [];
					this.legendLayers = [];
					this._referenceMxObject = null;
					this._referenceMxObjectGUID = 0;
					this._handles = []; // used for storing subscriptions
					this._referenceMxObjectsArr = []; // used to store GIS objects in
					this._initialLoad = true;

					//setup geometryService
					this.geometryService = new GeometryService(
						"https://utility.arcgisonline.com/ArcGIS/rest/services/Geometry/GeometryServer"
					);

					// since DojoParser with a template is not working, on advise of Jelte Lagendijk from Mendix, we create all needed child widgets in a separate function.
					// in callback trigger custom styling after load of all HTML elements
					this._createTemplate();
				},

				update: function(obj, callback) {
					var errorMessage = "";

					if (this.consoleLogging) {
						console.log(this.id + ".update");
					}

					this._contextObj = obj;

					this._resetSubscriptions();

					// Widget configured variables
					this.centerCoordinates = this._contextObj
						? this._contextObj.get(this.centerAttr)
						: null;
					this.geometryType = this._contextObj
						? this._contextObj.get(this.geometryTypeAttr)
						: null;

					// if no map available, so at initial load after postCreate, load map in callback of getHostName
					if (!this._gisMap) {
						this._getHostNameMF(callback);
						if (this.customZoomlevel) {
							this._getCustomZoomLevelMF();
						} else {
							this.zoomlevel = this.defaultZoom;
						}
					} else {
						this._referenceMxObjectsArr = [obj];
						this._refreshMap();
					}
					callback();
				},
				resize: function(box) {
					if (this.consoleLogging) {
						console.log(this.id + ".resize");
					}
					if (this._gisMap) {
					}
				},
				_resetSubscriptions: function() {
					if (this.consoleLogging) {
						console.log(this.id + ".resetSubscriptions");
					}
					if (this._handles) {
						for (var k = 0; k < this._handles.length; k++) {
							this.unsubscribe(this._handles[k]);
						}

						this._handles = [];
					}

					if (this._contextObj) {
						var contextHandle = this.subscribe({
							guid: this._contextObj.getGuid(),
							callback: lang.hitch(this, function(guid) {
								// get the Mendix Objects again, and call the _refreshMap function, trigger by the true boolean in the function call
								this._getReferenceMxObjects(null, true);
							})
						});
						this._handles.push(contextHandle);
					}
				},

				_loadMap: async function() {
					if (this.consoleLogging) {
						console.log(this._logNode + "._loadMap");
					}

					const gpsLocation = this.centerOnLocation
						? await this._getGPSLocation()
						: undefined;

					//This specifies the symbols highlighting selected/queried objects
					var popup = new Popup(
						{
							fillSymbol: new SimpleFillSymbol(
								SimpleFillSymbol.STYLE_SOLID,
								new SimpleLineSymbol(
									SimpleLineSymbol.STYLE_SOLID,
									new Color([255, 0, 0]),
									2
								),
								new Color([255, 255, 0, 0.25])
							)
						},
						dojo.create("div")
					);

					this.fieldInfosArr = [];
					this.queryOutFieldsArr = [];
					this._infoWindowTitle = null;

					// Build up array with the required layer attributes in it
					if (this.attributesArray.length > 0) {
						for (var i = 0; i < this.attributesArray.length; i++) {
							var fieldInfo = {
								fieldName: this.attributesArray[i].attrName,
								visible: true,
								label: this.attributesArray[i].attrLabel
							};

							this.fieldInfosArr.push(fieldInfo);
							this.queryOutFieldsArr.push(this.attributesArray[i].attrName);
							if (this.attributesArray[i].isTitle) {
								this._infoWindowTitle = this.attributesArray[i].attrName;
							}
							if (this.attributesArray[i].isMxReference) {
								this._referenceArcGisAttr = this.attributesArray[i].attrName;
							}
						}
					}

					// use popup for ArcGISDynamicMapServiceLayer
					// populate popup template with Query Task attributes array
					this.popupTemplate = new PopupTemplate({
						title: "{" + this._infoWindowTitle + "}",
						fieldInfos: this.fieldInfosArr
					});

					// only applicable for MapService
					this.multipleRecordsTemplate = new PopupTemplate({
						title:
							"Multiple objects found where clicked. <br><br> Please zoom in further to single object."
					});

					// use infotemplate for FeatureLayers
					this.infotemplate = new InfoTemplate();

					this.infotemplate.setContent(
						lang.hitch(this, function(graphic) {
							// get actionlist in infowindow. Should only have one child, 'zoom to' link
							var actionList = dojo.query(".actionList")[0];
							// destroy old buttons if existing

							if (this._mfBtn) {
								dojo.destroy(this._mfBtn);
							}

							// create default button options. will be used for edit, remove and onclick mf buttons
							var btnOptions = {
								class: this.onClickButttonClass,
								type: "button",
								style: "cursor : pointer; margin-right: 6px;"
							};

							// add on click mf if set from Modeler
							if (this.onClickMF) {
								// for microflow button change btnOptions
								btnOptions.style =
									"cursor : pointer; margin-right: 6px; color: black";

								// create a span holding the alt glyphicon
								var btnSpan = mxDom.create("span");
								btnSpan.setAttribute("class", "glyphicon glyphicon-share-alt");

								// create the custom text
								var btnText = mxDom.create("text");

								// create microflow button
								this._mfBtn = mxDom.create(
									"button",
									btnOptions,
									btnSpan,
									btnText
								);

								btnText.textContent = this.onClickButttonLabel;
								btnText.style.marginLeft = "4px";

								// get actionlist in infowindow. Should only two children child, 'zoom to' link
								actionList = dojo.query(".actionList")[0];

								// add second child button which triggers microflow on click
								actionList.appendChild(this._mfBtn);

								on(
									this._mfBtn,
									"click",
									dojo.hitch(this, function(e) {
										this._getMxObject(graphic, this._execMf, this);
									})
								);
							}

							var contentString = this._getTextContent(graphic);

							return contentString;
						})
					);

					if (this._infoWindowTitle) {
						this.infotemplate.setTitle(this._infoWindowTitle);
					} else {
						this.infotemplate.setTitle("Details");
					}
					this._gisMap = null;

					// do not use extent for now. So declare, but do not use when constructing map. It will interfere with defaultPosition and defaultZoom

					//this._extent = new esri.geometry.Extent({"xmin":-97.968323,"ymin":32.405333,"xmax":-86.220025,"ymax":37.006985,"spatialReference": {"wkid" : Number(this.spatialReference)}});

					// load basemap based on widget settings

					if (this.baseMapURL_Default) {
						// change basemap URL if set from Modeler
						basemaps.topo.baseMapLayers = [{ url: this.baseMapURL_Default }];
						basemaps.satellite.baseMapLayers = [
							{ url: this.baseMapURL_Satellite }
						];
					} else {
						// load default baseMap
						basemaps.topo.baseMapLayers = [
							{
								url:
									"https://services.arcgisonline.com/arcgis/rest/services/World_Topo_Map/MapServer"
							}
						];
						basemaps.satellite.baseMapLayers = [
							{
								url:
									"https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer"
							}
						];
					}
					this._gisMap = new Map(this.mapContainer, {
						basemap: "topo",
						zoom: Number(this.zoomlevel),
						sliderStyle: "small",
						infoWindow: popup
						//,extent : ext
					});
					// after layer load, add the legend and toggle checkboxes for toggling layer visiblity
					this._gisMap.on(
						"layers-add-result",
						lang.hitch(this, function(evt) {
							if (this.consoleLogging) {
								for (var i = 0; i < evt.layers.length; i++) {
									var result =
										evt.layers[i].error == undefined
											? "OK"
											: evt.layers[i].error.message;
									console.log(" - " + evt.layers[i].layer.id + ": " + result);
								}
							}

							var layers = evt.layers;

							layers = arrayUtils.map(layers, function(result) {
								return result.layer;
							});
							// add layer-add-result handler to gismap
							this._layerAddResultsEventHandler(layers);
						})
					);
					//Actions to be executed after the map has finished loading.
					this._gisMap.on(
						"load",
						function() {
							// attach events to gismap and layer loading
							this._setupEvents();

							if (this.enableNewReportCreation) {
								this._initNewDeclaration();
							}
							this._getDeclarationsData();
						}.bind(this)
					);

					if (gpsLocation && gpsLocation !== -1 && this.centerOnLocation) {
						this._zoomToLocation(
							Number(gpsLocation.longitude),
							Number(gpsLocation.latitude),
							this.zoomlevel
						);
					} else {
						this._zoomToLocation(
							Number(this.defaultX),
							Number(this.defaultY),
							this.zoomlevel,
							false
						);
					}

					var toggle = new BasemapToggle(
						{
							map: this._gisMap,
							basemap: "satellite",
							basemaps: {
								topo: {
									title: "Normaal",
									thumbnailUrl:
										"https://js.arcgis.com/3.31/esri/images/basemap/streets.jpg"
								},
								satellite: {
									title: "Sateliet",
									thumbnailUrl:
										"https://js.arcgis.com/3.31/esri/images/basemap/satellite.jpg"
								}
							}
						},
						this.BasemapToggleDiv
					);

					toggle.startup();

					if (this.enableSearch) {
						var search = new Search(
							{
								map: this._gisMap,
								showInfoWindowOnSelect: true,
								enableInfoWindow: true
							},
							this.searchDiv
						);

						search.startup();
					}
					//Use the ImageParameters to set the visibleLayerIds layers in the map service during ArcGISDynamicMapServiceLayer construction.
					var imageParameters = {};

					imageParameters = new ImageParameters();

					imageParameters.layerIds = [2];

					imageParameters.layerOption = ImageParameters.LAYER_OPTION_SHOW;
					//can also be: LAYER_OPTION_EXCLUDE, LAYER_OPTION_HIDE, LAYER_OPTION_INCLUDE

					var arcGisLayer,
						layerSpecificURL,
						layerObj = {},
						layerOpts = {};
					this._queryDefinition = null;

					// Build up array with the layers in it.
					if (this.layerArray.length > 0 && this.layerArr.length == 0) {
						for (var j = 0; j < this.layerArray.length; j++) {
							layerObj = {
								serverType: this.layerArray[j].layerServerType,
								url: this.layerArray[j].layerURL,
								id: this.layerArray[j].layerID,
								showAttribution: this.layerArray[j].showAttribution,
								indexes: this.layerArray[j].visibleLayerIndexes,
								featureLayerID: this.layerArray[j].featureLayerID,
								geometryType: this.layerArray[j].layerGeometryType,
								opacity: this.layerArray[j].opacity,
								queryLayer: this.layerArray[j].queryLayer
							};
							// add layer + settings to map. These options are shared between FeatureLayer and ArcGISDynamicWebserviceLayer
							layerOpts = {
								id: layerObj.id,
								showAttribution: layerObj.showAttribution,
								spatialReference: {
									wkid: Number(this.spatialReference)
								}
							};
							// if featureserver is environment dependent, hence gotten from DS MF, use that url part. Will only work for 1 FeatureServer for now...
							if (this.getFeatureServerNameMF) {
								layerSpecificURL =
									this.hostName + this.midFix + this._layerName;
							}
							// else use url of specific layer
							else {
								layerSpecificURL = this.hostName + this.midFix + layerObj.url;
							}

							if (this.consoleLogging) {
								console.log(
									this._logNode +
										this._logNode +
										"Full URL (HostName + Layer URL): " +
										layerSpecificURL +
										" and options: "
								);
								console.dir(this._logNode + layerOpts);
							}

							this.layerArr.push(layerObj);

							if (layerObj.queryLayer) {
								// set the layer on which querying will happen. This is later used to set the extent when the full map is loaded in _refreshMap function
								this._queryLayerObj = layerObj;
								// create the querydefinition
								this._queryDefinition = this._createQueryDefinition();
							}

							try {
								if (layerObj.serverType === "MapServer") {
									// set ArcGISDynamicMapServer specific options

									layerOpts.imageParameters = imageParameters;

									arcGisLayer = new ArcGISDynamicMapServiceLayer(
										layerSpecificURL + "/MapServer",
										layerOpts
									);
									// a MapServer can hold multiple layers
									if (layerObj.indexes) {
										var layerIndexesStringArray = layerObj.indexes.split(",");
										var layerIndexesIntArray = [];
										for (var k = 0; k < layerIndexesStringArray.length; k++) {
											var layerIndexesIntArrayEntry = parseInt(
												layerIndexesStringArray[k]
											);
											layerIndexesIntArray.push(layerIndexesIntArrayEntry);
										}
										// update the string of indexes to the array of these comma separated indexes
										layerObj.indexes = layerIndexesIntArray;
										arcGisLayer.setVisibleLayers(layerIndexesIntArray);
									}
								} else if (layerObj.serverType === "FeatureServer") {
									// set FeatuteLayer specific options
									layerOpts.mode = FeatureLayer.MODE_SNAPSHOT;
									layerOpts.outFields = this.queryOutFieldsArr;
									layerOpts.infoTemplate = this.infotemplate;

									// if token available append to url, else could give token required errors in browser
									if (this._token) {
										arcGisLayer = new FeatureLayer(
											layerSpecificURL +
												"/FeatureServer/" +
												layerObj.featureLayerID +
												"?token=" +
												this._token,
											layerOpts
										);
									} else {
										arcGisLayer = new FeatureLayer(
											layerSpecificURL +
												"/FeatureServer/" +
												layerObj.featureLayerID,
											layerOpts
										);
										arcGisLayer.setOpacity(layerObj.opacity);
									}

									if (this._queryDefinition) {
										// only overrule default ArcGIS styling when asked for in Modeler
										if (this.enableCustomStyling) {
											var uniqueValueRenderer = this._updateRenderer(
												arcGisLayer,
												layerObj.geometryType
											);
											arcGisLayer.setRenderer(uniqueValueRenderer);
										}
										if (!this.showAllObjectsInLayer) {
											// enforce query definition on objects shown on map
											arcGisLayer.setDefinitionExpression(
												this._queryDefinition
											);
										}
									}
								}

								// add own name to id, so can later on be retrieved in _refreshMap
								arcGisLayer.id = layerObj.id;
								arcGisLayer.layerName = layerObj.id;
								this.arcGisLayerArr.push(arcGisLayer);

								this.legendLayers.push({
									layer: arcGisLayer,
									title: arcGisLayer.id,
									startLayerTicked: this.layerArray[j].startLayerTicked
								});
							} catch (e) {
								console.error(
									this._logNode +
										this._logNode +
										"Error retrieving and creating layer with URL: " +
										layerObj.url +
										". Message: " +
										e
								);
							}
						}
					}

					this._gisMap.addLayers(this.arcGisLayerArr);
				},
				_zoomToLocation: function(longitude, latitude, zoom, project = true) {
					if (!this.declarationsExtent && longitude !== 0 && latitude !== 0) {
						if (project) {
							const locationPt = new Point(longitude, latitude);
							this.geometryService.project(
								[locationPt],
								new SpatialReference({
									wkid: Number(this.spatialReference)
								}),
								function(projectedPoints) {
									if (!this.declarationsExtent) {
										/* check again, because this is async */
										this._gisMap.centerAt(projectedPoints[0]);
										this._gisMap.setZoom(zoom);
										//this._gisMap.centerAndZoom(projectedPoints[0], zoom);
									}
								}.bind(this)
							);
						} else {
							const locationPt = new Point(
								longitude,
								latitude,
								new SpatialReference({ wkid: Number(this.spatialReference) })
							);
							this._gisMap.centerAt(locationPt);
							this._gisMap.setZoom(zoom);
							//this._gisMap.centerAndZoom(locationPt, zoom);
						}
					}
				},
				_refreshMap: function(objs) {
					var gisMapIds = this._gisMap.graphicsLayerIds;
					// get the layer that is being queried on
					var layerID = gisMapIds.filter(
						lang.hitch(this, function(id) {
							return (id = this._queryLayerObj.id);
						})
					)[0];

					// only when reference DataView and Reference Entity have been set, narrow down objects by adding a queryDefinition
					if (layerID) {
						var updateLayer = this._gisMap.getLayer(layerID);

						if (this.enableCustomStyling) {
							var uniqueValueRenderer = this._updateRenderer(
								updateLayer,
								this._queryLayerObj.geometryType
							);
							updateLayer.setRenderer(uniqueValueRenderer);
						}

						// create new querydefinition
						this._queryDefinition = this._createQueryDefinition();
						if (!this.showAllObjectsInLayer) {
							// enforce query definition
							updateLayer.setDefinitionExpression(this._queryDefinition);
							// applying querydefintion to layer which results in getting and setting extent on this._gisMap
							this._getExtentFromQueryDef(
								this._queryLayerObj,
								this._queryDefinition
							);
						}
					}
				},
				_createSimpleMarkerSymbol: function() {
					switch (this.markerSymbol) {
						case "STYLE_CIRCLE":
							return SimpleMarkerSymbol.STYLE_CIRCLE;
						case "STYLE_CROSS":
							return SimpleMarkerSymbol.STYLE_CROSS;
						case "STYLE_DIAMOND":
							return SimpleMarkerSymbol.STYLE_DIAMOND;
						case "STYLE_SQUARE":
							return SimpleMarkerSymbol.STYLE_SQUARE;
						case "STYLE_X":
							return SimpleMarkerSymbol.STYLE_X;
					}
				},
				_updateRenderer: function(layer, geometryType) {
					// determine symbol
					this._simpleMarkerSymbol = this._createSimpleMarkerSymbol();

					var objectid,
						color,
						defaultColor = this.defaultColor,
						defaultSymbol,
						renderer;

					var defaultColorBorderColor = defaultColor.split(",");
					var defaultColorFillColor;
					if (geometryType == "point") {
						defaultColorFillColor = (defaultColor + ",0.8").split(",");
					} else {
						defaultColorFillColor = (defaultColor + ",0.25").split(",");
					}
					if (geometryType == "point") {
						// new symbol based on color of object
						defaultSymbol = new SimpleMarkerSymbol(
							this._simpleMarkerSymbol,
							10,
							new SimpleLineSymbol(
								SimpleLineSymbol.STYLE_SOLID,
								new Color(defaultColorBorderColor),
								4
							), // border color
							new Color(defaultColorFillColor) // fill color
						);
					} else {
						defaultSymbol = new SimpleFillSymbol(
							SimpleFillSymbol.STYLE_SOLID,
							new SimpleLineSymbol(
								SimpleLineSymbol.STYLE_SOLID,
								new Color(defaultColorBorderColor),
								1
							),
							new Color(defaultColorFillColor)
						);
					}
					var layerSymbol;

					// try to retrieve original symbol if renderer is SimpleRenderer
					if (layer.renderer && layer.renderer.symbol) {
						console.log(1);
						console.dir(layerSymbol);
						layerSymbol = layer.renderer.symbol;
					}
					// if different layer type, retrieve symbol from first graphic, assuming all are same in layer
					else if (layer.graphics[0]) {
						layerSymbol = layer.graphics[0].symbol;
					}
					// if all fails, resort to defaultSymbol
					else {
						layerSymbol = defaultSymbol;
					}

					// at intial load original renderer not yet stored -> store!
					if (!this._originalRenderer) {
						this._originalRenderer = new UniqueValueRenderer(
							layerSymbol,
							this.arcGISID
						);
					}
					renderer = this._originalRenderer;

					renderer.defaultLabel = this.defaultLabel;

					for (var e = 0; e < this._referenceMxObjectsArr.length; e++) {
						objectid = this._referenceMxObjectsArr[e].get(this.objectIDAttr);
						color = this._referenceMxObjectsArr[e].get(this.colorAttr);

						var featureColorBorderColor = color.split(","),
							featureColorFillColor,
							newSymbol;

						if (geometryType == "point") {
							featureColorFillColor = (color + ",0.8").split(",");
						} else {
							featureColorFillColor = (color + ",0.25").split(",");
						}

						if (geometryType == "point") {
							// new marker symbol based on color of object
							newSymbol = new SimpleMarkerSymbol(
								this._simpleMarkerSymbol,
								10,
								new SimpleLineSymbol(
									SimpleLineSymbol.STYLE_SOLID,
									new Color(featureColorBorderColor),
									2
								), // border color
								new Color(featureColorFillColor) // fill color
							);
						} else {
							// new non marker symbol (leave as is - no overrule)
							newSymbol = new SimpleFillSymbol(
								SimpleFillSymbol.STYLE_SOLID,
								new SimpleLineSymbol(
									SimpleLineSymbol.STYLE_SOLID,
									new Color(featureColorBorderColor),
									1
								),
								new Color(featureColorFillColor)
							);
						}

						// find label configured for this color
						var colorLabelInstance = this.colorArray.filter(
							lang.hitch(this, function(instance) {
								return instance.featureColor == color;
							})
						)[0];

						//add symbol for each possible value
						if (color) {
							var infoValue;
							// if label found in array, use this label
							if (colorLabelInstance) {
								var featureColorLabel = colorLabelInstance.featureColorLabel;
								infoValue = {
									value: objectid,
									symbol: newSymbol,
									label: featureColorLabel
								};
							} else {
								infoValue = {
									value: objectid,
									symbol: newSymbol,
									label: "Label Unknown"
								};
							}
							renderer.addValue(infoValue);
						}
					}

					return renderer;
				},
				_execMf: function(mxobj, context) {
					if (context.consoleLogging) {
						console.log(context._logNode + "._execMf");
					}
					// if called from callback, context from widget is lost, hence set explicitly as context inputparameter
					var guid = null;
					if (mxobj) {
						guid = mxobj.getGuid();
					}
					if (guid) {
						mx.data.action(
							{
								params: {
									applyto: "selection",
									actionname: context.onClickMF,
									guids: [guid]
								},
								origin: context.mxform,
								callback: lang.hitch(context, function(obj) {}),
								error: function(error) {
									console.debug(error.description);
								}
							},
							this
						);
					}
				},
				_getHostNameMF: function(callback) {
					if (this.consoleLogging) {
						console.log(this.id + "._getHostNameMF");
					}
					// sometimes update is triggered twice on initial load of widget. do not want to trigger MF twice...
					if (this.getHostNameMF && this._initialLoad) {
						this._initialLoad = false;
						mx.data.action({
							params: {
								applyto: "none",
								actionname: this.getHostNameMF
							},
							origin: this.mxform,
							callback: lang.hitch(this, function(stringResult) {
								// set the hostname retrieved from the datasource MF
								this.hostName = stringResult;

								// if server needs to be dynamically set per layer, get server name
								if (this.getFeatureServerNameMF) {
									mx.data.action({
										params: {
											applyto: "none",
											actionname: this.getFeatureServerNameMF
										},
										origin: this.mxform,
										callback: lang.hitch(this, function(stringResult) {
											this._layerName = stringResult;
											// Can be a heavy function when having 100+ objects related to the DataView object
											// The false boolean is implemented to distinguish between an update (true) and not.
											this._getReferenceMxObjects(callback, false);
										}),
										error: lang.hitch(this, function(error) {
											console.error(this._logNode + error.description);
										})
									});
								} else {
									// Can be a heavy function when having 100+ objects related to the DataView object
									// The false boolean is implemented to distinguish between an update (true) and not.
									this._getReferenceMxObjects(callback, false);
								}
							}),
							error: lang.hitch(this, function(error) {
								console.error(this._logNode + error.description);
							})
						});
					}
				},
				_getCustomZoomLevelMF: function() {
					mx.data.action({
						params: {
							applyto: "none",
							actionname: this.customZoomlevel
						},
						origin: this.mxform,
						callback: lang.hitch(this, function(intResult) {
							this.zoomlevel = intResult;
						}),
						error: lang.hitch(this, function(error) {
							console.error(this._logNode + error.description);
							this.zoomlevel = this.defaultZoom;
						})
					});
				},
				_queryLayer: function(query, layerObj) {
					if (this.consoleLogging) {
						console.log(this.id + "._queryLayer");
					}
					var identifyTaskLayerURL = "";

					if (layerObj.serverType === "FeatureServer") {
						identifyTaskLayerURL =
							this.hostName +
							this.midFix +
							layerObj.url +
							"/FeatureServer/" +
							layerObj.featureLayerID;
					} else if (layerObj.serverType === "MapServer") {
						identifyTaskLayerURL =
							this.hostName +
							this.midFix +
							layerObj.url +
							"/MapServer/" +
							layerObj.visibleLayerIds;
					}
					var qt = new QueryTask(identifyTaskLayerURL);

					qt.execute(
						query,
						lang.hitch(this, function(response) {
							if (response && response.features && response.features[0]) {
								// extract needed content from QueryTask result
								var geometry = response.features[0].geometry;

								if (geometry) {
									var centerLocation = this._getCenterCoordinates(geometry);

									var centerX = centerLocation.x.toFixed(5).toString();
									var centerY = centerLocation.y.toFixed(5).toString();

									// store center coordinates for future reference, to minimize the API calls to ArcGIS
									if (
										this._contextObj &&
										!this._contextObj.get(this.centerAttr)
									) {
										this._contextObj.set(
											this.centerAttr,
											centerX + "," + centerY
										);
										mx.data.commit({
											mxobj: this._contextObj,
											callback: lang.hitch(this, function() {}),
											error: function(e) {
												console.error("Could not commit object:", e);
											}
										});
									}
								} else {
									console.log(this._logNode + "query gave empty result");
								}
							}
							this._gisMap
								.centerAndZoom(centerLocation, this._singleObjectZoom)
								.then(lang.hitch(this, function() {}));
						})
					);

					//return centerLocation;
				},
				_getExtentFromQueryDef: function(layerObj, queryDef) {
					var q = new Query(),
						spatialRef = this._gisMap.spatialReference,
						multiPoint = new Multipoint(),
						centerLocation,
						centerX,
						centerY;

					q.outSpatialReference = spatialRef;
					q.returnGeometry = true;
					q.outFields = this.queryOutFieldsArr;

					// add where statement
					q.where = queryDef;

					var identifyTaskLayerURL = "";

					if (layerObj.serverType === "FeatureServer") {
						identifyTaskLayerURL =
							this.hostName +
							this.midFix +
							layerObj.url +
							"/FeatureServer/" +
							layerObj.featureLayerID;
					} else if (layerObj.serverType === "MapServer") {
						identifyTaskLayerURL =
							this.hostName +
							this.midFix +
							layerObj.url +
							"/MapServer/" +
							layerObj.visibleLayerIds;
					}
					var qt = new QueryTask(identifyTaskLayerURL);

					qt.execute(
						q,
						lang.hitch(this, function(response) {
							if (response && response.features) {
								for (var k = 0; k < response.features.length; k++) {
									// extract needed content from QueryTask result
									var geometry = response.features[k].geometry;

									if (geometry) {
										centerLocation = this._getCenterCoordinates(geometry);
										centerX = centerLocation.x.toFixed(5).toString();
										centerY = centerLocation.y.toFixed(5).toString();

										multiPoint.addPoint(new Point(centerX, centerY));
									} else {
										console.log(this._logNode + "query gave empty result");
									}
								}
								if (this._referenceMxObjectsArr.length == 1) {
									this._gisMap.centerAndZoom(
										centerLocation,
										Number(this._singleObjectZoom) - 1
									);
								} else {
									// set extent
									this._extent = multiPoint.getExtent();
									this._extent.setSpatialReference(
										this._gisMap.spatialReference
									);
									this._gisMap.setExtent(this._extent);
								}
							}
						})
					);

					//return centerLocation;
				},
				_getTextContent: function(graphic) {
					if (this.consoleLogging) {
						console.log(this.id + "._getTextContent");
					}
					var textContentString = "";
					for (var c = 0; c < this.fieldInfosArr.length; c++) {
						// get property
						var value = graphic.attributes[this.fieldInfosArr[c].fieldName];
						// if value not found, set to empty string instead of null
						if (!value) {
							value = "";
						}
						textContentString +=
							"<b>" + this.fieldInfosArr[c].label + "</b> " + value + "<br>";
					}

					return textContentString;
				},
				taskCallbackInfoTemplate: function(response) {
					if (this.consoleLogging) {
						console.log(this.id + ".taskCallbackInfoTemplate");
					}
					var feature = null;

					if (response.features) {
						if (response.features.length == 1) {
							feature = response.features[0];

							feature.setInfoTemplate(this.popupTemplate);
						} else {
							feature.setInfoTemplate(this.multipleRecordsTemplate);
						}
					}
					return feature;
				},
				_setupEvents: function() {
					if (this.consoleLogging) {
						console.log(this._logNode + "._setupEvents");
					}
					// make editing possible
					this._editToolbar = new Edit(this._gisMap);

					// make moving of infowindow possible
					var handle = this._gisMap.infoWindow.domNode.querySelector(".title");

					/*var dnd = new Moveable(this._gisMap.infoWindow, {
					handle: handle
				});

				// when the infoWindow is moved, hide the arrow:
				dnd.on(
					"FirstMove",
					lang
						.hitch(this, function() {
							// hide pointer and outerpointer (used depending on where the pointer is shown)
							var arrowNode = this._gisMap.infoWindow.domNode.querySelector(
								".outerPointer"
							);
							arrowNode.classList.add("hidden");

							arrowNode = this._gisMap.infoWindow.domNode.querySelector(
								".pointer"
							);
							arrowNode.classList.add("hidden");
						})
						.bind(this)
				);*/

					// set default placeholder text. Somehow this is not working when setting property before startup.
					const searchIpt = domQuery(".searchInputGroup input");
					if (searchIpt && searchIpt[0]) {
						searchIpt[0].placeholder = "Zoek adres of plaats";
					}
				},
				_layerAddResultsEventHandler: function(layers) {
					if (this.enableLegend) {
						// add the legend
						var legend = new Legend(
							{
								map: this._gisMap,
								layerInfos: this.legendLayers
							},
							this.legendDiv
						);
						legend.startup();
					}

					if (this.enableToggleLayers) {
						var subLayerArray = [],
							layer = null,
							subLayerArrayUnfiltered = [],
							visibleLayerIndexArray = [];

						//add check boxes layers and sublayers
						for (var m = 0; m < this.legendLayers.length; m++) {
							subLayerArray = [];

							layer = this.legendLayers[m];

							subLayerArrayUnfiltered = layer.layer.layerInfos;

							visibleLayerIndexArray = layer.layer.visibleLayers;

							var noOfSubLayers = 0;

							if (subLayerArrayUnfiltered && visibleLayerIndexArray) {
								for (var p = 0; p < visibleLayerIndexArray.length; p++) {
									// check if layerindexes from Modeler actually exist in the layer itself. if not, it will give back undefined, hence can not be pushed into the array.
									if (subLayerArrayUnfiltered[p]) {
										subLayerArray.push(subLayerArrayUnfiltered[p]);
									}
								}
								noOfSubLayers = subLayerArray.length;
							}

							var layerName = layer.title;

							var span = mxDom.create("span", {
								id: "spanLabel_" + m
							});

							// set caret style based on starting collapsed or expanded
							if (this.startSubLayerListCollapsed) {
								span.className = "caret caret-left";
							} else {
								span.className = "caret";
							}

							// actually style the carets
							this._setCaretCSS(span);

							var checkLabel = mxDom.create(
								"label",
								{
									for: "checkBox" + layer.layer.id,
									innerHTML: layerName,
									style: {
										"font-weight": 700
									}
								},
								"  " + layerName + " (" + noOfSubLayers + ") ",
								span
							);

							var checkBox = mxDom.create("input", {
								name: "checkBox" + layer.layer.id,
								value: layer.layer.id,
								checked: layer.startLayerTicked,
								type: "checkbox"
							});

							var ul = mxDom.create(
								"ul",
								{
									style: {
										"list-style-type": "none",
										padding: 0,
										margin: 0,
										cursor: "pointer"
									}
								},
								checkLabel,
								checkBox
							);

							//add the check box after the label in the toc
							domConstruct.place(checkLabel, checkBox, "after");

							//add the check label to the table of contents
							domConstruct.place(ul, this.toggleDiv, "after");

							on(
								checkBox,
								"click",
								lang.hitch(this, function(e) {
									var targetLayer = this._gisMap.getLayer(e.target.value);
									targetLayer.setVisibility(!targetLayer.visible);
									e.target.checked = targetLayer.visible;
								})
							);

							// toggle collapse expand sublayer list on click of layer
							on(
								ul,
								"click",
								lang.hitch(this, function(e) {
									if (e.target.parentNode.tagName == "UL") {
										var ulElement = e.target.parentNode;

										this._toggleSubLayerList(ulElement);
									}
									if (e.target.parentNode.tagName == "LI") {
										if (this.consoleLogging) {
											console.log(this._logNode + "li clicked");
										}
									}
								})
							);

							for (var n = 0; n < subLayerArray.length; n++) {
								var subLayerName = subLayerArray[n].name;
								var subLayerID = subLayerArray[n].id;

								var checkLabel_Sub = mxDom.create(
									"label",
									{
										for: "checkBox" + subLayerID,
										innerHTML: subLayerName,
										style: {
											"font-weight": 400
										}
									},
									"  " + subLayerName
								);

								var checkBox_Sub = mxDom.create("input", {
									name: "checkBox" + subLayerID,
									value: layer.layer.id + "-" + subLayerID,
									checked: subLayerArray[n].defaultVisibility,
									type: "checkbox",
									style: "margin-left:10px"
								});

								var li = mxDom.create("li", {}, checkBox_Sub, checkLabel_Sub);

								//add the check box after the label in the toc
								domConstruct.place(li, checkLabel, "after");

								on(
									checkBox_Sub,
									"click",
									lang.hitch(this, function(e) {
										// get the parentLayer from the helpArray
										var helpArray = e.target.value.split("-");
										var parentLayer = this._gisMap.getLayer(helpArray[0]);

										// get currently visible subLayers
										var visibleLayersArray = parentLayer.visibleLayers;

										// check if clicked on subLayerIndex is already in visibleLayersArray
										// get the clicked on subLayer from the helpArray
										var subLayerIndex = Number(helpArray[1]);

										// if found, remove from visibleLayersArray
										if (
											this.containsObject(subLayerIndex, visibleLayersArray)
										) {
											visibleLayersArray = this._removeFromArr(
												visibleLayersArray,
												subLayerIndex
											);
										} else {
											// else add to visibleLayersArray
											visibleLayersArray.push(subLayerIndex);
										}
										// set new visibleLayersArray as visible layers on map
										parentLayer.setVisibleLayers(visibleLayersArray);
									})
								);
							}
							// if layer is set to Start Ticked = False in Modeler, mimick click events to untick.
							if (!layer.startLayerTicked) {
								// uncheck checkbox hence hiding layer in map
								checkBox.click();
								// collapse sublayerlist
								ul.click();
							}
							// by default start collapsed
							else if (this.startSubLayerListCollapsed) {
								this._toggleSubLayerList(ul);
							}
						}
					}
				},
				containsObject: function(obj, list) {
					var i;
					for (i = 0; i < list.length; i++) {
						if (list[i] == obj) {
							return true;
						}
					}

					return false;
				},
				_toggleSubLayerList: function(ul) {
					if (this.consoleLogging) {
						console.log(this.id + "._toggleSubLayerList");
					}
					// returns nodeList, so transform to actual Array
					var childNodeArray = Array.from(ul.childNodes);

					for (var d = 1; d < childNodeArray.length; d++) {
						// find the child list elements.
						if (ul.childNodes[d].tagName == "LI") {
							//if hidden, show
							if (ul.childNodes[d].style.display == "none") {
								ul.childNodes[d].style.display = "block";
							}
							//if shown, hide
							else {
								ul.childNodes[d].style.display = "none";
							}
						}

						// change caret
						if (ul.childNodes[d].tagName == "LABEL") {
							var span = ul.childNodes[d].lastElementChild;
							if (span.className == "caret") {
								span.className += " caret-left";
							} else {
								span.className = "caret";
							}
							this._setCaretCSS(span);
						}
					}
				},
				_setCaretCSS: function(span) {
					if (this.consoleLogging) {
						console.log(this.id + "._setCaretCSS");
					}
					if (span && span.className == "caret caret-left") {
						span.style.borderRight = "4px solid " + this.customColor;
						span.style.borderBottom = "4px solid transparent";
						span.style.borderTop = "4px solid transparent";
					} else if (span && span.className == "caret") {
						span.style.borderRight = "4px solid transparent";
						span.style.borderBottom = "4px solid transparent";
						span.style.borderTop = "4px solid " + this.customColor;
					}
				},
				_injectVariableStyling: function() {
					if (this.consoleLogging) {
						console.log(this.id + "._injectVariableStyling");
					}
					// add custom color based on widget setting
					if (this.customColor !== "") {
						// customize claro accordion menu styling
						var accSelectedCSS = document.createElement("style");
						accSelectedCSS.type = "text/css";
						accSelectedCSS.innerHTML =
							".claro .dijitAccordionTitleSelected { background-color: " +
							this.selectedColor +
							";}";
						accSelectedCSS.innerHTML +=
							".toggleTemplatePane .dijitAccordionContainer-child .dijitAccordionContainer-dijitContentPane { background-color: " +
							this.selectedColor +
							";}";
						document.body.appendChild(accSelectedCSS);

						var accHoverCSS = document.createElement("style");

						accHoverCSS.type = "text/css";
						accHoverCSS.innerHTML =
							".claro .dijitAccordionInnerContainer:hover { background-color: " +
							this.customColor +
							";}";
						document.body.appendChild(accHoverCSS);

						var popupHeaderCSS = document.createElement("style");

						popupHeaderCSS.type = "text/css";
						popupHeaderCSS.innerHTML =
							".esriPopup .titlePane { background-color: " +
							this.customColor +
							";}";
						document.body.appendChild(popupHeaderCSS);
					}
					// adjust dimensions of widget to widget settings
					domStyle.set(this.domNode, {
						height: this.mapHeight + "px",
						width: this.mapWidth + "px"
					});
				},
				// Retrieves all objects related to the ArcGISDataView via XPath or DataSource MF and store in array in cache
				_getReferenceMxObjects: function(callback, update) {
					if (this.consoleLogging) {
						console.log(this.id + "._getReferenceMxObjects");
					}

					// Scenario 1: loading objects with XPath constraint
					if (this.objectEntity && this.xPathConstraint) {
						if (this.consoleLogging) {
							console.info(this._logNode + "get from XPath");
						}
						var xpath = "//" + this.objectEntity + this.xPathConstraint;

						if (this._contextObj) {
							xpath = xpath.replace(
								"'[%CurrentObject%]'",
								this._contextObj.getGuid()
							);
						}

						if (this.consoleLogging) {
							console.log(this._logNode + "XPATH: " + xpath);
						}
						mx.data.get({
							xpath: xpath,
							callback: lang.hitch(this, function(objs) {
								if (this.consoleLogging) {
									console.log(
										this._logNode + "Received " + objs.length + " MxObjects: "
									);
									console.dir(this._logNode + objs);
								}
								this._referenceMxObjectsArr = objs;
								if (update) {
									this._refreshMap(objs);
								} else {
									this._loadMap(callback);
								}
							})
						});
					}
					// Scenario 2: loading objects by DataSource Microflow
					else if (this._getObjectsMF) {
						if (this.consoleLogging) {
							console.log(this._logNode + "get from DS MF set from Modeler");
						}
						var guid = this._contextObj.getGuid();
						mx.data.action({
							params: {
								applyto: "selection",
								actionname: this._getObjectsMF,
								guids: [guid]
							},
							origin: this.mxform,
							callback: lang.hitch(this, function(objs) {
								if (this.consoleLogging) {
									console.log(
										this._logNode + "Received " + objs.length + " MxObjects: "
									);
									console.dir(this._logNode + objs);
								}
								this._referenceMxObjectsArr = objs;
								if (update) {
									this._refreshMap(objs);
								} else {
									this._loadMap(callback);
								}
							}),
							error: lang.hitch(this, function(error) {
								console.error(this._logNode + error.description);
							})
						});
						// if no other objects need to be loaded, just load the map, assuming the context entity is the object to load
					}
					// Scenario 3: loading object of DataView itself (ListenToGrid or single DataView)
					else {
						if (this.consoleLogging) {
							console.info(this._logNode + "get object from DataView entity");
						}
						// only push into array if it exists, else an empty entry will be created, causing issues when iterating over this array later on
						if (this._contextObj) {
							this._referenceMxObjectsArr.push(this._contextObj);
						}

						if (update) {
							this._refreshMap([this._contextObj]);
						} else {
							this._loadMap(callback);
						}
					}
				},
				_getMxObject: function(graphic, callback, context) {
					if (this.consoleLogging) {
						console.log(this.id + "._getMxObject");
					}
					var MxObj = null;
					// try to find MxObj in cache, should be filled when using a reference DataView
					if (
						this._referenceMxObjectsArr &&
						this._referenceMxObjectsArr.length > 0
					) {
						MxObj = this._referenceMxObjectsArr.filter(
							lang.hitch(this, function(obj) {
								return (
									obj.get(this.objectIDAttr) ==
										graphic.attributes[this.arcGISID] &&
									obj.get(this.geometryTypeAttr) == graphic.geometry.type
								);
							})
						)[0];

						// this transferred to context variable, since this is reserved word in callback...
						if (callback && typeof callback == "function") {
							callback(MxObj, context);
						}
					}
					// if no reference DataView is there, hence _getReferenceMxObjects has not been kicked off, do a direct database retrieve
					else {
						var xpath =
							"//" +
							this.objectEntity +
							"[" +
							this.objectIDAttr +
							" = " +
							graphic.attributes[this.arcGISID] +
							" and " +
							this.geometryTypeAttr +
							" = '" +
							graphic.geometry.type +
							"']";
						if (this.consoleLogging) {
							console.log(this._logNode + xpath);
						}
						mx.data.get({
							xpath: xpath,
							callback: lang.hitch(this, function(objs) {
								if (this.consoleLogging) {
									console.log(
										this._logNode + "Received " + objs.length + " MxObjects: "
									);
									console.dir(this._logNode + objs);
								}
								MxObj = objs[0];
								callback(MxObj, context);
							})
						});
					}
				},
				// creates all HTML elements needed, so placeholder for legend, drawing, map, toolbar, etc.
				_createTemplate: function() {
					if (this.consoleLogging) {
						console.log(this.id + "._createTemplate");
					}
					// create general panes and containers
					var contentPane = BorderContainer({
						className: "content",
						gutters: false,
						design: "headline",
						style: {
							height: "100%",
							width: "100%"
						}
					});

					this.contentPane = contentPane.domNode;

					// adjust dimensions of content pane to widget dimensions
					domStyle.set(this.contentPane, {
						height: "100%",
						width: "100%"
					});

					var mapContainer = new ContentPane({
						className: "mapDiv",
						region: "center"
					});

					var BasemapToggleDiv = domConstruct.create(
						"div",
						{
							className: "BasemapToggleDiv"
						},
						mapContainer.domNode
					);

					this.BasemapToggleDiv = BasemapToggleDiv;

					contentPane.addChild(mapContainer);

					this.mapContainer = mapContainer.domNode;

					// adjust dimensions of map to content pane dimensions
					domStyle.set(this.mapContainer, {
						height: "100%",
						width: "100%",
						border: "solid 2px " + this.customColor
					});

					domConstruct.place(this.contentPane, this.domNode);

					// only create rightPane if either legend, togglelayer or draw is enabled
					if (this.enableToggleLayers | this.enableLegend) {
						// generic accordion container
						var accordionContainer = ContentPane({
							className: "rightPane",
							region: "right",
							height: "100%"
						});

						var accordion = new AccordionContainer();

						this.accordionContainer = accordionContainer.domNode;

						// adjust dimensions of map to content pane dimensions
						domStyle.set(this.mapContainer, {
							width: "80%"
						});
						// adjust dimensions of map to content pane dimensions
						domStyle.set(this.accordionContainer, {
							height: "100%",
							width: "20%"
						});

						accordionContainer.addChild(accordion);
						contentPane.addChild(accordionContainer);

						if (this.enableLegend) {
							var legendPane = new ContentPane({
								className: "legendPane",
								title: "Legenda"
							});
							this.legendDiv = domConstruct.create(
								"div",
								{
									className: "legendDiv"
								},
								legendPane.domNode
							);

							accordion.addChild(legendPane);
							this.legendPane = legendPane.domNode;
						}
						if (this.enableToggleLayers) {
							var toggleLayerPane = new ContentPane({
								className: "toggleLayerPane",
								title: "Lagen",
								style: "overflow-y: auto;"
							});

							this.toggleDiv = domConstruct.create(
								"div",
								{
									className: "toggleDiv",
									style: "padding: 2px 2px;"
								},
								toggleLayerPane.domNode
							);
							accordion.addChild(toggleLayerPane);
						}
					}

					if (this.enableSearch) {
						var searchDiv = domConstruct.create(
							"div",
							{
								className: "searchDiv"
							},
							mapContainer.domNode
						);

						this.searchDiv = searchDiv;
					}

					this._injectVariableStyling();
				},
				_createButton: function(
					attachPoint,
					className,
					iconClass,
					text,
					imageURL
				) {
					if (this.consoleLogging) {
						console.log(this.id + "._createButton");
					}
					var button = new Button({
						className: className,
						iconClass: iconClass,
						innerHTML: text,
						backgroundImage: imageURL
					});

					if (attachPoint !== null) {
						this[attachPoint] = button.domNode;
					}

					return button;
				},
				_createQueryDefinition: function() {
					var queryDefinition = "";

					// create query definition_create QueryDefinition
					if (this._referenceMxObjectsArr.length > 0) {
						// create an IN statement for all retrieved objects
						queryDefinition = this.arcGISID + " IN (";
						// add each ID of the specific ArcGIS object to the IN statement
						var ArcGISID = null;
						var coordinates = null;
						var firstIteration = true;
						var centerArray = [];
						var centerX = null;
						var centerY = null;

						this._objectsWithoutCoordinates = [];

						for (var q = 0; q < this._referenceMxObjectsArr.length; q++) {
							ArcGISID = this._referenceMxObjectsArr[q].get(this.objectIDAttr);
							coordinates = this._referenceMxObjectsArr[q].get(this.centerAttr);

							if (ArcGISID) {
								// only first time no postfix , should be added
								if (!firstIteration) {
									queryDefinition += ",";
								}
								if (firstIteration) {
									firstIteration = false;
								}
								queryDefinition += ArcGISID;
							}
						}
						queryDefinition += ")";
					}
					if (this.consoleLogging) {
						console.log(queryDefinition);
					}

					return queryDefinition;
				},
				_getCenterCoordinates: function(geometry) {
					if (this.consoleLogging) {
						console.log(this.id + "._getCenterCoordinates");
					}
					var centerLocation = null,
						centerX,
						centerY,
						centerSpatRef = null;

					if (geometry.type == "polyline" || geometry.type == "polygon") {
						var extent = "";
						if (geometry.rings) {
							extent = new Polyline(geometry.rings).getExtent();
						} else if (geometry.paths) {
							extent = new Polyline(geometry.paths).getExtent();
						}

						centerX = (extent.xmax + extent.xmin) / 2;
						centerY = (extent.ymax + extent.ymin) / 2;
						centerSpatRef = geometry.spatialReference;

						centerLocation = new Point(centerX, centerY, centerSpatRef);
					} else if (geometry.type == "point") {
						centerX = geometry.x;
						centerY = geometry.y;
						centerSpatRef = geometry.spatialReference;

						centerLocation = new Point(centerX, centerY, centerSpatRef);
					}
					return centerLocation;
				},
				_generateError: function(errorMessage) {
					console.error(errorMessage);
					mx.ui.info(errorMessage, false);
				},
				_removeFromArr: function(arr) {
					var what,
						a = arguments,
						L = a.length,
						ax;
					while (L > 1 && arr.length) {
						what = a[--L];
						while ((ax = arr.indexOf(what)) !== -1) {
							arr.splice(ax, 1);
						}
					}
					return arr;
				},
				uninitialize: function() {
					if (this.consoleLogging) {
						console.log(this.id + ".uninitialize");
					}
				},

				_getGPSLocation: async function(forceNewLocation = false) {
					let gpsLocation = undefined;

					if (this.initalGpsLocation === -1) {
						return undefined;
					}
					if (!forceNewLocation && this.initalGpsLocation !== undefined) {
						gpsLocation = this.initalGpsLocation;
					} else if (navigator.geolocation) {
						gpsLocation = await new Promise(function(resolve) {
							navigator.geolocation.getCurrentPosition(
								function(pos) {
									resolve({
										latitude: pos.coords.latitude,
										longitude: pos.coords.longitude
									});
								},
								function() {
									resolve(-1);
								},
								{
									timeout: 10000,
									enableHighAccuracy: true
								}
							);
						}).then(result => result);
					}

					if (!this.initalGpsLocation) {
						this.initalGpsLocation = gpsLocation;
					}

					return gpsLocation;
				},
				_projectPoint: async function(points) {
					return await new Promise(
						function(resolve) {
							this.geometryService.project(
								points,
								new SpatialReference({
									wkid: Number(this.spatialReference)
								}),
								function(projectedPoints) {
									resolve(projectedPoints);
								}
							);
						}.bind(this)
					).then(result => result);
				},

				_initNewDeclaration: async function() {
					let location = undefined;
					if (
						this.centerOnLocation &&
						(await this._getGPSLocation()) &&
						(await this._getGPSLocation()) !== -1
					) {
						const { longitude, latitude } = await this._getGPSLocation();
						const projectedPoints = await this._projectPoint([
							new Point(longitude, latitude)
						]);

						location = projectedPoints[0];
					} else {
						location = new Point(
							Number(this.defaultX),
							Number(this.defaultY),
							new SpatialReference({ wkid: Number(this.spatialReference) })
						);
					}

					const symbol = new SimpleMarkerSymbol({
						color: new Color(this.currentLocationColor),
						size: 15,
						type: "esriSMS",
						style: "esriSMSCircle"
					});
					const graphic = new Graphic(location, symbol);
					const layer = this._createNewDeclarationLayer();
					layer.add(graphic);

					this._gisMap.addLayers([layer]);

					this._updateNewDeclarationLocation(location.x, location.y);
				},
				_createNewDeclarationLayer: function() {
					const layer = new GraphicsLayer({
						id: "newDeclarationLyr"
					});
					//click handlers
					//Activate the toolbar when you click on a graphic
					layer.on(
						"click",
						function(evt) {
							event.stop(evt);
							this.editNewDeclarationLyrActive = !this
								.editNewDeclarationLyrActive;
							if (this.editNewDeclarationLyrActive) {
								this._editToolbar.activate(Edit.MOVE, evt.graphic);
								this._editToolbar.on(
									"graphic-move-stop",
									function(e) {
										const { graphic } = e;
										this._updateNewDeclarationLocation(
											graphic.geometry.x,
											graphic.geometry.y
										);
									}.bind(this)
								);
							} else {
								this._editToolbar.deactivate();
							}
						}.bind(this)
					);

					return layer;
				},
				_createExistingDeclarationsLayer: async function(declarationArr) {
					let layer = new GraphicsLayer({
						id: "existingDeclarationsLyr"
					});

					//click handlers
					//Activate the toolbar when you click on a graphic
					layer.on(
						"click",
						function(evt) {
							event.stop(evt);
							const { graphic } = evt;
							const mxObj = declarationArr.find(
								obj =>
									obj.get(this.objectIDAttr).toString() ===
									graphic.attributes[this.objectIDAttr].value
							);
							if (this.onReportClickMF) this._execDeclarationClickMf(mxObj);
						}.bind(this)
					);

					declarationArr.forEach(declaration =>
						this._addExistingDeclarationToLayer(declaration, layer)
					);

					this._gisMap.addLayers([layer]);
				},
				_addExistingDeclarationToLayer(declaration, layer) {
					const attributes = declaration.jsonData.attributes;
					const location = new Point({
						x: attributes[this.DeclarationLongitude].value,
						y: attributes[this.DeclarationLatitude].value,
						spatialReference: new SpatialReference({
							wkid: Number(this.spatialReference)
						})
					});
					const color = this._getDeclarationColorForStatus(
						attributes[this.reportStatus].value
					);
					const symbol = new SimpleMarkerSymbol({
						color: new Color(color),
						size: 15,
						type: "esriSMS",
						style: "esriSMSDiamond"
					});

					layer.add(new Graphic(location, symbol, attributes));
				},
				_getDeclarationColorForStatus(status) {
					const fallbackColor = "#1e6b00";
					if (!status) {
						return fallbackColor;
					}
					const statusColor = this.statusColorList.find(
						statusColorObj =>
							statusColorObj.statusLabel.toUpperCase() === status.toUpperCase()
					);

					return statusColor ? statusColor.statusColor : fallbackColor;
				},
				_execDeclarationClickMf: function(mxobj) {
					const guid = mxobj ? mxobj.getGuid() : null;

					if (guid) {
						mx.data.action(
							{
								params: {
									applyto: "selection",
									actionname: this.onReportClickMF,
									guids: [guid]
								},
								origin: this.mxform,
								error: function(error) {
									console.debug(error.description);
								}
							},
							this
						);
					}
				},
				_execNewReportChangekMf: function() {
					const guid = this._contextObj.getGuid();
					if (guid) {
						mx.data.action(
							{
								params: {
									applyto: "selection",
									actionname: this.onNewReportChangeMF,
									guids: [guid]
								},
								origin: this.mxform,
								error: function(error) {
									console.debug(error.description);
								}
							},
							this
						);
					}
				},
				_updateNewDeclarationLocation(longitude, latitude) {
					if (longitude && latitude) {
						this.DeclarationLongitude &&
							this._contextObj.set(
								this.DeclarationLongitude,
								Number(longitude).toFixed(8)
							);
						this.DeclarationLatitude &&
							this._contextObj.set(
								this.DeclarationLatitude,
								Number(latitude).toFixed(8)
							);
					}
					this.onNewReportChangeMF && this._execNewReportChangekMf();
				},
				_getDeclarationsData: function() {
					if (this.getReportsMF) {
						var guid = this._contextObj.getGuid();
						mx.data.action({
							params: {
								applyto: "selection",
								actionname: this.getReportsMF,
								guids: [guid]
							},
							origin: this.mxform,
							callback: lang.hitch(this, function(objs) {
								if (this.consoleLogging) {
									console.log(
										this._logNode + "Received " + objs.length + " MxObjects: "
									);
									console.dir(this._logNode + objs);
								}

								if (this.zoomToFit) {
									this._zoomToFitDeclarations(objs);
								} else {
									this.declarationsExtent = undefined;
								}

								this._createExistingDeclarationsLayer(objs);
							}),
							error: lang.hitch(this, function(error) {
								console.error(this._logNode + error.description);
							})
						});
						// if no other objects need to be loaded, just load the map, assuming the context entity is the object to load
					}
				},
				_zoomToFitDeclarations: function(declarationMFResult) {
					const points = declarationMFResult.map(declaration => {
						const attributes = declaration.jsonData.attributes;

						return new Point({
							x: attributes[this.DeclarationLongitude].value,
							y: attributes[this.DeclarationLatitude].value,
							spatialReference: new SpatialReference({
								wkid: Number(this.spatialReference)
							})
						});
					});

					this.geometryService.convexHull(
						points,
						/*callback=*/ geometry => {
							this.declarationsExtent = geometry.getExtent();
							this._gisMap.setExtent(this.declarationsExtent);
						},
						/*errback=*/ err => {
							this.declarationsExtent = undefined;
							if (this.consoleLogging) {
								console.log(
									"Something went wrong during the convex hull calculation of the reports."
								);
								console.log(JSON.stringify(err));
							}
						}
					);
				}
			});
		}
	);
});
require(["ArcGIS/widget/ArcGIS"], function() {});
