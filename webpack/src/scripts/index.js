import '../styles/index.scss';
import * as d3 from 'd3';
import {bin2d} from './bin2d';


// globals

const colors = {
	plotBackground: '#333',
	globeBackground: '#000',
	graticules: '#333',
	bin: '#fff',
	binSelected: '#f00'
};

let globalState = {
	cat: "All"
};


const loader = d3.select("#loader");
const widget = d3.select("#widget");

const w = widget.node().clientWidth;
const h = widget.node().clientHeight;



// dispatch

const globalDispatch = d3.dispatch(
	'toggle',
	'gaze:finder',
	'dist:cat',
	'dist:bin',
	'dist:clear'
);


globalDispatch.on('toggle',(data,images)=>{
	toggleNav(data,images);
});


globalDispatch.on('gaze:finder',(data,images)=>{
	destroyDistribution();
	renderGaze(data,images);
});


globalDispatch.on('dist:cat', (data,images)=>{
	console.log("dist:cat",globalState.cat);
	destroyGaze();
	renderDistribution(data,images);
	renderCategoryMenu(data,images);
});


globalDispatch.on('dist:bin',(bin,images)=>{
	renderBinContents(bin,images);
});


globalDispatch.on('dist:clear',()=>{
	destroyBinContents();
});







// data ---------------------------------------------------

// TODO: font loader promise

const dataPromise = d3.csv('./public/data/temp_data.csv', parseData);

dataPromise.then(data=>{
	
	const imageIds = data.map(d=>d.imageid);
	const imagesPromise = loadImages(imageIds);
	
	imagesPromise.then((images)=>{
		globalDispatch.call('toggle',null,data,images);

	window.onresize = function(){
			d3.select("#gaze").remove();
			d3.select("#dist").remove();
			d3.select("#gazeResult").remove();
			globalDispatch.call('toggle',null,data,images);
		};
	});
});

async function loadImages(imageIds) {
	const bar = loader.select(".progress_bar");
	const imageCount = imageIds.length;
	let currentCount = 0;
	const promiseArray = []; 
	const imageArray = []; 
	for (let imageId of imageIds) {
		promiseArray.push(new Promise(resolve => {
			const img = new Image();
			img.onload = function() {
				currentCount++;
				bar.style("width",`${Math.round(currentCount / imageCount * 100)}%`);
				resolve();
			};
			img.src = `./public/img/${imageId}.jpg`;
			imageArray.push({imageid:imageId,imageobj:img});
		}));
	}
	// wait for all the images to be loaded
	await Promise.all(promiseArray); 
	loader.remove();
	return imageArray;
}



function parseData(d){
	let p, y; 
	if (+d.manual_pitch != 0){
		p = +d.manual_pitch;
	} else {
		p = +d.pitch;
	}
	if (+d.manual_yaw != 0){
		y = +d.manual_yaw;
	} else {
		y = +d.yaw;
	}

	return {
		imageid: d.imageid,
		url: d.url,
		pitch: p,
		yaw: y,
		object_id: d.object_id,
		object_title: d.object_title,
		object_classification: d.object_classification,
		object_department: d.object_department,
		object_division: d.object_division,
		object_artist: d.object_artist,
		object_century: d.object_century,
		object_datebegin: d.object_datebegin,
		object_culture: d.object_culture,
		object_provenance: d.object_provenance,
		object_dimensions: d.object_dimensions,
		object_medium: d.object_medium,
		object_technique: d.object_technique,
		object_accessionyear: +d.object_accessionyear
	};
}


function binData(data){
	// set up bin function
	const dataBinned = bin2d()     
			.size([360, 180]) // degrees of globe
			.side(18); 
	// negative range of 3d coords won't work with 2dbin, so make all positive
	const dataTrans = data.map(d=>{
		return [d.yaw + 180, d.pitch + 90, d]; // add original data in 3rd slot
	});
	// generat dataBinned
	let binTrans = dataBinned(dataTrans);
	// move back to original range
	const binData = binTrans.map(d=>{
		d.x = d.x - 180;
		d.y = d.y - 90;
		return d;
	});
	return binData;
}

// nav


function toggleNav(data,images){

	update(d3.select("input[name='toggle']:checked").node().value);

	const toggle = d3.selectAll("input[name='toggle']")
		.on("change",function(){
			d3.event.preventDefault();
			update(d3.select("input[name='toggle']:checked").node().value);
		});

	function update(togglestate){
	 	console.log("toggstate",togglestate);
		if (togglestate === 'gaze') {
		 	globalDispatch.call('gaze:finder',null,data,images);
		} else {
			globalDispatch.call('dist:cat',null,data,images);
		}
	}
}




// distibution --------------------------------------------

