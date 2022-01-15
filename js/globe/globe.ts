/// <reference path="defs/three.d.ts" />
/// <reference path="defs/stats.d.ts" />
/// <reference path="defs/tween.js.d.ts" />
/// <reference path="defs/require.d.ts" />
/// <reference path="defs/TweenLite.d.ts" />

declare var screenfull:any;
declare var Detector:any;
declare var faker:any;
declare var angular:any;

import Common = require("./Common");
import SunUtils = require("./SunCalculations");

import TWEEN = require("../third-party/Tween");
import faker = require("../third-party/faker.min");

const debugMode = false;

const MAX_EVENTS = 30;

module Globe {
    const sunCalc = new SunUtils.Calculator(new Date());
    const PI_HALF:number = Math.PI / 2;
    const DIST_MAX:number = 1500;
    const DIST_MIN:number = 350;
    const EARTH_RADIUS:number = 200;
    const LINE_COLOR:number = 0x3498db;
    const SUN_DECLINATION = sunCalc.getDeclanation();
    const SUN_RIGHT_ASCENSION:number = sunCalc.getRightAscension();
    const UNIVERSE_RADIUS:number = 1600;

    export class Globe {
        camera;
        scene;
        sun;
        sunPath;
        equatorPath;
        renderer;
        containerWidth;
        containerHeight;
        currentIntersected;
        globeMesh;
        stats;
        ambientLight;
        overRenderer;
        directionalLight;

        shouldRotateGlobe:boolean = true;
        distance:number = 100000;
        distanceTarget:number = 1000;
        curZoomSpeed:number = 0;

        mouse = {x: 0, y: 0};
        mouseOnDown = {x: 0, y: 0};
        rotation = {x: 0, y: 0};
        target = {x: Math.PI, y: Math.PI / 5.0};
        targetOnDown = {x: 0, y: 0};
        raycaster = new THREE.Raycaster();

        constructor(public container:HTMLElement, public manager:any) { //container, manager){
            this.container = container;
            this.manager = manager;
            /*
             Draw a FPS counter
             */
            if (debugMode) {
                this.stats = new Stats();
                this.stats.domElement.style.position = 'absolute';
                this.stats.domElement.style.top = '0px';
                this.container.appendChild(this.stats.domElement);
            }

            /*
             Setup camera
             */
            this.containerWidth = this.container.offsetWidth;
            this.containerHeight = this.container.offsetHeight;
            this.camera = new THREE.PerspectiveCamera(30, this.containerWidth / this.containerHeight, 1, 10000);
            window['camera'] = this.camera;
            this.camera.position.z = this.distance; // Start way zoomed out

            /*
             Initialize our scene
             */
            this.scene = new THREE.Scene();
            window.scene = this.scene;

            /*
             Add some ambient lighting for PhongMaterial
             */
            this.ambientLight = new THREE.AmbientLight(0x404040);
            this.scene.add(this.ambientLight);

            /*
             Sun simulation, baby!
             */
            this.directionalLight = new THREE.DirectionalLight(0xffffff, 1);
            this.directionalLight.position.set(1, 0, EARTH_RADIUS + 50);
            this.directionalLight.rotation.y = Math.PI / 2;
            this.scene.add(this.directionalLight);

            /*
             Add in the earth
             */
            var loader = new THREE.TextureLoader(manager);
            this.globeMesh = new THREE.Mesh(
                new THREE.SphereGeometry(EARTH_RADIUS, 40, 30, 0, Math.PI * 2, 0, Math.PI),
                new THREE.MeshPhongMaterial({
                    map: loader.load('img/1_earth_8k.jpg'),
                    bumpMap: loader.load('img/earth-bump-8k.jpg'),
                    bumpScale: 5,
                    shininess: 0
                })
            ).rotateY(Math.PI);
            this.scene.add(this.globeMesh);

            // Debug sphere & light helper
            this.sun = new THREE.Mesh(
                new THREE.SphereGeometry(3, 30, 30),
                new THREE.MeshBasicMaterial({
                    color: 0xff0000,
                    visible: debugMode
                })
            );
            this.scene.add(this.sun)

            /*
             The curves for the equator & for the current angle of the sun's declination. Offset to the current time
             */
            var curve = new THREE.EllipseCurve(
                0, 0,                                // ax, aY
                EARTH_RADIUS + 50, EARTH_RADIUS + 50, // xRadius, yRadius
                0, Math.PI * 2,                      // aStartAngle, aEndAngle
                false,                                // aClockwise
                SUN_RIGHT_ASCENSION                   // aRotation
            );
            var basePath = new THREE.Path(curve.getPoints(50));

            this.sunPath = new THREE.Line(
                basePath.createPointsGeometry(50).rotateX(Math.PI / 2 + SUN_DECLINATION),
                new THREE.LineBasicMaterial({color: 0x00ff00, visible: debugMode})
            );
            this.scene.add(this.sunPath);

            this.equatorPath = new THREE.Line(
                basePath.createPointsGeometry(50).rotateX(Math.PI / 2),
                new THREE.LineBasicMaterial({color: 0x00ff00, visible: debugMode})
            );
            this.scene.add(this.equatorPath);

            var universeMesh = new THREE.Mesh(
                new THREE.SphereGeometry(UNIVERSE_RADIUS, 40, 30),
                new THREE.MeshBasicMaterial({
                    map: loader.load('img/starmap8k.png'),
                    side: THREE.BackSide
                })
            );
            this.scene.add(universeMesh);

            /*
             Animate the sun in real time (i.e. make sure the sun is always in the actual position it is overhead right now)
             */
            var sunInfo = {point: SUN_DECLINATION, index: 0}
            TweenLite.to(sunInfo, 86400, {
                point: -SUN_DECLINATION, index: 1,
                repeat: -1,
                ease: "Linear.easeNone",
                onUpdate:()=>{
                    var newPoint = curve.getPoint(sunInfo.index);
                    var vector = new THREE.Vector3(newPoint.x, newPoint.y, 0);
                    var axis = new THREE.Vector3(1, 0, 0);
                    var angle = Math.PI / 2 + SUN_DECLINATION;
                    vector.applyAxisAngle(axis, angle);
                    this.directionalLight.position.copy(vector);
                    this.sun.position.copy(vector);
                }
            })

            /*
             Start the renderer
             */
            this.renderer = new THREE.WebGLRenderer({antialias: true});
            this.renderer.setSize(this.containerWidth, this.containerHeight);
            this.renderer.domElement.style.position = 'absolute';
            this.container.appendChild(this.renderer.domElement);

            /*
             Attach event listeners for mouse events (dragging, etc)
             */
            this.container.addEventListener('mousedown', this.onMouseDown, false);
            this.container.addEventListener('mousewheel', this.onMouseWheel, false);
            this.container.addEventListener('mouseover', this.onMouseOver, false);
            this.container.addEventListener('mouseout', this.onMouseOutWindow, false);
            document.addEventListener('mousemove', this.onMouseMoveWindow, false);
            window.addEventListener('resize', this.onWindowResize, false);
        }

