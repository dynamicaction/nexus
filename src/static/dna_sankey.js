//Function that creates our SANKEY Diagram
//This is code that runs on the client side in the client browser, not server code

function drawFeedSankey(feedId) {
  //
  $('#myFeedJobTitle').html('<h4>' + feedId + '</h4>');
  $('#mySankeyDigram').html('');

  // Variables to hold sizing of the sankey
  var margin = {top: 0, right: 100, bottom: 20, left: 0},
    width = 2200 - margin.left - margin.right,
    height = 300 - margin.top - margin.bottom;


  // format variables
  var color = d3.scaleOrdinal(d3.schemeCategory20);

  // I'll be honest. I have no clue here. 
  var zoomListener = d3.zoom()
    .scaleExtent([1, 5])
    .on('zoom', zoomed);

  function zoomed() {
    if (d3.event.transform.k === 1) d3.event.transform.y = 0;
    if (d3.event.transform.x > 0) d3.event.transform.x = 0;
    svg.attr('transform', d3.event.transform);
  }

  // append the svg object to the body of the page
  var svg = d3.select('#mySankeyDigram').append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform',
          'translate(' + margin.left + ',' + margin.top + ')')

  zoomListener(svg);

  // Set the sankey diagram properties
  var sankey = d3.sankey()
    .nodeWidth(10)
    .nodePadding(30)
    .size([width, height])
    .overlapLinksAtSources(true)
    //.overlapLinksAtTargets(true)
    .align('right');

  var path = sankey.link();

  // Show our work in progress div
  var myprogress = $('#work-in-progress');
  myprogress.show();

  // We call the /sankey/:feedId route to get our graph JSON and then set some attributes
  d3.json('/sankey/' + feedId, function(error, graph) {

    // If we got an error back we need to display the error and move on with life
    if(graph.hasOwnProperty('error')) {
      
      // We aren't working in progress any longer
      var myprogress = $('#work-in-progress');
      myprogress.hide();

      // Enable the alert so we see the error on the site
      var myalert = $('#myAlert');
      myalert.find('strong').html('Validation Error!');
      myalert.find('p').html(graph.error);
      myalert.removeAttr('class');
      myalert.addClass('alert alert-danger alert-dismissable');
      myalert.show();
      return;
    }
  
  // D3 likes to high jack click events when we turn on zoom and drag. I use this variable
  // to track how far we drag. If we drag 0 or less than a certain amount we pop up a modal 
  // which simulates a click
  let dragMovement=0;

  // Function that handles our dragging
  var drag = d3.drag()
    // If we are dragging we are calling 'dragmove' function
    .on('drag', dragmove)
    // If start the dragging
    .on('start', function(){
      this.parentNode.appendChild(this);
    })
    //When we end the drag movement
    .on('end', function(d){
      // This is the check to see how far we dragged. If we haven't gone far then
      // we treat it as a click and open that modal
      if (dragMovement <= 5) {
        var mymodal = $('#modalContent');
        mymodal.find('.modal-title').html('<h3>' + d.name + '</h3>');
        mymodal.find('.modal-body').html(graph['flowInfo'][d.name]['html']);
        mymodal.modal('show');
      }
      // Reset the drag movement for next time
      dragMovement = 0;
    });

  // We add the nodes and the links to the sankey and let it iterate 200 times to make it pretty
  sankey
    .nodes(graph.nodes)
    .links(graph.links)
    .layout(200);

  //This creates the links to be drawn
  var link = svg.append('g').selectAll('.link')
    .data(graph.links)
    .enter().append('path')
    .attr('class', 'link')
    .attr('d', path)
    .style('stroke-width', function(d) { return Math.max(1, d.dy); })
    .sort(function(a, b) { return b.dy - a.dy; })
    // If we click the link between two nodes we pop up a modal
    .on("click", function(d) {
      var mymodal = $('#modalContent');
      mymodal.find('.modal-title').html('<h3>Flow Schema</h3>');
      var flowhtml = ''
      if (graph['flowInfo'][d.source.name].hasOwnProperty('flowhtml')) {
        flowhtml = graph['flowInfo'][d.source.name]['flowhtml'];
      }
      mymodal.find('.modal-body').html(flowhtml);
      mymodal.modal('show');
    });

  // This gives a title to the link
  link.append('title')
    .text(function(d) {return d.source.name + ' → ' + d.target.name; });

  // add in the nodes
  var node = svg.append('g').selectAll('.node')
    .data(graph.nodes)
    .enter()
    .append('g')
    .attr('class', 'node')
    .attr('transform', function(d) {
      return 'translate(' + d.x + ',' + d.y + ')'; })
    .call(drag);

  // add the rectangles for the nodes
  node.append('rect')
    .attr('height', function(d) { return d.dy; })
    .attr('width', sankey.nodeWidth())
    .style('fill', function(d) {
      return d.color = color(d.name.replace(/ .*/, '')); })
    .style('stroke', function(d) {
      return d3.rgb(d.color).darker(2); })
    .append('title')
    .text(function(d) {
      return d.name + '\n' + d.dy; })

  // add in the title for the nodes
  node.append('text')
    .attr('x', -6)
    .attr('y', function(d) { return d.dy / 2; })
    .attr('dy', '.35em')
    .attr('text-anchor', 'end')
    .attr('transform', null)
    .text(function(d) { return d.name; })
    //.filter(function(d) { return d.x < width / 2; })
    .attr('x', 6 + sankey.nodeWidth())
    .attr('text-anchor', 'start');

  // hide the progress bar
  $('#work-in-progress').hide();

  // the function for moving the nodes
  function dragmove(d) {
    dragMovement++;
    d3.select(this).attr('transform',
      'translate(' + (
        d.x = Math.max(0, Math.min(width - d.dx, d3.event.x))
      ) + ',' + (
        d.y = Math.max(0, Math.min(height - d.dy, d3.event.y))
      ) + ')');
    sankey.relayout();
    link.attr('d', path);
  }

});

}

function sankeyReset() {
  var svg = d3.select('#mySankeyDigram');
  var t = d3.zoomIdentity.scale(1)
  
  var zoomListener = d3.zoom()
  .clickDistance(3)
  .scaleExtent([1, 5])
  .on('zoom', zoomed);

  function zoomed() {
    if (d3.event.transform.k === 1) d3.event.transform.y = 0;
    if (d3.event.transform.x > 0) d3.event.transform.x = 0;
    svg.attr('transform', d3.event.transform);
  }

  svg.call(zoomListener.transform, t)
}

function populateDropDown() {
  
$.ajax({
  type: "GET",
  url: '/sankey/data/getFeeds',
  success: function(data)
  {
    if(data.hasOwnProperty('error')) {
      var myalert = $('#myAlert');
      myalert.find('strong').html('Validation Error!');
      myalert.find('p').html(data.error);
      myalert.removeAttr('class');
      myalert.addClass('alert alert-danger alert-dismissable');
      myalert.show();
      return;
    }
    var dropdown = $('#feedDropDown');
    dropdown.html('');
    data['feedOutputs'].forEach(function(feedOutput, i) {
      var selectionHTML = '<a class="dropdown-item" href="#" onclick="drawFeedSankey(\'' + feedOutput['jobName'] + '\');">' + feedOutput['jobName'] + '</a>';
      dropdown.append(selectionHTML);
    });
    
    
  }
});

}