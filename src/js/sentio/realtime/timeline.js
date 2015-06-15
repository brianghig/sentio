sentio.realtime.timeline = sentio_realtime_timeline;

function sentio_realtime_timeline() {
	'use strict';

	// Layout properties
	var id = 'rt_timeline_clip_' + Date.now();
	var margin = { top: 10, right: 10, bottom: 20, left: 40 };
	var height = 100, width = 600;

	// Default data delay, this is how far offset "now" is
	var delay = 10000;

	// Interval of the timeline, this is the amount of time being displayed by the timeline
	var interval = 60000;

	// Duration of the transition, also this is the minimum buffer time
	var duration = {
		reveal: 300,
		animate: 300
	};
	
	/**
	 * Callback function for hovers over the markers. Invokes this function
	 * with the d[2] data from the marker payload
	 */
	var markerHoverCallback = null;

	// Is the timeline running?
	var running = false;

	// Transition used for normal mode
	var transition = d3.select({}).transition()
		.duration(duration.reveal)
		.ease('linear');

	// Is the timeline running in efficient mode?
	var efficient = {
		enabled: false,
		fps: 10
	};

	// Default accessors for the dimensions of the data
	var value = {
		x: function(d, i) { return d[0]; },
		y: function(d, i) { return d[1]; }
	};

	var yExtent = [undefined, undefined];

	// Default scales for x and y dimensions
	var scale = {
		x: d3.time.scale(),
		y: d3.scale.linear()
	};

	// Default Axis definitions
	var axis = {
		x: d3.svg.axis().scale(scale.x).orient('bottom'),
		y: d3.svg.axis().scale(scale.y).orient('left').ticks(4)
	};

	var element = {
		svg: undefined,
		g: {
			container: undefined,
			xAxis: undefined,
			yAxis: undefined,
			line: undefined,
			markers: undefined
		},
		clipPath: undefined
	};

	// Line generator for the plot
	var line = d3.svg.line().interpolate('linear');
	line.x(function(d, i) {
		return scale.x(value.x(d, i));
	});
	line.y(function(d, i) {
		return scale.y(value.y(d, i));
	});

	var data = [], markers = [];

	// Chart create/init method
	function chart(selection){}

	// Perform all initial chart construction and setup
	chart.init = function(container){
		// Create the SVG element
		element.svg = container.append('svg');

		// Add the defs and add the clip path definition
		element.clipPath = element.svg.append('defs').append('clipPath').attr('id', id).append('rect');

		// Append a container for everything
		element.g.container = element.svg.append('g');

		// Append the path group (which will have the clip path and the line path
		element.g.line = element.g.container.append('g').attr('clip-path', 'url(#' + id + ')');
		element.g.line.append('path').attr('class', 'line');
		
		element.g.markers = element.g.container.append('g').attr('class', 'markers').attr('clip-path', 'url(#' + id + ')');
		
		// Append groups for the axes
		element.g.xAxis = element.g.container.append('g').attr('class', 'x axis');
		element.g.yAxis = element.g.container.append('g').attr('class', 'y axis');

		return chart;
	};

	// Update the chart data
	chart.data = function(value){
		if(!arguments.length) { return data; }
		data = value;
		element.g.line.datum(data);
		return chart;
	};
	
	/**
	 * Accepts the hovered element and conditionally invokes
	 * the marker hover callback if both the function and data
	 * are non-null
	 */
	function invokeMarkerCallback(d) {
		// fire an event with the payload from d[2]
		if(null != d[2] && null != markerHoverCallback) {
			markerHoverCallback(d[2]);
		}
	}
	
	/**
	 * Draws the appropriate marker lines, whether
	 * coming from enter or update of data
	 */
	function drawMarkerLines(selection) {
		selection
			.attr("x1", function(d) {
				return scale.x(d[0]);
			})
			.attr("x2", function(d) {
				return scale.x(d[0]);
			})
			.attr("y1", scale.y.range()[1])
			.attr("y2", scale.y.range()[0])
			.on('mouseover', invokeMarkerCallback);
	}
	
	/**
	 * Draws the appropriate marker text, whether
	 * coming from enter or update of data
	 */
	function drawMarkerText(selection) {
		
		var ySize = scale.y.range()[0] - scale.y.range()[1];
		ySize = ySize * 0.2;
		
		selection
			.attr("x", function(d) {
				return scale.x(d[0]);
			})
			.attr("y", ySize)
			.text(function(d) { return d[1]; })
			.on('mouseover', invokeMarkerCallback);
	}
	
	chart.markers = function(value) {
		if(!arguments.length) { return markers; }
		markers = value;
		
		if(markers.length === 0) {
			return chart;
		}
		
		// add data to the container of markers
		var markData = element.g.markers
		  .selectAll('.marker')
		    .data(markers)
		    .enter();
		
		/*
		 * markerGroup is a collection of the line
		 * and label for a particular marker
		 */
		var markerGroup = markData.append('g')
		    .attr('class', 'marker');
		
		// Add the line to the marker group
		drawMarkerLines(markerGroup.append('line') );
		
		// Text can show on hover or always
		drawMarkerText( markerGroup.append('text') );
		
		return chart;
	};

	chart.redraw = function(){
		var now = Date.now();

		// Set up the scales
		scale.x.range([0, width - margin.left - margin.right]);
		scale.y.range([height - margin.top - margin.bottom, 0]);

		// Append the clip path
		element.clipPath
			.attr('width', width - margin.left - margin.right)
			.attr('height', height - margin.top - margin.bottom);

		// Now update the size of the svg pane
		element.svg.attr('width', width).attr('height', height);

		// Append groups for the axes
		element.g.xAxis.attr('transform', 'translate(0,' + scale.y.range()[0] + ')');
		element.g.yAxis.attr('class', 'y axis');

		// update the margins on the main draw group
		element.g.container.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

		return chart;
	};

	function tick() {
		// If not running, let the loop die
		if(!running) return;

		// Store the current time
		var now = new Date();

		var extent = getYExtent(now);

		// Update the domains of the scales
		scale.x.domain([now - delay - interval - duration.reveal, now - delay - duration.reveal]);
		scale.y.domain(extent);

		if(null == efficient || !efficient.enabled){
			normalTick(now);
		} else {
			efficientTick(now);
		}
	}
	
	function executeTick(now) {
		// Select and draw the x axis
		element.g.xAxis.call(axis.x);
		
		// Select and draw the y axis
		element.g.yAxis.call(axis.y);
		
		var translate = scale.x(now - delay - interval - 2*duration.reveal);
		
		tickLine(translate);
		tickMarkers(translate);
	}
	
	function tickLine(translate) {
		// Select and draw the line
		element.g.line.select('.line').attr('d', line).attr('transform', null);
		element.g.line.select('.line').transition()
			.attr('transform', 'translate(' + translate + ')');
	}
	
	function tickMarkers(translate) {
		element.g.markers
			.selectAll('.marker')
			.attr('transform', null)
			// if any marker is outside the X-window, mark it for deletion
			.attr('delete', function(d) {
				return scale.x(d) < 0;
			});
		
		// Fade out and remove markers with lines outside of range
		element.g.markers.selectAll('[delete=true]')
			.attr('opacity', 1)
			.transition(500)
			.attr('opacity', 0)
			.remove();
		
		drawMarkerLines( element.g.markers.selectAll('line') );
		drawMarkerText( element.g.markers.selectAll('text') );
		
		element.g.markers
			.selectAll('.marker')
			.transition()
			.attr('transform', 'translate(' + translate + ')');
		
	}

	function normalTick(now) {
		transition = transition.each(function(){
			executeTick(now);
		}).transition().each('start', tick);
	}

	function efficientTick(now) {
		executeTick(now);

		// Schedule the next update
		window.setTimeout(tick, 1000/efficient.fps);
	}

	function getYExtent(now){
		// Calculate the domain of the y axis
		var nExtent = [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
		data.forEach(function(element, index){
			var y = value.y(element);
			var x = value.x(element);

			if(x < now - delay  + duration.reveal) {
				if(nExtent[0] > y) { nExtent[0] = y; }
				if(nExtent[1] < y) { nExtent[1] = y; }
			}
		});

		if(Number.POSITIVE_INFINITY === nExtent[0] && Number.NEGATIVE_INFINITY === nExtent[1]){ nExtent = [0, 10]; }
		if(nExtent[0] >= nExtent[1]) { nExtent[1] = nExtent[0] + 1; }
		nExtent[1] += (nExtent[1] - nExtent[0]) * 0.1;

		if(null != yExtent){
			if(null != yExtent[0]) { nExtent[0] = yExtent[0]; }
			if(null != yExtent[1]) { nExtent[1] = yExtent[1]; }
		}

		return nExtent;
	}

	chart.start = function(){
		if(running){ return; }

		running = true;
		tick();
	};

	chart.stop = function(){
		if(!running) { return; }

		running = false;
	};

	chart.restart = function(){
		chart.stop();
		chart.start();
	};

	// Basic Getters/Setters
	chart.width = function(v){
		if(!arguments.length) { return width; }
		width = v;
		return chart;
	};
	chart.height = function(v){
		if(!arguments.length) { return height; }
		height = v;
		return chart;
	};
	chart.xAxis = function(v){
		if(!arguments.length) { return axis.x; }
		axis.x = v;
		return chart;
	};
	chart.yAxis = function(v){
		if(!arguments.length) { return axis.y; }
		axis.y = v;
		return chart;
	};
	chart.xScale = function(v){
		if(!arguments.length) { return scale.x; }
		scale.x = v;
		axis.x.scale(v);
		return chart;
	};
	chart.yScale = function(v){
		if(!arguments.length) { return scale.y; }
		scale.y = v;
		axis.y.scale(v);
		return chart;
	};
	chart.interpolation = function(v){
		if(!arguments.length) { return line.interpolate(); }
		line.interpolate(v);
		return chart;
	};
	chart.xValue = function(v){
		if(!arguments.length) { return value.x; }
		value.x = v;
		return chart;
	};
	chart.yValue = function(v){
		if(!arguments.length) { return value.y; }
		value.y = v;
		return chart;
	};
	chart.interval = function(v){
		if(!arguments.length) { return interval; }
		interval = v;
		return chart;
	};
	chart.delay = function(v){
		if(!arguments.length) { return delay; }
		delay = v;
		return chart;
	};
	chart.yExtent = function(v){
		if(!arguments.length) { return yExtent; }
		yExtent = v;
		return chart;
	};
	chart.duration = function(v){
		if(!arguments.length) { return duration; }
		duration = v;
		transition.duration(duration.reveal);
		return chart;
	};
	chart.efficient = function(v){
		if(!arguments.length) { return efficient; }
		efficient = v;
		return chart;
	};

	chart.markerHover = function(f){
		if(!arguments.length) { return markerHoverCallback; }
		markerHoverCallback = f;
		return chart;
	};

	return chart;
}