        addLink(lat1, lng1, lat2, lng2, event, $scope) {
            var phi = (90 - lat1) * Math.PI / 180;
            var theta = (180 - lng1) * Math.PI / 180;

            var xFrom = EARTH_RADIUS * Math.sin(phi) * Math.cos(theta);
            var yFrom = EARTH_RADIUS * Math.cos(phi);
            var zFrom = EARTH_RADIUS * Math.sin(phi) * Math.sin(theta);

            phi = (90 - lat2) * Math.PI / 180;
            theta = (180 - lng2) * Math.PI / 180;

            var xTo = EARTH_RADIUS * Math.sin(phi) * Math.cos(theta);
            var yTo = EARTH_RADIUS * Math.cos(phi);
            var zTo = EARTH_RADIUS * Math.sin(phi) * Math.sin(theta);

            var vectorTo = new THREE.Vector3(xTo, yTo, zTo);
            var vectorFrom = new THREE.Vector3(xFrom, yFrom, zFrom);

            var dist = vectorFrom.distanceTo(vectorTo);

            var centerVectorTo = vectorTo.clone();
            var centerVectorFrom = vectorFrom.clone();

            var xCenter = ( 0.5 * (vectorFrom.x + vectorTo.x) );
            var yCenter = ( 0.5 * (vectorFrom.y + vectorTo.y) );
            var zCenter = ( 0.5 * (vectorFrom.z + vectorTo.z) );

            var mid = new THREE.Vector3(xCenter, yCenter, zCenter);

            var smoothDist = Common.linearMap(dist, 0, 400, 1.05, 1.80);
            mid.setLength(EARTH_RADIUS * smoothDist);

            centerVectorTo.add(mid);
            centerVectorFrom.add(mid);

            centerVectorTo.setLength(EARTH_RADIUS * smoothDist);
            centerVectorFrom.setLength(EARTH_RADIUS * smoothDist);

            var line = new THREE.CubicBezierCurve3(vectorFrom, centerVectorFrom, centerVectorTo, vectorTo);
            var curveGeo = new THREE.Geometry();
            curveGeo.vertices = line.getPoints(100);
            curveGeo.computeLineDistances();

            var existingGroup;
            $scope.events.forEach(function(activeEvent){
                // Get the Line mesh from each element
                var activeEventLine = activeEvent.group.children.filter(function(item){return item.type==="Line"})[0];

                // Get our verticies for what we want to put in, and what we already have
                var activeGeoVerticies = activeEventLine.geometry.vertices;
                var curveGeoVerticies = curveGeo.vertices;

                // Hey guys I have a great idea, let's not support array slicing in JS! Sound good? Awesome!
                if (
                    // Literally hitler comparison. Checks if the first point and last point are equal or vice-versa
                    (
                        (activeGeoVerticies[0].equals(curveGeoVerticies[0])) &&
                        (activeGeoVerticies[activeGeoVerticies.length-1].equals(curveGeoVerticies[curveGeoVerticies.length-1]))
                    ) || (
                        (activeGeoVerticies[0].equals(curveGeoVerticies[curveGeoVerticies.length-1])) &&
                        (activeGeoVerticies[activeGeoVerticies.length-1].equals(curveGeoVerticies[0]))
                    )

                ) {
                    existingGroup = activeEvent.group;
                }
            });

            var sphere = this.createSphere(xFrom, yFrom, zFrom, event);
            sphere['animate'] = {point: 0};

            if (existingGroup){
                if ($scope.currentFilter == "any" || $scope.currentFilter == event.type){
                    sphere.material.visible = false;
                } else {
                    sphere.material.visible = true;
                }

                sphere['tween'] = new TWEEN.Tween(sphere['animate'])
                    .to({point: 1}, Common.linearMap(dist, 0, 400, 1000, 5000))
                    .onUpdate(function (p) {
                        sphere.position.copy(line.getPoint(p))
                    })
                    .repeat(Infinity)
                    .start();

                existingGroup.add(sphere);
                event.group = existingGroup;
                event.sphere = sphere;
                return existingGroup
            } else {
                var group = new THREE.Group();
                var lineLength = curveGeo.lineDistances[curveGeo.lineDistances.length - 1];
                var lineMaterial = new THREE.LineDashedMaterial({
                    color: LINE_COLOR,
                    dashSize: 0,
                    gapSize: lineLength,
                    linewidth: 1,
                    transparent: true
                });
                var curveObject = new THREE.Line(curveGeo, lineMaterial);

                /*
                 Animate the line draw, then start moving the sphere
                 */

                group.add(curveObject);
                group.add(sphere);

                curveObject.material.visible = true;

                if ($scope.currentFilter != "all" && $scope.currentFilter != event.type){
                    sphere.material.visible = false;

                    curveObject.material.visible = false;
                    curveObject.material.dashSize = lineLength;

                    sphere['tween'] = new TWEEN.Tween(sphere['animate'])
                        .to({point: 1}, Common.linearMap(dist, 0, 400, 1000, 5000))
                        .onUpdate(function (p) {
                            sphere.position.copy(line.getPoint(p))
                        })
                        .repeat(Infinity)
                        .start();

                } else {
                    TweenLite.to(curveObject.material, Common.linearMap(dist, 0, 400, 1, 2), {
                        dashSize: lineLength,
                        ease: "Linear.easeNone",
                        onComplete: function () {
                            sphere.material.visible = true;
                            sphere['tween'] = new TWEEN.Tween(sphere['animate'])
                                .to({point: 1}, Common.linearMap(dist, 0, 400, 1000, 5000))
                                .onUpdate(function (p) {
                                    sphere.position.copy(line.getPoint(p))
                                })
                                .repeat(Infinity)
                                .start();
                        }
                    })
                    this.fadeIn(group, 1000);
                }

                this.scene.add(group);
                event.group = group;
                event.sphere = sphere;
                return group
            }
        }