function renderCategoryMenu(data,images){
	console.log("renderCategoryMenu");
	const rootDOM = d3.select('#filter');
	const categories = data.map(d=>{
			return d.object_classification;
		})
		.filter((v, i, a)=>a.indexOf(v)===i)
	categories.unshift("All");

	const menu = rootDOM
		.selectAll('.tab-menu')
		.data([1]);
	const menuEnter = menu.enter()
		.append('ul')
		.attr("class","tab-menu");
	menu.merge(menuEnter)
	const menuItems = menu.merge(menuEnter)
		.selectAll('.tab')
		.data(categories)
	const menuItemsEnter = menuItems.enter()
		.append("li")
		.attr("class","tab")
	menuItems.merge(menuItemsEnter)
		.attr("data-link",d=>d)
		.classed("active",d=>globalState.cat === d)
		.text(d=>d)
		.on("click", function(){
			d3.event.preventDefault();
			let cat = d3.select(this).attr("data-link");
			globalState.cat = cat;
			globalDispatch.call('dist:cat', null, data,images);
		});
}



function renderDistribution(data,images){
	console.log("renderDistribution");

	const filteredData = (function(){
			if (globalState.cat === "All") {
				return data;
			} else {
				return data.filter(d=>d.object_classification === globalState.cat)
			}
		})();


	const	dataBinned =  binData(filteredData);
	
	const globeRadius = w / 2;
	
	// update
	const svg = widget.selectAll('svg')
		.data([1]);
	// enter
	const svgEnter = svg.enter()
	 	.append('svg')
	 	.attr("id","dist")
	// update + enter
	svg.merge(svgEnter)
	 	.attr("viewBox", `0 0 ${w} ${h}`)	

	const plot = svg.merge(svgEnter)

	// Scale functions
	const scaleR = d3.scaleLinear()
	 	.domain([0,d3.max(dataBinned,d=>d.length)])
	 	.range([1, 8]); // range in pixels
	// Geo functions
	const proj = d3.geoOrthographic()
		.scale(globeRadius)
		.translate([w/2, h/2])
		.clipAngle(90);
	const circle = d3.geoCircle()
	const path = d3.geoPath()
		.projection(proj);
	const graticule = d3.geoGraticule()
		.step([18, 18]);
	// Globe background
	plot.append("circle")
		.attr("cx",w/2)
		.attr("cy",h/2)
		.attr("r",globeRadius)
		.attr("fill","black");
	// Graticules
	const graticules = plot.append("path")
		.datum(graticule)
		.attr("class", "graticule")
		.attr("d", path)
		.attr("fill","none")
		.attr("stroke",colors.graticules);

	// update
	const groups = plot.selectAll(".bin")
		.data(dataBinned, d=>d.imageid);

	// enter
	const groupsEnter = groups.enter()
		.append("g")
		.attr("class","bin")

	groupsEnter.append("path")
		.attr("class","bin-target")
		
	groupsEnter.append("path")
		.attr("class","bin-dot")

	// update + enter
	groups.merge(groupsEnter)
		.attr("data-binid",(d,i)=>i)
    .on('mouseover', function(d) {
		globalDispatch.call('dist:bin',null,d,images);
    	d3.select(this).select(".bin-dot").attr("fill",colors.binSelected)
    })
	.on('mouseout', function(d) {
			globalDispatch.call('dist:clear');
    	d3.select(this).select(".bin-dot").attr("fill",colors.bin)
    })
    .on('click', function(d) {
			globalDispatch.call('dist:bin',null,d,images);
    })

	groups.merge(groupsEnter)
		.select(".bin-target")
		.attr("d", (d)=>path(
			circle.center([d.x,d.y]).radius(scaleR(d3.max(dataBinned,d=>d.length)))()
		))
		.attr("fill",colors.globeBackground)
		.attr("opacity",0)
		
	groups.merge(groupsEnter)
		.select(".bin-dot")
			.attr("d", (d)=>path(
				circle.center([d.x,d.y]).radius(scaleR(d.length))()
			))
		.attr("fill",colors.bin)
		
	// exit
	groups.exit().remove()
}



function destroyDistribution(){
	console.log("destroyDistribution");
	d3.select("#dist").remove();
	d3.select("#filter .tab-menu").remove();
}



function renderBinContents(data, images){
	console.log("renderBinContents");

	const rootDOM = d3.select('#result');

	const unpackedData = data.map(d=>d[2]).slice(0,180);



	// update
	const container = rootDOM.selectAll('#unpackedBin')
		.data([1]);
	// enter
	const containerEnter = container.enter()
	 	.append('div')
	 	.attr("id","unpackedBin");
	// update + enter
	const div = container.merge(containerEnter)

	// upadte
	const faces = div.selectAll(".face")
		.data(unpackedData)
	// enter
	const facesEnter = faces.enter()
		.append("div")
		.attr("class","face")
	facesEnter.append("img")
		.attr("class","face-img")
	facesEnter.append("p")
		.attr("class","face-caption")

	// update + enter
	faces.merge(facesEnter)
		.attr("data-imgid",d=>d.imageid)
	faces.merge(facesEnter)
		.select(".face-img")
		.attr("src",d=>{
			let iObj = images.filter(j=>j.imageid === d.imageid)[0].imageobj;
			return iObj.src;
		})
	faces.merge(facesEnter)
		.select(".face-caption")
		.text(d=>d.imageid)
	
	// exit
	faces.exit().remove();
}