        createSphere(x, y, z, event) {
            var color
            if (event.color) {
                color = event.color
            } else {
                color = 0xFF0000
            }
            var sphere = new THREE.Mesh(
                new THREE.SphereGeometry(1, 10, 10),
                new THREE.MeshBasicMaterial({
                    color: color,
                    visible: false,
                    transparent: true
                })
            );
            sphere.position.set(x, y, z);
            return sphere
        }

        addEvent(data, event, $scope) {
            var lat1, lng1, lat2, lng2;
            lat1 = data[0][0][0];
            lng1 = data[0][0][1];
            lat2 = data[0][1][0];
            lng2 = data[0][1][1];
            return this.addLink(lat1, lng1, lat2, lng2, event, $scope);
        }

        onMouseDown = (event) => {
            event.preventDefault();

            this.container.addEventListener('mousemove', this.onMouseMove, false);
            this.container.addEventListener('mouseup', this.onMouseUp, false);
            this.container.addEventListener('mouseout', this.onMouseOut, false);

            this.mouseOnDown.x = -event.clientX;
            this.mouseOnDown.y = event.clientY;

            this.targetOnDown.x = this.target.x;
            this.targetOnDown.y = this.target.y;

            this.container.style.cursor = 'move';
            this.shouldRotateGlobe = false;
        }

        onMouseWheel = (event) => {
            event.preventDefault();
            if (this.overRenderer) {
                this.zoom(event.wheelDeltaY * 0.3);
            }
            return false;
        }

        onMouseOver = (event) => {
            this.overRenderer = true
        }

        onMouseOutWindow = (event) => {
            this.overRenderer = false;
        }

        onMouseMoveWindow = (event) => {
            // Track mouse movements for raytracing functionality
            this.mouse.x = (event.clientX / this.container.offsetWidth) * 2 - 1;
            this.mouse.y = -(event.clientY / this.container.offsetHeight) * 2 + 1;
        }

        onMouseMove = (event) => {
            this.mouse.x = -event.clientX;
            this.mouse.y = event.clientY;

            var zoomDamp = this.distance / 1000;

            this.target.x = this.targetOnDown.x + (this.mouse.x - this.mouseOnDown.x) * 0.005 * zoomDamp;
            this.target.y = this.targetOnDown.y + (this.mouse.y - this.mouseOnDown.y) * 0.005 * zoomDamp;

            this.target.y = this.target.y > PI_HALF ? PI_HALF : this.target.y;
            this.target.y = this.target.y < -PI_HALF ? -PI_HALF : this.target.y;
        }

        onMouseUp = (event) => {
            this.container.removeEventListener('mousemove', this.onMouseMove, false);
            this.container.removeEventListener('mouseup', this.onMouseUp, false);
            this.container.removeEventListener('mouseout', this.onMouseOut, false);
            this.container.style.cursor = 'auto';
        }

        onMouseOut = (event) => {
            this.container.removeEventListener('mousemove', this.onMouseMove, false);
            this.container.removeEventListener('mouseup', this.onMouseUp, false);
            this.container.removeEventListener('mouseout', this.onMouseOut, false);
            this.shouldRotateGlobe = true;
        }

        onWindowResize = (event) => {
            this.camera.aspect = this.container.offsetWidth / this.container.offsetHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(this.container.offsetWidth, this.container.offsetWidth);
        }

        zoom = (delta) => {
            this.distanceTarget -= delta;
            this.distanceTarget = this.distanceTarget > DIST_MAX ? DIST_MAX : this.distanceTarget;
            this.distanceTarget = this.distanceTarget < DIST_MIN ? DIST_MIN : this.distanceTarget;
        }

        fadeOutRemove = (event, seconds) => {
            // Yay for fighting with memory allocators
            // Seriously never touch this without gluing your eyeballs to a profiler.
            // TL;DR - GC languages are great until they're not :(
            var group = event.group;

            if(group.children.length > 2){
                TweenLite.to(event.sphere.material, 0.5, {
                    opacity:0,
                    ease: "Linear.easeNone",
                    onComplete: function () {
                        event.sphere.geometry.dispose();
                        event.sphere.material.dispose();
                        event.sphere.geometry.lineDistances = [];
                        event.sphere.indices = [];
                        event.sphere.vertices = [];
                        event.sphere.uvs = [];
                        event.group.remove(event.sphere);
                        TWEEN.remove(event.sphere.tween);
                    }
                })
            } else {
                var thing = group.children.length;
                for (var i = 0; i < group.children.length; i++) {
                    var child = group.children[i];
                    child.material.transparent = true;
                    ((child) => {
                        TweenLite.to(child.material, seconds / 1000, {
                            opacity:0,
                            ease: "Linear.easeNone",
                            onComplete: () => {
                                --thing;
                                if (thing == 0) {
                                    this.scene.remove(child.parent);
                                }
                                if (child.tween) {
                                    setTimeout(() => {
                                        TWEEN.remove(child.tween)
                                    }, 150)
                                }
                                child.geometry.dispose();
                                child.material.dispose();
                                child.geometry.lineDistances = [];
                                child.indices = [];
                                child.vertices = [];
                                child.uvs = [];
                            }
                        })
                    })(child)
                }
            }
        }