function destroyBinContents(){
	console.log("destroyBinContents");
	d3.select("#unpackedBin").remove();
}




// gaze ---------------------------------------------------


function renderGaze(data, images){
	console.log("renderGaze");
		const r = 1;
		const eyeOffset = -0.1;

	const rootDOM = widget;
	const result = d3.select("#result")
		.append("div")
		.attr("id","gazeResult");

	const rangeX = [-90,90];
	const rangeY = [-50,30];

	const scaleX = d3.scaleLinear().domain(rangeX).range([0, w]);
	const scaleY = d3.scaleLinear().domain(rangeY).range([h, 0]);

	const gaze = rootDOM.append("div")
		.attr("id","gaze")
	const img = gaze.append('div')
		.attr("id","img")
		.append("img");
	const cursor = gaze.append('div')
		.attr("id","cursor");
	setImage(img,cursor,0,0,data,images);
	rootDOM.on("mousemove",function(){
		let x = d3.mouse(this)[0];
		let y = d3.mouse(this)[1];
		let yaw = Math.round(scaleX.invert(x));
		let pitch = Math.round(scaleY.invert(y));
		cursor.style("left",`${x}px`).style("top",`${y}px`);
		setImage(img,cursor,yaw,pitch,data,images);
	})

	plotImages(gaze,data);

	function plotImages(rootDOM,data){

		const svg = rootDOM.selectAll('svg')
			.data([1]);
		// enter
		const svgEnter = svg.enter()
			.append('svg');
		// update + enter
		svg.merge(svgEnter)
			.attr("viewBox", `0 0 ${w} ${h}`)	

		const plot = svg.merge(svgEnter);

		plot.append("line")
			.attr("x1",scaleX(-90))
			.attr("y1",scaleY(0))
			.attr("x2",scaleX(90))
			.attr("y2",scaleY(0))
			.attr("stroke","red")
			.attr("opacity",1)

		plot.append("line")
			.attr("x1",scaleX(0))
			.attr("y1",scaleY(90))
			.attr("x2",scaleX(0))
			.attr("y2",scaleY(-90))
			.attr("stroke","red")
			.attr("opacity",1)
			
		plot.selectAll("face")
			.data(data)
			.enter()
			.append("circle")
			.attr("r",r)
			.attr("fill","white")
			.attr("opacity",0.5)
			.attr("cx",d=>scaleX(d.yaw))
			.attr("cy",d=>scaleY(d.pitch))
		
	}

	function setImage(imgDOM,cursorDOM,yaw,pitch,data,images){
		let localData = getByYawPitch(cursorDOM,yaw,pitch,data);
		let i = getRandom(localData,1)[0];
		let iObj = images.filter(d=>d.imageid === i.imageid)[0].imageobj;
		imgDOM.node().src = iObj.src; // seems to reference the loaded images
		result.html(`<b>${i.object_title}</b>
			<br>${i.object_artist}
			<br>${i.object_century}
			<br>&nbsp;
			<br><i>${i.object_classification}</i>`);
			
		function getByYawPitch(cursorDOM,yaw,pitch,data){

			function nearby(range = 1){
				// terminating condition
				let tData = data.filter(
					d=>
						 d.yaw > (yaw - range) 
					&& d.yaw < (yaw + range)
					&& d.pitch > (pitch - (range/2)) 
					&& d.pitch < (pitch + (range/2))
				);
				if (tData.length > 0){
					let n = range+1;

					// TODO: cursor as SVG

					cursorDOM.style("width",`${scaleX(n*2 - rangeX[1])}px`)
						.style("margin-left",`${scaleX(n - rangeX[1])/2*-1}px`)
						.style("height",`${scaleY(rangeY[1] - n*2)}px`)
						.style("margin-top",`${(scaleY(rangeY[1]+n)/2)}px`)
					return tData;
				}
				// recursive condition
				return nearby(range + 1);
			}
			return nearby();
		}		
			
	}
}


function destroyGaze(){
	console.log("destroyGaze");
	d3.select("#gaze").remove();
	d3.select("#gazeResult").remove();
}




// util ---------------------------------------------------

function getRandom(arr, n) {
	var result = new Array(n),
		len = arr.length,
		taken = new Array(len);
	if (n > len)
		throw new RangeError("getRandom: more elements taken than available");
	while (n--) {
		var x = Math.floor(Math.random() * len);
		result[n] = arr[x in taken ? taken[x] : x];
		taken[x] = --len in taken ? taken[len] : len;
	}
	return result;
}