        fadeIn(group, seconds) {
            for (var i = 0; i < group.children.length; i++) {
                // Weee closures
                ((child) => {
                    if (child.material.opacity == 1) {
                        return
                    }
                    child.material.transparent = true;
                    child.material.opacity = 0;
                    child.animating = true;
                    TweenLite.to(child.material, seconds / 1000, {
                        opacity: 1,
                        ease: "Linear.easeNone",
                        onComplete: function(){
                            child.animating = false;
                        }
                    })
                })(group.children[i]);
            }
        }

        render() {
            // Raycast to get mouseover stuff
            // this.raycaster.setFromCamera(this.mouse, this.camera);
            // var intersects = this.raycaster.intersectObjects(this.scene.children, true);
            var intersects = []
            if (intersects.length > 1) {
                if (intersects[0].object.type == "Line") {
                    if (this.currentIntersected != intersects[0].object && this.currentIntersected != intersects[1].object) {
                        this.currentIntersected && this.currentIntersected.material.color.setHex(LINE_COLOR);
                        this.currentIntersected = intersects[0].object;
                        this.currentIntersected.material.color.setHex(0xFF0000);
                    }
                } else if (this.currentIntersected !== undefined) {
                    this.currentIntersected.material.color.setHex(LINE_COLOR);
                    this.currentIntersected = undefined;
                }
            } else {
                if (this.currentIntersected !== undefined) {
                    this.currentIntersected.material.color.setHex(LINE_COLOR);
                    this.currentIntersected = undefined;
                }
            }

            this.zoom(this.curZoomSpeed);

            if (this.shouldRotateGlobe) {
                this.target.x -= .001
            }

            this.rotation.x += (this.target.x - this.rotation.x) * 0.1;
            this.rotation.y += (this.target.y - this.rotation.y) * 0.1;

            this.distance += (this.distanceTarget - this.distance) * 0.1;
            //noinspection JSSuspiciousNameCombination
            this.camera.position.x = this.distance * Math.sin(this.rotation.x) * Math.cos(this.rotation.y);
            //noinspection JSSuspiciousNameCombination
            this.camera.position.y = this.distance * Math.sin(this.rotation.y);
            //noinspection JSSuspiciousNameCombination
            this.camera.position.z = this.distance * Math.cos(this.rotation.x) * Math.cos(this.rotation.y);

            this.camera.lookAt(this.globeMesh.position);

            this.renderer.render(this.scene, this.camera);
        }

        public animate() {
            requestAnimationFrame(this.animate.bind(this));
            debugMode && this.stats.update();
            this.render();
            TWEEN.update();
        }

        public currentZoom = () => {return this.distanceTarget};
        public setLocation = (x, y, zoom) => {
            this.distanceTarget = zoom;
            this.target.x = x;
            this.target.y = y;
        };

        public toggleRotation = () => {
            this.shouldRotateGlobe = !this.shouldRotateGlobe;
        }
        public stopRotation = () => {
            this.shouldRotateGlobe = false;
        }
        public isRotating = () => {
            return this.shouldRotateGlobe;
        }
        public toggleSun = () => {
            if (this.ambientLight.color.getHex() == 0x404040) {
                this.ambientLight.color.setHex(0xFFFFFF);
                this.directionalLight.visible = false;
            } else {
                this.ambientLight.color.setHex(0x404040);
                this.directionalLight.visible = true;
            }
        }

        public toggleSunDebug = () => {
            this.sun.material.visible = !this.sun.material.visible;
            this.sunPath.material.visible = !this.sunPath.material.visible;
            this.equatorPath.material.visible = !this.equatorPath.material.visible;
        }

    }
}

var TA = TA || {};

TA.Globe = Globe.Globe;

TA.Logo = function (container, manager) {
    var camera, scene, renderer, w, h, mesh;

    function init() {
        /*
         Setup camera
         */
        w = container.offsetWidth;
        h = container.offsetHeight;
        camera = new THREE.PerspectiveCamera(30, w / h, 1, 10000);

        /*
         Initialize our scene
         */
        scene = new THREE.Scene();

        var JSONloader = new THREE.JSONLoader();
        JSONloader.load("meshes/TALogo.json", function (geometry, materials) {
            var material = new THREE.MeshFaceMaterial(materials)
            mesh = new THREE.Mesh(geometry, material);
            mesh.scale.set(12, 12, 12)
            mesh.position.set(400, 0, 0)
            scene.add(mesh)
            new TWEEN.Tween(mesh.rotation)
                .to({y: 2 * Math.PI}, 5000)
                .repeat(Infinity)
                .start()
            camera.lookAt(mesh.position);
            camera.position.setY(75)
            animate()
        })

        /*
         Start the renderer
         */
        renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
        renderer.setSize(w, h);
        renderer.domElement.style.position = 'absolute';
        container.appendChild(renderer.domElement);

        container.addEventListener('resize', function () {
            camera.aspect = container.offsetWidth / container.offsetHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(container.offsetWidth, container.offsetHeight);
        }, false);
    }

    function animate() {
        requestAnimationFrame(animate);
        render();
        TWEEN.update();
    }

    function render() {
        scene && renderer.render(scene, camera);
    }

    this.animate = animate;
    init();
}

const GLOBAL_AIRPORTS = [
    [37.6131904,-119.2725474],
    [37.4420076, -122.1621195],
    [47.121910, -88.558766],
    [35.6934063, 63.2890902],
    [-37.42896721719033,57.86318778991699],
    [31.351621252, -113.305864334],
    [-9.443380355834961, 147.22000122070312],
    [63.985000610352, -22.605600357056],
    [42.57279968261719, 21.03580093383789],
    [53.309700012200004, -113.580001831],
    [44.8807983398, -63.5085983276],
    [45.3224983215332, -75.66919708251953],
    [45.4706001282, -73.7407989502],
    [49.193901062, -123.183998108],
    [49.909999847399995, -97.2398986816],
    [51.113899231, -114.019996643],
    [48.646900177, -123.426002502],
    [47.618598938, -52.7518997192],
    [43.6772003174, -79.63059997559999],
    [36.691001892089844, 3.215409994125366],
    [5.605189800262451, -0.16678600013256073],
    [9.006790161132812, 7.263169765472412],
    [4.8725, 8.093],
    [6.5773701667785645, 3.321160078048706],
    [36.85100173950195, 10.22719955444336],
    [50.901401519800004, 4.48443984985],
    [50.459201812699995, 4.45382022858],
    [50.63740158081055, 5.443220138549805],
    [52.380001068115, 13.522500038147],
    [51.1328010559082, 13.767200469970703]
];

const US_AIRPORTS =[
    ["40.1506944", "-122.2523056"],
    ["40.509", "-122.293389"],
    ["34.08525", "-117.146388"],
    ["34.678653", "-86.684781"],
    ["27.456389", "-81.342222"],
    ["41.517778", "-88.175556"],
    ["35.7649958", "-80.9538958"],
    ["39.370621", "-101.698992"],
    ["39.499108", "-119.768108"],
    ["47.4931389", "-122.21575"],
    ["40.7288", "-73.4134"],
    ["42.260556", "-84.460556"],
    ["45.6312", "-89.4675"],
    ["34.3507778", "-85.1586667"],
    ["36.0396111", "-95.9846389"],
    ["38.7364361", "-112.0989444"],
    ["34.8913056", "-79.7596111"],
    ["37.505167", "-77.319667"],
    ["39.7561006", "-84.8427175"],
    ["35.219369", "-101.705931"],
    ["39.813786", "-82.927822"],
    ["33.951875", "-117.445103"],
    ["43.064167", "-108.459722"],
    ["37.325472", "-79.975417"],
    ["66.8175", "-161.022222"],
    ["31.06725", "-97.828917"]
]

angular.module('globe', ['ngAnimate'])
    .controller('globeCtrl', function($scope, $interval, $timeout, $animate){
        $scope.globe = undefined;
        $scope.events = [];
        $scope.menuVisible = true;
        $scope.loaded = false;

        $scope.currentFilter = "all"

        $scope.allTab = {
            active: true,
            color: "#3498db",
            underlineColor: "#2980b9",
            type: "all"
        };
        $scope.approvalsTab = {
            color: "#2ecc71",
            underlineColor: "#27ae60",
            type: "approvals"
        };
        $scope.alertsTab = {
            color: "#e74c3c",
            underlineColor: "#c0392b",
            type: "alerts"
        };
        $scope.filesTab = {
            color: "#f1c40f",
            underlineColor: "#f39c12",
            type: "files"
        };

        $scope.currentTab = $scope.allTab;

        $scope.toggleMenu = function(){
            $scope.menuVisible = !$scope.menuVisible;
        };

        $scope.addRandomEvent = function(){
            var event = {
                eventMessage: undefined,
                color: undefined,
                group: undefined,
                avatar: faker.image.avatar(),
                ownerName: faker.name.findName(),
                requesterName: faker.name.findName(),
                fileName: faker.hacker.noun() + faker.random.arrayElement([".txt", ".png", ".pdf", ".doc", ".js"]),
                type: faker.random.arrayElement(['misc', 'file', 'approval', 'alert']),
            };

            Common.shuffleArray(US_AIRPORTS);

            switch (event.type){
                case "misc":
                    event.eventMessage = event.ownerName + faker.random.arrayElement([
                            " took a screen shot",
                            " printed this document"
                        ]);
                    event.color = 0x3498db;
                    break;
                case "file":
                    event.eventMessage = event.ownerName + faker.random.arrayElement([
                            " emailed this file to " + event.requesterName,
                            " received this file",
                            " shared this file with " + faker.random.arrayElement(["Slack", "Google Drive", "Gmail", ""])
                        ]);
                    event.color = 0xf1c40f;
                    break;
                case "approval":
                    event.eventMessage = event.ownerName + faker.random.arrayElement([
                            " revoked access from " + event.requesterName,
                            " granted access to " + event.requesterName,
                            " denied access to " + event.requesterName
                        ]);
                    event.color = 0x2ecc71;
                    break;
                case "alert":
                    event.eventMessage = event.ownerName + faker.random.arrayElement([
                            " took a screen-shot",
                            " tried to share this file outside your organization ",
                            " copied this document to a USB drive",
                            " copied this document to a network drive"
                        ]);
                    event.color = 0xe74c3c;
                    break;
            }

            event.group = $scope.globe.addEvent([
                [US_AIRPORTS[0], US_AIRPORTS[1]]
            ], event, $scope);

            $scope.events.splice(0, 0, event);
            if ($scope.events.length > MAX_EVENTS){
                $scope.globe.fadeOutRemove($scope.events.pop(), 1000);
            }
        };

        $scope.toggleSettings = function(){
            $scope.shouldShowMenu = !$scope.shouldShowMenu;
        };

        $scope.toggleFullscreen = function(){
            var body = document.getElementsByClassName('main-wrapper')[0]
            if(screenfull.enabled){
                screenfull.toggle();
            }
        };

        $scope.hideOrShowEvents = function(type){
            $scope.events.forEach(function(e){
                if(e.type == type){
                    if (e.group.children.length == 2){
                        e.group.children.forEach(function(c){
                            c.material.opacity = 1;
                            c.material.visible = true;
                        })
                    } else {
                        e.sphere.material.opacity = 1;
                        e.sphere.material.visible = true;
                    }
                } else {
                    if (e.group.children.length == 2){
                        e.group.children.forEach(function(c){
                            c.material.opacity = 0;
                            c.material.visible = false;
                        })
                    } else {
                        e.sphere.material.opacity = 0;
                        e.sphere.material.visible = false;
                    }
                }
            })
        }

        $scope.setTab = function(page){
            $animate.enabled(false);
            var newTab;

            switch (page) {
                case "all":
                    $scope.currentFilter = "all"
                    newTab = $scope.allTab;
                    $timeout(function() {
                        // Just show everything
                        $scope.events.forEach(function (e) {
                            e.group.children.forEach(function(c){
                                c.material.visible = true;
                                c.material.opacity = 1;
                            })
                        })
                    });
                    break;
                case "approvals":
                    $scope.currentFilter = "approval";
                    newTab = $scope.approvalsTab;
                    $timeout(function(){
                        $scope.hideOrShowEvents("approval")
                    });
                    break;
                case "alerts":
                    $scope.currentFilter = "alert"
                    newTab = $scope.alertsTab;
                    $timeout(function() {
                        $scope.hideOrShowEvents("alert")
                    });
                    break;
                case "files":
                    $scope.currentFilter = "file"
                    newTab = $scope.filesTab;
                    $timeout(function() {
                        $scope.hideOrShowEvents("file")
                    });
                    break;
            }

            if(newTab == $scope.currentTab){return}

            $scope.menu = {"background-color": newTab.color};

            newTab.active = true;
            $scope.currentTab.active = false;
            $scope.currentTab = newTab;
            $timeout(function () {
                $animate.enabled(true);
            });
        }

        $scope.zoomToMurica = function(){
            $scope.globe.stopRotation();
            var currentLocation = {
                x: $scope.globe.target.x,
                y: $scope.globe.target.y,
                distanceTarget: $scope.globe.currentZoom()
            };

            var muricaOffset = 3.279334311641279847;

            var offset = ((currentLocation.x + muricaOffset)) % (Math.PI * 2);

            // This bit determines how far away we are from the point we want to go to, and will rotate
            // whichever way is the fastest to get to where we want (i.e. if we're slightly left
            // of america it'll just go right a hair, not all the way around to the left. Same with
            // right).
            var pointLocation;
            if (((currentLocation.x + muricaOffset)) % (Math.PI * 2) > Math.PI){
                pointLocation = (((2*Math.PI) - offset) + currentLocation.x);
            } else {
                pointLocation = (currentLocation.x - offset);
            }
            var muricaLocation = {x: pointLocation, y: 0.6627041168950789, distanceTarget: 528};
            TweenLite.to(currentLocation, 1, {
                x: muricaLocation.x,
                y: muricaLocation.y,
                distanceTarget: muricaLocation.distanceTarget,
                onUpdate:function(){
                    $scope.globe.setLocation(currentLocation.x, currentLocation.y, currentLocation.distanceTarget)
                }
            })
        }

        $scope.toggleSun = function(){
            $scope.globe.toggleSun();
        };

        $scope.toggleSunDebug = function(){
            $scope.globe.toggleSunDebug();
        }

        $scope.toggleRotation = function(){
            $scope.globe.toggleRotation();
        };

        $timeout(function(){
            renderGlobe(function(globe){
                $scope.loaded = true;
                $scope.globe = globe;
                // Add a new event once every .5-5 seconds
                (function loop(){
                    var rand = Math.floor(Math.random() * 5000) + 500;
                    setTimeout(function() {
                        $timeout(function() {
                            $scope.addRandomEvent();
                        });
                        loop();
                    }, rand);
                }());

            });
        })
    })
    .filter('tabFilter', function() {
        return function(input, currentTab) {
            var out = [];
            angular.forEach(input, function(event) {
                if ((currentTab == "all") ||
                    (currentTab == "approvals" && event.type == "approval") ||
                    (currentTab == "alerts" && event.type == "alert") ||
                    (currentTab == "files" && event.type == "file")
                ){
                    out.push(event)
                }
            });
            return out;
        }
    });

angular.element(document).ready(function() {
    angular.bootstrap(document, ['globe']);
});

function renderGlobe(doneCallback){
    if(!Detector.webgl){
        alert("Unfortuantely you don't have WebGL, so this won't work :(. Sorry!");
        return false;
    }
    var logo = document.getElementById('logoContainer');
    var container = document.getElementById('container');
    var menu = document.getElementById('right-menu');
    var messages = document.getElementById('messages');
    var logoStyle = logo.style;

    function resize(){
        logoStyle.bottom = (window.innerHeight / 2) - 40 + "px";
        logoStyle.left = (window.innerWidth / 2) - (230/2) + "px";
        messages.style.height = window.innerHeight - 105 + "px";
    }
    resize();
    logoStyle.display = "block";

    window.addEventListener('resize', resize);
    window.addEventListener('resize', function(){
        container.style.width = window.innerWidth - menu.offsetWidth + "px";
        messages.style.height = window.innerHeight - 105 + "px";
    });

    container.style.width = window.innerWidth - menu.offsetWidth + "px";
    var logoContainer = document.getElementById('logo');
    var manager = new THREE.LoadingManager(
        function onComplete(){
            setTimeout(function(){
                var globeStyle = document.getElementById('container').style;
                var menuStyle = document.getElementById('right-menu').style;
                var pointers = {opacity:0, bottom: parseFloat(logoStyle.bottom), left: parseFloat(logoStyle.left)}
                TweenLite.to(pointers, 1, {
                    opacity: 1, bottom: 5, left: 5,
                    onUpdate:function(){
                        window.removeEventListener('resize', resize);
                        logoStyle.bottom = pointers.bottom + "px";
                        logoStyle.left = pointers.left + "px";
                        globeStyle.opacity = pointers.opacity.toString();
                        menuStyle.opacity = pointers.opacity.toString();
                    },
                    onComplete:function(){
                        if(doneCallback instanceof Function)
                            doneCallback(globe);
                    }
                });
            }, 1500)

        }
    );

    var globe = new TA.Globe(container, manager);
    globe.animate()
    logo = new TA.Logo(logoContainer, manager);

    document.addEventListener('keydown', function(event) {
        // Let spacebar start/stop
        if(event.keyCode == 32) {
            globe.toggleRotation()
        }
    });

}